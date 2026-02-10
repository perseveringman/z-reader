# Library/Feed 二元分离架构

## 概述

将 Z-Reader 的内容体系拆分为 **Library（资料库）** 和 **Feed（订阅流）** 两个独立区域，对齐 Readwise Reader 的核心设计理念：

- **Library（高信噪比）**: 用户主动策划的内容——手动保存 URL、从 Feed 提升的文章。永久存储，支持完整的 Inbox/Later/Archive 三态管理。
- **Feed（低信噪比）**: RSS 自动抓取的内容——仅有 Unseen/Seen 两态，点到即止。用户可将有价值的文章"保存到 Library"进行深度管理。

## 设计决策

### 为什么用 `source` 字段而不是判断 `feedId IS NULL`？

1. 从 Feed 保存到 Library 的文章仍保留 `feedId` 以追溯来源
2. 显式字段让查询语义更清晰，避免隐式逻辑
3. 为未来扩展其他来源（浏览器插件、API 导入）预留空间

### Feed 状态系统

Feed 文章使用简化的两态系统（`unseen`/`seen`），与 Library 的三态系统（`inbox`/`later`/`archive`）共用 `read_status` 字段：

| 区域 | 可用状态 | 说明 |
|------|---------|------|
| Library | `inbox` / `later` / `archive` | 三态管理流 |
| Feed | `unseen` / `seen` | 仅区分已读/未读 |

### "保存到 Library" 行为

- 将 `source` 从 `'feed'` 改为 `'library'`
- 将 `readStatus` 设为 `'inbox'`
- 保留 `feedId` 引用（用于归因展示）
- 文章从 Feed 视图中消失（干净分离，无重复）

### "已读"触发条件

- Feed 文章在列表中被 hover/选中时自动标记为 `seen`
- 采用乐观更新避免 UI 闪烁

### Shortlist 与 Trash

- 两个区域共享同一个 Shortlist 和 Trash（不按来源隔离）

## 变更文件

### 修改文件 (11)

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/db/schema.ts` | 修改 | articles 表新增 `source` 字段 |
| `src/main/db/index.ts` | 修改 | 迁移 SQL：ALTER TABLE + 索引 |
| `src/shared/ipc-channels.ts` | 修改 | 新增 `ARTICLE_SAVE_URL`、`ARTICLE_SAVE_TO_LIBRARY` |
| `src/shared/types.ts` | 修改 | 新增 `ArticleSource`、`ReadStatus`、`SaveUrlInput` 类型；更新 `Article`、`ArticleListQuery`、`UpdateArticleInput`、`ElectronAPI` |
| `src/preload.ts` | 修改 | 新增 `articleSaveUrl`、`articleSaveToLibrary` IPC 桥接 |
| `src/main/ipc/article-handlers.ts` | 修改 | 新增 2 个 handler + `ARTICLE_LIST` 增加 source 过滤 + `ARTICLE_UPDATE` 支持 source 更新 |
| `src/main/services/rss-service.ts` | 修改 | 新文章插入时设置 `source:'feed'`、`readStatus:'unseen'` |
| `src/renderer/App.tsx` | 修改 | 新视图路由、AddUrlDialog 状态、`Cmd+Shift+S` 快捷键、source/initialTab 派生 |
| `src/renderer/components/Sidebar.tsx` | 修改 | 完整重构导航结构 |
| `src/renderer/components/ContentList.tsx` | 修改 | source 感知的 Tab 切换、hover 标记已读、Save to Library 上下文菜单 |
| `src/renderer/components/ArticleCard.tsx` | 修改 | BookmarkPlus 保存按钮、source 感知的快捷操作 |

### 新增文件 (1)

| 文件 | 说明 |
|------|------|
| `src/renderer/components/AddUrlDialog.tsx` | 手动保存 URL 到 Library 的对话框 |

## Schema 变更

### articles 表新增字段

```sql
source TEXT DEFAULT 'feed'   -- 'library' | 'feed'
```

### 迁移策略

```typescript
// 在 initTables() 末尾执行，使用 try/catch 保证幂等
try {
  sqlite.exec(`ALTER TABLE articles ADD COLUMN source TEXT DEFAULT 'feed'`);
  sqlite.exec(`UPDATE articles SET source = 'feed' WHERE source IS NULL`);
} catch {
  // 字段已存在，跳过
}
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)`);
```

所有历史文章默认为 `source = 'feed'`，零数据损失。

## IPC 通道

### 新增通道

| 通道名 | 方向 | 说明 |
|--------|------|------|
| `article:saveUrl` | Renderer → Main | 通过 URL 手动保存文章到 Library |
| `article:saveToLibrary` | Renderer → Main | 将 Feed 文章提升到 Library |

### `article:saveUrl` Handler

```
输入: { url: string, title?: string }
处理: 调用 @postlight/parser 解析正文 → 插入 articles 表（source='library', readStatus='inbox'）
输出: Article 完整对象
```

### `article:saveToLibrary` Handler

```
输入: articleId (string)
处理: UPDATE articles SET source='library', readStatus='inbox' WHERE id=?
输出: Article 更新后的对象
```

### `article:list` 变更

查询参数新增 `source?: 'library' | 'feed'` 过滤条件。

## 侧边栏导航结构

```
Library
  ├─ Inbox          → library-inbox
  ├─ Later          → library-later
  ├─ Archive        → library-archive
  └─ Tags           → tags（可展开子标签列表）

Feed
  ├─ Unseen         → feed-unseen
  ├─ Seen           → feed-seen
  ├─ All Feeds      → feeds（feedId=null）
  └─ [订阅源列表]    → feeds + feedId

Pinned
  ├─ Shortlist      → shortlist
  └─ Trash          → trash
```

顶部操作栏新增 **Save URL** 按钮（Link 图标），与现有 **Add Feed** 按钮（Plus 图标）并列。

## 键盘快捷键

### 新增/变更

| 快捷键 | 作用域 | 功能 |
|--------|--------|------|
| `Cmd+Shift+S` | 全局 | 打开"保存 URL"对话框 |
| `B` | Feed 视图 | 将选中文章保存到 Library |
| `1` | Library 视图 | 切换到 Inbox |
| `1` | Feed 视图 | 切换到 Unseen |
| `2` | Library 视图 | 切换到 Later |
| `2` | Feed 视图 | 切换到 Seen |
| `3` | Library 视图 | 切换到 Archive |
| `E` | Library 视图 | 归档文章（Feed 视图中无效） |
| `L` | Library 视图 | 标记稍后阅读（Feed 视图中无效） |

### 不变

| 快捷键 | 功能 |
|--------|------|
| `S` | 切换 Shortlist（全局） |
| `D` | 删除（全局） |
| `Z` | 撤销（全局） |
| `j/k` | 上下导航（全局） |
| `Enter` | 打开阅读视图（全局） |

## 数据流转图

```
                     ┌─────────────────┐
                     │   RSS 定时抓取   │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │  Feed (Unseen)  │  source='feed', readStatus='unseen'
                     └────────┬────────┘
                              │
                   ┌──────────┼──────────┐
                   │          │          │
                   ▼          ▼          ▼
              hover/选中   用户按 B   用户按 D
                   │          │          │
                   ▼          ▼          ▼
            Feed (Seen)   Library    Trash
                         (Inbox)
                              │
                   ┌──────────┼──────────┐
                   │          │          │
                   ▼          ▼          ▼
               按 L        按 E      按 S
                   │          │          │
                   ▼          ▼          ▼
               Later     Archive   Shortlist


                     ┌─────────────────┐
                     │  用户手动保存 URL │  Cmd+Shift+S
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Library (Inbox) │  source='library', readStatus='inbox'
                     └─────────────────┘
```

## 后续规划 (Phase 2)

### 浏览器扩展

- 注册 `z-reader://save?url=...` 深度链接协议
- Chrome Manifest V3 扩展，通过深度链接将 URL 发送到 Z-Reader
- 一键将浏览器中正在阅读的文章保存到 Library
