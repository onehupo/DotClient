#!/usr/bin/env python3
"""
生成示例图片脚本
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os

def create_pattern_image(width=40, height=40):
    """创建棋盘图案"""
    image = Image.new('L', (width, height), 255)
    pixels = np.array(image)
    
    # 创建棋盘图案
    for y in range(height):
        for x in range(width):
            if (x // 5 + y // 5) % 2 == 0:
                pixels[y, x] = 0
    
    return Image.fromarray(pixels, 'L')

def create_text_image(width=296, height=152):
    """创建文本示例"""
    image = Image.new('L', (width, height), 255)
    draw = ImageDraw.Draw(image)
    
    # 使用默认字体
    try:
        # 尝试使用系统字体
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
    except:
        font = ImageFont.load_default()
    
    # 绘制文本
    text = "示例文本\nExample Text\n测试内容"
    draw.multiline_text((10, 20), text, fill=0, font=font, spacing=10)
    
    # 添加一些装饰线条
    draw.line([(10, 10), (width-10, 10)], fill=0, width=2)
    draw.line([(10, height-10), (width-10, height-10)], fill=0, width=2)
    
    return image

def create_icon_image(width=40, height=40):
    """创建简单图标"""
    image = Image.new('L', (width, height), 255)
    draw = ImageDraw.Draw(image)
    
    # 绘制一个简单的齿轮图标
    center_x, center_y = width // 2, height // 2
    
    # 外圆
    draw.ellipse([(5, 5), (width-5, height-5)], outline=0, width=2)
    
    # 内圆
    draw.ellipse([(15, 15), (width-15, height-15)], outline=0, width=2)
    
    # 齿轮齿
    for i in range(8):
        angle = i * 45
        x1 = center_x + 15 * np.cos(np.radians(angle))
        y1 = center_y + 15 * np.sin(np.radians(angle))
        x2 = center_x + 20 * np.cos(np.radians(angle))
        y2 = center_y + 20 * np.sin(np.radians(angle))
        draw.line([(x1, y1), (x2, y2)], fill=0, width=2)
    
    return image

def create_landscape_image(width=296, height=152):
    """创建风景示例"""
    image = Image.new('L', (width, height), 255)
    draw = ImageDraw.Draw(image)
    
    # 天空渐变
    for y in range(height // 2):
        gray_value = int(255 - (y / (height // 2)) * 100)
        draw.line([(0, y), (width, y)], fill=gray_value)
    
    # 山峰轮廓
    mountain_points = []
    for x in range(0, width, 20):
        y = height // 2 + 20 * np.sin(x * 0.02) + 10 * np.sin(x * 0.05)
        mountain_points.append((x, int(y)))
    mountain_points.append((width, height))
    mountain_points.append((0, height))
    
    draw.polygon(mountain_points, fill=100)
    
    # 添加一些树木
    for x in range(30, width-30, 40):
        tree_x = x + np.random.randint(-10, 10)
        tree_y = height - 30
        # 树干
        draw.rectangle([(tree_x-2, tree_y), (tree_x+2, tree_y+20)], fill=50)
        # 树冠
        draw.ellipse([(tree_x-8, tree_y-15), (tree_x+8, tree_y+5)], fill=80)
    
    return image

def main():
    """生成所有示例图片"""
    output_dir = "/Users/liangrui/Desktop/dotclient/public/examples"
    
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 生成图片
    images = {
        "sample-40x40-pattern.png": create_pattern_image(40, 40),
        "sample-296x152-text.png": create_text_image(296, 152), 
        "sample-40x40-icon.png": create_icon_image(40, 40),
        "sample-296x152-landscape.png": create_landscape_image(296, 152)
    }
    
    for filename, image in images.items():
        filepath = os.path.join(output_dir, filename)
        image.save(filepath)
        print(f"已生成: {filepath}")
    
    print("所有示例图片生成完成！")

if __name__ == "__main__":
    main()
