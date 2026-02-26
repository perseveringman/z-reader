# 划词翻译蓝色下划线标记 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让翻译过的词在文章正文中显示蓝色下划线，并支持正文 ↔ Learn Tab 双向跳转定位。

**Architecture:** 在 `selection_translations` 表新增位置字段（anchorPath / startOffset / endOffset），保存翻译时记录选区位置，渲染时复用 highlight-engine 逻辑为已翻译词注入 `<mark data-translation-id>` 标签，通过 prop 回调实现双向跳转。

**Tech Stack:** Electron / React / TypeScript / SQLite (better-sqlite3) / Drizzle ORM

---

## Task 1：数据库 & Schema 扩展

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/index.ts`

**Step 1: 在 schema.ts 的 `selectionTranslations` 表定义中新增 3 个字段**

找到 `selectionTranslations` 的 sqliteTable 定义（约第 264 行），在 `deletedFlg` 之前加入：

```ts
anchorPath: text('anchor_path'),
startOffset: integer('start_offset'),
endOffset: integer('end_offset'),
```

**Step 2: 在 `src/main/db/index.ts` 末尾的迁移块（`initializeDatabase` 函数结尾，`selection_translations` 表创建语句之后）新增 migration**

在 `}` 关闭 `initializeDatabase` 之前，紧接着 `selection_translations` 表创建语句后添加：

```ts
// Migration: selection_translations 表新增位置字段
try {
  sqlite.exec(`ALTER TABLE selection_translations ADD COLUMN anchor_path TEXT`);
} catch { /* Column already exists */ }
try {
  sqlite.exec(`ALTER TABLE selection_translations ADD COLUMN start_offset INTEGER`);
} catch { /* Column already exists */ }
try {
  sqlite.exec(`ALTER TABLE selection_translations ADD COLUMN end_offset INTEGER`);
} catch { /* Column already exists */ }
```

**Step 3: 手动验证（无自动测试）**

启动 `pnpm start`，打开任意文章，选词翻译一次，在 DevTools console 运行：
```js
window.electronAPI.selectionTranslationList('<articleId>').then(console.log)
```
确认返回的对象中有 `anchorPath`、`startOffset`、`endOffset` 字段（目前为 null）。

**Step 4: Commit**

```bash
git add src/main/db/schema.ts src/main/db/index.ts
git commit -m "feat(db): selection_translations 新增位置字段 anchorPath/startOffset/endOffset"
```

---

## Task 2：共享类型 & IPC 参数扩展

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: 扩展 `SelectionTranslation` 接口**

找到（约第 815 行）：
```ts
export interface SelectionTranslation {
  id: string;
  articleId: string;
  sourceText: string;
  targetLang: string;
  translation: string;
  detectedLang: string | null;
  engine: string;
  analysis: SelectionTranslationAnalysis | null;
  createdAt: string;
}
```

在 `createdAt` 后新增：
```ts
  anchorPath?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
```

**Step 2: 扩展 `TranslateTextInput` 接口**

找到（约第 827 行）：
```ts
export interface TranslateTextInput {
  text: string;
  sourceLang: string | null;
  targetLang: string;
  articleId: string;
  useLLMAnalysis: boolean;
  enabledModules?: ...;
}
```

在末尾新增（在闭合 `}` 之前）：
```ts
  anchorPath?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
```

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): SelectionTranslation 和 TranslateTextInput 新增位置字段"
```

---

## Task 3：翻译 service 持久化位置字段

**Files:**
- Modify: `src/main/translation/service.ts`

**Step 1: 在 `translateText` 函数的 `db.insert` 调用中写入位置字段**

找到（约第 771 行）`await db.insert(schema.selectionTranslations).values({` 块，在 `deletedFlg: 0,` 之前加入：

```ts
    anchorPath: input.anchorPath ?? null,
    startOffset: input.startOffset ?? null,
    endOffset: input.endOffset ?? null,
```

**Step 2: 在 `listSelectionTranslations` 返回的 map 中包含位置字段**

找到（约第 900 行）返回的对象映射，在 `createdAt: row.createdAt,` 后加：

```ts
    anchorPath: row.anchorPath ?? null,
    startOffset: row.startOffset ?? null,
    endOffset: row.endOffset ?? null,
```

**Step 3: Commit**

```bash
git add src/main/translation/service.ts
git commit -m "feat(service): translateText 持久化 anchorPath/startOffset/endOffset"
```

---

## Task 4：ReaderView 保存翻译时传入选区位置

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 修正 `handleSelectionTranslate` 的时序，先计算位置再清除选区**

找到（约第 328 行）`handleSelectionTranslate` 函数，当前逻辑是先 `setForceTab` → `setToolbar(null)` → `selection.removeAllRanges()` 再调 IPC。

修改为：在 `selection.removeAllRanges()` **之前** 计算位置信息：

```ts
const handleSelectionTranslate = useCallback(async () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || !article) return;

  // 先计算选区位置（在 removeAllRanges 之前）
  let anchorPath: string | null = null;
  let startOffset: number | null = null;
  let endOffset: number | null = null;
  if (selection && selection.rangeCount > 0 && contentRef.current) {
    const range = selection.getRangeAt(0);
    const blockEl = getBlockAncestor(range.startContainer, contentRef.current);
    if (blockEl) {
      anchorPath = computeAnchorPath(blockEl, contentRef.current);
      const offsets = rangeToBlockOffsets(blockEl, range);
      if (offsets) {
        startOffset = offsets.startOffset;
        endOffset = offsets.endOffset;
      }
    }
  }

  // 切到语言学习 Tab，清除选区
  setForceTab({ tab: 'learn', ts: Date.now() });
  setToolbar(null);
  selection?.removeAllRanges();

  setSelectionTranslating(true);
  try {
    const settings = await window.electronAPI.translationSettingsGet();
    const isLLM = settings.provider === 'llm';
    await window.electronAPI.selectionTranslate({
      text,
      sourceLang: null,
      targetLang: settings.defaultTargetLang || defaultTargetLang,
      articleId: article.id,
      useLLMAnalysis: isLLM,
      enabledModules: settings.selectionAnalysis,
      anchorPath,
      startOffset,
      endOffset,
    });
    setSelectionTranslationRefresh((prev) => prev + 1);
  } catch (err) {
    console.error('划词翻译失败:', err);
  } finally {
    setSelectionTranslating(false);
  }
}, [article, defaultTargetLang]);
```

**Step 2: Commit**

```bash
git add src/renderer/components/ReaderView.tsx
git commit -m "feat(reader): 划词翻译保存时记录选区位置"
```

---

## Task 5：highlight-engine 新增翻译标记函数

**Files:**
- Modify: `src/renderer/highlight-engine.ts`

**Step 1: 新增 `applyTranslationMarks` 函数（追加到文件末尾）**

```ts
/**
 * 在文章 DOM 中为已翻译词注入蓝色下划线标记
 * - 按 sourceText 去重，同一词只取最新一条（列表已按 createdAt desc 排序）
 * - 优先用 anchorPath + offset 定位，fallback 到全文文本搜索
 */
export function applyTranslationMarks(
  contentEl: HTMLElement,
  translations: Array<{
    id: string;
    sourceText: string;
    anchorPath?: string | null;
    startOffset?: number | null;
    endOffset?: number | null;
  }>,
) {
  // 去重：同一 sourceText 只保留最新（第一条，列表已倒序）
  const seen = new Set<string>();
  const deduped = translations.filter((t) => {
    if (seen.has(t.sourceText)) return false;
    seen.add(t.sourceText);
    return true;
  });

  for (const t of deduped) {
    let range: Range | null = null;

    // 策略 1：anchorPath + offset
    if (t.anchorPath && t.startOffset != null && t.endOffset != null) {
      const blockEl = resolveAnchorPath(contentEl, t.anchorPath);
      if (blockEl) {
        range = offsetsToRange(blockEl, t.startOffset, t.endOffset);
        if (range && range.toString() !== t.sourceText) range = null;
      }
    }

    // 策略 2：全文文本搜索 fallback
    if (!range && t.sourceText) {
      const fb = textSearchInElement(contentEl, t.sourceText);
      if (fb) range = offsetsToRange(contentEl, fb.startOffset, fb.endOffset);
    }

    if (!range) continue;

    // 注入 <mark data-translation-id data-translation-word>
    wrapRangeWithTranslationMark(contentEl, range, t.id, t.sourceText);
  }
}

/** 为单个 Range 注入翻译标记（蓝色下划线） */
function wrapRangeWithTranslationMark(
  root: HTMLElement,
  range: Range,
  translationId: string,
  word: string,
) {
  const textNodesInRange: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (range.intersectsNode(t)) textNodesInRange.push(t);
  }
  if (textNodesInRange.length === 0) return;

  const segments: Array<{ node: Text; start: number; end: number }> = [];
  for (const t of textNodesInRange) {
    const start = t === range.startContainer ? range.startOffset : 0;
    const end = t === range.endContainer ? range.endOffset : t.data.length;
    if (end <= start) continue;
    segments.push({ node: t, start, end });
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const { node: t, start, end } = segments[i];
    let target = t;
    if (end < target.data.length) target.splitText(end);
    if (start > 0) target = t.splitText(start);

    const mark = document.createElement('mark');
    mark.dataset.translationId = translationId;
    mark.dataset.translationWord = word;
    mark.className = 'translation-mark';
    target.parentNode!.insertBefore(mark, target);
    mark.appendChild(target);
  }
}

/** 移除指定 sourceText 对应的翻译标记 */
export function unwrapTranslationMark(root: HTMLElement, word: string) {
  root.querySelectorAll(`mark[data-translation-word="${CSS.escape(word)}"]`).forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  });
}

/** 清除所有翻译标记 */
export function clearAllTranslationMarks(root: HTMLElement) {
  root.querySelectorAll('mark[data-translation-id]').forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/renderer/highlight-engine.ts
git commit -m "feat(highlight-engine): 新增 applyTranslationMarks / unwrapTranslationMark"
```

---

## Task 6：全局样式新增 `.translation-mark`

**Files:**
- Modify: `src/index.css`

**Step 1: 在文件末尾追加样式**

```css
/* 划词翻译蓝色下划线标记 */
.translation-mark {
  background: transparent;
  border-bottom: 2px solid #3b82f6;
  cursor: pointer;
  padding-bottom: 1px;
  color: inherit;
  border-radius: 0;
}

.translation-mark:hover {
  background: rgba(59, 130, 246, 0.12);
}

/* 翻译定位闪烁动画 */
@keyframes translation-flash {
  0%, 100% { background: transparent; }
  33%, 66% { background: rgba(59, 130, 246, 0.25); }
}

.translation-mark-flash {
  animation: translation-flash 0.8s ease-in-out;
}
```

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(style): 新增 .translation-mark 蓝色下划线样式"
```

---

## Task 7：ReaderView 渲染翻译标记 + 正文点击跳转

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 导入新函数**

在文件顶部的 `highlight-engine` 导入行中加入：

```ts
import {
  // ... 已有导入 ...
  applyTranslationMarks,
  clearAllTranslationMarks,
  unwrapTranslationMark,
} from '../highlight-engine';
```

**Step 2: 新增 `selectionTranslations` 状态**

在现有 state 声明区（`highlights`、`selectionTranslationRefresh` 附近）新增：

```ts
const [selectionTranslations, setSelectionTranslations] = useState<SelectionTranslation[]>([]);
```

同时在顶部 import 中加入 `SelectionTranslation` 类型（来自 `../../shared/types`，已有 import 行扩展即可）。

**Step 3: 加载翻译列表**

在"加载高亮"的 `useEffect` 附近新增：

```ts
// ==================== 加载划词翻译列表 ====================
useEffect(() => {
  let cancelled = false;
  window.electronAPI.selectionTranslationList(articleId).then((list) => {
    if (!cancelled) setSelectionTranslations(list);
  });
  return () => { cancelled = true; };
}, [articleId, selectionTranslationRefresh]);
```

**Step 4: 新增 `applyTranslationMarksToDOM` 回调**

在 `applyHighlights` 回调附近新增：

```ts
const applyTranslationMarksToDOM = useCallback(() => {
  if (!contentRef.current) return;
  // 先清除旧标记，再重新注入
  clearAllTranslationMarks(contentRef.current);
  applyTranslationMarks(contentRef.current, selectionTranslations);
}, [selectionTranslations]);
```

**Step 5: 在内容渲染完成后触发**

找到现有调用 `applyHighlights()` 的 `useEffect`（当 `loading`、`article.content` 变化时触发），在 `applyHighlights()` 调用之后加入：

```ts
applyTranslationMarksToDOM();
```

同样在 `selectionTranslations` 变化时重新应用，新增：

```ts
useEffect(() => {
  if (loading || !article?.content || !contentRef.current) return;
  clearAllTranslationMarks(contentRef.current);
  applyTranslationMarks(contentRef.current, selectionTranslations);
}, [selectionTranslations, loading, article?.content]);
```

**Step 6: 正文点击处理——识别翻译标记**

找到 `mousedown`/`click` 事件处理函数中检测 `mark[data-highlight-id]` 的逻辑，在其**之前**（优先）插入翻译标记的检测：

```ts
// 点击翻译标记 → 切到 Learn Tab 并聚焦对应条目
const translationMark = target.closest('mark[data-translation-id]') as HTMLElement | null;
if (translationMark) {
  const translationId = translationMark.dataset.translationId;
  if (translationId) {
    setForceTab({ tab: 'learn', ts: Date.now() });
    setFocusTranslationId(translationId);
    return;
  }
}
```

**Step 7: 新增 `focusTranslationId` state 和 `handleLocateTranslation` 回调**

```ts
const [focusTranslationId, setFocusTranslationId] = useState<string | null>(null);

const handleLocateTranslation = useCallback((sourceText: string) => {
  if (!contentRef.current) return;
  const mark = contentRef.current.querySelector(
    `mark[data-translation-word="${CSS.escape(sourceText)}"]`
  ) as HTMLElement | null;
  if (!mark) return;
  mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mark.classList.add('translation-mark-flash');
  setTimeout(() => mark.classList.remove('translation-mark-flash'), 800);
}, []);
```

**Step 8: 将新 props 传给 ReaderDetailPanel**

找到 `<ReaderDetailPanel` JSX，新增：

```tsx
focusTranslationId={focusTranslationId}
onLocateTranslation={handleLocateTranslation}
onTranslationDeleted={(id, sourceText) => {
  setSelectionTranslations((prev) => {
    const next = prev.filter((t) => t.id !== id);
    // 如果该词还有其他记录则保留标记，否则移除
    const stillHasWord = next.some((t) => t.sourceText === sourceText);
    if (!stillHasWord && contentRef.current) {
      unwrapTranslationMark(contentRef.current, sourceText);
    }
    return next;
  });
}}
```

**Step 9: Commit**

```bash
git add src/renderer/components/ReaderView.tsx
git commit -m "feat(reader): 渲染翻译标记，正文点击跳转到 Learn Tab"
```

---

## Task 8：ReaderDetailPanel 透传新 Props

**Files:**
- Modify: `src/renderer/components/ReaderDetailPanel.tsx`

**Step 1: 扩展 Props 接口**

在 `ReaderDetailPanelProps` 中新增：

```ts
/** 从正文点击翻译标记跳转时，需要聚焦的翻译记录 ID */
focusTranslationId?: string | null;
/** 定位到正文中某译词的回调 */
onLocateTranslation?: (sourceText: string) => void;
/** 翻译记录删除回调（id, sourceText） */
onTranslationDeleted?: (id: string, sourceText: string) => void;
```

**Step 2: 在函数签名中解构并透传给 LanguageLearningTab**

解构新 props 并传给 `<LanguageLearningTab>`：

```tsx
{activeTab === 'learn' && (
  <LanguageLearningTab
    articleId={articleId}
    refreshTrigger={selectionTranslationRefresh}
    focusTranslationId={focusTranslationId}
    onLocateTranslation={onLocateTranslation}
    onTranslationDeleted={onTranslationDeleted}
  />
)}
```

**Step 3: Commit**

```bash
git add src/renderer/components/ReaderDetailPanel.tsx
git commit -m "feat(detail-panel): 透传翻译标记定位相关 props 到 LanguageLearningTab"
```

---

## Task 9：LanguageLearningTab 新增定位功能 & 删除回调

**Files:**
- Modify: `src/renderer/components/LanguageLearningTab.tsx`

**Step 1: 扩展 Props**

```ts
interface LanguageLearningTabProps {
  articleId: string;
  refreshTrigger?: number;
  /** 从正文点击跳转时需要聚焦的翻译 ID */
  focusTranslationId?: string | null;
  /** 点击条目中的"定位"，通知父组件滚动到正文中的词 */
  onLocateTranslation?: (sourceText: string) => void;
  /** 删除一条翻译后通知父组件（传 id 和 sourceText） */
  onTranslationDeleted?: (id: string, sourceText: string) => void;
}
```

**Step 2: 新增自动展开逻辑**

在 `toggleExpand` 附近，新增监听 `focusTranslationId` 变化的 effect：

```ts
useEffect(() => {
  if (focusTranslationId) {
    setExpandedId(focusTranslationId);
    // 滚动到对应条目
    setTimeout(() => {
      document.querySelector(`[data-translation-item-id="${focusTranslationId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}, [focusTranslationId]);
```

**Step 3: 每个条目根节点加 `data-translation-item-id` 属性**

```tsx
<div
  key={item.id}
  data-translation-item-id={item.id}
  className="rounded-lg border ..."
>
```

**Step 4: 修改 `handleDelete` 函数，调用 `onTranslationDeleted`**

```ts
const handleDelete = useCallback(async (id: string, sourceText: string) => {
  try {
    await window.electronAPI.selectionTranslationDelete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (expandedId === id) setExpandedId(null);
    onTranslationDeleted?.(id, sourceText);
  } catch (err) {
    console.error('删除划词翻译失败:', err);
  }
}, [expandedId, onTranslationDeleted]);
```

**Step 5: 在每个条目的头部按钮区新增"定位"图标**

在现有删除按钮之前，新增定位按钮（使用 `MapPin` 图标，来自 lucide-react）：

```tsx
import { GraduationCap, ChevronDown, ChevronRight, Trash2, Loader2, MapPin } from 'lucide-react';

// 在头部按钮区：
{onLocateTranslation && (
  <button
    onClick={(e) => { e.stopPropagation(); onLocateTranslation(item.sourceText); }}
    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-blue-400 transition-all cursor-pointer shrink-0"
    title="定位到正文"
  >
    <MapPin className="w-3 h-3" />
  </button>
)}
```

**Step 6: 更新删除按钮的 onClick 传参**

```tsx
onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.sourceText); }}
```

**Step 7: Commit**

```bash
git add src/renderer/components/LanguageLearningTab.tsx
git commit -m "feat(learn-tab): 支持 focusTranslationId 聚焦、定位按钮、删除回调"
```

---

## Task 10：端到端验证

**Step 1: 启动应用**

```bash
pnpm start
```

**Step 2: 验证新翻译的蓝线**
1. 打开任意英文文章
2. 选中一个词，点击工具栏翻译按钮
3. 确认：文章中该词出现蓝色下划线，Learn Tab 自动切换并展开最新条目

**Step 3: 验证正文 → Learn Tab 跳转**
1. 点击文章中已有蓝线的词
2. 确认：自动切换到 Learn Tab，对应条目展开

**Step 4: 验证 Learn Tab → 正文跳转**
1. 在 Learn Tab 某条目 hover，点击"定位"图标（MapPin）
2. 确认：正文滚动到对应词，词有短暂蓝色闪烁动画

**Step 5: 验证删除同步**
1. 对同一词翻译 2 次，确认文章中只有 1 条蓝线
2. 在 Learn Tab 删除其中一条，确认蓝线仍在
3. 删除第二条，确认蓝线消失

**Step 6: 验证历史数据兼容（旧记录无位置信息）**
1. 若有之前翻译的历史记录（anchorPath 为 null），确认 text search fallback 能找到并标注蓝线

**Step 7: Final Commit**

```bash
git add -A
git commit -m "feat: 划词翻译蓝色下划线标记完整功能"
```
