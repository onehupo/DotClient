#!/bin/bash

# 构建Windows版本的脚本
# 使用方法: ./build-windows.sh

echo "=== 构建DotClient Windows版本 ==="

# 检查依赖
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    echo "建议使用GitHub Actions来构建Windows版本"
    exit 1
fi

echo "📦 构建Docker镜像..."
docker build -f Dockerfile.windows -t dotclient-windows .

echo "🔨 提取构建结果..."
docker create --name temp-container dotclient-windows
docker cp temp-container:/app/src-tauri/target/x86_64-pc-windows-gnu/release/ ./windows-build/
docker rm temp-container

echo "✅ Windows版本构建完成！"
echo "📁 构建文件位于: ./windows-build/"
echo ""
echo "或者，您可以："
echo "1. 推送代码到GitHub仓库"
echo "2. GitHub Actions会自动构建所有平台版本"
echo "3. 在Actions页面下载构建好的文件"
