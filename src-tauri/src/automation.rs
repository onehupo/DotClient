use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, TimeZone, Timelike, NaiveDate};
use chrono_tz::Asia::Shanghai;
use std::collections::{HashMap, VecDeque, HashSet};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use std::time::Duration;
use std::path::PathBuf;
use std::fs;
use base64::Engine; // for encode/decode methods on base64 engine
use image::imageops::FilterType;

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
    // 新增：可选的固定时间与间隔调度字段（保持向后兼容）
    #[serde(default)]
    pub fixed_at: Option<DateTime<Utc>>, // 固定时间（一次性）
    #[serde(default)]
    pub min_interval_sec: Option<i64>,   // 最小间隔
    #[serde(default)]
    pub max_interval_sec: Option<i64>,   // 最大间隔（截止）
    #[serde(default)]
    pub interval_sec: Option<i64>,       // 前端使用的单一间隔字段
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
    pub position: u32,
    pub status: String, // "pending" | "done" | "skipped"
    pub created_at: DateTime<Utc>,
    pub executed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub scheduled_at: Option<DateTime<Utc>>, // 计划的触发时间
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

    // 注册 tauri AppHandle（由初始化代码调用），以便向前端推送事件
    pub fn register_app_handle(&self, app: tauri::AppHandle) {
        if let Ok(mut h) = self.app_handle.lock() {
            *h = Some(app);
        }
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
        let app_handle = Arc::clone(&self.app_handle);
         
         std::thread::spawn(move || {
             let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
             
             rt.block_on(async {
                // 每秒对齐检查：1s 粒度，一秒仅启动一个任务
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                let mut last_log_minute = 0u32; // 用于控制日志输出频率
                
                loop {
                    interval.tick().await;
                    
                    let now = Utc::now();
                    let shanghai_time = now.with_timezone(&Shanghai);
                    let current_minute = shanghai_time.minute();
                    
                    // 只在分钟变化时输出调度循环日志
                    if current_minute != last_log_minute {
                        println!("🔄 FROM=调度循环: {}", shanghai_time.format("%Y-%m-%d %H:%M"));
                        last_log_minute = current_minute;
                    }
                    
                    // 检查全局自动化开关
                    let is_enabled = {
                        let enabled_guard = automation_enabled.lock().unwrap();
                        *enabled_guard
                    };
                    
                    if !is_enabled {
                        // 如果自动化被禁用，跳过这次检查（不输出日志）
                        continue;
                    }

                    // 处理过期的计划项目，将其标记为跳过
                    {
                        let mut p = planned.lock().unwrap();
                        let today = now.with_timezone(&Shanghai).date_naive().to_string();
                        let mut marked_count = 0;
                        
                        for item in p.iter_mut() {
                            if item.date == today && item.status == "pending" {
                                if let Some(scheduled) = item.scheduled_at {
                                    let diff_seconds = (now - scheduled).num_seconds();
                                    // 如果超过1秒且已经过期，标记为跳过
                                    if diff_seconds > 1 && now > scheduled {
                                        item.status = "skipped".to_string();
                                        marked_count += 1;
                                    }
                                }
                            }
                        }
                        
                        if marked_count > 0 {
                            println!("⏭️ 跳过 {} 个过期任务", marked_count);
                        }
                    }

                    // 1) 构建候选集：来自 backlog + 新到期任务
                    let mut candidate_ids: Vec<String> = {
                        let mut ids = Vec::new();
                        // 先取出 backlog（不清空，仅复制顺序）
                        let bl_guard = backlog.lock().unwrap();
                        for id in bl_guard.iter() { ids.push(id.clone()); }
                        ids
                    };

                    let tasks_snapshot: Vec<AutomationTask> = {
                        let guard = tasks.lock().unwrap();
                        guard.values().cloned().collect()
                    };

                    for t in tasks_snapshot.iter() {
                        if !t.enabled { 
                            continue; 
                        }
                        
                        // 检查该任务是否在今天（以上海时区为准）的计划队列中，且有待执行项目
                        let today = now.with_timezone(&Shanghai).date_naive().to_string();
                        
                        let has_pending_planned_for_this_task = {
                            let p = planned.lock().unwrap();
                            let pending_items: Vec<_> = p.iter()
                                .filter(|pi| pi.date == today && pi.task_id == t.id && pi.status == "pending")
                                .collect();
                            
                            !pending_items.is_empty()
                        };
                        
                        // 如果该任务在计划队列中，检查是否到达计划执行时间（精确时间，不允许延迟）
                        let planned_due = if has_pending_planned_for_this_task {
                            let p = planned.lock().unwrap();
                            
                            let due_items: Vec<_> = p.iter()
                                .filter(|pi| {
                                    if pi.date == today && pi.status == "pending" && pi.task_id == t.id {
                                        if let Some(scheduled) = pi.scheduled_at {
                                            // 只在精确时间点执行，不允许延迟（精确到秒）
                                            let diff_seconds = (now - scheduled).num_seconds().abs();
                                            diff_seconds <= 1 && now >= scheduled
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                })
                                .collect();
                            
                            if !due_items.is_empty() {
                                println!("⏰ 任务 {} 到达执行时间", t.name);
                            }
                            
                            !due_items.is_empty()
                        } else {
                            false
                        };
                        
                        // 只使用计划队列逻辑，没有计划就不执行
                        let should_execute = if has_pending_planned_for_this_task {
                            planned_due
                        } else {
                            // 没有在计划队列中的任务不执行
                            false
                        };
                        
                        if should_execute {
                            candidate_ids.push(t.id.clone());
                        }
                    }

                    // 去重
                    let mut seen: HashSet<String> = HashSet::new();
                    candidate_ids.retain(|id| seen.insert(id.clone()));

                    // 组装候选任务并计算优先级键（结合计划队列位置）
                    let mut candidates: Vec<(AutomationTask, CandidatePriority)> = Vec::new();
                    // 获取今天的日期（上海时区）
                    let today = now.with_timezone(&Shanghai).date_naive().to_string();
                    let planned_snapshot: Vec<PlannedItem> = { planned.lock().unwrap().clone() };
                    for id in candidate_ids.iter() {
                        if let Some(task) = tasks_snapshot.iter().find(|t| &t.id == id) {
                            if let Some(mut pri) = compute_priority(task, now) {
                                // 若存在计划项，按 position 提升优先级
                                if let Some(p) = planned_snapshot
                                    .iter()
                                    .filter(|pi| pi.date == today && pi.status == "pending" && pi.task_id == task.id)
                                    .min_by_key(|pi| pi.position) {
                                    // 让计划项优先：把 kind_rank 设为 0，并以 position 作为主键
                                    pri.kind_rank = 0;
                                    pri.key1 = p.position as i64;
                                }
                                candidates.push((task.clone(), pri));
                            }
                        }
                    }

                    // 排序：固定时间优先；间隔按deadline紧迫度、最小间隔等次序
                    candidates.sort_by(|a, b| a.1.cmp(&b.1));

                    // 仅取一个任务执行；其余回写 backlog
                    if let Some((task, _pri)) = candidates.first().cloned() {
                        // 回写 backlog（不包括已选任务）
                        {
                            let mut bl = backlog.lock().unwrap();
                            bl.clear();
                            for (t, _p) in candidates.into_iter().skip(1) {
                                bl.push_back(t.id);
                            }
                        }

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

                        // 记录执行日志
                        let log = TaskExecutionLog {
                            id: uuid::Uuid::new_v4().to_string(),
                            task_id: task.id.clone(),
                            executed_at,
                            success,
                            error_message,
                            duration_ms,
                        };
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(log);
                        }

                        // 更新任务统计与调度字段
                        {
                            let mut tasks_guard = tasks.lock().unwrap();
                            if let Some(task_mut) = tasks_guard.get_mut(&task.id) {
                                task_mut.last_run = Some(executed_at);
                                task_mut.run_count += 1;
                                if !success { task_mut.error_count += 1; }

                                // 若为一次性 fixed_at，执行后清空
                                if task_mut.fixed_at.is_some() {
                                    task_mut.fixed_at = None;
                                }
                            }
                        }

                        // 标记计划项为完成（以上海时区判断日期）
                        {
                            let mut planned_guard = planned.lock().unwrap();
                            let today_str = executed_at.with_timezone(&Shanghai).date_naive().to_string();
                            
                            // 找到今天第一个待执行且匹配的项
                            if let Some(item) = planned_guard
                .iter_mut()
                .filter(|pi| pi.date == today_str && pi.status == "pending" && pi.task_id == task.id)
                                .min_by_key(|pi| pi.position) {
                                item.status = if success { "done".into() } else { "skipped".into() };
                                item.executed_at = Some(executed_at);
                                
                                println!("✅ 任务完成: {}", if success { "成功" } else { "失败" });
                            }
                            
                            // 保存
                            if let Ok(json) = serde_json::to_string_pretty(&*planned_guard) {
                                let _ = fs::write(tasks_file_path.parent().unwrap().join("planned_queue.json"), json);
                            }
                            // 新增：检查是否当天全部计划项已完成（无 pending）且 backlog 为空
                            let remaining_pending = planned_guard.iter()
                                .filter(|p| p.date == today_str && p.status == "pending")
                                .count();
                            let backlog_len = backlog.lock().map(|b| b.len()).unwrap_or(0);
                            if remaining_pending == 0 && backlog_len == 0 {
                                println!("🎉 当日计划已全部完成: {}", today_str);
                                // 可选：在此触发其它动作，例如发送通知、调用外部回调或写入标记文件
                                // let _ = fs::write(self.data_dir.join(format!("completed_{}.stamp", today_str)), "done");
                                // 若注册了 AppHandle，向前端广播计划已更新事件（payload 为日期字符串）
                                if let Ok(ah) = app_handle.lock() {
                                    if let Some(app) = ah.as_ref() {
                                        let _ = app.emit("planned-updated", today_str.clone());
                                    }
                                }
                             }
                         }                        // 持久化任务与日志（日志保留最近100条）
                        {
                            let tasks_guard = tasks.lock().unwrap();
                            let tasks_vec: Vec<AutomationTask> = tasks_guard.values().cloned().collect();
                            if let Ok(json_data) = serde_json::to_string_pretty(&tasks_vec) {
                                let _ = fs::write(&tasks_file_path, json_data);
                            }
                        }
                        {
                            let logs_guard = logs.lock().unwrap();
                            let logs_to_save: Vec<TaskExecutionLog> = logs_guard.iter().rev().take(100).cloned().collect::<Vec<_>>().into_iter().rev().collect();
                            if let Ok(json_data) = serde_json::to_string_pretty(&logs_to_save) {
                                let _ = fs::write(&logs_file_path, json_data);
                            }
                        }
                    } else {
                        // 无任务可执行：清理 backlog 以避免陈旧堆积
                        let mut bl = backlog.lock().unwrap();
                        bl.clear();
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

        // 如果前端传了 interval_sec，转换为 min_interval_sec（移除max_interval_sec的容错机制）
        if let Some(interval) = task.interval_sec {
            task.min_interval_sec = Some(interval);
            task.max_interval_sec = Some(interval); // 设为相同值，取消容错窗口
        }

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

        // 如果前端传了 interval_sec，转换为 min_interval_sec（移除max_interval_sec的容错机制）
        if let Some(interval) = task.interval_sec {
            task.min_interval_sec = Some(interval);
            task.max_interval_sec = Some(interval); // 设为相同值，取消容错窗口
        }

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
                if let TaskConfig::TextToImage { background_color, background_image, link, .. } = &task.config {
                    // 生成图片（当前版本先忽略文本叠加，使用背景图或纯色背景）
                    let image_data = generate_t2i_image(background_color, background_image.as_deref())?;
                    self.execute_image_task(
                        &task.device_ids,
                        api_key,
                        &image_data,
                        link.as_deref(),
                    ).await
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
        
        // 构建请求数据
        let request_data = crate::TextApiRequest {
            device_id: device_id.clone(),
            title: title.to_string(),
            message: message.to_string(),
            signature: signature.to_string(),
            icon: icon.map(|s| s.to_string()),
            link: link.map(|s| s.to_string()),
        };

        println!("📝 发送文本到设备: {}", request_data.device_id);
        println!("标题: {}, 消息: {}", title, message);
        
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
        
        // 处理base64数据
        let base64_data = if image_data.starts_with("data:image/") {
            match image_data.find(",") {
                Some(comma_pos) => &image_data[comma_pos + 1..],
                None => return Err("Invalid image data format".to_string()),
            }
        } else {
            image_data
        };
        
        // 构建请求数据
        let request_data = crate::ImageApiRequest {
            device_id: device_id.clone(),
            image: base64_data.to_string(),
            link: link.map(|s| s.to_string()),
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
pub fn automation_generate_planned_for_date(
    date: String, // YYYY-MM-DD
    order: Vec<String>, // 按用户排列的 task_id 列表（高优先在前）
    state: tauri::State<SimpleAutomationManager>
) -> Result<(), String> {
    // 打印输入参数
    // 精简日志：打印日期、order 长度与前 10 项预览，以及 tasks/planned 的数量（若能获取）
    let order_len = order.len();
    let order_preview: Vec<_> = order.iter().take(10).collect();
    let tasks_count = match state.tasks.lock() {
        Ok(m) => m.len(),
        Err(_) => 0,
    };
    let planned_count = match state.planned.lock() {
        Ok(p) => p.len(),
        Err(_) => 0,
    };
    println!(
        "📅 生成计划队列: 日期={}, order_count={}, order_preview={:?}, tasks={}, planned={}",
        date, order_len, order_preview, tasks_count, planned_count
    );
    // 生成当天计划：依据任务调度模式在当天展开多次发生点，按时间排序
    let now = Utc::now();
    
    // 修复：以上海时区为准，队列从当天 00:00:00 到当前的 23:59:59
    let target_date: NaiveDate = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let local_start_naive = target_date.and_hms_opt(0, 0, 0).ok_or_else(|| "无效的开始时间".to_string())?;
    let local_day_end_naive = target_date
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| "无效的结束时间".to_string())?;
    let start = Shanghai.from_local_datetime(&local_start_naive).single().unwrap().with_timezone(&Utc);
    let end = Shanghai.from_local_datetime(&local_day_end_naive).single().unwrap().with_timezone(&Utc);

    println!("📅 生成计划队列: {} 从上海时区 00:00:00 到次日 23:59:59", date);
    println!("⏰ 本地时间: {} 到 {}", local_start_naive.format("%Y-%m-%d %H:%M:%S"), local_day_end_naive.format("%Y-%m-%d %H:%M:%S"));
    println!("⏰ UTC时间范围: {} 到 {}", start.format("%Y-%m-%d %H:%M:%S"), end.format("%Y-%m-%d %H:%M:%S"));

    let tasks_map = state.tasks.lock().map_err(|e| e.to_string())?;
    let mut occurrences: Vec<(DateTime<Utc>, String)> = Vec::new(); // (scheduled_at, task_id)

    // helper: push if in [start,end)
    let mut push_occ = |dt: DateTime<Utc>, tid: &str| {
        if dt >= start && dt < end { occurrences.push((dt, tid.to_string())); }
    };

    for task_id in order.iter() {
        if let Some(task) = tasks_map.get(task_id) {
            // 根据模式展开：
            if task.fixed_at.is_some() {
                if let Some(fx) = task.fixed_at {
                    push_occ(fx, &task.id);
                }
            } else if let Some(interval) = task.interval_sec.or(task.min_interval_sec) {
                // 优先使用 interval_sec（前端配置），其次使用 min_interval_sec
                let step = chrono::Duration::seconds(interval.max(1));
                let mut t = start;
                
                // 修复：合理处理历史时间，避免生成过多项目
                if let Some(last) = task.last_run {
                    let next_scheduled = last + chrono::Duration::seconds(interval.max(0));
                    
                    // 如果下次计划执行时间在今天之内，从该时间开始
                    if next_scheduled >= start && next_scheduled < end {
                        t = next_scheduled;
                    } else if next_scheduled < start {
                        // 如果下次执行时间在今天之前，说明已经错过了，从今天开始
                        // 但要找到合适的起始点，避免生成太多项目
                        let time_since_start = (start - last).num_seconds().max(0);
                        let intervals_passed = time_since_start / interval.max(1);
                        t = last + chrono::Duration::seconds(intervals_passed * interval.max(1));
                        
                        // 确保不早于今天开始时间
                        while t < start {
                            t = t + step;
                        }
                    }
                    // 如果下次执行时间在今天之后，则今天不生成任何项目
                    else {
                        println!("📅 任务 {} 下次执行时间 {} 在今天之后，跳过生成", 
                            task.id, next_scheduled.with_timezone(&Shanghai).format("%Y-%m-%d %H:%M:%S"));
                        continue;
                    }
                }
                
                println!("📋 任务 {} 间隔 {}秒，从 {} 开始生成计划项目", 
                    task.id, interval, t.with_timezone(&Shanghai).format("%H:%M:%S"));
                
                // 限制最大生成数量，避免过度生成
                let max_items = (24 * 3600 / interval.max(1)).min(65535); // 最多1000项或一天的数量
                let mut count = 0;
                
                while t < end && count < max_items {
                    push_occ(t, &task.id);
                    t = t + step;
                    count += 1;
                }
                
                if count >= max_items {
                    println!("⚠️ 任务 {} 计划项目数量达到上限 {}", task.id, max_items);
                }
            } else if let (Some(mini), Some(_maxi)) = (task.min_interval_sec, task.max_interval_sec) {
                // 兼容旧的 min/max 间隔逻辑
                let step = chrono::Duration::seconds(mini.max(1));
                let mut t = start;
                // 若存在 last_run，当天首个不早于 last_run+min
                if let Some(last) = task.last_run {
                    let first_earliest = last + chrono::Duration::seconds(mini.max(0));
                    if first_earliest > t { t = first_earliest; }
                }
                while t < end {
                    push_occ(t, &task.id);
                    t = t + step;
                }
            } else {
                // cron/默认：支持常见预设，粗略展开
                let cron = task.schedule.as_str();
                match cron {
                    "* * * * *" => {
                        // 每分钟
                        let mut t = start;
                        while t < end { push_occ(t, &task.id); t = t + chrono::Duration::minutes(1); }
                    }
                    "0 * * * *" => {
                        // 每小时，整点
                        let mut t = start;
                        while t < end { push_occ(t, &task.id); t = t + chrono::Duration::hours(1); }
                    }
                    _ if cron.starts_with("0 ") => {
                        // 粗略：每天小时=第二段，使用上海时区
                        let hour = cron.split_whitespace().nth(1).and_then(|h| h.parse::<u32>().ok()).unwrap_or(9);
                        if let Some(local_datetime) = target_date.and_hms_opt(hour, 0, 0) {
                            let sh_dt = Shanghai.from_local_datetime(&local_datetime).single();
                            if let Some(sh) = sh_dt {
                                let dt = sh.with_timezone(&Utc);
                                push_occ(dt, &task.id);
                            }
                        }
                    }
                    _ => {
                        // 默认每小时一次
                        let mut t = start;
                        while t < end { push_occ(t, &task.id); t = t + chrono::Duration::hours(1); }
                    }
                }
            }
        }
    }

    // 按时间排序，并赋予 position
    occurrences.sort_by_key(|(dt, _)| *dt);
    let mut items: Vec<PlannedItem> = Vec::new();
    for (i, (dt, tid)) in occurrences.into_iter().enumerate() {
        items.push(PlannedItem {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: tid,
            date: date.clone(),
            position: (i as u32) + 1,
            status: "pending".into(),
            created_at: now,
            executed_at: None,
            scheduled_at: Some(dt),
        });
    }
    {
        let mut planned = state.planned.lock().map_err(|e| e.to_string())?;
        // 先移除该日期旧项
        planned.retain(|p| p.date != date);
        planned.extend(items.clone());
    }
    state.save_planned();
    
    println!("✅ 计划队列生成完成: {} 共生成 {} 个任务项", date, items.len());
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
// 现在只使用计划队列调度，不再使用传统的cron/间隔调度

#[derive(Debug, Clone, Eq, PartialEq)]
struct CandidatePriority {
    // kind: 0 = fixed-time, 1 = interval/cron
    kind_rank: u8,
    // 对 fixed：fixed_at 秒戳；对 interval：time_to_deadline（秒）
    key1: i64,
    // 对 interval：min_interval_sec（越小越优先）；对 fixed：0
    key2: i64,
    // 进一步稳定排序：last_run 越早越优先（秒戳）
    key3: i64,
    // 再以 id 做稳定排序
    id: String,
}

impl Ord for CandidatePriority {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // 注意：我们希望 fixed 优先（kind_rank 小者优先），key 越小越优先
        self.kind_rank.cmp(&other.kind_rank)
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
// - 若存在 min interval 则严格按照间隔执行，错过就不再执行
// - 否则回退到原有 cron 规则（每分钟/每小时/每日某时）
// 注意：is_task_due 函数已移除，现在只使用计划队列调度

// 计算优先级：
// - 固定任务：kind_rank=0，key1=fixed_at 秒戳（更早更优），key2=0
// - 间隔任务：kind_rank=1，key1=距离执行时间的秒数（越接近越优先），key2=minInterval（更小更优）
// - 其他/仅cron：kind_rank=2，key1=0（或距离下一次执行的估值），key2=0
fn compute_priority(task: &AutomationTask, now: DateTime<Utc>) -> Option<CandidatePriority> {
    let last_run_ts = task
        .last_run
        .map(|t| t.timestamp())
        .unwrap_or(0);

    if let Some(fixed_at) = task.fixed_at {
        return Some(CandidatePriority {
            kind_rank: 0,
            key1: fixed_at.timestamp(),
            key2: 0,
            key3: last_run_ts,
            id: task.id.clone(),
        });
    }

    if let (Some(min_i), Some(_max_i)) = (task.min_interval_sec, task.max_interval_sec) {
        let (time_to_next, min_key) = if let Some(last) = task.last_run {
            let next_run = last + chrono::Duration::seconds(min_i.max(0));
            // 修改：只计算到下次执行的时间，不使用deadline概念
            ((next_run - now).num_seconds(), task.min_interval_sec.unwrap_or(0))
        } else {
            // 从未执行：设为高优先级，但不是最高
            (0, task.min_interval_sec.unwrap_or(0))
        };

        return Some(CandidatePriority {
            kind_rank: 1,
            key1: time_to_next.abs(), // 使用绝对值，越接近执行时间越优先
            key2: min_key,
            key3: last_run_ts,
            id: task.id.clone(),
        });
    }

    // 仅 cron：给最低优先级
    Some(CandidatePriority {
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
            if let TaskConfig::TextToImage { background_color, background_image, link, .. } = &task.config {
                let image_data = generate_t2i_image(background_color, background_image.as_deref())?;
                execute_image_task(
                    &task.device_ids,
                    api_key,
                    &image_data,
                    link.as_deref(),
                ).await
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
    
    // 构建请求数据
    let request_data = crate::TextApiRequest {
        device_id: device_id.clone(),
        title: title.to_string(),
        message: message.to_string(),
        signature: signature.to_string(),
        icon: icon.map(|s| s.to_string()),
        link: link.map(|s| s.to_string()),
    };


    
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
    
    // 处理base64数据
    let base64_data = if image_data.starts_with("data:image/") {
        match image_data.find(",") {
            Some(comma_pos) => &image_data[comma_pos + 1..],
            None => return Err("Invalid image data format".to_string()),
        }
    } else {
        image_data
    };
    
    // 构建请求数据
    let request_data = crate::ImageApiRequest {
        device_id: device_id.clone(),
        image: base64_data.to_string(),
        link: link.map(|s| s.to_string()),
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

// 生成制图任务的图片（296x152 PNG base64 data URL）
fn generate_t2i_image(background_color: &str, background_image: Option<&str>) -> Result<String, String> {
    let width = 296u32;
    let height = 152u32;

    // 如果有背景图片，优先使用背景图片并调整到 296x152
    if let Some(bg) = background_image {
        let base64_data = if bg.starts_with("data:image/") {
            match bg.find(',') { Some(pos) => &bg[pos + 1..], None => bg }
        } else { bg };

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("背景图片base64解码失败: {}", e))?;

        let img = image::load_from_memory(&bytes)
            .map_err(|e| format!("加载背景图片失败: {}", e))?;
        let resized = img.resize_exact(width, height, FilterType::Triangle);

        let mut buffer = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut buffer);
            resized
                .write_to(&mut cursor, image::ImageFormat::Png)
                .map_err(|e| format!("编码PNG失败: {}", e))?;
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
        return Ok(format!("data:image/png;base64,{}", b64));
    }

    // 否则创建纯色背景
    let mut img = image::RgbImage::new(width, height);

    let color = match normalize_color(background_color) {
        (r, g, b) => image::Rgb([r, g, b])
    };

    for pixel in img.pixels_mut() {
        *pixel = color;
    }

    let mut buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut buffer);
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("编码PNG失败: {}", e))?;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:image/png;base64,{}", b64))
}

// 解析配置中的颜色名称到RGB
fn normalize_color(c: &str) -> (u8, u8, u8) {
    let v = c.trim().to_lowercase();
    match v.as_str() {
        "white" | "#fff" | "#ffffff" => (255, 255, 255),
        "black" | "#000" | "#000000" => (0, 0, 0),
        "gray" | "grey" | "#808080" => (128, 128, 128),
        _ => (255, 255, 255), // 默认白色
    }
}
