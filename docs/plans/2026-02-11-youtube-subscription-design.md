# YouTube 订阅与阅读能力设计

## 概述

为 Z-Reader 增加 YouTube 频道订阅能力，用户粘贴 YouTube 频道 URL 即可订阅，视频以嵌入播放器 + 字幕同步的方式阅读，复用现有 article 体系并通过 `mediaType` 自动分类。

## 一、数据模型扩展

### articles 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| mediaType | TEXT | 'article' | 'article' \| 'video' \| 'podcast' |
| videoId | TEXT | null | YouTube 视频 ID |
| duration | INTEGER | null | 视频时长（秒） |

### feeds 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| feedType | TEXT | 'rss' | 'rss' \| 'youtube' \| 'podcast' |

### 新建 transcripts 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 UUID |
| articleId | TEXT | 外键 → articles |
| segments | TEXT | JSON 数组，每项: `{ start: number, end: number, text: string }` |
| language | TEXT | 字幕语言 |
| createdAt | TEXT | 创建时间 |

字幕存储结构化的时间轴数据，支持播放同步、点击跳转、进度指示。

## 二、YouTube 频道订阅流程

### 用户操作

在添加 Feed 的输入框粘贴 YouTube 频道 URL，支持多种格式：
- `https://www.youtube.com/@username`
- `https://www.youtube.com/channel/UCxxxxxx`
- `https://www.youtube.com/c/channelname`

### 后端处理流程

1. 检测 URL 是否为 YouTube 域名
2. 抓取频道页面 HTML，从中提取 `channel_id`（meta 标签或 canonical link）
3. 拼接 RSS 地址：`https://www.youtube.com/feeds/videos.xml?channel_id={id}`
4. 用现有 `rss-parser` 解析该 feed，获取频道标题、描述、视频列表
5. 创建 feed 记录，`feedType` 设为 `youtube`
6. 解析每个视频条目：自动设置 `mediaType = 'video'`，从 `yt:videoId` 提取 videoId，从 `media:group` 提取 thumbnail、duration
7. 字幕延迟到用户打开视频详情时按需获取（避免浪费带宽）

### 定时抓取

复用现有 `startScheduledFetch` 机制，YouTube feed 和普通 RSS feed 统一调度。

## 三、视频详情页 UI 与字幕交互

### 整体布局

- 顶部：YouTube IFrame 嵌入播放器（16:9 比例，响应式宽度）
- 下方：字幕/转录区域，按 segment 逐行渲染
- 右侧：复用现有 DetailPanel

### 字幕渲染

- 每个 segment 作为可点击的文本块
- 左侧蓝色竖线作为进度指示条
- 当前播放 segment 高亮显示

### 两种浏览模式

| 模式 | 触发条件 | 字幕滚动行为 | 蓝色条 | UI 提示 |
|------|---------|-------------|--------|---------|
| **字幕同步模式**（默认） | 打开视频 / 点击切换 | 自动滚动到当前播放 segment | 跟随播放位置 | 无 |
| **自由浏览模式** | 用户手动滚动字幕区域 | 停止自动滚动，用户自由浏览 | 继续跟随播放位置 | 浮动提示框："自由浏览模式，点击回到同步" |

### 交互细节

- **点击 segment 跳转**：两种模式下都生效，调用 YouTube IFrame API `seekTo(segment.start)` 跳转
- **播放进度同步**：通过 YouTube IFrame API `getCurrentTime()` 轮询（约每秒一次），更新当前 segment 高亮，同时写入 `readProgress`

## 四、字幕获取与 Library 分类

### 字幕获取

- 使用 `youtubei.js` 在主进程中获取字幕
- 时机：用户首次打开视频详情时按需获取，获取后存入 `transcripts` 表缓存
- 优先级：手动上传字幕 > 自动生成字幕
- 语言选择：优先匹配视频原始语言，其次取第一个可用语言
- 获取失败：播放器正常显示，字幕区域显示"暂无字幕"

### 新增 IPC 通道

- `TRANSCRIPT_GET`：按 articleId 查询缓存字幕
- `TRANSCRIPT_FETCH`：从 YouTube 获取字幕并存储

### Library 自动分类

Sidebar 的 Library 区域增加子分类：
```
Library
  ├── All          （全部内容）
  ├── Articles     （mediaType = 'article'）
  ├── Videos       （mediaType = 'video'）
  └── Podcasts     （mediaType = 'podcast'，预留）
```

- 每个子分类内保持 inbox / later / archive 三状态
- ContentList 查询增加 `mediaType` 筛选
- 视频条目显示时长标签和缩略图，与文章条目视觉区分

## 五、右侧 Info 面板与高亮

### Info Tab 视频特有 metadata

- Type: RSS
- Source: 频道名称
- Domain: youtube.com
- Published: 发布日期
- **Length**: 视频时长（MM:SS 或 HH:MM:SS）
- Saved: 保存时间
- **Progress**: 播放进度百分比（实时更新）
- Language: 字幕语言

Author / Word Count / Reading Time 对视频隐藏，替换为 Length 和 Progress。

### 字幕文本高亮

- 复用现有 highlights 体系
- 高亮 `startOffset` / `endOffset` 基于 segment index + 文字偏移量定位
- 高亮笔记在 Notebook tab 正常显示

## 六、实现范围

| 模块 | 新增 | 修改 |
|------|------|------|
| 数据库 | `transcripts` 表 | `articles` 加 3 字段，`feeds` 加 1 字段 |
| 服务层 | `youtube-service.ts`（频道解析 + 字幕获取） | `rss-service.ts`（YouTube feed 解析适配） |
| IPC | transcript handlers | feed-handlers（URL 识别） |
| 组件 | `VideoPlayer.tsx`、`TranscriptView.tsx` | `DetailPanel.tsx`、`ContentList.tsx`、`Sidebar.tsx` |

## 七、技术依赖

- `youtubei.js`：YouTube 字幕提取
- YouTube IFrame Player API：视频嵌入与播放控制
- 现有 `rss-parser`：YouTube RSS feed 解析（无需额外依赖）
