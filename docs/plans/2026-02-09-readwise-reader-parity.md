# Readwise Reader 功能对齐实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Z-Reader 补齐 Readwise Reader 的核心交互功能，达到良好的操作体验和阅读体验。

**Architecture:** 所有功能遵循现有 Main→IPC→Renderer 架构。数据层改动在 `src/main/` 下完成，UI 改动在 `src/renderer/components/` 下完成，类型和通道定义通过 `src/shared/` 共享。新增 IPC 通道需同步修改 `ipc-channels.ts`、`types.ts`、`global.d.ts`、`preload.ts` 和对应的 handler 文件。

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS + SQLite (better-sqlite3) + Drizzle ORM

**Linear Issues:** ZYB-137 ~ ZYB-151

---

## 批次 A：核心操作闭环 (High Priority)

---

### Task 1: 全文搜索 (ZYB-137)

**目标:** 用户可通过 `/` 快捷键或 Search 按钮唤起搜索面板，实时搜索文章标题、正文、作者。

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 `ARTICLE_SEARCH` 通道
- Modify: `src/shared/types.ts` — 添加 `ArticleSearchQuery` 类型和 `ElectronAPI.articleSearch` 方法
- Modify: `src/shared/global.d.ts` — (随 types.ts 自动生效)
- Modify: `src/preload.ts` — 添加 `articleSearch` 桥接
- Modify: `src/main/ipc/article-handlers.ts` — 添加 FTS5 搜索 handler
- Modify: `src/main/db/index.ts` — 添加 FTS5 触发器保持索引同步
- Create: `src/renderer/components/SearchPanel.tsx` — 搜索面板 UI
- Modify: `src/renderer/App.tsx` — 集成搜索面板
- Modify: `src/renderer/components/Sidebar.tsx` — Search 按钮绑定事件

**Step 1: 添加 FTS5 同步触发器**

在 `src/main/db/index.ts` 的 `initTables` 函数末尾添加 FTS5 自动同步触发器：

```sql
-- FTS5 同步触发器：插入
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, content_text, author)
  VALUES (NEW.rowid, NEW.title, NEW.content_text, NEW.author);
END;

-- FTS5 同步触发器：删除
CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_text, author)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content_text, OLD.author);
END;

-- FTS5 同步触发器：更新
CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_text, author)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content_text, OLD.author);
  INSERT INTO articles_fts(rowid, title, content_text, author)
  VALUES (NEW.rowid, NEW.title, NEW.content_text, NEW.author);
END;
```

**Step 2: 添加 IPC 通道和类型**

在 `src/shared/ipc-channels.ts` 的 Article 区域添加：
```typescript
ARTICLE_SEARCH: 'article:search',
```

在 `src/shared/types.ts` 添加：
```typescript
export interface ArticleSearchQuery {
  query: string;
  limit?: number;
}
```

在 `ElectronAPI` 接口添加：
```typescript
articleSearch: (query: ArticleSearchQuery) => Promise<Article[]>;
```

在 `src/preload.ts` 添加：
```typescript
articleSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_SEARCH, query),
```

**Step 3: 实现搜索 handler**

在 `src/main/ipc/article-handlers.ts` 添加 handler：
```typescript
ipcMain.handle(ARTICLE_SEARCH, async (_event, query: ArticleSearchQuery) => {
  const db = getDatabase();
  const sqlite = db._.session as any; // 访问底层 better-sqlite3 实例
  // 使用原始 SQL 进行 FTS5 搜索
  const stmt = sqlite.prepare(`
    SELECT a.* FROM articles a
    INNER JOIN articles_fts fts ON a.rowid = fts.rowid
    WHERE articles_fts MATCH ? AND a.deleted_flg = 0
    ORDER BY rank
    LIMIT ?
  `);
  return stmt.all(query.query + '*', query.limit ?? 20);
});
```

注意：由于 Drizzle ORM 不直接支持 FTS5 查询，需要通过底层 better-sqlite3 直接执行 raw SQL。在 `src/main/db/index.ts` 中导出 sqlite 实例：
```typescript
let sqliteInstance: Database.Database | null = null;

export function getSqlite() {
  return sqliteInstance;
}
```

并在 `getDatabase` 中保存引用：
```typescript
sqliteInstance = sqlite;
```

handler 改为：
```typescript
import { getSqlite } from '../db';

ipcMain.handle(ARTICLE_SEARCH, async (_event, query: ArticleSearchQuery) => {
  const sqlite = getSqlite();
  if (!sqlite) return [];
  const searchTerm = query.query.trim();
  if (!searchTerm) return [];
  const stmt = sqlite.prepare(`
    SELECT a.* FROM articles a
    INNER JOIN articles_fts fts ON a.rowid = fts.rowid
    WHERE articles_fts MATCH ? AND a.deleted_flg = 0
    ORDER BY rank
    LIMIT ?
  `);
  return stmt.all(searchTerm + '*', query.limit ?? 20);
});
```

**Step 4: 创建 SearchPanel 组件**

创建 `src/renderer/components/SearchPanel.tsx`：
- 全屏遮罩 + 居中搜索框（类似 CommandPalette 风格）
- 输入框自动聚焦，300ms 防抖搜索
- 搜索结果列表展示：标题、作者、域名、摘要片段
- 箭头键导航 + Enter 选中跳转到文章
- ESC 关闭

**Step 5: 集成到 App.tsx**

- 添加 `searchOpen` 状态
- `/` 快捷键打开搜索（在 ContentList 的 keydown 中已经有 `/` 但未实现）
- Sidebar Search 按钮点击打开
- 搜索结果选中后：设置 selectedArticleId 或打开 ReaderView

**Step 6: 提交**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/db/index.ts src/main/ipc/article-handlers.ts src/renderer/components/SearchPanel.tsx src/renderer/App.tsx src/renderer/components/Sidebar.tsx
git commit -m "feat: 全文搜索 (FTS5) - ZYB-137"
```

---

### Task 2: Feed 分类展示与按 Feed 筛选 (ZYB-138)

**目标:** Sidebar Feed 区域展示各订阅源（按分类分组），点击可筛选该 Feed 下的文章。

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx` — Feed 列表展示 + 分类分组 + 点击筛选
- Modify: `src/renderer/App.tsx` — 添加 feedFilter 状态，传递给 ContentList
- Modify: `src/renderer/components/ContentList.tsx` — 支持 feedId 筛选

**Step 1: App.tsx 添加 Feed 筛选状态**

```typescript
const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
```

传递给 Sidebar：
```typescript
<Sidebar
  ...
  selectedFeedId={selectedFeedId}
  onFeedSelect={(feedId) => {
    setSelectedFeedId(feedId);
    setActiveView('feeds');
  }}
/>
```

传递给 ContentList：
```typescript
<ContentList
  ...
  feedId={activeView === 'feeds' ? selectedFeedId : undefined}
/>
```

**Step 2: Sidebar 加载 Feed 列表并分组展示**

Sidebar 内部：
- `useEffect` 调用 `window.electronAPI.feedList()` 获取 feeds
- 按 `category` 分组（null 归入 "未分类"）
- Feed 区域展示分类 → 各 Feed（显示 favicon + title + 未读数）
- "All Feeds" 点击清除 feedId 筛选
- 单个 Feed 点击设置对应 feedId

**Step 3: ContentList 支持 feedId prop**

```typescript
interface ContentListProps {
  ...
  feedId?: string | null;
}
```

在 `fetchArticles` 中把 feedId 传入 query：
```typescript
const query: ArticleListQuery = {
  readStatus: activeTab,
  feedId: feedId ?? undefined,
  ...
};
```

当 `activeView === 'feeds'` 且有 `feedId` 时，内容列表只显示该 Feed 文章。

**Step 4: 提交**

```bash
git add src/renderer/App.tsx src/renderer/components/Sidebar.tsx src/renderer/components/ContentList.tsx
git commit -m "feat: Feed 分类展示与按 Feed 筛选 - ZYB-138"
```

---

### Task 3: Shortlist 收藏功能 (ZYB-139)

**目标:** 用户可收藏文章到 Shortlist，Sidebar Shortlist 视图显示所有收藏文章。

**Files:**
- Modify: `src/renderer/components/ArticleCard.tsx` — 添加星标按钮
- Modify: `src/renderer/components/ContentList.tsx` — Shortlist 视图 + `S` 快捷键
- Modify: `src/renderer/App.tsx` — Shortlist 视图逻辑

**Step 1: ArticleCard 添加星标按钮**

在 hover 浮层中添加 Star 按钮（在 Archive 和 Later 之前）：
```typescript
import { Star } from 'lucide-react';

// 在 onStatusChange 之外添加 onToggleShortlist prop
interface ArticleCardProps {
  ...
  onToggleShortlist?: (id: string, current: boolean) => void;
}
```

星标按钮：已收藏显示实心黄色星星，未收藏显示空心。

**Step 2: ContentList 支持 Shortlist 视图**

添加 props：
```typescript
interface ContentListProps {
  ...
  isShortlisted?: boolean;  // 当 activeView === 'shortlist' 时为 true
}
```

fetchArticles 中：
```typescript
if (isShortlisted) {
  query.isShortlisted = true;
  delete query.readStatus; // Shortlist 不按状态筛选
}
```

添加 `S` 快捷键切换当前文章的 shortlist 状态。

添加 `handleToggleShortlist` 方法：
```typescript
const handleToggleShortlist = async (id: string, current: boolean) => {
  await window.electronAPI.articleUpdate({ id, isShortlisted: !current });
  await fetchArticles();
  showToast(current ? '已取消收藏' : '已加入 Shortlist', 'success');
};
```

**Step 3: App.tsx Shortlist 视图切换**

当 `activeView === 'shortlist'` 时，传递 `isShortlisted={true}` 给 ContentList。ContentList 的标题也改为动态显示（Shortlist 时不显示 INBOX/LATER/ARCHIVE tabs）。

**Step 4: 提交**

```bash
git add src/renderer/components/ArticleCard.tsx src/renderer/components/ContentList.tsx src/renderer/App.tsx
git commit -m "feat: Shortlist 收藏功能 - ZYB-139"
```

---

### Task 4: 未读/已读文章视觉区分 (ZYB-140)

**目标:** 已读文章（readProgress > 0 或 readStatus === 'archive'）在列表中视觉弱化。

**Files:**
- Modify: `src/renderer/components/ArticleCard.tsx` — 已读样式变灰

**Step 1: ArticleCard 根据阅读状态调整样式**

判断逻辑：文章 `readProgress >= 0.9` 或 `readStatus === 'archive'` 视为"已读"。

已读文章样式调整：
- 标题颜色从 `text-gray-100` 降为 `text-gray-500`
- 摘要颜色从 `text-gray-500` 降为 `text-gray-600`
- 整体透明度降低 `opacity-70`
- 缩略图/域名首字母也降低对比度

```typescript
const isRead = article.readProgress >= 0.9 || article.readStatus === 'archive';

// 标题类名
className={`text-[14px] font-medium truncate leading-snug ${isRead ? 'text-gray-500' : 'text-gray-100'}`}
```

**Step 2: 提交**

```bash
git add src/renderer/components/ArticleCard.tsx
git commit -m "feat: 未读/已读文章视觉区分 - ZYB-140"
```

---

### Task 5: Trash 回收站 (ZYB-141)

**目标:** 删除文章进入 Trash，支持恢复和永久删除。

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 `ARTICLE_RESTORE`, `ARTICLE_PERMANENT_DELETE`
- Modify: `src/shared/types.ts` — 添加 `ElectronAPI` 新方法
- Modify: `src/preload.ts` — 添加桥接
- Modify: `src/main/ipc/article-handlers.ts` — 添加恢复和永久删除 handler
- Modify: `src/renderer/components/Sidebar.tsx` — 添加 Trash 入口
- Modify: `src/renderer/components/ContentList.tsx` — Trash 视图 + 恢复/永久删除操作
- Modify: `src/renderer/App.tsx` — Trash 视图逻辑

**Step 1: IPC 通道和类型**

`ipc-channels.ts` 添加：
```typescript
ARTICLE_RESTORE: 'article:restore',
ARTICLE_PERMANENT_DELETE: 'article:permanentDelete',
ARTICLE_LIST_DELETED: 'article:listDeleted',
```

`types.ts` ElectronAPI 添加：
```typescript
articleRestore: (id: string) => Promise<Article>;
articlePermanentDelete: (id: string) => Promise<void>;
articleListDeleted: () => Promise<Article[]>;
```

`preload.ts` 添加对应桥接。

**Step 2: 后端 handler**

```typescript
// 恢复文章
ipcMain.handle(ARTICLE_RESTORE, async (_event, id: string) => {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.update(schema.articles).set({ deletedFlg: 0, updatedAt: now }).where(eq(schema.articles.id, id));
  const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
  return result;
});

// 永久删除
ipcMain.handle(ARTICLE_PERMANENT_DELETE, async (_event, id: string) => {
  const db = getDatabase();
  await db.delete(schema.articles).where(eq(schema.articles.id, id));
});

// 查询已删除文章
ipcMain.handle(ARTICLE_LIST_DELETED, async () => {
  const db = getDatabase();
  return db.select().from(schema.articles)
    .where(eq(schema.articles.deletedFlg, 1))
    .orderBy(desc(schema.articles.updatedAt));
});
```

**Step 3: Sidebar 添加 Trash 入口**

在 Pinned section 下方添加 Trash 导航项，使用 `Trash2` 图标。

**Step 4: ContentList Trash 视图**

当 `activeView === 'trash'` 时：
- 不显示 INBOX/LATER/ARCHIVE tabs
- 标题改为 "Trash"
- 调用 `articleListDeleted()` 获取数据
- 文章卡片 hover 操作改为: 恢复 (RotateCcw) + 永久删除 (Trash2)
- 修改撤销栈：删除操作支持撤销（恢复文章）

**Step 5: 修改 ContentList 现有的删除逻辑**

将 `handleDelete` 中的撤销改为真正可撤销：
```typescript
const handleDelete = async (id: string) => {
  const article = articles.find(a => a.id === id);
  await window.electronAPI.articleDelete(id);
  await fetchArticles();
  showToast('已移入回收站', 'success');
  undoStack.push({
    description: 'Undo delete',
    undo: async () => {
      await window.electronAPI.articleRestore(id);
      await fetchArticles();
      showToast('已恢复', 'info');
    },
  });
};
```

**Step 6: 提交**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/ipc/article-handlers.ts src/renderer/components/Sidebar.tsx src/renderer/components/ContentList.tsx src/renderer/App.tsx
git commit -m "feat: Trash 回收站 - ZYB-141"
```

---

## 批次 B：提升阅读品质 (Medium Priority)

---

### Task 6: 阅读视图排版控制 (ZYB-142)

**目标:** 用户可调节字体、字号、行距、主题（亮/暗/米黄）。

**Files:**
- Create: `src/renderer/components/ReaderSettings.tsx` — 排版设置浮层
- Modify: `src/renderer/components/ReaderView.tsx` — 集成设置，动态应用样式
- Modify: `src/index.css` — 添加主题变体样式

**Step 1: ReaderSettings 组件**

设置项:
- 字体: System / Serif / Sans-serif / Monospace
- 字号: 14-22px 滑块
- 行距: 1.5 / 1.75 / 2.0
- 主题: Dark (当前) / Light / Sepia

使用 localStorage 持久化设置。

**Step 2: ReaderView 集成**

在正文区域顶栏添加设置按钮（Settings2 图标），点击弹出 ReaderSettings 浮层。

动态样式通过 inline style 应用到 `.article-content` 容器：
```typescript
style={{
  fontFamily: fontMap[settings.font],
  fontSize: `${settings.fontSize}px`,
  lineHeight: settings.lineHeight,
}}
```

主题通过父容器的 className 控制：
```css
.reader-theme-light { background: #fff; color: #1a1a1a; }
.reader-theme-sepia { background: #f4ecd8; color: #5b4636; }
.reader-theme-dark  { background: #0f0f0f; color: #d1d5db; }
```

**Step 3: 提交**

```bash
git add src/renderer/components/ReaderSettings.tsx src/renderer/components/ReaderView.tsx src/index.css
git commit -m "feat: 阅读视图排版控制 - ZYB-142"
```

---

### Task 7: 标签系统 UI (ZYB-143)

**目标:** 用户可为文章添加/删除标签，Sidebar Tags 视图按标签筛选文章。

**Files:**
- Modify: `src/main/ipc/index.ts` — 注册 tag handlers
- Create: `src/main/ipc/tag-handlers.ts` — Tag CRUD handler
- Modify: `src/renderer/components/Sidebar.tsx` — Tags 区域展示标签列表
- Create: `src/renderer/components/TagPicker.tsx` — 标签选择器弹出框
- Modify: `src/renderer/components/DetailPanel.tsx` — Info Tab 添加标签区域
- Modify: `src/renderer/components/ContentList.tsx` — 支持按 tagId 筛选
- Modify: `src/renderer/App.tsx` — Tags 视图逻辑

**Step 1: 创建 tag-handlers.ts**

实现 IPC_CHANNELS 中已定义的 5 个 tag 通道：
```typescript
TAG_LIST, TAG_CREATE, TAG_DELETE, ARTICLE_TAG_ADD, ARTICLE_TAG_REMOVE
```

TAG_LIST 额外返回每个标签的文章数（通过 JOIN article_tags 统计）。

在 `ipc/index.ts` 中注册：
```typescript
import { registerTagHandlers } from './tag-handlers';
// ...
registerTagHandlers();
```

**Step 2: Sidebar Tags 展示**

当 Tags section 展开时，加载并展示所有标签，每个标签显示文章数。点击标签切换到对应 tag 筛选视图。

**Step 3: TagPicker 组件**

用于在 DetailPanel 中为文章添加标签：
- 显示已关联标签（带删除 X 按钮）
- 输入框：搜索已有标签或创建新标签
- 下拉列表显示匹配标签

**Step 4: DetailPanel Info Tab 添加标签区域**

在元数据区域下方添加 Tags 行，点击打开 TagPicker。

**Step 5: ContentList 支持 tagId 筛选**

添加新 IPC：`ARTICLE_LIST_BY_TAG`，返回指定 tag 关联的文章列表。

**Step 6: 提交**

```bash
git add src/main/ipc/tag-handlers.ts src/main/ipc/index.ts src/renderer/components/Sidebar.tsx src/renderer/components/TagPicker.tsx src/renderer/components/DetailPanel.tsx src/renderer/components/ContentList.tsx src/renderer/App.tsx src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts
git commit -m "feat: 标签系统 UI - ZYB-143"
```

---

### Task 8: 高亮笔记增强 (ZYB-144)

**目标:** 高亮支持内联编辑笔记、高亮间跳转。

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 `HIGHLIGHT_UPDATE`
- Modify: `src/shared/types.ts` — 添加 `UpdateHighlightInput` 和 `highlightUpdate` API
- Modify: `src/preload.ts` — 桥接
- Modify: `src/main/ipc/highlight-handlers.ts` — 更新 handler
- Modify: `src/renderer/components/DetailPanel.tsx` — 高亮卡片内联编辑
- Modify: `src/renderer/components/ReaderDetailPanel.tsx` — 同步修改
- Modify: `src/renderer/components/ReaderView.tsx` — 高亮点击跳转

**Step 1: 后端添加 HIGHLIGHT_UPDATE**

```typescript
HIGHLIGHT_UPDATE: 'highlight:update',
```

```typescript
export interface UpdateHighlightInput {
  id: string;
  note?: string;
  color?: string;
}
```

Handler：
```typescript
ipcMain.handle(HIGHLIGHT_UPDATE, async (_event, input: UpdateHighlightInput) => {
  const db = getDatabase();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (input.note !== undefined) updates.note = input.note;
  if (input.color !== undefined) updates.color = input.color;
  await db.update(schema.highlights).set(updates).where(eq(schema.highlights.id, input.id));
  const [result] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, input.id));
  return result;
});
```

**Step 2: 高亮卡片内联编辑笔记**

在 DetailPanel 和 ReaderDetailPanel 的高亮卡片中：
- 点击笔记区域变为 textarea 编辑模式
- blur 或 Enter 保存
- 如果无笔记，显示"添加笔记…"占位文本，点击可添加

**Step 3: ReaderView 高亮跳转**

Notebook Tab 中点击某条高亮，自动滚动到对应的 `mark[data-highlight-id]` 元素。

**Step 4: 提交**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/ipc/highlight-handlers.ts src/renderer/components/DetailPanel.tsx src/renderer/components/ReaderDetailPanel.tsx src/renderer/components/ReaderView.tsx
git commit -m "feat: 高亮笔记增强 - ZYB-144"
```

---

### Task 9: 文章内目录导航 TOC (ZYB-145)

**目标:** 阅读视图左侧自动提取 H1-H6 标题生成目录，点击跳转。

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx` — 提取标题并渲染 TOC

**Step 1: 正文加载后提取标题**

```typescript
interface TocItem {
  id: string;
  text: string;
  level: number;  // 1-6
}

function extractToc(contentEl: HTMLDivElement): TocItem[] {
  const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return Array.from(headings).map((h, i) => {
    const id = `heading-${i}`;
    h.id = id;
    return {
      id,
      text: h.textContent?.trim() ?? '',
      level: parseInt(h.tagName.charAt(1)),
    };
  });
}
```

在 `article.content` 渲染完成后（useEffect），提取 TOC 到状态。

**Step 2: 渲染左侧 Contents 面板**

替换当前"文章目录功能开发中…"占位内容：
```tsx
{tocItems.length > 0 ? (
  <ul className="space-y-1">
    {tocItems.map((item) => (
      <li key={item.id}>
        <button
          onClick={() => {
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="text-[12px] text-gray-400 hover:text-white text-left truncate w-full transition-colors"
          style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
        >
          {item.text}
        </button>
      </li>
    ))}
  </ul>
) : (
  <p className="text-[12px] text-gray-500">此文章没有章节标题</p>
)}
```

**Step 3: 提交**

```bash
git add src/renderer/components/ReaderView.tsx
git commit -m "feat: 文章内目录导航 TOC - ZYB-145"
```

---

### Task 10: 键盘快捷键帮助面板 (ZYB-146)

**目标:** `?` 键唤出快捷键帮助面板。

**Files:**
- Create: `src/renderer/components/KeyboardShortcutsHelp.tsx`
- Modify: `src/renderer/App.tsx` — 集成

**Step 1: 创建 KeyboardShortcutsHelp 组件**

对话框样式，分类列出所有快捷键：

```typescript
const SHORTCUT_GROUPS = [
  {
    title: '导航',
    items: [
      { keys: ['j', '↓'], description: '下一篇文章 / 下一段落' },
      { keys: ['k', '↑'], description: '上一篇文章 / 上一段落' },
      { keys: ['Enter'], description: '打开阅读视图' },
      { keys: ['Esc'], description: '返回 / 关闭' },
    ],
  },
  {
    title: '文章操作',
    items: [
      { keys: ['E'], description: '归档' },
      { keys: ['L'], description: '稍后阅读' },
      { keys: ['D'], description: '删除' },
      { keys: ['S'], description: '收藏 / 取消收藏' },
      { keys: ['Z'], description: '撤销' },
    ],
  },
  {
    title: '视图切换',
    items: [
      { keys: ['1'], description: 'Inbox' },
      { keys: ['2'], description: 'Later' },
      { keys: ['3'], description: 'Archive' },
    ],
  },
  {
    title: '全局',
    items: [
      { keys: ['⌘K'], description: '命令面板' },
      { keys: ['/'], description: '搜索' },
      { keys: ['?'], description: '快捷键帮助' },
      { keys: ['H'], description: '高亮当前段落 (阅读视图)' },
    ],
  },
];
```

**Step 2: App.tsx 集成**

- 添加 `shortcutsHelpOpen` 状态
- `?` 键（Shift + /）切换显示
- 注意不要在 INPUT/TEXTAREA 中触发

**Step 3: 提交**

```bash
git add src/renderer/components/KeyboardShortcutsHelp.tsx src/renderer/App.tsx
git commit -m "feat: 键盘快捷键帮助面板 - ZYB-146"
```

---

## 批次 C：完善操作效率 (Low Priority)

---

### Task 11: 文章列表视图模式切换 (ZYB-147)

**目标:** ContentList 支持紧凑列表和扩展卡片两种视图。

**Files:**
- Modify: `src/renderer/components/ContentList.tsx` — 视图切换按钮 + 紧凑模式
- Modify: `src/renderer/components/ArticleCard.tsx` — 支持 compact prop

**Step 1: ContentList 添加视图切换**

在排序区域添加切换按钮（LayoutList / LayoutGrid 图标），存入 localStorage。

**Step 2: ArticleCard compact 模式**

compact 模式：隐藏缩略图和摘要，只显示标题 + 元数据行，高度更紧凑。

```typescript
interface ArticleCardProps {
  ...
  compact?: boolean;
}
```

**Step 3: 提交**

```bash
git add src/renderer/components/ContentList.tsx src/renderer/components/ArticleCard.tsx
git commit -m "feat: 文章列表视图模式切换 - ZYB-147"
```

---

### Task 12: 批量操作 (ZYB-148)

**目标:** 支持多选文章，批量归档/删除/打标签。

**Files:**
- Modify: `src/renderer/components/ContentList.tsx` — 多选模式
- Modify: `src/renderer/components/ArticleCard.tsx` — Checkbox 选择
- Modify: `src/shared/types.ts` — 批量操作 API
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload.ts`
- Modify: `src/main/ipc/article-handlers.ts` — 批量 handler

**Step 1: 批量操作 IPC**

```typescript
ARTICLE_BATCH_UPDATE: 'article:batchUpdate',
ARTICLE_BATCH_DELETE: 'article:batchDelete',
```

```typescript
articleBatchUpdate: (ids: string[], input: Partial<UpdateArticleInput>) => Promise<void>;
articleBatchDelete: (ids: string[]) => Promise<void>;
```

**Step 2: ContentList 多选模式**

- `Cmd/Ctrl + 点击` 切换选择
- `Shift + 点击` 范围选择
- 选中时顶部显示批量操作栏：已选 N 篇 | 归档 | 稍后 | 删除 | 取消

**Step 3: ArticleCard Checkbox**

多选模式下，卡片左侧缩略图位置显示 checkbox。

**Step 4: 提交**

```bash
git add src/renderer/components/ContentList.tsx src/renderer/components/ArticleCard.tsx src/shared/types.ts src/shared/ipc-channels.ts src/preload.ts src/main/ipc/article-handlers.ts
git commit -m "feat: 批量操作 - ZYB-148"
```

---

### Task 13: 右键上下文菜单 (ZYB-149)

**目标:** 文章卡片右键弹出上下文菜单。

**Files:**
- Create: `src/renderer/components/ContextMenu.tsx` — 通用右键菜单组件
- Modify: `src/renderer/components/ArticleCard.tsx` — 右键事件
- Modify: `src/renderer/components/ContentList.tsx` — 菜单状态管理

**Step 1: ContextMenu 组件**

通用的右键菜单，支持：
- 位置（x, y）
- 菜单项列表（icon + label + onClick + 分隔线）
- 点击外部关闭

**Step 2: ArticleCard 右键事件**

```typescript
onContextMenu={(e) => {
  e.preventDefault();
  onContextMenu?.(article.id, e.clientX, e.clientY);
}}
```

**Step 3: ContentList 菜单项**

菜单项：
- 打开阅读视图
- ---
- 移入 Inbox / Later / Archive
- 收藏 / 取消收藏
- ---
- 删除
- 在浏览器中打开

**Step 4: 提交**

```bash
git add src/renderer/components/ContextMenu.tsx src/renderer/components/ArticleCard.tsx src/renderer/components/ContentList.tsx
git commit -m "feat: 右键上下文菜单 - ZYB-149"
```

---

### Task 14: Feed 管理面板 (ZYB-150)

**目标:** 查看/编辑/删除 Feed，显示健康状态。

**Files:**
- Create: `src/renderer/components/FeedManageDialog.tsx` — Feed 管理对话框
- Modify: `src/renderer/components/Sidebar.tsx` — Feed 项目右键编辑入口
- Modify: `src/renderer/App.tsx` — 集成

**Step 1: FeedManageDialog 组件**

对话框显示单个 Feed 详情：
- 基本信息：标题（可编辑）、URL（只读）、分类（可编辑）
- 抓取设置：间隔时间（可编辑）
- 健康状态：上次抓取时间、连续错误次数
- 操作：保存修改、手动抓取、取消订阅（删除）

**Step 2: Sidebar Feed 入口**

每个 Feed 项添加右键菜单或 hover 齿轮图标，打开 FeedManageDialog。

**Step 3: 提交**

```bash
git add src/renderer/components/FeedManageDialog.tsx src/renderer/components/Sidebar.tsx src/renderer/App.tsx
git commit -m "feat: Feed 管理面板 - ZYB-150"
```

---

### Task 15: 笔记/高亮导出 (ZYB-151)

**目标:** 将文章高亮和笔记导出为 Markdown。

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 `HIGHLIGHT_EXPORT`
- Modify: `src/shared/types.ts`
- Modify: `src/preload.ts`
- Create: `src/main/ipc/export-handlers.ts` — 导出逻辑
- Modify: `src/main/ipc/index.ts` — 注册
- Modify: `src/renderer/components/DetailPanel.tsx` — 导出按钮
- Modify: `src/renderer/components/ReaderDetailPanel.tsx` — 导出按钮

**Step 1: 导出 handler**

```typescript
HIGHLIGHT_EXPORT: 'highlight:export',
```

Handler 生成 Markdown 格式：
```markdown
# {文章标题}

**来源:** {domain}
**作者:** {author}
**日期:** {publishedAt}
**链接:** {url}

---

## Highlights

> {高亮文本 1}

{笔记 1}

---

> {高亮文本 2}

...
```

支持两种方式：
1. 复制到剪贴板（使用 `clipboard.writeText`）
2. 保存为文件（使用 `dialog.showSaveDialog`）

**Step 2: UI 导出按钮**

在 Notebook Tab 标题行添加导出按钮（Download 图标），点击弹出选择：复制 / 保存文件。

**Step 3: 提交**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/ipc/export-handlers.ts src/main/ipc/index.ts src/renderer/components/DetailPanel.tsx src/renderer/components/ReaderDetailPanel.tsx
git commit -m "feat: 笔记/高亮导出 Markdown - ZYB-151"
```

---

## 实施注意事项

1. **每个 Task 完成后更新对应 Linear issue 为 Done**
2. **每个 Task 完成后在 `docs/` 下沉淀文档**
3. **FTS5 触发器（Task 1）是基础设施，必须最先实现**
4. **Task 2 (Feed 筛选) 和 Task 3 (Shortlist) 都依赖 ContentList 的重构，建议顺序实施**
5. **所有新增 IPC 需同步修改 4 个文件: ipc-channels.ts → types.ts → preload.ts → handler 文件**
6. **使用 localStorage 做客户端偏好持久化（排版设置、视图模式等）**
7. **提交时不带 Co-Authored-By 署名**
