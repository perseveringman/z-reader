# Feed 订阅发现功能设计

## 概述

新增独立的"发现"页面，让用户无需提前准备订阅链接，即可搜索和浏览 RSS、播客、YouTube 频道等内容源并便捷订阅。

## 核心能力

1. **RSSHub 路由浏览** — 按分类展示支持的站点，用户填参数生成订阅
2. **iTunes API 播客搜索** — 关键词搜索播客
3. **网页 RSS 自动发现** — 输入任意 URL 解析 HTML 中的 RSS link 标签
4. **RSSHub 后备代理** — 无 RSS 的站点通过 RSSHub 路由生成订阅链接

不引入 YouTube Data API，YouTube 频道通过 RSSHub 路由处理。

## 入口与导航

### 侧边栏入口

在 Sidebar 中新增"发现"导航项，位于"All Feeds"上方，使用搜索/指南针图标。

### 页面状态

新增视图类型：

```typescript
type ViewType = 'feed' | 'manage' | 'discover'
```

`viewType === 'discover'` 时，右侧区域渲染 DiscoverPage，单栏全宽展示。

### 发现页面内部导航

- 默认状态：搜索框 + 分类卡片网格
- 搜索后：搜索框 + 搜索结果列表（可清除回到默认）
- 点击分类：面包屑导航（发现 > 分类名 > 站点名），支持逐级返回
- 预览/参数表单：侧滑面板或模态框，不离开当前浏览位置

## 页面布局

### 顶部：统一搜索框

智能识别输入类型：
- **URL** → 触发网页 RSS 自动发现
- **关键词** → 同时搜索 iTunes 播客 + 过滤 RSSHub 路由

### 下方：RSSHub 分类浏览

- 分类卡片网格（分类名 + 站点数量）
- 点击分类 → 站点列表（站点名 + 图标 + 描述）
- 点击站点 → 路由列表（路由名称 + 示例 + 参数说明）
- 点击路由 → 动态参数表单

## 搜索功能

### URL 输入

1. 请求 URL 的 HTML，解析 `<link rel="alternate" type="application/rss+xml">` 和 `type="application/atom+xml"` 标签
2. 找到 RSS 链接 → 展示发现的订阅源列表，可直接订阅
3. 未找到 → 提示"该网站未提供 RSS 订阅"，并自动在 RSSHub 路由中匹配该域名

### 关键词输入（并行三路搜索）

1. **iTunes Search API** — 搜索播客，返回名称、作者、封面、RSS 链接
2. **RSSHub 路由过滤** — 模糊匹配站点名/路由名/分类名
3. **RSSHub 分类过滤** — 匹配分类关键词（如输入"视频"匹配视频分类下所有站点）

### 搜索结果展示

- 按来源分组：播客结果、RSS 发现结果、RSSHub 匹配路由
- 播客结果直接显示"订阅"按钮
- RSSHub 路由结果点击后进入动态参数表单
- 每组默认 5 条，可展开更多

## RSSHub 集成

### 服务配置

- 设置页面增加 RSSHub 实例地址配置项（默认空）
- 未配置时，发现页面提示用户先配置实例地址
- 配置后主进程调用 `/api/routes` 拉取路由数据并缓存

### 动态参数表单

- 根据 `/api/routes` 返回的路由参数定义自动生成表单
- 每个参数一个输入框，带 label 和 placeholder（来自路由示例）
- 可选参数标记为"选填"
- 底部"预览"按钮 → 拼接完整 RSSHub URL，尝试拉取验证
- 验证通过后显示订阅源预览
- 无必填参数的路由（如 `/zhihu/hot`）可直接订阅

## 订阅预览与确认

所有订阅路径都经过统一的预览确认步骤：

1. 主进程拉取 RSS 链接，解析 feed 元信息
2. 展示预览卡片：
   - 订阅源标题、描述、图标
   - 最近 3-5 篇文章标题和发布时间
   - 更新频率提示（根据文章时间间隔估算）
   - 订阅源类型标签（RSS / 播客 / YouTube）
3. 用户可编辑订阅名称、选择分类
4. 确认订阅 → 复用现有 `FEED_ADD` 通道

### 状态反馈

- 已订阅的源显示"已订阅"状态，不重复添加
- 拉取失败时显示错误信息和可能原因

## 技术实现

### 主进程新增模块

- `src/main/services/rsshub-service.ts` — RSSHub 路由缓存管理：拉取 `/api/routes`、路由搜索/过滤、URL 拼接
- `src/main/services/rss-discovery.ts` — 网页 RSS 自动发现：请求 HTML、解析 link 标签
- `src/main/ipc/discover-handlers.ts` — 发现功能 IPC handlers

### 新增 IPC 通道

| 通道 | 用途 |
|------|------|
| `DISCOVER_SEARCH` | 统一搜索（智能识别输入类型，并行多路查询） |
| `DISCOVER_RSSHUB_CATEGORIES` | 获取 RSSHub 路由分类列表 |
| `DISCOVER_RSSHUB_ROUTES` | 获取指定分类/站点下的路由 |
| `DISCOVER_PREVIEW` | 预览订阅源（拉取 feed 返回元信息和最近文章） |
| `DISCOVER_RSSHUB_CONFIG` | 获取/保存 RSSHub 实例配置 |

### 渲染进程新增组件

| 组件 | 用途 |
|------|------|
| `discover/DiscoverPage.tsx` | 发现页面主容器 |
| `discover/SearchResults.tsx` | 搜索结果列表（按来源分组） |
| `discover/CategoryGrid.tsx` | 分类卡片网格 |
| `discover/RouteList.tsx` | 站点路由列表 |
| `discover/RouteParamForm.tsx` | 动态参数表单 |
| `discover/FeedPreview.tsx` | 订阅预览卡片 |

### 数据库

不需要改动。订阅走现有 feeds 表，RSSHub 路由数据纯内存缓存不落库。

### 设置页面

增加 RSSHub 实例地址配置项，存储到应用配置。

### 与现有功能的关系

- AddFeedDialog（"+"按钮）保留，给知道 URL 的用户快速添加
- 播客搜索能力从 AddFeedDialog 迁移到发现页面，AddFeedDialog 播客 Tab 改为引导用户去发现页面
- FeedManager 中的"Suggested" Tab 移除，由发现页面替代

## 数据流

1. 应用启动时，主进程从 RSSHub 实例拉取 `/api/routes`，缓存到内存（定期刷新）
2. 搜索时，渲染进程发 IPC 请求，主进程并行查询：iTunes API + 本地 RSSHub 路由过滤 + URL RSS 自动发现
3. 订阅时，复用现有 `FEED_ADD` IPC 通道，RSSHub 路由 URL 前缀拼接用户配置的实例地址
