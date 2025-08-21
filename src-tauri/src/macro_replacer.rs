use chrono::{DateTime, Utc, Datelike, Timelike};
use chrono_tz::Asia::Shanghai;
use std::collections::HashMap;

/// 宏替换器，支持多种文本宏替换格式
pub struct MacroReplacer {
    /// 预定义的宏映射
    macros: HashMap<String, Box<dyn Fn() -> String + Send + Sync>>,
}

impl MacroReplacer {
    /// 创建新的宏替换器实例
    pub fn new() -> Self {
        let mut replacer = MacroReplacer {
            macros: HashMap::new(),
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
