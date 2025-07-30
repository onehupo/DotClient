# 扩展的Material Icons列表（首字母大写）
material_icons = [
    'Home', 'Search', 'Menu', 'Close', 'Add', 'Remove', 'Edit', 'Delete',
    'Save', 'Share', 'Favorite', 'Star', 'Bookmark', 'Settings', 'Help',
    'Info', 'Warning', 'Error', 'Check', 'Cancel', 'Arrow_back', 'Arrow_forward',
    'Arrow_upward', 'Arrow_downward', 'Refresh', 'Sync', 'Download', 'Upload',
    'Cloud', 'Folder', 'File_copy', 'Print', 'Email', 'Phone', 'Location_on',
    'Person', 'Group', 'Account_circle', 'Lock', 'Visibility', 'Visibility_off',
    'Thumb_up', 'Thumb_down', 'Chat', 'Comment', 'Notifications', 'Alarm',
    'Schedule', 'Today', 'Calendar_month', 'Event', 'Shopping_cart', 'Payment',
    'Credit_card', 'Monetization_on', 'Trending_up', 'Trending_down', 'Analytics',
    'Dashboard', 'Bar_chart', 'Pie_chart', 'Table_chart', 'Map', 'Place',
    'Directions', 'Local_shipping', 'Flight', 'Hotel', 'Restaurant', 'Local_cafe',
    'Shopping_bag', 'Store', 'Business', 'Work', 'School', 'Library_books',
    'Play_arrow', 'Pause', 'Stop', 'Skip_next', 'Skip_previous', 'Volume_up',
    'Volume_down', 'Volume_off', 'Mic', 'Mic_off', 'Camera', 'Photo_camera',
    'Video_call', 'Call', 'Call_end', 'Message', 'Chat_bubble', 'Forum',
    'Calendar_today', 'Calendar_view_day', 'Check_circle',
    'Radio_button_checked', 'Radio_button_unchecked', 'Toggle_on', 'Toggle_off',
    'Language', 'Translate', 'G_translate', 'Link', 'Unlink', 'Attachment',
    'File_upload', 'File_download', 'Cloud_upload', 'Cloud_download',
    'Cloud_off', 'Cloud_queue', 'Cloud_done', 'Cloud_sync',
]

import os
import requests
from PIL import Image
import io

def download_material_icon(icon_name, size=40, output_dir="public/icons"):
    """
    从Material Icons CDN下载指定图标
    
    Args:
        icon_name: 图标名称
        size: 图标尺寸 (默认40x40)
        output_dir: 输出目录
    """
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 检查文件是否已存在
    output_path = os.path.join(output_dir, f"{icon_name}_{size}x{size}.png")
    if os.path.exists(output_path):
        print(f"⏭ 跳过: {icon_name} (文件已存在)")
        return True
    
    # 尝试多个Material Icons来源
    urls = [
        # Google Material Icons API (PNG)
        f"https://img.icons8.com/material/{size}/{icon_name}.png",
        # 备用：Icons8 Material Design
        f"https://img.icons8.com/material-outlined/{size}/{icon_name}.png",
        # 备用：Icons8 Material Filled
        f"https://img.icons8.com/material-rounded/{size}/{icon_name}.png"
    ]
    
    for i, url in enumerate(urls):
        try:
            # 下载图标文件
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                # 验证是否为有效图片
                img = Image.open(io.BytesIO(response.content))
                
                # 调整到指定尺寸
                img = img.resize((size, size), Image.Resampling.LANCZOS)
                
                # 确保为RGBA模式（支持透明背景）
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                
                # 保存为PNG文件
                img.save(output_path, "PNG")
                
                print(f"✓ 已下载: {icon_name} (来源: {i+1})")
                return True
                
        except Exception as e:
            continue
    
    # 如果所有来源都失败，不创建占位符
    print(f"✗ 下载失败: {icon_name}")
    return False

def download_all_icons(icon_list, size=40, clear_existing=True):
    """
    批量下载图标
    
    Args:
        icon_list: 图标名称列表
        size: 图标尺寸
        clear_existing: 是否清除现有图标文件
    """
    output_dir = "public/icons"
    
    # 如果需要，清除现有的图标文件
    if clear_existing and os.path.exists(output_dir):
        print("正在清除现有图标文件...")
        for filename in os.listdir(output_dir):
            if filename.endswith('.png'):
                file_path = os.path.join(output_dir, filename)
                try:
                    os.remove(file_path)
                    print(f"删除: {filename}")
                except Exception as e:
                    print(f"删除失败 {filename}: {e}")
        print("清除完成。\n")
    
    print(f"开始下载 {len(icon_list)} 个图标 ({size}x{size})")
    
    success_count = 0
    failed_icons = []
    
    for icon_name in icon_list:
        if download_material_icon(icon_name, size):
            success_count += 1
        else:
            failed_icons.append(icon_name)
    
    print(f"\n下载完成: {success_count}/{len(icon_list)} 个图标成功")
    
    if failed_icons:
        print(f"失败的图标: {', '.join(failed_icons)}")
    
    return success_count, failed_icons

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='下载Material Icons图标')
    parser.add_argument('--size', type=int, default=40, help='图标尺寸 (默认: 40)')
    parser.add_argument('--no-clear', action='store_true', help='不清除现有的图标文件')
    
    args = parser.parse_args()
    
    # 选择要下载的图标列表
    icons_to_download = material_icons
    print("下载完整的Material Icons列表...")
    
    # 下载指定尺寸的图标
    clear_existing = not args.no_clear
    success_count, failed_icons = download_all_icons(icons_to_download, size=args.size, clear_existing=clear_existing)