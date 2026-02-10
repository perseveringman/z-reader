# 阅读进度功能设计

## 概述

对齐 Readwise Reader，在阅读模式中实时追踪滚动进度，页面顶部展示 sticky 进度条，并将进度持久化到数据库。文章列表中每篇文章底部也展示进度条（已实现）。

## 数据层

无需改动。现有基础设施已完备：
- `articles.readProgress`: `real` 类型，默认 `0`，范围 `0~1`
- `articleUpdate` IPC: 已支持 `readProgress` 字段
- `UpdateArticleInput` 类型: 已包含 `readProgress?: number`

## ReaderView 改动

### 文件：`src/renderer/components/ReaderView.tsx`

### 1. 新增状态

- `readProgress: number`（0~1），初始值从 `article.readProgress` 读取

### 2. 滚动监听

- 监听内容滚动容器（`<div className="flex-1 overflow-y-auto">`）的 `scroll` 事件
- 计算公式：`progress = scrollTop / (scrollHeight - clientHeight)`
- 只允许进度前进（`Math.max`），不允许回退

### 3. 防抖持久化

- 滚动时实时更新 `readProgress` state（UI 即时响应）
- 1 秒 debounce 调用 `window.electronAPI.articleUpdate({ id, readProgress })`
- 组件卸载 / `onClose` 时强制 flush 最新进度

### 4. sticky 进度条 UI

- 位置：内容区顶部导航栏下方，sticky 定位
- 高度 `2px`，背景 `bg-white/5`，填充 `bg-blue-500`
- `transition-all` 平滑过渡

## 文章列表进度条

已在 `ArticleCard.tsx:252-259` 实现，使用 `violet-500` 颜色。
退出阅读模式后文章列表自动刷新，进度自然同步。
