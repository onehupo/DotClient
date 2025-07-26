# Windows版本构建指南

由于在macOS上交叉编译Windows的Tauri应用程序需要特殊的工具链配置，我们提供了以下几种构建方案：

## 方案1：使用GitHub Actions（推荐）

这是最简单且可靠的方法：

1. 将代码推送到GitHub仓库
2. GitHub Actions会自动构建所有平台版本（Windows、macOS、Linux）
3. 在仓库的Actions页面下载构建好的文件

GitHub Actions配置已经准备好了，位于 `.github/workflows/build.yml`

## 方案2：使用Docker

1. 确保已安装Docker
2. 运行构建脚本：
   ```bash
   ./build-windows.sh
   ```
3. 构建完成后，Windows版本会在 `windows-build/` 目录中

## 方案3：在Windows机器上构建

1. 在Windows机器上安装Node.js和Rust
2. 克隆项目
3. 运行：
   ```bash
   npm install
   npm run tauri build
   ```

## 当前问题

在macOS上直接交叉编译遇到的问题：
- `tauri-winres` 库需要 `llvm-rc` 工具来编译Windows资源文件
- 这个工具在macOS上不容易获得，需要复杂的交叉编译工具链配置

## 解决方案状态

- ✅ GitHub Actions配置已准备好
- ✅ Docker构建配置已准备好  
- ❌ 直接在macOS上交叉编译需要额外工具链配置

建议使用GitHub Actions方案，它是最稳定可靠的方法。
