use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::Manager;

mod automation;
mod macro_replacer;
use automation::{
    SimpleAutomationManager,
    automation_add_task,
    automation_update_task,
    automation_update_priorities,
    automation_delete_task,
    automation_get_tasks,
    automation_get_logs,
    automation_execute_task,
    automation_execute_t2i_with_frontend_render,
    automation_get_t2i_task_with_macros,
    automation_start_background_tasks,
    automation_sync_api_keys,
    automation_set_enabled,
    automation_get_enabled,
    automation_set_api_key,
    automation_generate_planned_for_date,
    automation_get_planned_for_date,
    automation_clear_planned_for_date,
};
use macro_replacer::{MacroReplacer, MACROS_HELP};
use automation::TextElement;

#[derive(Serialize, Deserialize)]
struct TextApiRequest {
    #[serde(rename = "deviceId")]
    device_id: String,
    title: String,
    message: String,
    signature: String,
    icon: Option<String>,
    link: Option<String>,
    #[serde(rename = "refreshNow")]
    refresh_now: bool,
}

#[derive(Serialize, Deserialize)]
struct ImageApiRequest {
    #[serde(rename = "deviceId")]
    device_id: String,
    image: String,
    link: Option<String>,
    #[serde(rename = "refreshNow")]
    refresh_now: bool,
    // 0: white border, 1: black border
    border: u8,
    #[serde(rename = "ditherType")]
    dither_type: String, // DIFFUSION | ORDERED | NONE
    #[serde(rename = "ditherKernel")]
    dither_kernel: String, // THRESHOLD | ATKINSON | BURKES | FLOYD_STEINBERG | SIERRA2 | STUCKI | JARVIS_JUDICE_NINKE | DIFFUSION_ROW | DIFFUSION_COLUMN | DIFFUSION2_D
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn save_image_to_downloads(
    app_handle: tauri::AppHandle,
    image_data: String,
    filename: String,
) -> Result<String, String> {
    // Remove the data URL prefix if present
    let base64_data = if image_data.starts_with("data:image/") {
        match image_data.find(",") {
            Some(comma_pos) => &image_data[comma_pos + 1..],
            None => return Err("Invalid image data format".to_string()),
        }
    } else {
        &image_data
    };

    // Decode base64 data
    use base64::Engine;
    let image_bytes = match base64::engine::general_purpose::STANDARD.decode(base64_data) {
        Ok(bytes) => bytes,
        Err(e) => return Err(format!("Failed to decode base64: {}", e)),
    };

    // Get the downloads directory
    let downloads_dir = match app_handle.path().download_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get downloads directory: {}", e)),
    };

    // Create full file path
    let file_path = downloads_dir.join(&filename);

    // Write the file
    match std::fs::write(&file_path, image_bytes) {
        Ok(_) => Ok(file_path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

fn ordered_dither(img: &DynamicImage) -> Result<DynamicImage, String> {
    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();
    let mut result = ImageBuffer::new(width, height);

    // 4x4 Bayer matrix，与Python代码保持一致
    let bayer_matrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];

    for (x, y, pixel) in rgb_img.enumerate_pixels() {
        // 计算灰度值
        let gray = (pixel[0] as f32 * 0.299 + pixel[1] as f32 * 0.587 + pixel[2] as f32 * 0.114) as u8;
        
        // 获取阈值，乘以16与Python保持一致
        let threshold = bayer_matrix[(y % 4) as usize][(x % 4) as usize] * 16;
        
        // 二值化判断
        let new_val = if gray as u32 > threshold { 255 } else { 0 };
        result.put_pixel(x, y, Rgb([new_val, new_val, new_val]));
    }

    Ok(DynamicImage::ImageRgb8(result))
}

fn floyd_steinberg_dither(img: &DynamicImage) -> Result<DynamicImage, String> {
    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();
    let mut result = ImageBuffer::new(width, height);
    
    // 创建误差缓冲区，与Python代码保持一致
    let mut error_buffer: Vec<Vec<f32>> = vec![vec![0.0; width as usize]; height as usize];
    
    // 先将所有像素转换为灰度并存储到误差缓冲区
    for (x, y, pixel) in rgb_img.enumerate_pixels() {
        let gray = pixel[0] as f32 * 0.299 + pixel[1] as f32 * 0.587 + pixel[2] as f32 * 0.114;
        error_buffer[y as usize][x as usize] = gray;
    }

    for y in 0..height {
        for x in 0..width {
            let old_pixel = error_buffer[y as usize][x as usize];
            
            // 阈值为127，与Python代码保持一致
            let new_pixel = if old_pixel > 127.0 { 255.0 } else { 0.0 };
            let new_val = new_pixel as u8;
            
            result.put_pixel(x, y, Rgb([new_val, new_val, new_val]));
            
            let error = old_pixel - new_pixel;
            
            // 分布误差到相邻像素，与Python代码保持一致
            if x + 1 < width {
                error_buffer[y as usize][(x + 1) as usize] += error * 7.0 / 16.0;
            }
            if y + 1 < height {
                if x > 0 {
                    error_buffer[(y + 1) as usize][(x - 1) as usize] += error * 3.0 / 16.0;
                }
                error_buffer[(y + 1) as usize][x as usize] += error * 5.0 / 16.0;
                if x + 1 < width {
                    error_buffer[(y + 1) as usize][(x + 1) as usize] += error * 1.0 / 16.0;
                }
            }
        }
    }
    
    Ok(DynamicImage::ImageRgb8(result))
}

fn random_dither(img: &DynamicImage) -> Result<DynamicImage, String> {
    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();
    let mut result = ImageBuffer::new(width, height);
    
    // 使用固定种子保证结果一致，与Python代码保持一致
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    // 预生成整个图像的随机阈值矩阵，模拟Python的np.random.randint(0, 256, (height, width))
    let mut random_thresholds = vec![vec![0u8; width as usize]; height as usize];
    
    // 使用固定种子42生成随机阈值矩阵
    for y in 0..height {
        for x in 0..width {
            let mut hasher = DefaultHasher::new();
            // 使用位置和固定种子生成确定性的随机值
            (x + y * width + 42).hash(&mut hasher);
            let hash_result = hasher.finish();
            random_thresholds[y as usize][x as usize] = (hash_result % 256) as u8;
        }
    }
    
    // 对每个像素进行二值化，完全按照Python代码的逻辑
    for (x, y, pixel) in rgb_img.enumerate_pixels() {
        let gray = (pixel[0] as f32 * 0.299 + pixel[1] as f32 * 0.587 + pixel[2] as f32 * 0.114) as u8;
        let random_threshold = random_thresholds[y as usize][x as usize];
        
        // 直接按照Python逻辑：grayscale_array > random_threshold
        let new_val = if gray > random_threshold { 255 } else { 0 };
        result.put_pixel(x, y, Rgb([new_val, new_val, new_val]));
    }
    
    Ok(DynamicImage::ImageRgb8(result))
}

#[tauri::command]
async fn process_image_with_algorithm(
    image_data: String,
    algorithm: String,
) -> Result<String, String> {
    // Remove the data URL prefix if present
    let base64_data = if image_data.starts_with("data:image/") {
        match image_data.find(",") {
            Some(comma_pos) => &image_data[comma_pos + 1..],
            None => return Err("Invalid image data format".to_string()),
        }
    } else {
        &image_data
    };

    // Decode base64 data
    use base64::Engine;
    let image_bytes = match base64::engine::general_purpose::STANDARD.decode(base64_data) {
        Ok(bytes) => bytes,
        Err(e) => return Err(format!("Failed to decode base64: {}", e)),
    };

    // Load image from bytes
    let img = match image::load_from_memory(&image_bytes) {
        Ok(img) => img,
        Err(e) => return Err(format!("Failed to load image: {}", e)),
    };

    // Process image based on algorithm
    let processed_img = match algorithm.as_str() {
        "ordered" => ordered_dither(&img)?,
        "floyd_steinberg" => floyd_steinberg_dither(&img)?,
        "random" => random_dither(&img)?,
        _ => return Err("Unknown algorithm".to_string()),
    };

    // Convert processed image back to base64
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);

    match processed_img.write_to(&mut cursor, image::ImageFormat::Png) {
        Ok(_) => {}
        Err(e) => return Err(format!("Failed to encode image: {}", e)),
    }

    let base64_result = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:image/png;base64,{}", base64_result))
}

#[tauri::command]
async fn send_text_to_api(
    api_key: String,
    device_id: String,
    title: String,
    message: String,
    signature: String,
    icon: Option<String>,
    link: Option<String>,
) -> Result<String, String> {
    println!("开始发送文本到API...");
    
    let client = reqwest::Client::new();

    // 宏替换：参考 automation.rs::execute_text_task，对所有文本字段进行宏替换
    let macro_replacer = MacroReplacer::new();
    let processed_title = macro_replacer.replace(&title);
    let processed_message = macro_replacer.replace(&message);
    let processed_signature = macro_replacer.replace(&signature);
    let processed_link = link.as_ref().map(|l| macro_replacer.replace(l));

    // 如果有宏被替换，输出日志
    if macro_replacer.contains_macros(&title)
        || macro_replacer.contains_macros(&message)
        || macro_replacer.contains_macros(&signature)
        || link.as_deref().map_or(false, |l| macro_replacer.contains_macros(l))
    {
        println!("📝 文本API调用宏替换:");
        if processed_title != title {
            println!("  标题: {} -> {}", title, processed_title);
        }
        if processed_message != message {
            println!("  消息: {} -> {}", message, processed_message);
        }
        if processed_signature != signature {
            println!("  签名: {} -> {}", signature, processed_signature);
        }
        if let (Some(original), Some(processed)) = (&link, &processed_link) {
            if processed != original {
                println!("  链接: {} -> {}", original, processed);
            }
        }
    }

    // 构建请求数据（使用处理后的文本）
    let request_data = TextApiRequest {
        device_id: device_id.clone(),
        title: processed_title,
        message: processed_message,
        signature: processed_signature,
        icon,
    link: processed_link,
    refresh_now: true,
    };
    
    println!("设备ID: {}", device_id);
    println!("标题: {}", title);
    println!("消息: {}", message);
    println!("发送文本API请求到: https://dot.mindreset.tech/api/open/text");
    
    let response = client
        .post("https://dot.mindreset.tech/api/open/text")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_data)
        .send()
        .await
        .map_err(|e| {
            println!("请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;
    
    let status = response.status();
    println!("响应状态码: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("请求失败，状态码: {}，错误内容: {}", status, error_text);
        return Err(format!("请求失败 ({}): {}", status, error_text));
    }
    
    let result_text = response.text().await
        .map_err(|e| {
            println!("读取响应失败: {}", e);
            format!("读取响应失败: {}", e)
        })?;
    
    println!("请求成功: {}", status);
    println!("响应内容: {}", result_text);
    
    Ok(result_text)
}

#[tauri::command]
async fn send_image_to_api(
    api_key: String,
    device_id: String,
    image_data: String,
    link: Option<String>,
) -> Result<String, String> {
    println!("开始发送图片到API...");
    
    let client = reqwest::Client::new();

    // 如果base64数据以"data:image/"开头，去掉前缀
    let base64_data = if image_data.starts_with("data:image/") {
        match image_data.find(",") {
            Some(comma_pos) => &image_data[comma_pos + 1..],
            None => return Err("Invalid image data format".to_string()),
        }   
    } else {
        &image_data
    };
    
    // 宏替换处理链接（与 automation.rs::execute_image_task 一致）
    let macro_replacer = MacroReplacer::new();
    let processed_link = link.as_ref().map(|l| macro_replacer.replace(l));
    if let (Some(original), Some(processed)) = (&link, &processed_link) {
        if macro_replacer.contains_macros(original) && processed != original {
            println!("🖼️ 图片API调用宏替换: 链接 {} -> {}", original, processed);
        }
    }

    // 构建请求数据，与Python代码保持一致（使用处理后的链接）
    let request_data = ImageApiRequest {
        device_id: device_id.clone(),
        image: base64_data.to_string(), // base64格式的处理后图片
    link: processed_link,
    refresh_now: true,
    border: 0,
    dither_type: "NONE".to_string(),
    dither_kernel: "FLOYD_STEINBERG".to_string(),
    };
    
    println!("设备ID: {}", device_id);
    // println!("发送图片数据长度: {}", request_data.image);
    println!("发送图片API请求到: https://dot.mindreset.tech/api/open/image");
    
    let response = client
        .post("https://dot.mindreset.tech/api/open/image")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_data)
        .send()
        .await
        .map_err(|e| {
            println!("请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;
    
    let status = response.status();
    println!("响应状态码: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("请求失败，状态码: {}，错误内容: {}", status, error_text);
        return Err(format!("请求失败 ({}): {}", status, error_text));
    }
    
    let result_text = response.text().await
        .map_err(|e| {
            println!("读取响应失败: {}", e);
            format!("读取响应失败: {}", e)
        })?;
    
    println!("请求成功: {}", status);
    println!("响应内容: {}", result_text);
    
    Ok(result_text)
}

#[tauri::command]
async fn save_text_to_downloads(
    app_handle: tauri::AppHandle,
    content: String,
    filename: String,
) -> Result<String, String> {
    // Get the downloads directory
    let downloads_dir = match app_handle.path().download_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get downloads directory: {}", e)),
    };

    // Create full file path
    let file_path = downloads_dir.join(&filename);

    // Write the file
    match std::fs::write(&file_path, content.as_bytes()) {
        Ok(_) => Ok(file_path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

#[tauri::command]
async fn copy_to_clipboard(_text: String) -> Result<String, String> {
    // 这个函数现在将通过前端的clipboard-manager插件调用，而不是直接在Rust中实现
    // 返回成功状态，实际复制操作由前端JS处理
    Ok("Ready for clipboard operation".to_string())
}

#[tauri::command]
async fn test_macro_replacement(text: String) -> Result<String, String> {
    let macro_replacer = MacroReplacer::new();
    Ok(macro_replacer.replace(&text))
}

#[tauri::command]
async fn get_available_macros() -> Result<Vec<String>, String> {
    let macro_replacer = MacroReplacer::new();
    Ok(macro_replacer.list_macros())
}

#[tauri::command]
async fn get_macros_help_markdown() -> Result<String, String> {
    Ok(MACROS_HELP.to_string())
}

// 使用与前端一致的 HTML5 Canvas 渲染（通过无头 Chrome），并对文本内容进行宏替换
#[cfg(not(windows))]
#[tauri::command]
async fn render_t2i_via_headless_canvas_api(
    background_color: String,
    background_image: Option<String>,
    texts: Vec<TextElement>,
) -> Result<String, String> {
    // 宏替换文本内容
    let macro_replacer = MacroReplacer::new();
    let mut processed_texts = Vec::with_capacity(texts.len());
    for mut t in texts {
        t.content = macro_replacer.replace(&t.content);
        processed_texts.push(t);
    }

    use headless_chrome::{Browser, LaunchOptionsBuilder};
    use serde_json::json;

    // 画布尺寸
    let width: u32 = 296;
    let height: u32 = 152;

    // 将渲染参数序列化为 JSON，供页面脚本读取
    let payload = json!({
        "background_color": background_color,
        "background_image": background_image,
        "texts": processed_texts,
        "width": width,
        "height": height,
    })
    .to_string();

    // 内嵌最小 HTML，使用与前端一致的 Canvas API 绘制
    let html = format!(r##"<!doctype html>
<html>
<head>
    <meta charset='utf-8'>
    <style>html,body{{margin:0;padding:0;background:transparent;}}</style>
    <!-- 允许内联脚本用于简化在 data: 文档中的渲染 -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;">
    <script>window.__PAYLOAD__ = {payload};</script>
    <title>loading</title>
    <script>
    (function(){{
        const data = window.__PAYLOAD__;
        window.addEventListener('DOMContentLoaded', function(){{
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
                let finished = false;
                const finish = ()=>{{ if(!finished){{ finished = true; drawTexts(); }} }};
                if (data.background_image){{
                    const img = new Image();
                    img.onload = ()=>{{
                        try {{ ctx.drawImage(img,0,0,{w},{h}); }} catch(_) {{}}
                        finish();
                    }};
                    img.onerror = ()=>{{
                        // 回退：背景色填充
                        ctx.fillStyle = resolveColor(data.background_color || 'white');
                        ctx.fillRect(0,0,{w},{h});
                        finish();
                    }};
                    // 若图片长时间未触发 onload/onerror，则超时回退
                    setTimeout(()=>{{
                        if(!finished){{
                            ctx.fillStyle = resolveColor(data.background_color || 'white');
                            ctx.fillRect(0,0,{w},{h});
                            finish();
                        }}
                    }}, 2000);
                    img.src = data.background_image;
                }} else {{
                    ctx.fillStyle = resolveColor(data.background_color || 'white');
                    ctx.fillRect(0,0,{w},{h});
                    finish();
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
                document.title = 'ready';
            }}
            drawBackground();
        }});
    }})();
    </script>
</head>
<body>
    <canvas id="c" width="{w}" height="{h}"></canvas>
</body>
</html>"##, w=width, h=height, payload=payload);

    // 启动无头 Chrome
    let launch_opts = LaunchOptionsBuilder::default()
        .headless(true)
        .build()
        .map_err(|e| format!("启动 Chrome 失败: {}", e))?;
    let browser = Browser::new(launch_opts).map_err(|e| format!("创建浏览器失败: {}", e))?;
    let tab = browser.new_tab().map_err(|e| format!("创建标签页失败: {}", e))?;

    // 使用 data: URL 方式加载内联 HTML
    // base64 编码需要引入 Engine trait
    use base64::Engine;
    let html_b64 = base64::engine::general_purpose::STANDARD.encode(html.as_bytes());
    let data_url = format!("data:text/html;base64,{}", html_b64);
    tab.navigate_to(&data_url)
        .map_err(|e| format!("导航失败: {}", e))?;
    tab.wait_until_navigated()
        .map_err(|e| format!("等待导航失败: {}", e))?;

    // 等待页面就绪
    use std::time::{Duration, Instant};
    let start = Instant::now();
    loop {
        let title = tab.get_title().unwrap_or_default();
        if title == "ready" { break; }
        if start.elapsed() > Duration::from_secs(10) {
            return Err("Canvas渲染超时".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    // 读取数据 URL
    let data_url: String = tab
        .evaluate("document.getElementById('c').toDataURL('image/png')", false)
        .map_err(|e| format!("获取数据URL失败: {}", e))?
        .value
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "无法读取数据URL".to_string())?;

    Ok(data_url)
}

// Windows 上禁用 headless_chrome 以避免额外依赖，提供占位实现
#[cfg(windows)]
#[tauri::command]
async fn render_t2i_via_headless_canvas_api(
    _background_color: String,
    _background_image: Option<String>,
    _texts: Vec<TextElement>,
) -> Result<String, String> {
    Err("Text-to-Image 后端渲染在 Windows 打包时已禁用（无头 Chrome 依赖已移除）".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // 获取应用数据目录
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data directory");
            
            // 初始化简化的自动化管理器
            let automation_manager = SimpleAutomationManager::new(app_data_dir);
            app.manage(automation_manager);
            
            println!("Simple automation manager initialized successfully");
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            save_image_to_downloads, 
            save_text_to_downloads, 
            process_image_with_algorithm, 
            send_text_to_api, 
            send_image_to_api, 
            render_t2i_via_headless_canvas_api,
            copy_to_clipboard,
            automation_add_task,
            automation_update_task,
            automation_update_priorities,
            automation_delete_task,
            automation_get_tasks,
            automation_get_logs,
            automation_execute_task,
            automation_execute_t2i_with_frontend_render,
            automation_get_t2i_task_with_macros,
            automation_start_background_tasks,
            automation_sync_api_keys,
            automation_set_api_key,
            automation_set_enabled,
            automation_get_enabled,
            automation_generate_planned_for_date,
            automation_get_planned_for_date,
            automation_clear_planned_for_date,
            get_macros_help_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
