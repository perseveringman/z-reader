# YouTube 订阅与阅读能力

## 功能概述

Z-Reader 支持订阅 YouTube 频道，用户在添加订阅时粘贴 YouTube 频道 URL 即可。视频内容以嵌入播放器 + 字幕同步的方式阅读，复用现有 article 体系。

## 使用方式

1. 点击侧栏 `+` 按钮打开添加订阅对话框
2. 粘贴 YouTube 频道 URL（支持 `/@username`、`/channel/UCxxx`、`/c/name` 格式）
3. 系统自动解析为 RSS feed 并订阅
4. 视频出现在 Feed 列表和 Library > Videos 分类中
5. 点击视频进入 VideoReaderView，包含播放器和字幕同步

## 技术实现

### 数据模型

- `feeds` 表新增 `feed_type` 字段（`rss` | `youtube` | `podcast`）
- `articles` 表新增 `media_type`（`article` | `video` | `podcast`）、`video_id`、`duration` 字段
- 新建 `transcripts` 表存储结构化字幕（JSON 格式的 `{start, end, text}` 段落数组）

### 核心服务

- `youtube-service.ts`：频道 URL 解析（HTML 抓取提取 channel_id）+ 字幕获取（`youtubei.js`）
- `rss-service.ts`：YouTube RSS feed 解析适配，自动设置 mediaType/videoId/thumbnail

### 前端组件

- `VideoPlayer.tsx`：YouTube IFrame 嵌入，通过 postMessage 控制播放、获取进度
- `TranscriptView.tsx`：字幕视图，支持同步模式（自动滚动）和自由浏览模式（用户滚动触发）
- `VideoReaderView.tsx`：视频阅读器主视图，整合播放器 + 字幕 + DetailPanel

### IPC 通道

- `transcript:get`：查询缓存字幕
- `transcript:fetch`：从 YouTube 获取字幕并缓存

## 字幕交互

- **同步模式**（默认）：字幕自动滚动到当前播放位置
- **自由浏览模式**：用户滚动触发，蓝色进度条继续跟随播放位置，底部浮动提示可切换回同步
- **点击跳转**：两种模式下均可点击字幕 segment 跳转到对应时间点
- **进度保存**：每 10 秒自动保存播放进度，关闭时保存最终进度

## 已知限制

- 部分视频可能没有字幕（自动生成字幕也无法获取时），此时只显示播放器
- YouTube 频道页面结构变更可能影响 channel_id 提取
- YouTube RSS feed 不提供视频时长，时长通过 IFrame API 在播放时获取
- `youtubei.js` 依赖 YouTube 内部 API，可能因 YouTube 更新而失效

## 依赖

- `youtubei.js`：YouTube 字幕提取
- YouTube IFrame Player API：视频嵌入与播放控制（无需额外依赖，通过 postMessage 通信）
