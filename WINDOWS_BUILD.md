# Windows版本构建指南

## 🚀 使用GitHub Actions（推荐）

GitHub Actions配置已经修复和优化，现在支持：

1. **并行构建**：Windows、macOS、Linux三个平台同时构建
2. **错误隔离**：一个平台失败不会影响其他平台
3. **自动发布**：构建成功后自动创建GitHub Release

### 使用步骤：

1. 将代码推送到GitHub仓库
2. GitHub Actions会自动触发构建
3. 在仓库的Actions页面查看构建进度
4. 构建完成后，在Releases页面下载各平台版本

### 最新修复：

- ✅ 修复了Ubuntu依赖问题
- ✅ 添加了`fail-fast: false`防止单一平台失败影响全部
- ✅ 简化了macOS构建目标
- ✅ 改进了错误调试输出
- ✅ 优化了artifact上传策略

## 🐳 使用Docker（备选）

如果GitHub Actions不可用，可以使用Docker：

```bash
./build-windows.sh
```

## 🔧 本地Windows机器构建

在Windows机器上：

```bash
npm install
npm run tauri build
```

## 故障排除

如果GitHub Actions构建失败：

1. 检查Actions页面的详细日志
2. 常见问题：
   - Ubuntu依赖缺失（已修复）
   - Node.js版本不兼容（使用Node 18）
   - Rust工具链问题（使用stable工具链）

## 当前状态

- ✅ GitHub Actions配置已优化
- ✅ 支持Windows x86_64构建
- ✅ 支持macOS x86_64构建  
- ✅ 支持Linux x86_64构建
- ✅ 自动发布到GitHub Releases

**推荐直接使用GitHub Actions，这是最稳定可靠的构建方式。**
