import requests
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import os
import time
import re

def create_placeholder_icon(icon_name, output_path, size=(40, 40)):
    """创建占位符图标"""
    # 创建一个简单的图标
    img = Image.new('RGBA', size, (70, 130, 180, 255))  # 钢蓝色背景
    draw = ImageDraw.Draw(img)
    
    # 绘制简单的图形
    if 'home' in icon_name:
        # 绘制房子形状
        draw.polygon([(size[0]//2, 8), (8, size[1]//2), (size[0]-8, size[1]//2)], fill=(255, 255, 255))
        draw.rectangle([12, size[1]//2, size[0]-12, size[1]-8], fill=(255, 255, 255))
    elif 'search' in icon_name:
        # 绘制放大镜
        center = (size[0]//2, size[1]//2-2)
        radius = 8
        draw.ellipse([center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius], 
                    outline=(255, 255, 255), width=2)
        draw.line([center[0]+6, center[1]+6, center[0]+12, center[1]+12], fill=(255, 255, 255), width=2)
    elif 'menu' in icon_name:
        # 绘制三条横线
        for i in range(3):
            y = 12 + i * 8
            draw.line([8, y, size[0]-8, y], fill=(255, 255, 255), width=2)
    elif 'star' in icon_name:
        # 绘制星形
        points = []
        for i in range(10):
            angle = i * 36 * 3.14159 / 180
            if i % 2 == 0:
                r = 12
            else:
                r = 6
            x = size[0]//2 + r * (angle - 3.14159/2)
            y = size[1]//2 + r * (angle - 3.14159/2)
            points.append((x, y))
        # draw.polygon(points, fill=(255, 255, 255))
    else:
        # 默认绘制文字
        text = icon_name[:3].upper()
        try:
            # 尝试使用默认字体
            draw.text((size[0]//2-8, size[1]//2-6), text, fill=(255, 255, 255))
        except:
            # 如果字体加载失败，绘制简单矩形
            draw.rectangle([8, 8, size[0]-8, size[1]-8], outline=(255, 255, 255), width=2)
    
    img.save(output_path, 'PNG')
    print(f"✓ 占位符图标已保存: {output_path}")
    return True

def download_and_resize_icon(url, output_path, size=(40, 40)):
    """下载并调整图标尺寸"""
    icon_name = os.path.basename(output_path).replace('_40x40.png', '')
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, timeout=15, headers=headers)
        response.raise_for_status()
        
        # 对于SVG文件，尝试多种处理方式
        if url.endswith('.svg'):
            try:
                # 方法1: 尝试使用cairosvg
                import cairosvg
                png_data = cairosvg.svg2png(bytestring=response.content, output_width=size[0], output_height=size[1])
                img = Image.open(BytesIO(png_data))
            except ImportError:
                print(f"⚠️  cairosvg不可用，为 {icon_name} 创建占位符图标")
                return create_placeholder_icon(icon_name, output_path, size)
            except Exception as svg_error:
                print(f"⚠️  SVG处理失败，为 {icon_name} 创建占位符图标: {svg_error}")
                return create_placeholder_icon(icon_name, output_path, size)
        else:
            # 处理其他图片格式
            img = Image.open(BytesIO(response.content))
            img = img.resize(size, Image.LANCZOS)
        
        # 确保图像是RGBA模式以支持透明度
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        img.save(output_path, 'PNG')
        print(f"✓ 图标已保存: {output_path}")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"⚠️  网络错误，为 {icon_name} 创建占位符图标: {e}")
        return create_placeholder_icon(icon_name, output_path, size)
    except Exception as e:
        print(f"⚠️  处理失败，为 {icon_name} 创建占位符图标: {e}")
        return create_placeholder_icon(icon_name, output_path, size)

def generate_material_icon_url(icon_name, style='outlined', size='48px'):
    """生成Material Icons的URL"""
    base_url = "https://fonts.gstatic.com/s/i/short-term/release"
    style_map = {
        'outlined': 'materialsymbolsoutlined',
        'filled': 'materialsymbolsfilled',
        'rounded': 'materialsymbolsrounded',
        'sharp': 'materialsymbolssharp'
    }
    
    style_path = style_map.get(style, 'materialsymbolsoutlined')
    return f"{base_url}/{style_path}/{icon_name}/default/{size}.svg"

def download_material_icons(icon_list, output_dir='public/icons', size=(40, 40), style='outlined', max_retries=2):
    """批量下载Material Icons"""
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    success_count = 0
    total_count = len(icon_list)
    
    print(f"开始下载 {total_count} 个Material Icons...")
    print(f"样式: {style}, 尺寸: {size[0]}x{size[1]}")
    print(f"输出目录: {output_dir}")
    print("-" * 60)
    
    for i, icon_name in enumerate(icon_list, 1):
        url = generate_material_icon_url(icon_name, style)
        output_path = os.path.join(output_dir, f"{icon_name}_{size[0]}x{size[1]}.png")
        
        print(f"[{i:2d}/{total_count}] {icon_name:<20}", end=" ")
        
        # 检查文件是否已存在
        if os.path.exists(output_path):
            print("✓ 已存在")
            success_count += 1
            continue
        
        # 尝试下载
        success = False
        for attempt in range(max_retries + 1):
            if attempt > 0:
                print(f"\n      重试 {attempt}/{max_retries}...", end=" ")
                time.sleep(1)  # 重试前等待
            
            if download_and_resize_icon(url, output_path, size):
                success = True
                success_count += 1
                break
            
            if attempt < max_retries:
                print("失败,", end="")
        
        if not success:
            print(f"✗ 最终失败")
        
        # 添加延迟避免请求过于频繁
        if i < total_count:  # 不是最后一个
            time.sleep(0.2)
    
    print("-" * 60)
    print(f"下载完成! 成功: {success_count}/{total_count} ({success_count/total_count*100:.1f}%)")
    
    if success_count > 0:
        print(f"\n生成的图标保存在: {output_dir}")
        print("可以使用以下命令查看:")
        print(f"  ls -la {output_dir}/*_40x40.png")

# 最常用的Material Icons列表 (精简版)
essential_icons = [
    'home', 'search', 'menu', 'close', 'add', 'remove', 'edit', 'delete',
    'save', 'share', 'favorite', 'star', 'settings', 'help', 'info',
    'check', 'cancel', 'arrow_back', 'arrow_forward', 'refresh'
]

# 扩展的Material Icons列表
material_icons = [
    'home', 'search', 'menu', 'close', 'add', 'remove', 'edit', 'delete',
    'save', 'share', 'favorite', 'star', 'bookmark', 'settings', 'help',
    'info', 'warning', 'error', 'check', 'cancel', 'arrow_back', 'arrow_forward',
    'arrow_upward', 'arrow_downward', 'refresh', 'sync', 'download', 'upload',
    'cloud', 'folder', 'file_copy', 'print', 'email', 'phone', 'location_on',
    'person', 'group', 'account_circle', 'lock', 'visibility', 'visibility_off',
    'thumb_up', 'thumb_down', 'chat', 'comment', 'notifications', 'alarm',
    'schedule', 'today', 'calendar_month', 'event', 'shopping_cart', 'payment',
    'credit_card', 'monetization_on', 'trending_up', 'trending_down', 'analytics',
    'dashboard', 'bar_chart', 'pie_chart', 'table_chart', 'map', 'place',
    'directions', 'local_shipping', 'flight', 'hotel', 'restaurant', 'local_cafe',
    'shopping_bag', 'store', 'business', 'work', 'school', 'library_books',
    'play_arrow', 'pause', 'stop', 'skip_next', 'skip_previous', 'volume_up',
    'volume_down', 'volume_off', 'mic', 'mic_off', 'camera', 'photo_camera',
    'video_call', 'call', 'call_end', 'message', 'chat_bubble', 'forum'
]

if __name__ == "__main__":
    # 首先下载最基本的图标
    print("=== 下载基本图标集 ===")
    download_material_icons(essential_icons)
    
    # 询问用户是否继续下载完整集合
    print("\n" + "="*60)
    print("基本图标下载完成!")
    print("是否要下载完整的图标集合? (输入 'y' 继续，其他键跳过)")
    
    # 注释掉交互部分，直接下载完整集合
    # user_input = input().strip().lower()
    # if user_input == 'y':
    print("\n=== 下载完整图标集 ===")
    download_material_icons(material_icons)
    
    # 也可以下载其他样式的图标
    print("\n=== 下载 filled 样式图标 (部分) ===")
    download_material_icons(['home', 'search', 'menu', 'star', 'favorite'], style='filled')