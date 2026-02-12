# Feed 订阅发现功能实现文档

## Linear Issue
- **ZYB-181**: Feed 订阅发现功能
- **分支**: `feature/feed-discovery`

## 功能概述

新增独立的"发现"页面（Discover），让用户无需提前准备订阅链接，即可搜索和浏览 RSS、播客、YouTube 频道等内容源并便捷订阅。

## 核心能力

1. **RSSHub 路由浏览** — 按分类展示 RSSHub 支持的站点，用户填参数生成订阅链接
2. **iTunes API 播客搜索** — 关键词搜索播客目录
3. **网页 RSS 自动发现** — 输入任意网站 URL，自动解析 HTML 中的 RSS/Atom link 标签
4. **统一搜索** — 智能识别输入类型（URL / 关键词），并行多路查询
5. **订阅预览** — 订阅前展示 feed 元信息和最近文章

## 技术实现

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/services/rsshub-service.ts` | RSSHub 路由缓存管理（拉取 /api/routes、分类查询、模糊搜索、URL 拼接） |
| `src/main/services/rss-discovery.ts` | 网页 RSS 自动发现（解析 link[rel=alternate] 标签） |
| `src/main/ipc/discover-handlers.ts` | 发现功能 IPC handlers（5 个通道） |
| `src/renderer/components/discover/DiscoverPage.tsx` | 发现页面主容器 |
| `src/renderer/components/discover/SearchResults.tsx` | 搜索结果列表（按来源分组） |
| `src/renderer/components/discover/CategoryGrid.tsx` | RSSHub 分类卡片网格 |
| `src/renderer/components/discover/RouteList.tsx` | 站点路由列表 |
| `src/renderer/components/discover/RouteParamForm.tsx` | 动态参数表单 |
| `src/renderer/components/discover/FeedPreview.tsx` | 订阅预览弹窗 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/shared/ipc-channels.ts` | 新增 5 个 DISCOVER_* 通道 |
| `src/shared/types.ts` | 新增 RSSHub/Discover 类型定义，AppSettings 增加 rsshubBaseUrl |
| `src/main/ipc/index.ts` | 注册 registerDiscoverHandlers |
| `src/preload.ts` | 桥接 5 个 discover* 方法 |
| `src/renderer/App.tsx` | 添加 discover 视图分支 |
| `src/renderer/components/Sidebar.tsx` | Feed section 添加 Discover 导航项 |
| `src/renderer/components/PreferencesDialog.tsx` | 添加 RSSHub 实例地址配置项 |

### IPC 通道

| 通道 | 用途 |
|------|------|
| `discover:search` | 统一搜索（智能识别 URL/关键词） |
| `discover:rsshubCategories` | 获取 RSSHub 分类列表 |
| `discover:rsshubRoutes` | 获取指定分类下的路由 |
| `discover:preview` | 预览订阅源 |
| `discover:rsshubConfig` | 获取/设置 RSSHub 实例地址 |

### 数据流

1. RSSHub 路由数据通过 `/api/routes` 拉取，内存缓存 30 分钟
2. 搜索时主进程并行查询：iTunes API + RSSHub 路由过滤 / URL RSS 自动发现
3. 订阅复用现有 `FEED_ADD` 通道
4. RSSHub 实例地址存储在应用设置文件中

## 使用前提

- 需要配置 RSSHub 自建实例地址（在发现页面顶部或设置页面配置）
- 播客搜索无需额外配置（默认使用 iTunes API）
- 网页 RSS 自动发现无需额外配置

## 设计文档

详细设计见 `docs/plans/2026-02-12-feed-discovery-design.md`
