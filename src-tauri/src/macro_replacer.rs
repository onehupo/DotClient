use chrono::{Utc, Datelike, Timelike};
use chrono_tz::Asia::Shanghai;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, Components, System, RefreshKind};
use std::env;
use if_addrs::{get_if_addrs, IfAddr};
use pnet_datalink as datalink;

/// 宏替换器，支持多种文本宏替换格式
pub struct MacroReplacer {
    /// 预定义的宏映射
    macros: HashMap<String, Box<dyn Fn() -> String + Send + Sync>>,
    /// 系统信息（带缓存）
    sys_cache: Arc<Mutex<SystemCache>>, 
}

impl MacroReplacer {
    /// 创建新的宏替换器实例
    pub fn new() -> Self {
        let mut replacer = MacroReplacer {
            macros: HashMap::new(),
            sys_cache: Arc::new(Mutex::new(SystemCache::new())),
        };
        
        // 注册默认的时间相关宏
        replacer.register_default_macros();
        replacer
    }

    /// 注册默认的时间相关宏
    fn register_default_macros(&mut self) {
        // 当前日期（ISO 8601 格式）：2025-08-21
        self.register_macro("DATE", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%Y-%m-%d").to_string()
        });

        // 当前时间（24 小时制）：23:07:44
        self.register_macro("TIME", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%H:%M:%S").to_string()
        });

        // 当前年份：2025
        self.register_macro("YEAR", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.year().to_string()
        });

        // 当前月份（补零）：08
        self.register_macro("MONTH", || {
            let now = Utc::now().with_timezone(&Shanghai);
            format!("{:02}", now.month())
        });

        // 当前日（补零）：21
        self.register_macro("DAY", || {
            let now = Utc::now().with_timezone(&Shanghai);
            format!("{:02}", now.day())
        });

        // 当前小时（24 小时制）：23
        self.register_macro("HOUR", || {
            let now = Utc::now().with_timezone(&Shanghai);
            format!("{:02}", now.hour())
        });

        // 当前分钟：07
        self.register_macro("MINUTE", || {
            let now = Utc::now().with_timezone(&Shanghai);
            format!("{:02}", now.minute())
        });

        // 当前秒：44
        self.register_macro("SECOND", || {
            let now = Utc::now().with_timezone(&Shanghai);
            format!("{:02}", now.second())
        });

        // 时间戳（年月日时分秒连续）：20250821230744
        self.register_macro("TIMESTAMP", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%Y%m%d%H%M%S").to_string()
        });

        // 当前星期（英文）：Thursday
        self.register_macro("WEEKDAY", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%A").to_string()
        });

        // 短日期格式（斜杠分隔）：2025/08/21
        self.register_macro("SHORT_DATE", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%Y/%m/%d").to_string()
        });

        // 中文星期：星期四
        self.register_macro("WEEKDAY_CN", || {
            let now = Utc::now().with_timezone(&Shanghai);
            let weekday = now.weekday();
            match weekday {
                chrono::Weekday::Mon => "星期一".to_string(),
                chrono::Weekday::Tue => "星期二".to_string(),
                chrono::Weekday::Wed => "星期三".to_string(),
                chrono::Weekday::Thu => "星期四".to_string(),
                chrono::Weekday::Fri => "星期五".to_string(),
                chrono::Weekday::Sat => "星期六".to_string(),
                chrono::Weekday::Sun => "星期日".to_string(),
            }
        });

        // 中文日期格式：2025年08月21日
        self.register_macro("DATE_CN", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%Y年%m月%d日").to_string()
        });

        // 12小时制时间：11:07:44 PM
        self.register_macro("TIME_12", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%I:%M:%S %p").to_string()
        });

        // Unix 时间戳（秒）：1724259444
        self.register_macro("UNIX_TIMESTAMP", || {
            Utc::now().timestamp().to_string()
        });

        // Unix 时间戳（毫秒）：1724259444123
        self.register_macro("UNIX_TIMESTAMP_MS", || {
            Utc::now().timestamp_millis().to_string()
        });

        // ISO 8601 完整格式：2025-08-21T23:07:44+08:00
        self.register_macro("ISO_DATETIME", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.to_rfc3339()
        });

        // 只有月和日：08-21
        self.register_macro("MONTH_DAY", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%m-%d").to_string()
        });

        // 只有时和分：23:07
        self.register_macro("HOUR_MINUTE", || {
            let now = Utc::now().with_timezone(&Shanghai);
            now.format("%H:%M").to_string()
        });

        // ================== 系统状态相关宏 ==================
        // CPU 使用率（0-100，取整）
        self.register_macro("CPU_USAGE", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                format!("{}", c.cpu_usage_percent())
            }
        });

        // 内存使用率（百分比，取整）
        self.register_macro("MEM_USAGE", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                format!("{}", c.mem_usage_percent())
            }
        });

        // 磁盘使用率（百分比，总览，取整）
        self.register_macro("DISK_USAGE", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                format!("{}", c.disk_usage_percent())
            }
        });

        // 网络接收总字节（自系统启动，单位 B）
        self.register_macro("NET_IN_BYTES", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                c.net_in_bytes().to_string()
            }
        });

        // 网络发送总字节（自系统启动，单位 B）
        self.register_macro("NET_OUT_BYTES", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                c.net_out_bytes().to_string()
            }
        });

        // 温度（若可用，摄氏度取整；不可用则返回 N/A）
        self.register_macro("TEMPERATURE", {
            let cache = Arc::clone(&self.sys_cache);
            move || {
                let mut c = cache.lock().unwrap();
                c.refresh();
                c.temperature_celsius()
                    .map(|t| t.to_string())
                    .unwrap_or_else(|| "N/A".to_string())
            }
        });

        // ================== 操作系统与环境宏 ==================
        // 计算机名（主机名）
        self.register_macro("HOSTNAME", || {
            System::host_name().unwrap_or_else(|| "Unknown".to_string())
        });
        // 别名：COMPUTER_NAME
        self.register_macro("COMPUTER_NAME", || {
            System::host_name().unwrap_or_else(|| "Unknown".to_string())
        });

        // 当前用户名称
        self.register_macro("USERNAME", || {
            env::var("USER")
                .or_else(|_| env::var("USERNAME"))
                .or_else(|_| env::var("LOGNAME"))
                .unwrap_or_else(|_| "Unknown".to_string())
        });

        // 操作系统名称（如 macOS / Linux / Windows）
        self.register_macro("OS_NAME", || {
            System::name().unwrap_or_else(|| "Unknown".to_string())
        });
        // 操作系统版本（例如 14.5）
        self.register_macro("OS_VERSION", || {
            System::os_version().unwrap_or_else(|| "Unknown".to_string())
        });
        // 操作系统完整版本（例如 macOS 14.5）
        self.register_macro("OS_LONG_VERSION", || {
            System::long_os_version().unwrap_or_else(|| "Unknown".to_string())
        });
        // 内核版本（例如 Darwin 23.x 等）
        self.register_macro("KERNEL_VERSION", || {
            System::kernel_version().unwrap_or_else(|| "Unknown".to_string())
        });
        // 架构（如 x86_64 / aarch64）
        self.register_macro("ARCH", || {
            std::env::consts::ARCH.to_string()
        });
        // 平台（操作系统简名：macos / linux / windows 等）
        self.register_macro("PLATFORM", || {
            std::env::consts::OS.to_string()
        });

        // ================== 网络信息宏 ==================
        // 首个活动接口名称（排除回环）
    self.register_macro("NETWORK_NAME", || {
            match get_if_addrs() {
                Ok(addrs) => {
                    addrs.into_iter()
            .filter(|a| !a.is_loopback())
                        .map(|a| a.name)
                        .next()
                        .unwrap_or_else(|| "Unknown".to_string())
                }
                Err(_) => "Unknown".to_string(),
            }
        });
        // IPv4 地址
        self.register_macro("NETWORK_IP", || {
            match get_if_addrs() {
                Ok(addrs) => {
                    addrs.into_iter()
                        .filter(|a| !a.is_loopback())
                        .find_map(|a| match a.addr {
                            IfAddr::V4(v4) => Some(v4.ip.to_string()),
                            _ => None,
                        })
                        .unwrap_or_else(|| "Unknown".to_string())
                }
                Err(_) => "Unknown".to_string(),
            }
        });
        // IPv6 地址
        self.register_macro("NETWORK_IPv6", || {
            match get_if_addrs() {
                Ok(addrs) => {
                    addrs.into_iter()
                        .filter(|a| !a.is_loopback())
                        .find_map(|a| match a.addr {
                            IfAddr::V6(v6) => Some(v6.ip.to_string()),
                            _ => None,
                        })
                        .unwrap_or_else(|| "Unknown".to_string())
                }
                Err(_) => "Unknown".to_string(),
            }
        });
        // MAC 地址（若可用）
        self.register_macro("NETWORK_MAC", || {
            // Use pnet_datalink to get MAC of the first non-loopback interface
            let mut mac = None;
            for iface in datalink::interfaces().into_iter().filter(|i| !i.is_loopback()) {
                if let Some(m) = iface.mac {
                    mac = Some(m.to_string());
                    break;
                }
            }
            mac.unwrap_or_else(|| "Unknown".to_string())
        });
    }

    /// 注册自定义宏
    /// 
    /// # 参数
    /// * `name` - 宏名称（不包含大括号）
    /// * `generator` - 生成宏值的函数
    pub fn register_macro<F>(&mut self, name: &str, generator: F)
    where
        F: Fn() -> String + Send + Sync + 'static,
    {
        self.macros.insert(name.to_string(), Box::new(generator));
    }

    /// 替换文本中的所有宏
    /// 
    /// # 参数
    /// * `text` - 包含宏的原始文本
    /// 
    /// # 返回值
    /// 替换后的文本
    /// 
    /// # 示例
    /// ```
    /// let replacer = MacroReplacer::new();
    /// let result = replacer.replace("今天是 {DATE}，当前时间是 {TIME}");
    /// // 输出类似：今天是 2025-08-21，当前时间是 23:07:44
    /// ```
    pub fn replace(&self, text: &str) -> String {
        let mut result = text.to_string();
        
        // 遍历所有已注册的宏
        for (macro_name, generator) in &self.macros {
            let pattern = format!("{{{}}}", macro_name);
            let replacement = generator();
            result = result.replace(&pattern, &replacement);
        }
        
        result
    }

    /// 获取所有可用的宏列表
    pub fn list_macros(&self) -> Vec<String> {
        self.macros.keys().cloned().collect()
    }

    /// 获取指定宏的当前值
    /// 
    /// # 参数
    /// * `macro_name` - 宏名称（不包含大括号）
    /// 
    /// # 返回值
    /// 宏的当前值，如果宏不存在则返回 None
    pub fn get_macro_value(&self, macro_name: &str) -> Option<String> {
        self.macros.get(macro_name).map(|generator| generator())
    }

    /// 检查文本中是否包含宏
    pub fn contains_macros(&self, text: &str) -> bool {
        for macro_name in self.macros.keys() {
            let pattern = format!("{{{}}}", macro_name);
            if text.contains(&pattern) {
                return true;
            }
        }
        false
    }

    /// 获取文本中使用的所有宏名称
    pub fn extract_used_macros(&self, text: &str) -> Vec<String> {
        let mut used_macros = Vec::new();
        
        for macro_name in self.macros.keys() {
            let pattern = format!("{{{}}}", macro_name);
            if text.contains(&pattern) {
                used_macros.push(macro_name.clone());
            }
        }
        
        used_macros
    }
}

impl Default for MacroReplacer {
    fn default() -> Self {
        Self::new()
    }
}

/// 简单的系统信息缓存，避免每次宏替换都进行昂贵的系统刷新
struct SystemCache {
    sys: System,
    networks: Networks,
    disks: Disks,
    components: Components,
    last_refresh: Instant,
}

impl SystemCache {
    fn new() -> Self {
        // 初始刷新设置：CPU 需要两次刷新之间的间隔；其余按需
    let mut sys = System::new();
    sys.refresh_specifics(RefreshKind::everything());
    let networks = Networks::new_with_refreshed_list();
    let disks = Disks::new_with_refreshed_list();
    let components = Components::new_with_refreshed_list();
    Self { sys, networks, disks, components, last_refresh: Instant::now() - Duration::from_secs(10) }
    }

    fn refresh(&mut self) {
        // 节流：1 秒内多次访问复用旧值
        if self.last_refresh.elapsed() < Duration::from_millis(900) { return; }

        // 刷新 CPU 与内存
        self.sys.refresh_cpu();
        self.sys.refresh_memory();
    // 刷新网络与磁盘与温度
        self.networks.refresh();
        self.disks.refresh_list();
        for d in self.disks.list_mut() { d.refresh(); }
    self.components.refresh();
        self.last_refresh = Instant::now();
    }

    fn cpu_usage_percent(&self) -> u8 {
        // sysinfo 的 cpu 使用率为 0.0..100.0，取平均并取整
        if self.sys.cpus().is_empty() { return 0; }
        let avg: f32 = self.sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / self.sys.cpus().len() as f32;
        avg.round().clamp(0.0, 100.0) as u8
    }

    fn mem_usage_percent(&self) -> u8 {
        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        if total == 0 { return 0; }
        ((used as f64 / total as f64) * 100.0).round() as u8
    }

    fn disk_usage_percent(&self) -> u8 {
        let mut total: u128 = 0;
        let mut used: u128 = 0;
        for d in self.disks.list() {
            let t = d.total_space() as u128;
            let a = d.available_space() as u128;
            total += t;
            used += t.saturating_sub(a);
        }
        if total == 0 { return 0; }
        ((used as f64 / total as f64) * 100.0).round() as u8
    }

    fn net_in_bytes(&self) -> u64 {
        self.networks.iter().map(|(_, data)| data.total_received()).sum()
    }

    fn net_out_bytes(&self) -> u64 {
        self.networks.iter().map(|(_, data)| data.total_transmitted()).sum()
    }

    fn temperature_celsius(&mut self) -> Option<i32> {
        // macOS 上 sysinfo 的温度支持有限，尽力而为
        let max_temp = self
            .components
            .iter()
            .map(|c| c.temperature())
            .fold(None, |acc: Option<f32>, t| Some(acc.map_or(t, |cur| cur.max(t))));
        max_temp.map(|t| t.round() as i32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_macro_replacement() {
        let replacer = MacroReplacer::new();
        let result = replacer.replace("Today is {DATE} and time is {TIME}");
        
        // 验证结果包含预期的格式
        assert!(result.contains("Today is 20"));
        assert!(result.contains("and time is "));
        assert!(!result.contains("{DATE}"));
        assert!(!result.contains("{TIME}"));
    }

    #[test]
    fn test_custom_macro() {
        let mut replacer = MacroReplacer::new();
        replacer.register_macro("CUSTOM", || "custom_value".to_string());
        
        let result = replacer.replace("Value: {CUSTOM}");
        assert_eq!(result, "Value: custom_value");
    }

    #[test]
    fn test_no_macros() {
        let replacer = MacroReplacer::new();
        let result = replacer.replace("No macros here");
        assert_eq!(result, "No macros here");
    }

    #[test]
    fn test_multiple_same_macros() {
        let replacer = MacroReplacer::new();
        let result = replacer.replace("{YEAR}-{YEAR}");
        
        // 应该替换所有相同的宏
        assert!(!result.contains("{YEAR}"));
        assert!(result.contains("-"));
    }

    #[test]
    fn test_list_macros() {
        let replacer = MacroReplacer::new();
        let macros = replacer.list_macros();
        
        // 验证包含基本的时间宏
        assert!(macros.contains(&"DATE".to_string()));
        assert!(macros.contains(&"TIME".to_string()));
        assert!(macros.contains(&"YEAR".to_string()));
    }

    #[test]
    fn test_contains_macros() {
        let replacer = MacroReplacer::new();
        
        assert!(replacer.contains_macros("Today is {DATE}"));
        assert!(!replacer.contains_macros("No macros here"));
    }

    #[test]
    fn test_extract_used_macros() {
        let replacer = MacroReplacer::new();
        let used = replacer.extract_used_macros("Date: {DATE}, Time: {TIME}, Year: {YEAR}");
        
        assert!(used.contains(&"DATE".to_string()));
        assert!(used.contains(&"TIME".to_string()));
        assert!(used.contains(&"YEAR".to_string()));
        assert_eq!(used.len(), 3);
    }
}

// ============================================================
// 替换规则总览（可用的宏）：
//
// 时间与日期
//   {DATE}                -> 2025-08-21
//   {TIME}                -> 23:07:44
//   {YEAR}                -> 2025
//   {MONTH}               -> 08
//   {DAY}                 -> 21
//   {HOUR}                -> 23
//   {MINUTE}              -> 07
//   {SECOND}              -> 44
//   {TIMESTAMP}           -> 20250821230744
//   {WEEKDAY}             -> Thursday
//   {SHORT_DATE}          -> 2025/08/21
//   {WEEKDAY_CN}          -> 星期四
//   {DATE_CN}             -> 2025年08月21日
//   {TIME_12}             -> 11:07:44 PM
//   {UNIX_TIMESTAMP}      -> 1724259444
//   {UNIX_TIMESTAMP_MS}   -> 1724259444123
//   {ISO_DATETIME}        -> 2025-08-21T23:07:44+08:00
//   {MONTH_DAY}           -> 08-21
//   {HOUR_MINUTE}         -> 23:07
//
// 系统状态
//   {CPU_USAGE}           -> CPU 使用率百分比 (0-100)
//   {MEM_USAGE}           -> 内存使用率百分比 (0-100)
//   {DISK_USAGE}          -> 磁盘使用率总览百分比 (0-100)
//   {NET_IN_BYTES}        -> 网络接收总字节
//   {NET_OUT_BYTES}       -> 网络发送总字节
//   {TEMPERATURE}         -> 最高温度(°C) 或 N/A
//
// 操作系统与环境
//   {HOSTNAME}            -> 主机名
//   {COMPUTER_NAME}       -> 主机名（别名）
//   {USERNAME}            -> 当前用户名称
//   {OS_NAME}             -> 操作系统名称 (macOS/Linux/Windows)
//   {OS_VERSION}          -> 操作系统版本
//   {OS_LONG_VERSION}     -> 操作系统完整版本
//   {KERNEL_VERSION}      -> 内核版本
//   {ARCH}                -> 系统架构 (x86_64/aarch64/...)
//   {PLATFORM}            -> 平台 (macos/linux/windows/...)
//
// 网络信息
//   {NETWORK_NAME}        -> 第一个非回环网络接口名称
//   {NETWORK_IP}          -> 第一个非回环 IPv4 地址
//   {NETWORK_IPv6}        -> 第一个非回环 IPv6 地址
//   {NETWORK_MAC}         -> 第一个非回环接口的 MAC 地址
// ============================================================

// 供前端展示的宏帮助（Markdown 文本）
pub const MACROS_HELP: &str = r#"
## 宏替换说明

### 时间与日期
- {DATE} → 2025-08-21
- {TIME} → 23:07:44
- {YEAR} → 2025
- {MONTH} → 08
- {DAY} → 21
- {HOUR} → 23
- {MINUTE} → 07
- {SECOND} → 44
- {TIMESTAMP} → 20250821230744
- {WEEKDAY} → Thursday
- {SHORT_DATE} → 2025/08/21
- {WEEKDAY_CN} → 星期四
- {DATE_CN} → 2025年08月21日
- {TIME_12} → 11:07:44 PM
- {UNIX_TIMESTAMP} → 1724259444
- {UNIX_TIMESTAMP_MS} → 1724259444123
- {ISO_DATETIME} → 2025-08-21T23:07:44+08:00
- {MONTH_DAY} → 08-21
- {HOUR_MINUTE} → 23:07

### 系统状态
- {CPU_USAGE} → CPU 使用率百分比 (0-100)
- {MEM_USAGE} → 内存使用率百分比 (0-100)
- {DISK_USAGE} → 磁盘使用率总览百分比 (0-100)
- {NET_IN_BYTES} → 网络接收总字节
- {NET_OUT_BYTES} → 网络发送总字节
- {TEMPERATURE} → 最高温度(°C) 或 N/A

### 操作系统与环境
- {HOSTNAME} / {COMPUTER_NAME} → 主机名
- {USERNAME} → 当前用户名称
- {OS_NAME} → 操作系统名称 (macOS/Linux/Windows)
- {OS_VERSION} → 操作系统版本
- {OS_LONG_VERSION} → 操作系统完整版本
- {KERNEL_VERSION} → 内核版本
- {ARCH} → 系统架构 (x86_64/aarch64/...)
- {PLATFORM} → 平台 (macos/linux/windows/...)

### 网络信息
- {NETWORK_NAME} → 第一个非回环网络接口名称
- {NETWORK_IP} → 第一个非回环 IPv4 地址
- {NETWORK_IPv6} → 第一个非回环 IPv6 地址
- {NETWORK_MAC} → 第一个非回环接口的 MAC 地址
"#;
