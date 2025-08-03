use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct TextApiRequest {
    #[serde(rename = "deviceId")]
    device_id: String,
    title: String,
    message: String,
    signature: String,
    icon: Option<String>,
    link: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ImageApiRequest {
    #[serde(rename = "deviceId")]
    device_id: String,
    image: String,
    link: Option<String>,
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
    
    // 构建请求数据，与Python代码保持一致
    let request_data = TextApiRequest {
        device_id: device_id.clone(),
        title: title.clone(),
        message: message.clone(),
        signature: signature.clone(),
        icon,
        link,
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
    
    // 构建请求数据，与Python代码保持一致
    let request_data = ImageApiRequest {
        device_id: device_id.clone(),
        image: base64_data.to_string(), // base64格式的处理后图片
        link,
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
async fn copy_to_clipboard(text: String) -> Result<String, String> {
    // 这个函数现在将通过前端的clipboard-manager插件调用，而不是直接在Rust中实现
    // 返回成功状态，实际复制操作由前端JS处理
    Ok("Ready for clipboard operation".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![greet, save_image_to_downloads, save_text_to_downloads, process_image_with_algorithm, send_text_to_api, send_image_to_api, copy_to_clipboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
