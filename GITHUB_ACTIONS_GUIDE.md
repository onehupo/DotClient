# GitHub Actions 条件构建说明

## 当前修改

已将你的 GitHub Actions 工作流修改为条件触发模式。现在构建只会在以下情况下执行：

### 1. Commit 消息包含 `[build]` 标识
当你的提交消息包含 `[build]` 时，会触发构建。

**使用方法：**
```bash
git commit -m "feat: 添加新功能 [build]"
git push origin main
```

### 2. Pull Request
所有的 Pull Request 仍然会触发构建，用于验证代码质量。

### 3. Release 条件
Release 只会在以下情况下创建：
- 推送到 main 分支
- 是 push 事件（不是 PR）
- commit 消息包含 `[build]` 标识

## 可选方案

我还创建了一个 `build-alternative.yml` 文件，提供了更多触发选项：

### 方案1：手动触发 (workflow_dispatch)
- 可以在 GitHub 仓库的 Actions 页面手动触发构建
- 可以选择构建目标和是否创建 release

### 方案2：标签触发
- 只有推送以 `v` 开头的标签时才构建
- 例如：`git tag v1.0.0 && git push origin v1.0.0`

### 方案3：组合条件
- 结合了手动触发、标签触发和 commit 消息触发

## 使用建议

**日常开发：**
```bash
# 正常提交，不会触发构建
git commit -m "fix: 修复bug"
git push origin main

# 需要构建时，在commit消息中添加[build]
git commit -m "feat: 重要功能完成 [build]"
git push origin main
```

**发布版本：**
```bash
# 方法1：使用标签
git tag v1.0.0
git push origin v1.0.0

# 方法2：使用commit标识
git commit -m "release: v1.0.0 [build]"
git push origin main

# 方法3：在GitHub网页上手动触发
```

## 切换到其他方案

如果你想使用其他方案，可以：
1. 重命名 `build.yml` 为 `build-old.yml`
2. 重命名 `build-alternative.yml` 为 `build.yml`

这样就可以使用包含更多选项的版本了。
