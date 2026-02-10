# Feed 订阅管理界面设计

## 概述

新增 Feed 管理界面，参考 Readwise Reader 的 Manage feeds 页面。用户可在表格中查看、搜索、编辑、Pin、删除订阅源，右侧面板展示选中 feed 的详细信息。

## 入口与布局

- 侧边栏 Feed 区域新增 "Manage feeds" 导航项
- 点击后 `activeView = 'manage-feeds'`
- 中间区域渲染 `FeedManager` 表格组件（替换 ContentList）
- 右侧渲染 `FeedDetailPanel`（替换 DetailPanel）

## 表格设计

### 顶部
- Tab 栏：Subscribed（当前实现）/ Suggested（后期）
- 搜索框：按 name / url 实时过滤
- "Add feed" 按钮

### 列

| 列名 | 数据来源 | 排序 |
|------|---------|------|
| NAME | favicon + title (fallback url) | 字母排序 |
| DESCRIPTION | description 截断 | - |
| DOCUMENTS | 文章计数（聚合查询） | 可排序 |
| CATEGORY | category | - |
| LAST UPDATED | lastFetchedAt | 可排序（默认降序） |

### 行内操作（hover 显示）
1. **Info (i)** — 选中该行，右侧展示详情
2. **Edit (pencil)** — 打开 FeedManageDialog 编辑弹窗
3. **Pin (pin)** — Pin/Unpin 到侧边栏
4. **Delete (trash)** — 二次确认弹窗后软删除

### 底部
- `Count: N` 总订阅数

## 右侧 FeedDetailPanel

选中某 feed 后展示：
- **头部**：favicon 大图 + title + URL 外链
- **描述**：description 全文
- **元信息卡片**：
  - Category 标签
  - Fetch Interval
  - 文章总数 / Unseen 数
  - 健康状态（errorCount）
  - 最后拉取时间
  - 创建时间
- **操作按钮**：手动拉取、编辑、取消订阅
- **最近文章**：最新 5 篇文章标题列表

## Pin 机制

- feeds 表新增 `pinned INTEGER DEFAULT 0`
- Pin 后该 feed 出现在侧边栏 Feed 区域固定位置（Unseen/Seen 下方，All Feeds 上方）
- 表格中 Pin 图标：已 Pin 实心，未 Pin 空心

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/db/schema.ts` | 修改 | feeds 表加 `pinned` 字段 |
| `src/main/db/index.ts` | 修改 | 迁移 ALTER TABLE |
| `src/shared/ipc-channels.ts` | 修改 | 新增 FEED_TOGGLE_PIN、FEED_ARTICLE_COUNT |
| `src/shared/types.ts` | 修改 | Feed 加 pinned；新增 FeedArticleCount |
| `src/preload.ts` | 修改 | 暴露新 IPC |
| `src/main/ipc/feed-handlers.ts` | 修改 | pin toggle + 文章计数 handler |
| `src/renderer/components/FeedManager.tsx` | 新建 | 主表格组件 |
| `src/renderer/components/FeedDetailPanel.tsx` | 新建 | 右侧详情面板 |
| `src/renderer/components/Sidebar.tsx` | 修改 | "Manage feeds" 导航 + pinned feeds |
| `src/renderer/App.tsx` | 修改 | 路由 manage-feeds 视图 |

## 数据流

1. "Manage feeds" → activeView = 'manage-feeds'
2. FeedManager 挂载 → feedList() + feedArticleCount()
3. 点击行/info → selectedManageFeedId → FeedDetailPanel
4. Pin → feedTogglePin(id) → refreshTrigger++ → Sidebar + FeedManager 刷新
5. 删除 → 确认弹窗 → feedDelete(id) → refreshTrigger++

## 文章计数查询

新增 IPC `feed:articleCount`，后端 `SELECT feedId, COUNT(*) FROM articles WHERE deletedFlg=0 GROUP BY feedId`，一次返回避免 N+1。
