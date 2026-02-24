# 微信公众号订阅与文章管理

## 功能概述

Z-Reader 支持订阅微信公众号，用户通过 Fiddler 等抓包工具获取微信 Token URL 后，可批量拉取公众号历史文章列表、离线保存文章 HTML 内容、以及获取阅读/点赞/评论等行为数据。该功能从 Python 项目 `Access_wechat_article` 完整迁移而来，复用现有的 feeds + articles 数据体系。

## 使用方式

1. 点击侧栏 `+` 按钮打开添加订阅对话框，切换到「微信公众号」标签页
2. 粘贴任意微信文章 URL（`mp.weixin.qq.com` 域名），系统自动解析出公众号名称和 biz 值
3. 确认后创建 Feed（`feedType: 'wechat'`）
4. 在侧栏点击「微信公众号」导航入口，进入微信专属视图
5. 选中公众号 Feed，右侧面板展示 `WechatOperationPanel` 操作面板
6. 使用 Fiddler 抓取微信客户端的 `wapcommreport` 请求 URL，粘贴到 Token 对话框完成授权
7. 设置页码范围，点击「拉取文章列表」批量获取历史文章
8. 使用「下载内容」批量离线保存文章 HTML
9. 使用「获取统计」批量拉取阅读/点赞/转发/在看/评论数据

## 技术实现

### 数据模型

**feeds 表扩展字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `wechat_biz` | text | 公众号唯一标识（biz 值） |
| `wechat_token_url` | text | 完整的 Token URL（来自 Fiddler 抓包） |
| `wechat_token_expiry` | text | Token 设置时间（有效期约 2-6 小时） |

**wechat_stats 表（新建）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 主键 |
| `article_id` | text FK | 关联 articles.id |
| `read_count` | integer | 阅读数 |
| `like_count` | integer | 点赞数 |
| `share_count` | integer | 转发数 |
| `wow_count` | integer | 在看数 |
| `fetched_at` | text | 最后获取时间 |

**wechat_comments 表（新建）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | 主键 |
| `article_id` | text FK | 关联 articles.id |
| `content` | text | 评论内容 |
| `like_count` | integer | 评论点赞数 |
| `nickname` | text | 评论者昵称 |

### 核心服务

#### wechat-service.ts

Token 解析与微信 API 调用的核心逻辑。

**Token 解析：**
- 从 Fiddler 抓取的 `wapcommreport` URL 中提取 `__biz`、`uin`、`key`、`pass_ticket` 四个参数
- 使用递归 `fullyDecode()` 解码（最多 5 次循环），处理 Fiddler 抓包导致的多层 URL 编码（如 `%25252B` → `+`）
- 通过 `buildWechatApiUrl()` + `URLSearchParams` 安全构建 API 请求 URL，避免手动字符串拼接导致的编码错误

**微信 API 调用：**

| API | 路径 | 方法 | 功能 |
|-----|------|------|------|
| 文章列表 | `/mp/profile_ext?action=getmsg` | GET | 分页获取公众号历史文章 |
| 文章详情 | `/mp/getappmsgext` | POST | 获取单篇文章阅读/点赞/转发/在看数据 |
| 评论列表 | `/mp/appmsg_comment?action=getcomment` | GET | 获取文章评论 |

**反封禁策略：**
- User-Agent 池：6 种主流 Chrome/Safari UA 随机切换
- 延时策略：短延时 0.1-1.5s（单篇请求间）+ 长延时 3-7s（翻页间）
- 自适应退避：检测到 API 返回错误时自动加倍延时（最高 5 倍），成功后渐进恢复
- 任务取消控制：通过 `cancelledTasks` Set 支持随时中断长时间任务

**主要导出函数：**

```typescript
// Token 管理
parseTokenUrl(tokenUrl: string): WechatTokenParams | null
saveToken(feedId: string, tokenUrl: string): Promise<WechatTokenParams | null>
getTokenParams(feedId: string): Promise<WechatTokenParams | null>

// 文章操作
parseArticleUrl(articleUrl: string): Promise<WechatParseResult | null>
fetchArticleList(feedId, pagesStart, pagesEnd, onProgress): Promise<number>

// 行为数据
fetchArticleStats(feedId, articleIds?, onProgress): Promise<number>
getArticleStats(articleId: string): Promise<WechatStats | null>
getArticleComments(articleId: string): Promise<WechatComment[]>

// 工具
isWechatArticleUrl(url: string): boolean
cancelTask(feedId: string): void
```

#### wechat-html-saver.ts

使用 Electron BrowserWindow 替代 Python Playwright 实现离线 HTML 保存。

- 创建隐藏 BrowserWindow（1920x1080）加载文章页面
- 滚动触发懒加载图片（最多 50 次滚动，3 次内容稳定判定为加载完成）
- 强制将懒加载属性（`data-src`、`data-original`、`data-lazy-src` 等）转为 `src`
- 60 秒超时保护
- 提取完整 HTML + 纯文本，计算字数和阅读时间（约 400 字/分钟）

```typescript
saveArticleHtml(articleUrl, articleTitle, publishDate): Promise<{ htmlContent, textContent } | null>
downloadArticleContents(feedId, articleIds?, onProgress): Promise<number>
```

### IPC 通道

| 通道 | 功能 | 类型 |
|------|------|------|
| `wechat:parse-article-url` | 解析微信文章 URL，提取公众号信息 | 请求-响应 |
| `wechat:set-token` | 配置 Token 参数 | 请求-响应 |
| `wechat:get-token-status` | 查询 Token 状态和有效性 | 请求-响应 |
| `wechat:fetch-article-list` | 批量拉取文章列表（异步任务） | 异步 + 进度事件 |
| `wechat:download-content` | 批量下载文章 HTML 内容（异步任务） | 异步 + 进度事件 |
| `wechat:fetch-stats` | 批量获取行为数据（异步任务） | 异步 + 进度事件 |
| `wechat:get-stats` | 查询单篇文章统计数据 | 请求-响应 |
| `wechat:get-comments` | 查询单篇文章评论列表 | 请求-响应 |
| `wechat:cancel-task` | 取消正在运行的异步任务 | 请求-响应 |
| `wechat:progress` | 进度事件广播（所有渲染进程） | 单向事件推送 |

异步任务通过 `WechatProgressEvent` 事件实时推送进度：

```typescript
interface WechatProgressEvent {
  feedId: string
  taskType: 'fetch-list' | 'download-content' | 'fetch-stats'
  current: number
  total: number
  currentTitle: string
  status: 'running' | 'completed' | 'error'
  error?: string
}
```

### 前端组件

| 组件 | 功能 |
|------|------|
| `WechatTokenDialog` | Token 配置对话框，支持 URL 粘贴、验证和状态展示 |
| `WechatOperationPanel` | 操作面板，集成文章列表拉取、内容下载、统计获取，支持页码范围和进度展示 |
| `WechatStatsSection` | 文章行为数据展示区，显示阅读/点赞/转发/在看/评论数据 |
| `AddFeedDialog`（微信标签页） | 添加公众号入口，粘贴文章 URL 自动解析公众号信息 |

### 视图路由

- 侧栏「微信公众号」导航入口：`activeView = 'wechat'`
- App.tsx 中 `contentSource` 派生为 `'feed'`，传递 `feedType='wechat'` 给 ContentList
- ContentList 通过 `feedType` 过滤文章查询，后端使用 `leftJoin` feeds 表按 `feedType` 条件筛选
- 微信视图有独立的标题（「微信公众号」）和空状态提示

## 文件清单

| 文件路径 | 角色 |
|---------|------|
| `src/main/services/wechat-service.ts` | 核心服务：Token 解析、API 调用、反封禁 |
| `src/main/services/wechat-html-saver.ts` | HTML 离线保存服务 |
| `src/main/ipc/wechat-handlers.ts` | 10 个 IPC 处理器 |
| `src/preload.ts` | Preload 桥接（10 个 wechat API） |
| `src/renderer/components/WechatTokenDialog.tsx` | Token 配置对话框 |
| `src/renderer/components/WechatOperationPanel.tsx` | 操作面板 |
| `src/renderer/components/WechatStatsSection.tsx` | 行为数据展示 |
| `src/renderer/components/AddFeedDialog.tsx` | 添加订阅（微信标签页） |
| `src/renderer/components/Sidebar.tsx` | 侧栏微信导航入口 |
| `src/renderer/components/ContentList.tsx` | 文章列表（feedType 过滤） |
| `src/renderer/components/FeedDetailPanel.tsx` | Feed 详情（嵌入操作面板） |
| `src/renderer/components/DetailPanel.tsx` | 文章详情（嵌入统计区块） |
| `src/renderer/App.tsx` | 视图路由 |
| `src/main/db/schema.ts` | 数据库 Schema（feeds 扩展 + 新表） |
| `src/main/ipc/article-handlers.ts` | 文章查询（feedType 过滤） |
| `src/shared/types.ts` | 共享类型定义 |
| `src/shared/ipc-channels.ts` | IPC 通道常量 |

## 已知限制

- Token 有效期约 2-6 小时，过期后需重新从 Fiddler 获取并配置
- 微信 API 存在频率限制，密集请求可能触发封禁（已通过延时策略缓解）
- HTML 离线保存依赖 BrowserWindow，部分复杂页面可能存在渲染差异
- 评论 API 仅能获取精选评论，非精选评论不可见
- 文章列表 API 每页返回约 10 篇，大量历史文章需要多页拉取

## 依赖

- Electron BrowserWindow：离线 HTML 保存（替代 Python Playwright）
- Electron net.fetch：微信 API HTTP 请求
- Drizzle ORM：数据库操作
- lucide-react（MessageSquare 图标）：侧栏微信导航图标
