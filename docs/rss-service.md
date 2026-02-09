# RSS 抓取服务 (rss-service.ts)

**Linear Issue**: [ZYB-126](https://linear.app/zybwork/issue/ZYB-126)

## 概述

实现了 RSS Feed 抓取服务，包含单 Feed 抓取、批量抓取、OPML 导入和定时调度四个核心功能。

## 文件变更

### 新增
- `src/main/services/rss-service.ts` — 核心抓取服务

### 修改
- `src/main/ipc/feed-handlers.ts` — 新增 FEED_FETCH / FEED_FETCH_ALL / FEED_IMPORT_OPML 三个 IPC handler；FEED_ADD 添加后自动触发抓取
- `src/main.ts` — 启动时注册 15 分钟定时抓取

## API

| 函数 | 说明 |
|------|------|
| `fetchFeed(feedId)` | 抓取单个 Feed，支持 Etag/Last-Modified 增量抓取，自动去重 (guid 或 url+feedId) |
| `fetchAllFeeds()` | 顺序抓取所有未删除 Feed，返回结果摘要 |
| `importOpml(opmlXml)` | 解析 OPML XML 并创建不存在的 Feed 记录 |
| `startScheduledFetch(minutes)` | 设置定时抓取，返回清理函数 |

## 关键设计

- **增量抓取**: 请求时携带 `If-None-Match` (Etag) 和 `If-Modified-Since` 头，304 时跳过解析
- **文章去重**: 优先用 guid 匹配，无 guid 时用 url + feedId 组合匹配
- **错误容错**: 抓取失败时递增 `errorCount`，不阻塞其他 Feed
- **内容处理**: 自动提取纯文本、计算字数和阅读时间、从 enclosure 或 `<img>` 提取缩略图
- **OPML 导入**: 通过 Electron dialog 选择文件，正则解析 `<outline>` 标签提取 xmlUrl
