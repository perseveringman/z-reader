# Podcast 订阅能力设计

## 目标

- 支持播客订阅：用户可通过搜索或粘贴 URL 订阅播客
- RSS-first 统一管线：所有来源最终归一为 `feedUrl` 走现有 `feed:add` 与 RSS 抓取
- 支持音频播放与离线下载（可指定目录，容量上限滚动清理）
- 未来可演进为“转录 + YouTube 风格详情页”

## 关键决策

- 入口：Add feed 增加播客 Tab + Sidebar 增加 Podcasts 管理入口
- 目录搜索：iTunes Search API 默认 + Podcast Index 可选 key 作为补充
- URL 解析范围：Apple Podcasts + Spotify + 小宇宙
- Podcast 识别：RSS 有 enclosure 或 iTunes 命名空间之一即可
- 展示范围：出现在 Feed 中；单集保存到 Library 后进入 Podcasts 分类
- 播放：内置播放器，支持播放/暂停、进度、倍速、快进/后退、音量
- 下载：手动下载，用户可指定目录；容量上限滚动清理最旧下载
- 已读：播放到 90% 自动标记 seen

## 架构与数据流

```
Search/URL -> resolve feedUrl + metadata
-> feed:add (feedType=podcast)
-> rss-service fetch -> articles(mediaType=podcast, audioUrl...)
-> Feed list / Podcast manager / Reader
```

所有来源最终以 `feedUrl + metadata` 进入现有 feed 管线，减少新增复杂度。

## 数据模型

复用：
- `feeds`：`feedType='podcast'`
- `articles`：`mediaType='podcast'`

新增字段（articles）：
- `audioUrl` (string) — enclosure URL
- `audioMime` (string) — enclosure type
- `audioBytes` (integer) — enclosure length
- `audioDuration` (integer) — itunes:duration（秒）
- `episodeNumber` / `seasonNumber`（可选）

新增表（downloads）：
- `id`, `articleId`, `filePath`, `bytes`, `status`, `addedAt`, `lastAccessedAt`
- `status`: queued | downloading | ready | failed

新增设置：
- Podcast Index API key（可选）
- 下载目录（用户指定）
- 下载容量上限（如 5GB）

## 服务与解析

### 目录搜索（main）

`podcast-directory-service` 提供：
- `search(query, type=show|episode)`
- iTunes Search API 为默认来源
- Podcast Index 有 key 时并行搜索并合并
- 合并去重以 `feedUrl` 为主键
- 结果模型统一：`{title, author, image, feedUrl?, website?, source, id}`

### URL 解析（main）

`podcast-resolver`：
1. 若页面包含 RSS `<link rel="alternate" type="application/rss+xml">`，直接取 `feedUrl`
2. Apple Podcasts：解析 show id → iTunes Lookup → `feedUrl`
3. Spotify/小宇宙：抓页面元数据（title/author）→ 目录 search 近似匹配 → `feedUrl`
4. 失败则提示用户手动输入 RSS

### RSS 抓取扩展（main）

`rss-service` 解析：
- 识别 podcast feed：`enclosure` 或 iTunes 命名空间
- 从 `enclosure` 写入 `audioUrl/audioMime/audioBytes`
- 解析 `itunes:duration` → `audioDuration`
- `mediaType='podcast'`

## IPC 通道

新增：
- `podcast:search` — 搜索目录
- `podcast:resolveUrl` — 页面 URL 解析
- `download:start` / `download:cancel` / `download:list` / `download:status`
- `settings:get` / `settings:set` — Podcast Index key、下载目录、容量上限

## 前端组件

- `PodcastManager`：节目列表 + 右侧详情
- `PodcastSearchPanel`：Show/Episode 切换
- `ShowDetailPanel`：节目介绍 + 单集列表
- `PodcastReaderView`：中间播放器 + show notes，未来可扩展转录
- `AudioPlayer`：播放/暂停/进度/倍速/快进后退/音量
- `DownloadManager`：下载状态、失败重试、删除
- Settings 增加 Podcast Index key、下载配置

## 交互规则

- 播放到 90% 自动标记 seen
- 单集 Save to Library 后进入 Library > Podcasts
- 下载超出容量上限时删除最旧下载

## 错误处理

- 目录不可用：降级仅 iTunes；仍失败提示手动 RSS
- URL 解析失败：提示支持的 URL 范围与手动输入
- RSS 抓取失败：沿用 errorCount/lastFetchedAt
- 下载失败：标记 failed，可重试；权限/磁盘问题提示更换目录
- 播放失败：提供重试/外部打开

## 测试建议

- 单元：URL 解析、RSS enclosure 解析、目录合并去重
- 集成：podcast:search 合并、feed:add 写入 feedType、rss-service 写入 audioUrl
- E2E：订阅→抓取→播放→90% seen→Save to Library→Library Podcasts 可见
- 下载：开始/取消/完成/清理

## 未来演进

- 转录：复用 `transcripts` 表与 YouTube 风格 UI
- 章节/摘要：基于转录生成
- 播放队列与继续播放
