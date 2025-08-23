use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, TimeZone, Timelike, Datelike, NaiveDate};
use chrono_tz::Asia::Shanghai;
use std::collections::{HashMap, VecDeque, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::path::PathBuf;
use std::fs;
use std::str::FromStr;
use base64::Engine; // for encode/decode methods on base64 engine
use crate::macro_replacer::MacroReplacer;
use tauri::Emitter; // 使 AppHandle::emit 可用
// 已不需要 Manager trait；使用 AppHandle::emit 通知前端

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationTask {
    pub id: String,
    pub name: String,
    pub task_type: TaskType,
    pub enabled: bool,
    pub schedule: String, // cron 表达式
    pub device_ids: Vec<String>,
    pub config: TaskConfig,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
    pub run_count: u64,
    pub error_count: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub fixed_at: Option<DateTime<Utc>>, // 固定时间（一次性）
    #[serde(default)]
    pub interval_sec: Option<u32>, // 间隔时间（秒）
    // 用户排序优先级（数值越小优先级越高），前端拖拽排序后会立刻更新
    #[serde(default)]
    pub priority: i32,
    // 每个任务的持续时长（秒），用于按“日程模式”布局计划队列；默认 5 秒（5 秒）
    #[serde(default)]
    pub duration_sec: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "text-to-image")]
    TextToImage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TaskConfig {
    #[serde(rename = "text")]
    Text {
        title: String,
        message: String,
        signature: String,
        icon: Option<String>,
        link: Option<String>,
    },
    #[serde(rename = "image")]
    Image {
        image_data: String,
        algorithm: String,
        link: Option<String>,
    },
    #[serde(rename = "text-to-image")]
    TextToImage {
        background_color: String,
        background_image: Option<String>,
        texts: Vec<TextElement>,
        link: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextElement {
    pub id: String,
    pub content: String,
    pub x: f64,
    pub y: f64,
    pub font_size: f64,
    pub rotation: f64,
    pub font_weight: String,
    pub text_align: String,
    pub color: String,
    pub font_family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskExecutionLog {
    pub id: String,
    pub task_id: String,
    pub executed_at: DateTime<Utc>,
    pub success: bool,
    pub error_message: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedItem {
    pub id: String,
    pub task_id: String,
    pub date: String, // YYYY-MM-DD（本地或UTC日期，这里采用UTC以简化）
    #[serde(default)]
    pub time: String, // HH:MM:SS
    pub position: u32,
    pub status: String, // "pending" | "done" | "skipped"
    pub created_at: DateTime<Utc>,
    pub executed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub scheduled_at: Option<DateTime<Utc>>, // 计划的触发时间
    #[serde(default)]
    pub scheduled_end_at: Option<DateTime<Utc>>, // 计划的结束时间
    // 新增：计划项持续时长（秒），来源于任务的 duration_sec 或 start/end 差值
    #[serde(default)]
    pub duration_sec: Option<u32>,
}

// 简化版的自动化管理器，用于基础功能
pub struct SimpleAutomationManager {
    tasks: Arc<Mutex<HashMap<String, AutomationTask>>>,
    logs: Arc<Mutex<Vec<TaskExecutionLog>>>,
    api_keys: Arc<Mutex<HashMap<String, String>>>,
    background_tasks_started: Arc<Mutex<bool>>,
    automation_enabled: Arc<Mutex<bool>>, // 全局自动化开关
    data_dir: PathBuf, // 数据存储目录
    // 每秒仅执行一个任务：维护待执行的积压队列
    backlog: Arc<Mutex<VecDeque<String>>>, // 存放任务ID
    planned: Arc<Mutex<Vec<PlannedItem>>>, // 计划队列（多天）
    // 可选的 Tauri AppHandle，用于在计划更新后推送事件给前端
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    // 防抖：避免同一日期并发重复生成
    planning_inflight: Arc<Mutex<HashSet<String>>>,
}

impl SimpleAutomationManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        // 创建自动化数据目录
        let automation_dir = app_data_dir.join("automation");
        if !automation_dir.exists() {
            fs::create_dir_all(&automation_dir).unwrap_or_else(|e| {
                eprintln!("创建自动化目录失败: {}", e);
            });
        }

        let manager = SimpleAutomationManager {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            logs: Arc::new(Mutex::new(Vec::new())),
            api_keys: Arc::new(Mutex::new(HashMap::new())),
            background_tasks_started: Arc::new(Mutex::new(false)),
            automation_enabled: Arc::new(Mutex::new(true)), // 默认启用自动化
            data_dir: automation_dir,
            backlog: Arc::new(Mutex::new(VecDeque::new())),
            planned: Arc::new(Mutex::new(Vec::new())),
            app_handle: Arc::new(Mutex::new(None)),
            planning_inflight: Arc::new(Mutex::new(HashSet::new())),
        };
        
        // 加载保存的任务和日志
        manager.load_tasks();
        manager.load_logs();
        manager.load_settings();
        manager.load_planned();
        
        // 若启动时已存在任务，确保后台检查器已启动
        {
            let tasks_guard = manager.tasks.lock().unwrap();
            if !tasks_guard.is_empty() {
                drop(tasks_guard);
                manager.start_background_tasks();
            }
        }

        manager
    }

    fn tasks_file_path(&self) -> PathBuf {
        self.data_dir.join("tasks.json")
    }

    fn logs_file_path(&self) -> PathBuf {
        self.data_dir.join("logs.json")
    }

    fn settings_file_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    fn planned_file_path(&self) -> PathBuf {
        self.data_dir.join("planned_queue.json")
    }

    // 保存任务到文件
    fn save_tasks(&self) {
        let tasks_guard = match self.tasks.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        let tasks_vec: Vec<AutomationTask> = tasks_guard.values().cloned().collect();
        
        match serde_json::to_string_pretty(&tasks_vec) {
            Ok(json_data) => {
                if let Err(e) = fs::write(self.tasks_file_path(), json_data) {
                    eprintln!("保存任务失败: {}", e);
                } else {
                    println!("💾 已保存 {} 个自动化任务", tasks_vec.len());
                }
            }
            Err(e) => eprintln!("序列化任务数据失败: {}", e),
        }
    }

    // 从文件加载任务
    fn load_tasks(&self) {
        let tasks_file = self.tasks_file_path();
        if !tasks_file.exists() {
            println!("📂 任务文件不存在，从空白开始");
            return;
        }

        match fs::read_to_string(tasks_file) {
            Ok(json_data) => {
                match serde_json::from_str::<Vec<AutomationTask>>(&json_data) {
                    Ok(tasks_vec) => {
                        let mut tasks_guard = self.tasks.lock().unwrap();
                        tasks_guard.clear();
                        
                        for task in tasks_vec {
                            tasks_guard.insert(task.id.clone(), task);
                        }
                        
                        println!("📋 已加载 {} 个自动化任务", tasks_guard.len());
                    }
                    Err(e) => eprintln!("解析任务数据失败: {}", e),
                }
            }
            Err(e) => eprintln!("读取任务文件失败: {}", e),
        }
    }

    // 原 save_logs 方法已移除，日志保存逻辑在后台线程中就地实现

    // 从文件加载日志
    fn load_logs(&self) {
        let logs_file = self.logs_file_path();
        if !logs_file.exists() {
            return;
        }

        match fs::read_to_string(logs_file) {
            Ok(json_data) => {
                match serde_json::from_str::<Vec<TaskExecutionLog>>(&json_data) {
                    Ok(logs_vec) => {
                        let mut logs_guard = self.logs.lock().unwrap();
                        logs_guard.clear();
                        logs_guard.extend(logs_vec);
                        
                        println!("📜 已加载 {} 条执行日志", logs_guard.len());
                    }
                    Err(e) => eprintln!("解析日志数据失败: {}", e),
                }
            }
            Err(e) => eprintln!("读取日志文件失败: {}", e),
        }
    }

    // 保存计划队列
    fn save_planned(&self) {
        let guard = match self.planned.lock() { Ok(g) => g, Err(_) => return };
        match serde_json::to_string_pretty(&*guard) {
            Ok(json) => { let _ = fs::write(self.planned_file_path(), json); }
            Err(e) => eprintln!("序列化计划队列失败: {}", e),
        }
    }

    // 加载计划队列
    fn load_planned(&self) {
        let file = self.planned_file_path();
        if !file.exists() { return; }
        match fs::read_to_string(file) {
            Ok(json) => match serde_json::from_str::<Vec<PlannedItem>>(&json) {
                Ok(items) => {
                    let mut g = self.planned.lock().unwrap();
                    *g = items;
                }
                Err(e) => eprintln!("解析计划队列失败: {}", e),
            },
            Err(e) => eprintln!("读取计划队列失败: {}", e),
        }
    }

    // 保存设置到文件
    fn save_settings(&self) {
        let enabled = self.automation_enabled.lock().unwrap();
        let settings = serde_json::json!({
            "automation_enabled": *enabled
        });
        
        match serde_json::to_string_pretty(&settings) {
            Ok(json_data) => {
                if let Err(e) = fs::write(self.settings_file_path(), json_data) {
                    eprintln!("保存设置失败: {}", e);
                }
            }
            Err(e) => eprintln!("序列化设置数据失败: {}", e),
        }
    }

    // 从文件加载设置
    fn load_settings(&self) {
        let settings_file = self.settings_file_path();
        if !settings_file.exists() {
            println!("⚙️ 设置文件不存在，使用默认设置");
            return;
        }

        match fs::read_to_string(settings_file) {
            Ok(json_data) => {
                match serde_json::from_str::<serde_json::Value>(&json_data) {
                    Ok(settings) => {
                        if let Some(enabled) = settings.get("automation_enabled").and_then(|v| v.as_bool()) {
                            let mut automation_enabled = self.automation_enabled.lock().unwrap();
                            *automation_enabled = enabled;
                            println!("⚙️ 已加载自动化设置: {}", if enabled { "启用" } else { "禁用" });
                        }
                    }
                    Err(e) => eprintln!("解析设置数据失败: {}", e),
                }
            }
            Err(e) => eprintln!("读取设置文件失败: {}", e),
        }
    }

    // 设置全局自动化开关
    pub fn set_automation_enabled(&self, enabled: bool) -> Result<(), String> {
        {
            let mut automation_enabled = self.automation_enabled.lock().map_err(|e| e.to_string())?;
            *automation_enabled = enabled;
        }
        
        self.save_settings();
        
        println!("🔧 自动化总开关已{}", if enabled { "启用" } else { "禁用" });
        Ok(())
    }

    // 获取全局自动化开关状态
    pub fn is_automation_enabled(&self) -> Result<bool, String> {
        let automation_enabled = self.automation_enabled.lock().map_err(|e| e.to_string())?;
        Ok(*automation_enabled)
    }

    pub fn start_background_tasks(&self) {
        let mut started = self.background_tasks_started.lock().unwrap();
        if *started {
            return; // 已经启动过了
        }
        *started = true;
        drop(started); // 释放锁
        
        self.start_task_checker();
    }

    pub fn set_api_key(&self, device_id: String, api_key: String) -> Result<(), String> {
        let mut api_keys = self.api_keys.lock().map_err(|e| e.to_string())?;
        api_keys.insert(device_id, api_key);
        Ok(())
    }

    fn start_task_checker(&self) {
        let tasks = Arc::clone(&self.tasks);
        let logs = Arc::clone(&self.logs);
        let api_keys = Arc::clone(&self.api_keys);
        let automation_enabled = Arc::clone(&self.automation_enabled);
        let tasks_file_path = self.tasks_file_path();
        let logs_file_path = self.logs_file_path();
        let backlog = Arc::clone(&self.backlog);
        let planned = Arc::clone(&self.planned);
         
         std::thread::spawn(move || {
             let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
             
             rt.block_on(async {
                // 每秒对齐检查：1s 粒度，一秒仅启动一个任务
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                
                loop {
                    interval.tick().await;

                    let now = Utc::now();
                    let shanghai_time = now.with_timezone(&Shanghai);

                    println!("start_task_checker loop : {}", shanghai_time.format("%Y-%m-%d %H:%M:%S"));

                    // 检查全局自动化开关
                    let is_enabled = {
                        let enabled_guard = automation_enabled.lock().unwrap();
                        *enabled_guard
                    };
                    
                    if !is_enabled {
                        // 如果自动化被禁用，跳过这次检查（不输出日志）
                        continue;
                    }

                    // 获取当前planned_queue
                    let planned_queue = {
                        let guard = planned.lock().unwrap();
                        guard.clone()
                    };

                    // 过滤出当前时间(秒)的task队列，willExecute
                    let will_execute_tasks: Vec<_> = planned_queue.iter()
                        .filter(|task| {
                            if let Some(scheduled_at) = task.scheduled_at {
                                let task_time = scheduled_at.with_timezone(&Shanghai);
                                task_time.year() == shanghai_time.year()
                                    && task_time.month() == shanghai_time.month()
                                    && task_time.day() == shanghai_time.day()
                                    && task_time.hour() == shanghai_time.hour()
                                    && task_time.minute() == shanghai_time.minute()
                                    && task_time.second() == shanghai_time.second()
                            } else {
                                false
                            }
                        })
                        .cloned()
                        .collect();
                    println!("当前时间(秒)的待执行任务: {:?}", will_execute_tasks);

                    // 找出will_execute_tasks中，可以执行的task，对应的task_config配置中应该是开启的状态
                    let mut candidate_tasks = Vec::new();
                    let tasks_guard = tasks.lock().unwrap();
                    for t in will_execute_tasks {
                        if let Some(task_config) = tasks_guard.get(&t.task_id) {
                            if task_config.enabled {
                                candidate_tasks.push(task_config.clone());
                            }
                        }
                    }
                    
                    // 提取任务ID用于日志显示
                    let candidate_ids: Vec<String> = candidate_tasks.iter().map(|task| task.id.clone()).collect();

                    // 同一时间，只保留一个任务，所以需要忽略其他任务，取出第一个
                    let first_candidate_task = candidate_tasks.first().cloned();
                    if let Some(ref task) = first_candidate_task {
                        candidate_tasks.retain(|t| t.id == task.id);
                        println!("当前时间(秒)的执行任务: {}", task.id);
                    } else {
                        println!("当前时间(秒)的执行任务: 无");
                    }

                    // 直接使用候选任务数据计算优先级
                    let mut candidates = Vec::new();
                    for task in candidate_tasks {
                        let priority = compute_priority(&task, now);
                        candidates.push((task, priority));
                    }
                    
                    // 打印候选任务的名称
                    let candidate_names: Vec<String> = candidates.iter().map(|(task, _)| task.name.clone()).collect();
                    println!("候选任务: {:?}", candidate_names);

                    // 仅取一个任务执行；其余回写 backlog
                    if let Some((task, _pri)) = candidates.first().cloned() {

                        // 执行前获取 API key
                        let api_key = {
                            let api_keys_guard = api_keys.lock().unwrap();
                            if let Some(device_id) = task.device_ids.first() {
                                api_keys_guard.get(device_id).cloned().unwrap_or_default()
                            } else {
                                String::new()
                            }
                        };

                        if api_key.is_empty() {
                            // 缺少凭据：跳过本秒；不要从候选中移除，等待凭据同步
                            continue;
                        }

                        let start_time = std::time::Instant::now();
                        let executed_at = Utc::now();
                        let executed_shanghai = executed_at.with_timezone(&Shanghai);
                        println!("🚀 执行任务: {} ({})", 
                            task.name, executed_shanghai.format("%H:%M:%S"));

                        let result = execute_task_by_type(&task, &api_key).await;

                        let duration_ms = start_time.elapsed().as_millis() as u64;
                        let success = result.is_ok();
                        let error_message = if let Err(ref e) = result { Some(e.clone()) } else { None };
                        println!("任务执行结果: {}，耗时: {}ms", 
                            if success { "成功" } else { "失败" }, duration_ms);
                        if !success {
                           println!("错误信息: {}", error_message.as_ref().unwrap_or(&"无错误信息".to_string()));
                        }
                    } else {
                        
                    }
                }
            });
        });
        
        println!("🚀 自动化任务检查器已启动（每秒调度，单秒单任务）");
    }

    pub fn add_task(&self, mut task: AutomationTask) -> Result<(), String> {
        task.id = uuid::Uuid::new_v4().to_string();
        task.created_at = Utc::now();
        task.updated_at = Utc::now();

        let mut tasks = self.tasks.lock().map_err(|e| e.to_string())?;
        let is_first_task = tasks.is_empty();
        tasks.insert(task.id.clone(), task);
        drop(tasks); // 释放锁
        
        // 保存任务到文件
        self.save_tasks();
        
        // 如果这是第一个任务，启动后台任务检查器
        if is_first_task {
            println!("📋 添加了第一个自动化任务，启动后台检查器...");
            self.start_background_tasks();
        }
        
        Ok(())
    }

    pub fn update_task(&self, mut task: AutomationTask) -> Result<(), String> {
        task.updated_at = Utc::now();

        let mut tasks = self.tasks.lock().map_err(|e| e.to_string())?;
        tasks.insert(task.id.clone(), task);
        drop(tasks); // 释放锁
        
        // 保存任务到文件
        self.save_tasks();
        
        Ok(())
    }

    pub fn delete_task(&self, task_id: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().map_err(|e| e.to_string())?;
        tasks.remove(task_id);
        drop(tasks); // 释放锁
        
        // 保存任务到文件
        self.save_tasks();
        
        Ok(())
    }

    pub fn get_tasks(&self) -> Result<Vec<AutomationTask>, String> {
        let tasks = self.tasks.lock().map_err(|e| e.to_string())?;
        Ok(tasks.values().cloned().collect())
    }

    pub fn get_logs(&self, limit: Option<usize>) -> Result<Vec<TaskExecutionLog>, String> {
        let logs = self.logs.lock().map_err(|e| e.to_string())?;
        let mut sorted_logs = logs.clone();
        sorted_logs.sort_by(|a, b| b.executed_at.cmp(&a.executed_at));
        
        if let Some(limit) = limit {
            Ok(sorted_logs.into_iter().take(limit).collect())
        } else {
            Ok(sorted_logs)
        }
    }

    pub async fn execute_task(&self, task_id: &str, api_key: &str) -> Result<(), String> {
        let start_time = std::time::Instant::now();
        let executed_at = Utc::now();
        
        // 获取任务
        let task = {
            let tasks = self.tasks.lock().map_err(|e| e.to_string())?;
            tasks.get(task_id).cloned()
                .ok_or_else(|| "任务不存在".to_string())?
        };

        if !task.enabled {
            return Err("任务已禁用".to_string());
        }

        // 在手动执行时，如果传入了 api_key，则写入管理器，保证后台调度也能使用
        if !api_key.trim().is_empty() {
            let mut keys = self.api_keys.lock().map_err(|e| e.to_string())?;
            for did in &task.device_ids {
                if !did.trim().is_empty() {
                    keys.insert(did.clone(), api_key.to_string());
                }
            }
        }

        // 执行任务
        let result = self.execute_task_by_type(&task, api_key).await;
        
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let success = result.is_ok();
        let error_message = if let Err(ref e) = result {
            Some(e.clone())
        } else {
            None
        };

        // 记录执行日志
        let log = TaskExecutionLog {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: task_id.to_string(),
            executed_at,
            success,
            error_message,
            duration_ms,
        };

        {
            let mut logs = self.logs.lock().map_err(|e| e.to_string())?;
            logs.push(log);
        }

        // 更新任务统计
        {
            let mut tasks = self.tasks.lock().map_err(|e| e.to_string())?;
            if let Some(task) = tasks.get_mut(task_id) {
                task.last_run = Some(executed_at);
                task.run_count += 1;
                if !success {
                    task.error_count += 1;
                }
            }
        }

        result
    }

    async fn execute_task_by_type(&self, task: &AutomationTask, api_key: &str) -> Result<(), String> {
        match &task.task_type {
            TaskType::Text => {
                if let TaskConfig::Text { title, message, signature, icon, link } = &task.config {
                    self.execute_text_task(
                        &task.device_ids,
                        api_key,
                        title,
                        message,
                        signature,
                        icon.as_deref(),
                        link.as_deref(),
                    ).await
                } else {
                    Err("任务配置类型不匹配".to_string())
                }
            }
            TaskType::Image => {
                if let TaskConfig::Image { image_data, link, .. } = &task.config {
                    self.execute_image_task(
                        &task.device_ids,
                        api_key,
                        image_data,
                        link.as_deref(),
                    ).await
                } else {
                    Err("任务配置类型不匹配".to_string())
                }
            }
            TaskType::TextToImage => {
                if let TaskConfig::TextToImage { background_color, background_image, texts, link } = &task.config {
                    // 对所有文本元素进行宏替换，保持与前端一致
                    let macro_replacer = MacroReplacer::new();
                    let mut processed_texts = Vec::new();
                    for t in texts {
                        let mut nt = t.clone();
                        nt.content = macro_replacer.replace(&t.content);
                        processed_texts.push(nt);
                    }

                    // 在后端用无头浏览器执行与前端一致的 Canvas 渲染
                    match render_t2i_via_headless_canvas(background_color, background_image.as_deref(), &processed_texts).await {
                        Ok(data_url) => {
                            return self.execute_image_task(&task.device_ids, api_key, &data_url, link.as_deref()).await;
                        }
                        Err(e) => {
                            return Err(format!("TextToImage后端渲染失败: {}", e));
                        }
                    }
                } else {
                    Err("任务配置类型不匹配".to_string())
                }
            }
        }
    }

    async fn execute_text_task(
        &self,
        device_ids: &[String],
        api_key: &str,
        title: &str,
        message: &str,
        signature: &str,
        icon: Option<&str>,
        link: Option<&str>,
    ) -> Result<(), String> {
        let client = reqwest::Client::new();
        
        // 验证设备ID
        if device_ids.is_empty() {
            return Err("没有指定设备".to_string());
        }
        
        let device_id = &device_ids[0];
        if device_id.trim().is_empty() {
            return Err("设备ID为空".to_string());
        }
        
        // 创建宏替换器并处理文本内容
        let macro_replacer = MacroReplacer::new();
        let processed_title = macro_replacer.replace(title);
        let processed_message = macro_replacer.replace(message);
        let processed_signature = macro_replacer.replace(signature);
        let processed_link = link.map(|l| macro_replacer.replace(l));
        
        // 如果有宏被替换，输出日志
        if macro_replacer.contains_macros(title) || 
           macro_replacer.contains_macros(message) || 
           macro_replacer.contains_macros(signature) ||
           link.map_or(false, |l| macro_replacer.contains_macros(l)) {
            println!("📝 文本任务宏替换:");
            if processed_title != title {
                println!("  标题: {} -> {}", title, processed_title);
            }
            if processed_message != message {
                println!("  消息: {} -> {}", message, processed_message);
            }
            if processed_signature != signature {
                println!("  签名: {} -> {}", signature, processed_signature);
            }
            if let (Some(original), Some(processed)) = (link, &processed_link) {
                if processed != original {
                    println!("  链接: {} -> {}", original, processed);
                }
            }
        }
        
        // 构建请求数据（使用处理后的文本）
        let request_data = crate::TextApiRequest {
            device_id: device_id.clone(),
            title: processed_title.clone(),
            message: processed_message.clone(),
            signature: processed_signature.clone(),
            icon: icon.map(|s| s.to_string()),
            link: processed_link,
            refresh_now: true,
        };

        println!("📝 发送文本到设备: {}", request_data.device_id);
        println!("标题: {}, 消息: {}", processed_title, processed_message);
        
        let response = client
            .post("https://dot.mindreset.tech/api/open/text")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_data)
            .send()
            .await
            .map_err(|e| format!("网络请求失败: {}", e))?;

        let status = response.status();
        
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("请求失败 ({}): {}", status, error_text));
        }

        let _result_text = response.text().await
            .map_err(|e| format!("读取响应失败: {}", e))?;
        
        println!("✅ 任务执行成功");
        Ok(())
    }

    async fn execute_image_task(
        &self,
        device_ids: &[String],
        api_key: &str,
        image_data: &str,
        link: Option<&str>,
    ) -> Result<(), String> {
        let client = reqwest::Client::new();
        
        // 验证设备ID
        if device_ids.is_empty() {
            return Err("没有指定设备".to_string());
        }
        
        let device_id = &device_ids[0];
        if device_id.trim().is_empty() {
            return Err("设备ID为空".to_string());
        }
        
        // 创建宏替换器并处理链接
        let macro_replacer = MacroReplacer::new();
        let processed_link = link.map(|l| macro_replacer.replace(l));
        
        // 如果链接中有宏被替换，输出日志
        if let (Some(original), Some(processed)) = (link, &processed_link) {
            if macro_replacer.contains_macros(original) {
                println!("🖼️ 图片任务宏替换:");
                println!("  链接: {} -> {}", original, processed);
            }
        }
        
        // 处理base64数据
        let base64_data = if image_data.starts_with("data:image/") {
            match image_data.find(",") {
                Some(comma_pos) => &image_data[comma_pos + 1..],
                None => return Err("Invalid image data format".to_string()),
            }
        } else {
            image_data
        };
        
        // 构建请求数据（使用处理后的链接）
        let request_data = crate::ImageApiRequest {
            device_id: device_id.clone(),
            image: base64_data.to_string(),
            link: processed_link,
            refresh_now: true,
            border: 0,
            dither_type: "NONE".to_string(),
            dither_kernel: "FLOYD_STEINBERG".to_string(),
        };

        println!("🤖 自动化任务: 发送图片到设备 {}", request_data.device_id);
        
        let response = client
            .post("https://dot.mindreset.tech/api/open/image")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_data)
            .send()
            .await
            .map_err(|e| format!("网络请求失败: {}", e))?;

        let status = response.status();
        
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("请求失败 ({}): {}", status, error_text));
        }

        let _result_text = response.text().await
            .map_err(|e| format!("读取响应失败: {}", e))?;
        
        println!("✅ 任务执行成功");
        Ok(())
    }
}

// Tauri 命令
#[tauri::command]
pub fn automation_add_task(
    task: AutomationTask,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.add_task(task)
}

#[tauri::command]
pub fn automation_update_task(
    task: AutomationTask,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.update_task(task)
}

#[tauri::command]
pub fn automation_delete_task(
    task_id: String,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.delete_task(&task_id)
}

#[tauri::command]
pub fn automation_get_tasks(
    state: tauri::State<SimpleAutomationManager>
) -> Result<Vec<AutomationTask>, String> {
    state.get_tasks()
}

#[tauri::command]
pub fn automation_get_logs(
    limit: Option<usize>,
    state: tauri::State<SimpleAutomationManager>
) -> Result<Vec<TaskExecutionLog>, String> {
    state.get_logs(limit)
}

#[tauri::command]
pub fn automation_sync_api_keys(
    device_configs: Vec<(String, String)>, // (serialNumber, apiKey) pairs
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    let mut api_keys = state.api_keys.lock().map_err(|e| e.to_string())?;
    
    for (device_id, api_key) in device_configs {
        if !api_key.is_empty() {
            api_keys.insert(device_id.clone(), api_key);
            println!("🔑 设置设备 {} 的API密钥", device_id);
        }
    }
    
    println!("✅ API密钥同步完成，共同步 {} 个设备", api_keys.len());
    Ok(())
}

#[tauri::command]
pub fn automation_start_background_tasks(
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.start_background_tasks();
    println!("🤖 自动化后台任务已启动");
    Ok(())
}

#[tauri::command]
pub async fn automation_execute_task(
    task_id: String,
    api_key: String,
    state: tauri::State<'_, SimpleAutomationManager>
) -> Result<(), String> {
    state.execute_task(&task_id, &api_key).await
}

#[tauri::command]
pub fn automation_set_api_key(
    device_id: String,
    api_key: String,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.set_api_key(device_id, api_key)
}

// 接收两种命名风格的参数，避免前端大小写不一致导致的调用失败
#[derive(Deserialize)]
pub struct UpdatePrioritiesArgs {
    // 支持 ordered_ids 与 orderedIds 两种写法
    #[serde(alias = "orderedIds")]
    ordered_ids: Vec<String>,
}

// 按前端排序更新优先级：ids 顺序即优先级（索引越小优先级越高）
#[tauri::command]
pub fn automation_update_priorities(
    args: UpdatePrioritiesArgs,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    for (idx, tid) in args.ordered_ids.iter().enumerate() {
        if let Some(t) = tasks.get_mut(tid) {
            t.priority = idx as i32; // 从0开始，越小越优先
            t.updated_at = Utc::now();
        }
    }
    drop(tasks);
    state.save_tasks();
    Ok(())
}

#[tauri::command]
pub fn automation_set_enabled(
    enabled: bool,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    state.set_automation_enabled(enabled)
}

#[tauri::command]
pub fn automation_get_enabled(
    state: tauri::State<SimpleAutomationManager>
) -> Result<bool, String> {
    state.is_automation_enabled()
}

#[tauri::command]
pub async fn automation_execute_t2i_with_frontend_render(
    task_id: String,
    rendered_image_data: String, // 前端渲染好的图片 base64 data URL
    api_key: String,
    state: tauri::State<'_, SimpleAutomationManager>
) -> Result<(), String> {
    // 获取任务信息（主要是为了获取设备ID和链接）
    let task = {
        let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
        tasks.get(&task_id).cloned()
            .ok_or_else(|| "任务不存在".to_string())?
    };

    if !task.enabled {
        return Err("任务已禁用".to_string());
    }

    // 提取链接信息（如果有的话）
    let link = if let TaskConfig::TextToImage { link, .. } = &task.config {
        link.as_deref()
    } else {
        None
    };

    // 直接使用前端渲染的图片数据执行图片任务
    execute_image_task(
        &task.device_ids,
        &api_key,
        &rendered_image_data,
        link,
    ).await
}

#[tauri::command]
pub fn automation_get_t2i_task_with_macros(
    task_id: String,
    state: tauri::State<SimpleAutomationManager>
) -> Result<serde_json::Value, String> {
    // 获取任务
    let task = {
        let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
        tasks.get(&task_id).cloned()
            .ok_or_else(|| "任务不存在".to_string())?
    };

    if let TaskConfig::TextToImage { background_color, background_image, texts, link } = &task.config {
        // 对所有文本元素进行宏替换
        let macro_replacer = MacroReplacer::new();
        let mut processed_texts = Vec::new();
        
        for text in texts {
            let processed_content = macro_replacer.replace(&text.content);
            
            // 创建处理后的文本元素
            let mut processed_text = text.clone();
            processed_text.content = processed_content;
            processed_texts.push(processed_text);
        }
        
        // 处理链接中的宏
        let processed_link = link.as_ref().map(|l| macro_replacer.replace(l));
        
        // 返回处理后的配置
        Ok(serde_json::json!({
            "background_color": background_color,
            "background_image": background_image,
            "texts": processed_texts,
            "link": processed_link
        }))
    } else {
        Err("任务不是TextToImage类型".to_string())
    }
}

#[tauri::command]
pub fn automation_generate_planned_for_date(
    date: String, // YYYY-MM-DD
    order: Vec<String>, // 按用户排列的 task_id 列表（高优先在前）
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    // 防抖：同一日期若已在生成中，直接忽略
    {
        let inflight = state.planning_inflight.lock().map_err(|e| e.to_string())?;
        if inflight.contains(&date) {
            println!("⏳ 已有生成任务进行中: {}，忽略重复请求", date);
            return Ok(());
        }
    }
    {
        // 标记为进行中
        let mut inflight = state.planning_inflight.lock().map_err(|e| e.to_string())?;
        inflight.insert(date.clone());
    }
    // 将重计算放到后台线程，避免阻塞前端 UI
    let order_len = order.len();
    let order_preview: Vec<_> = order.iter().take(10).cloned().collect();
    println!(
        "📅 异步生成计划队列启动: 日期={}, order_count={}, order_preview={:?}",
        date, order_len, order_preview
    );

    // 预先取到文件路径和共享资源，以便在线程中使用
    let planned_path = state.planned_file_path();
    let tasks_path = state.tasks_file_path();
    let tasks_arc = Arc::clone(&state.tasks);
    let planned_arc = Arc::clone(&state.planned);
    let app_handle_arc = Arc::clone(&state.app_handle);
    let inflight_arc = Arc::clone(&state.planning_inflight);
    let date_cloned = date.clone();
    let order_cloned = order.clone();
    let tasks_path_cloned = tasks_path.clone();
    // 计算每任务计划输出目录（planned_tasks/<date>/）
    let per_task_root_dir: PathBuf = planned_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
        .join("planned_tasks");

    std::thread::spawn(move || {
        // 用闭包封装主逻辑，确保最终清理 in-flight 标记
        let result = (|| {
            let now = Utc::now();
            // 解析日期和当天起止时间（按上海时区）
            let target_date = match NaiveDate::parse_from_str(&date_cloned, "%Y-%m-%d") {
                Ok(d) => d,
                Err(e) => { eprintln!("生成计划失败(解析日期): {}", e); return; }
            };
            let local_start_naive = match target_date.and_hms_opt(0, 0, 0) { Some(t) => t, None => { eprintln!("无效的开始时间"); return; } };
            let local_day_end_naive = match target_date.and_hms_opt(23, 59, 59) { Some(t) => t, None => { eprintln!("无效的结束时间"); return; } };
            let start = Shanghai.from_local_datetime(&local_start_naive).single().unwrap().with_timezone(&Utc);
            let end = Shanghai.from_local_datetime(&local_day_end_naive).single().unwrap().with_timezone(&Utc);

            // 同步一次优先级并快照任务列表，尽量缩短锁持有时间
            let tasks_snapshot: HashMap<String, AutomationTask> = {
                let mut tasks_map = match tasks_arc.lock() { Ok(g) => g, Err(_) => { eprintln!("任务锁被毒化"); return; } };
                for (idx, tid) in order_cloned.iter().enumerate() {
                    if let Some(t) = tasks_map.get_mut(tid) {
                        t.priority = idx as i32;
                        t.updated_at = now;
                    }
                }
                // 将最新优先级写入 tasks.json（释放锁后写文件）
                let snapshot = tasks_map.clone();
                snapshot
            };

            // 保存 tasks.json 以便前端同步（已包含最新优先级）
            {
                let tasks_vec: Vec<AutomationTask> = tasks_snapshot.values().cloned().collect();
                match serde_json::to_string_pretty(&tasks_vec) {
                    Ok(json) => { let _ = fs::write(&tasks_path_cloned, json); }
                    Err(e) => eprintln!("序列化任务失败: {}", e),
                }
            }

            // 构造每个任务的当日日程（开始时间 + 持续时间），不做平移
            #[derive(Clone)]
            struct Occ { start: DateTime<Utc>, end: DateTime<Utc>, task_id: String, priority_idx: usize }
            let mut occs: Vec<Occ> = Vec::new();
            let default_duration = chrono::Duration::seconds(5);
            let mut push_occ = |dt: DateTime<Utc>, task: &AutomationTask, pri: usize| {
                if dt >= start && dt < end {
                    let dur = chrono::Duration::seconds(task.duration_sec.unwrap_or(5) as i64);
                    let duration = if dur > chrono::Duration::zero() { dur } else { default_duration };
                    let st = dt;
                    let ed = st + duration;
                    if ed <= end {
                        occs.push(Occ { start: st, end: ed, task_id: task.id.clone(), priority_idx: pri });
                    }
                }
            };

            for (pri_idx, task_id) in order_cloned.iter().enumerate() {
                if let Some(task) = tasks_snapshot.get(task_id) {
                    if !task.enabled { continue; }
                    if let Some(fx) = task.fixed_at {
                        push_occ(fx, task, pri_idx);
                    } else if let Some(interval_seconds) = task.interval_sec {
                        if interval_seconds > 0 {
                            let mut t = start;
                            while t < end { push_occ(t, task, pri_idx); t = t + chrono::Duration::seconds(interval_seconds as i64); }
                        }
                    } else {
                        let expr = task.schedule.trim();
                        // 支持到秒的 6 字段表达式：sec min hour day mon dow
                        // 也兼容旧的 5 字段（无秒）表达式：min hour day mon dow
                        // 优先尝试使用 cron crate 解析；失败则回退到既有的简单规则
                        let mut used_cron = false;
                        if !expr.is_empty() {
                            let fields: Vec<&str> = expr.split_whitespace().collect();
                            if fields.len() == 6 || fields.len() == 5 {
                                let expr_with_sec = if fields.len() == 5 {
                                    // 旧 5 字段：默认秒=0
                                    format!("0 {}", expr)
                                } else { expr.to_string() };
                                if let Ok(schedule) = cron::Schedule::from_str(&expr_with_sec) {
                                    used_cron = true;
                                    // 在上海时区按天窗口内迭代触发点
                                    let window_start_local = start.with_timezone(&Shanghai);
                                    let window_end_local = end.with_timezone(&Shanghai);
                                    for dt_local in schedule.after(&window_start_local).take_while(|d| *d < window_end_local) {
                                        let dt_utc = dt_local.with_timezone(&Utc);
                                        push_occ(dt_utc, task, pri_idx);
                                    }
                                }
                            }
                        }

                        if !used_cron {
                            // 旧规则回退：每分钟、整点、或简单“0 H * * *”样式
                            match expr {
                                "* * * * *" => { let mut t = start; while t < end { push_occ(t, task, pri_idx); t = t + chrono::Duration::minutes(1); } }
                                "0 * * * *" => { let mut t = start; while t < end { push_occ(t, task, pri_idx); t = t + chrono::Duration::hours(1); } }
                                _ if expr.starts_with("0 ") => {
                                    let hour = expr.split_whitespace().nth(1).and_then(|h| h.parse::<u32>().ok()).unwrap_or(9);
                                    if let Some(local_datetime) = target_date.and_hms_opt(hour, 0, 0) {
                                        if let Some(sh) = Shanghai.from_local_datetime(&local_datetime).single() {
                                            let dt = sh.with_timezone(&Utc);
                                            push_occ(dt, task, pri_idx);
                                        }
                                    }
                                }
                                _ => { let mut t = start; while t < end { push_occ(t, task, pri_idx); t = t + chrono::Duration::hours(1); } }
                            }
                        }
                    }
                }
            }

            // 先为每个单独任务输出当日 planned_queue 文件：planned_tasks/<date>/<task_id>.json
            // 内容为该任务当天的所有 Occ 列表，未与其它任务合并前的原始计划
            {
                use std::collections::HashMap as StdHashMap;
                // 分组
                let mut by_task: StdHashMap<String, Vec<&Occ>> = StdHashMap::new();
                for o in &occs {
                    by_task.entry(o.task_id.clone()).or_default().push(o);
                }

                // 确保日期目录存在
                let day_dir = per_task_root_dir.join(&date_cloned);
                if let Err(e) = fs::create_dir_all(&day_dir) {
                    eprintln!("创建每任务计划目录失败: {:?} -> {}", day_dir, e);
                }

                for (tid, mut list) in by_task.into_iter() {
                    // 按开始时间排序
                    list.sort_by_key(|o| o.start);

                    // 构建 PlannedItem 列表（仅该任务）
                    let mut items: Vec<PlannedItem> = Vec::new();
                    for (idx, oc) in list.iter().enumerate() {
                        let time_str = oc.start.with_timezone(&Shanghai).format("%H:%M:%S").to_string();
                        let dur_secs = oc.end.signed_duration_since(oc.start).num_seconds().max(0) as u32;
                        items.push(PlannedItem {
                            id: uuid::Uuid::new_v4().to_string(),
                            task_id: tid.clone(),
                            date: date_cloned.clone(),
                            time: time_str,
                            position: (idx as u32) + 1,
                            status: "pending".into(),
                            created_at: now,
                            executed_at: None,
                            scheduled_at: Some(oc.start),
                            scheduled_end_at: Some(oc.end),
                            duration_sec: Some(dur_secs),
                        });
                    }

                    // 写入文件 planned_tasks/<date>/<task_id>.json
                    let file_path = day_dir.join(format!("{}.json", tid));
                    match serde_json::to_string_pretty(&items) {
                        Ok(json) => {
                            if let Err(e) = fs::write(&file_path, json) {
                                eprintln!("写入每任务计划失败: {:?} -> {}", file_path, e);
                            }
                        }
                        Err(e) => eprintln!("序列化每任务计划失败 (task={}): {}", tid, e),
                    }
                }
            }

            // 先按优先级索引（数值大=低优先）与开始时间排序
            occs.sort_by(|a, b| a.priority_idx.cmp(&b.priority_idx).then(a.start.cmp(&b.start)));

            // 合并执行队列：先放入低优先（索引大），再放入高优先（索引小），
            // 如果低优先的开始时间落在高优先的持续区间内，则移除该低优先任务
            let mut kept: Vec<Occ> = Vec::new();
            if !occs.is_empty() {
                let max_pri = occs.iter().map(|o| o.priority_idx).max().unwrap_or(0);
                for current_pri in (0..=max_pri).rev() { // 从低优先到高优先
                    // 本优先级的所有 occ，按开始时间排序
                    let mut current: Vec<Occ> = occs.iter().filter(|o| o.priority_idx == current_pri).cloned().collect();
                    current.sort_by_key(|o| o.start);
                    for hb in current {
                        // 高优先进入时，清理 kept 中低优先（priority_idx > current_pri）且 start ∈ [hb.start, hb.end)
                        kept.retain(|low| {
                            if low.priority_idx > current_pri {
                                !(low.start >= hb.start && low.start < hb.end)
                            } else { true }
                        });
                        // 将当前（可能是低优先或更高优先）加入 kept
                        kept.push(hb);
                    }
                }
            }
            // 输出按开始时间排序
            kept.sort_by(|a, b| a.start.cmp(&b.start).then(a.priority_idx.cmp(&b.priority_idx)));

            // 生成 PlannedItem
            let mut items: Vec<PlannedItem> = Vec::new();
            for (i, b) in kept.iter().enumerate() {
                let time_str = b.start.with_timezone(&Shanghai).format("%H:%M:%S").to_string();
                let dur_secs = b.end.signed_duration_since(b.start).num_seconds().max(0) as u32;
                items.push(PlannedItem {
                    id: uuid::Uuid::new_v4().to_string(),
                    task_id: b.task_id.clone(),
                    date: date_cloned.clone(),
                    time: time_str,
                    position: (i as u32) + 1,
                    status: "pending".into(),
                    created_at: now,
                    executed_at: None,
                    scheduled_at: Some(b.start),
                    scheduled_end_at: Some(b.end),
                    duration_sec: Some(dur_secs),
                });
            }

            // 写回 merged planned（清空旧内容，只保留本次生成的队列），并保存到磁盘
            {
                let mut planned = match planned_arc.lock() { Ok(g) => g, Err(_) => { eprintln!("计划队列锁被毒化"); return; } };
                planned.clear();
                planned.extend(items.clone());
                if let Ok(json) = serde_json::to_string_pretty(&*planned) { let _ = fs::write(&planned_path, json); }
            }

            // 通知任务列表已更新（优先级写盘），以及计划队列已生成
            if let Ok(h) = app_handle_arc.lock() {
                if let Some(handle) = &*h { let _ = handle.emit("automation:tasks:updated", serde_json::json!({"saved": true})); }
            }
            // 发送完成事件（若前端监听可刷新）
            if let Ok(h) = app_handle_arc.lock() {
                if let Some(handle) = &*h { let _ = handle.emit("automation:planned:generated", serde_json::json!({"date": date_cloned, "count": items.len()})); }
            }

            println!("✅ 计划队列生成完成(异步): {} 共生成 {} 个任务项", date_cloned, items.len());
        })();

        // 清理 in-flight 标记
        if let Ok(mut inflight) = inflight_arc.lock() {
            inflight.remove(&date_cloned);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn automation_get_planned_for_date(
    date: String,
    state: tauri::State<SimpleAutomationManager>
) -> Result<Vec<PlannedItem>, String> {
    let planned = state.planned.lock().map_err(|e| e.to_string())?;
    let mut items: Vec<PlannedItem> = planned.iter().filter(|p| p.date == date).cloned().collect();
    items.sort_by(|a, b| a.scheduled_at.cmp(&b.scheduled_at).then(a.position.cmp(&b.position)));
    Ok(items)
}

#[tauri::command]
pub fn automation_clear_planned_for_date(
    date: String,
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    {
        let mut planned = state.planned.lock().map_err(|e| e.to_string())?;
        planned.retain(|p| p.date != date);
    }
    state.save_planned();
    Ok(())
}

// 辅助函数：检查任务是否应该执行
// 注意：should_execute_task 和 parse_hour_from_cron 函数已移除
// 现在只使用计划队列调度，支持三种模式：固定时间、间隔调度、cron调度

#[derive(Debug, Clone, Eq, PartialEq)]
struct CandidatePriority {
    // 用户定义的优先级（数值越小越优先）
    user_priority: i32,
    // kind: 0 = fixed-time, 1 = interval, 2 = cron
    kind_rank: u8,
    // 对 fixed：fixed_at 秒戳；对 interval：间隔秒数；对 cron：0
    key1: i64,
    // 对 fixed：0；对 interval：0；对 cron：0（保留用于扩展）
    key2: i64,
    // 进一步稳定排序：last_run 越早越优先（秒戳）
    key3: i64,
    // 再以 id 做稳定排序
    id: String,
}

impl Ord for CandidatePriority {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // 先看用户优先级；相同再看调度类型；再比较 key；再看 last_run；最后按 id 稳定
        self.user_priority.cmp(&other.user_priority)
            .then(self.kind_rank.cmp(&other.kind_rank))
            .then(self.key1.cmp(&other.key1))
            .then(self.key2.cmp(&other.key2))
            .then(self.key3.cmp(&other.key3))
            .then(self.id.cmp(&other.id))
    }
}

impl PartialOrd for CandidatePriority {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

// 判断任务是否“到期可选”：
// - 若存在 fixed_at 且 now >= fixed_at 则可选
// - 否则回退到原有 cron 规则（每分钟/每小时/每日某时）
// 注意：is_task_due 函数已移除，现在只使用计划队列调度

// 计算优先级：
// - 固定任务：kind_rank=0，key1=fixed_at 秒戳（更早更优），key2=0
// - 间隔任务：kind_rank=1，key1=间隔秒数（更短更优），key2=0
// - cron任务：kind_rank=2，key1=0，key2=0
fn compute_priority(task: &AutomationTask, _now: DateTime<Utc>) -> Option<CandidatePriority> {
    let last_run_ts = task
        .last_run
        .map(|t| t.timestamp())
        .unwrap_or(0);
    let user_p = task.priority;

    if let Some(fixed_at) = task.fixed_at {
        return Some(CandidatePriority {
            user_priority: user_p,
            kind_rank: 0,
            key1: fixed_at.timestamp(),
            key2: 0,
            key3: last_run_ts,
            id: task.id.clone(),
        });
    }

    if let Some(interval_sec) = task.interval_sec {
        return Some(CandidatePriority {
            user_priority: user_p,
            kind_rank: 1,
            key1: interval_sec as i64, // 间隔越短优先级越高
            key2: 0,
            key3: last_run_ts,
            id: task.id.clone(),
        });
    }

    // 仅 cron：给最低优先级
    Some(CandidatePriority {
    user_priority: user_p,
        kind_rank: 2,
        key1: 0,
        key2: 0,
        key3: last_run_ts,
        id: task.id.clone(),
    })
}

// 辅助函数：执行具体任务类型
async fn execute_task_by_type(task: &AutomationTask, api_key: &str) -> Result<(), String> {
    match &task.task_type {
        TaskType::Text => {
            if let TaskConfig::Text { title, message, signature, icon, link } = &task.config {
                execute_text_task(
                    &task.device_ids,
                    api_key,
                    title,
                    message,
                    signature,
                    icon.as_deref(),
                    link.as_deref(),
                ).await
            } else {
                Err("任务配置类型不匹配".to_string())
            }
        }
        TaskType::Image => {
            if let TaskConfig::Image { image_data, link, .. } = &task.config {
                execute_image_task(
                    &task.device_ids,
                    api_key,
                    image_data,
                    link.as_deref(),
                ).await
            } else {
                Err("任务配置类型不匹配".to_string())
            }
        }
        TaskType::TextToImage => {
            if let TaskConfig::TextToImage { background_color, background_image, texts, link } = &task.config {
                // 与前端一致的宏替换
                let macro_replacer = MacroReplacer::new();
                let processed_texts: Vec<TextElement> = texts.iter().map(|t| {
                    let mut nt = t.clone();
                    nt.content = macro_replacer.replace(&t.content);
                    nt
                }).collect();

                match render_t2i_via_headless_canvas(background_color, background_image.as_deref(), &processed_texts).await {
                    Ok(data_url) => {
                        return execute_image_task(&task.device_ids, api_key, &data_url, link.as_deref()).await;
                    }
                    Err(e) => {
                        println!("❌ 后端Canvas渲染失败: {}", e);
                        return Err(format!("TextToImage任务渲染失败: {}", e));
                    }
                }
            } else {
                Err("任务配置类型不匹配".to_string())
            }
        }
    }
}

// 辅助函数：执行文本任务
async fn execute_text_task(
    device_ids: &[String],
    api_key: &str,
    title: &str,
    message: &str,
    signature: &str,
    icon: Option<&str>,
    link: Option<&str>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    // 验证设备ID
    if device_ids.is_empty() {
        return Err("没有指定设备".to_string());
    }
    
    let device_id = &device_ids[0];
    if device_id.trim().is_empty() {
        return Err("设备ID为空".to_string());
    }
    
    // 创建宏替换器并处理文本内容
    let macro_replacer = MacroReplacer::new();
    let processed_title = macro_replacer.replace(title);
    let processed_message = macro_replacer.replace(message);
    let processed_signature = macro_replacer.replace(signature);
    let processed_link = link.map(|l| macro_replacer.replace(l));
    
    // 如果有宏被替换，输出日志
    if macro_replacer.contains_macros(title) || 
       macro_replacer.contains_macros(message) || 
       macro_replacer.contains_macros(signature) ||
       link.map_or(false, |l| macro_replacer.contains_macros(l)) {
        println!("📝 文本任务宏替换:");
        if processed_title != title {
            println!("  标题: {} -> {}", title, processed_title);
        }
        if processed_message != message {
            println!("  消息: {} -> {}", message, processed_message);
        }
        if processed_signature != signature {
            println!("  签名: {} -> {}", signature, processed_signature);
        }
        if let (Some(original), Some(processed)) = (link, &processed_link) {
            if processed != original {
                println!("  链接: {} -> {}", original, processed);
            }
        }
    }
    
    // 构建请求数据（使用处理后的文本）
    let request_data = crate::TextApiRequest {
        device_id: device_id.clone(),
        title: processed_title.clone(),
        message: processed_message.clone(),
        signature: processed_signature.clone(),
        icon: icon.map(|s| s.to_string()),
    link: processed_link,
    refresh_now: true,
    };

    println!("📝 发送文本到设备: {}", request_data.device_id);
    println!("标题: {}, 消息: {}", processed_title, processed_message);
    
    let response = client
        .post("https://dot.mindreset.tech/api/open/text")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_data)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("请求失败 ({}): {}", status, error_text));
    }

    let _result_text = response.text().await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    
    println!("✅ 任务执行成功");
    Ok(())
}

// 辅助函数：执行图片任务
async fn execute_image_task(
    device_ids: &[String],
    api_key: &str,
    image_data: &str,
    link: Option<&str>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    // 验证设备ID
    if device_ids.is_empty() {
        return Err("没有指定设备".to_string());
    }
    
    let device_id = &device_ids[0];
    if device_id.trim().is_empty() {
        return Err("设备ID为空".to_string());
    }
    
    // 创建宏替换器并处理链接
    let macro_replacer = MacroReplacer::new();
    let processed_link = link.map(|l| macro_replacer.replace(l));
    
    // 如果链接中有宏被替换，输出日志
    if let (Some(original), Some(processed)) = (link, &processed_link) {
        if macro_replacer.contains_macros(original) {
            println!("🖼️ 图片任务宏替换:");
            println!("  链接: {} -> {}", original, processed);
        }
    }
    
    // 处理base64数据
    let base64_data = if image_data.starts_with("data:image/") {
        match image_data.find(",") {
            Some(comma_pos) => &image_data[comma_pos + 1..],
            None => return Err("Invalid image data format".to_string()),
        }
    } else {
        image_data
    };
    
    // 构建请求数据（使用处理后的链接）
    let request_data = crate::ImageApiRequest {
        device_id: device_id.clone(),
        image: base64_data.to_string(),
        link: processed_link,
        refresh_now: true,
        border: 0,
        dither_type: "NONE".to_string(),
        dither_kernel: "FLOYD_STEINBERG".to_string(),
    };

    println!("🤖 自动化任务: 发送图片到设备 {}", request_data.device_id);
    
    let response = client
        .post("https://dot.mindreset.tech/api/open/image")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_data)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("请求失败 ({}): {}", status, error_text));
    }

    let _result_text = response.text().await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    
    println!("✅ 任务执行成功");
    Ok(())
}

// 使用与前端一致的 HTML5 Canvas 渲染（通过无头 Chrome）
#[cfg(not(windows))]
async fn render_t2i_via_headless_canvas(
        background_color: &str,
        background_image: Option<&str>,
        texts: &[TextElement],
) -> Result<String, String> {
        use headless_chrome::{Browser, LaunchOptionsBuilder};
        use serde_json::json;

        // 画布尺寸
        let width: u32 = 296;
        let height: u32 = 152;

        // 将渲染参数序列化为 JSON，供页面脚本读取
        let payload = json!({
                "background_color": background_color,
                "background_image": background_image,
                "texts": texts,
                "width": width,
                "height": height,
        }).to_string();

        // 内嵌最小 HTML，使用同前端逻辑的 Canvas API 绘制
        // 注：如前端有现成的渲染脚本，可将逻辑拷贝到这里保持一致
    let html = format!(r##"<!doctype html>
<html>
<head>
    <meta charset='utf-8'>
    <style>html,body{{margin:0;padding:0;background:transparent;}}</style>
</head>
<body>
    <canvas id="c" width="{w}" height="{h}"></canvas>
    <script>
    (function(){{
        const data = {payload};
        const c = document.getElementById('c');
        const ctx = c.getContext('2d');

        function resolveColor(c){{
            if(!c) return '#ffffff';
            const v=String(c).toLowerCase();
            if(v==='white' || v==="#fff" || v==="#ffffff") return '#ffffff';
            if(v==='black' || v==="#000" || v==="#000000") return '#000000';
            if(v==='gray' || v==='grey' || v==="#808080") return '#808080';
            return c;
        }}
        function drawBackground(){{
            if (data.background_image){{
                const img = new Image();
                img.onload = ()=>{{
                    ctx.drawImage(img,0,0,{w},{h});
                    drawTexts();
                }};
                img.src = data.background_image;
            }} else {{
                ctx.fillStyle = resolveColor(data.background_color || 'white');
                ctx.fillRect(0,0,{w},{h});
                drawTexts();
            }}
        }}

        function drawTexts(){{
            (data.texts||[]).forEach(t=>{{
                if(!t.content) return;
                ctx.save();
                ctx.translate(t.x||0, t.y||0);
                if(t.rotation) ctx.rotate(t.rotation*Math.PI/180);
                const weight = t.font_weight||'normal';
                const size = (t.font_size||14);
                const family = t.font_family||'Arial';
                ctx.font = `${{weight}} ${{size}}px ${{family}}`;
                ctx.fillStyle = (t.color==='black' ? '#000000' : (t.color==='white' ? '#ffffff' : (t.color||'#000')));
                ctx.textAlign = (t.text_align||'left');
                ctx.fillText(String(t.content), 0, 0);
                ctx.restore();
            }});
            // 通知 Rust 可以截图
            document.title = 'ready';
        }}

        drawBackground();
    }})();
    </script>
</body>
</html>"##, w=width, h=height, payload=payload);

        // 启动无头 Chrome
        let launch_opts = LaunchOptionsBuilder::default()
                .headless(true)
                .build()
                .map_err(|e| format!("启动 Chrome 失败: {}", e))?;
        let browser = Browser::new(launch_opts).map_err(|e| format!("创建浏览器失败: {}", e))?;
        let tab = browser.new_tab().map_err(|e| format!("创建标签页失败: {}", e))?;

        // 加载内联 HTML（使用 data: URL base64 编码，避免 set_content API 兼容问题）
        let html_b64 = base64::engine::general_purpose::STANDARD.encode(html.as_bytes());
        let data_url = format!("data:text/html;base64,{}", html_b64);
        tab.navigate_to(&data_url).map_err(|e| format!("导航失败: {}", e))?;
        tab.wait_until_navigated().map_err(|e| format!("等待导航失败: {}", e))?;

        // 等待页面 title 变为 'ready'
        use std::time::{Duration, Instant};
        let start = Instant::now();
        loop {
                let title = tab.get_title().unwrap_or_default();
                if title == "ready" { break; }
                if start.elapsed() > Duration::from_secs(5) {
                        return Err("Canvas渲染超时".into());
                }
                std::thread::sleep(Duration::from_millis(50));
        }

        // 从页面获取数据 URL（避免裁剪问题）
        let data_url: String = tab
                .evaluate("document.getElementById('c').toDataURL('image/png')", false)
                .map_err(|e| format!("获取数据URL失败: {}", e))?
                .value
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .ok_or_else(|| "无法读取数据URL".to_string())?;

        Ok(data_url)
}

// Windows 构建下的占位实现（禁用 headless_chrome）
#[cfg(windows)]
async fn render_t2i_via_headless_canvas(
    _background_color: &str,
    _background_image: Option<&str>,
    _texts: &[TextElement],
) -> Result<String, String> {
    Err("Windows 构建未启用后端 Canvas 渲染（移除了 headless_chrome 依赖）".into())
}
