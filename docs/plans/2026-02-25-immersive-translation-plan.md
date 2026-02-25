# 沉浸式翻译功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在阅读器中实现沉浸式翻译功能，支持文章/视频/播客/电子书的段落级对照翻译，支持 LLM/Google/Microsoft 三种翻译引擎。

**Architecture:** DOM 注入方案——翻译结果以 `<div data-translation>` 节点注入到原文段落下方，不匹配 `BLOCK_SELECTOR`，保护现有高亮/焦点/导航功能。翻译引擎通过 `TranslationEngine` 接口抽象，三种实现共享同一接口。翻译结果持久化到 `translations` 表，支持缓存和多版本。

**Tech Stack:** Electron IPC, Drizzle ORM (SQLite), TypeScript, React, Google Cloud Translation API v2, Azure Translator API, AI SDK (generateObject)

**设计文档:** `docs/plans/2026-02-25-immersive-translation-design.md`

---

## Phase 1: 数据层 + 翻译引擎

### Task 1: translations 表 schema 定义

**Files:**
- Modify: `src/main/db/schema.ts` — 追加 translations 表定义
- Modify: `src/main/db/index.ts` — 确保新表被创建

**Step 1: 在 schema.ts 末尾添加 translations 表**

在 `src/main/db/schema.ts` 的最后一个表定义之后追加：

```typescript
// ==================== translations 表 ====================
export const translations = sqliteTable('translations', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  bookId: text('book_id').references(() => books.id),
  sourceType: text('source_type').notNull(), // 'article' | 'transcript' | 'book'
  sourceLang: text('source_lang'),
  targetLang: text('target_lang').notNull(),
  paragraphs: text('paragraphs'), // JSON: [{index, original, translated}]
  model: text('model'),
  promptTemplate: text('prompt_template'),
  tokenCount: integer('token_count').default(0),
  status: text('status').default('pending'), // 'pending' | 'translating' | 'completed' | 'failed'
  progress: real('progress').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});
```

**Step 2: 确认 db/index.ts 自动创建表**

检查 `src/main/db/index.ts` 中的表创建逻辑是否通过 Drizzle 自动 push。如果是手动迁移，需要添加 CREATE TABLE 语句。

**Step 3: Commit**

```bash
git add src/main/db/schema.ts src/main/db/index.ts
git commit -m "feat(translation): 添加 translations 表 schema 定义"
```

---

### Task 2: IPC 通道定义 + 类型定义

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 Translation 通道
- Modify: `src/shared/types.ts` — 添加翻译相关类型

**Step 1: 在 ipc-channels.ts 添加 Translation 通道**

在 `IPC_CHANNELS` 对象中添加：

```typescript
  // Translation (沉浸式翻译)
  TRANSLATION_START: 'translation:start',
  TRANSLATION_CANCEL: 'translation:cancel',
  TRANSLATION_GET: 'translation:get',
  TRANSLATION_DELETE: 'translation:delete',
  TRANSLATION_LIST: 'translation:list',
  TRANSLATION_ON_PROGRESS: 'translation:onProgress',
  TRANSLATION_SETTINGS_GET: 'translation:settings:get',
  TRANSLATION_SETTINGS_SET: 'translation:settings:set',
```

**Step 2: 在 types.ts 添加类型定义**

```typescript
// ==================== Translation 沉浸式翻译 ====================

export type TranslationProvider = 'llm' | 'google' | 'microsoft';
export type TranslationStatus = 'pending' | 'translating' | 'completed' | 'failed';
export type TranslationSourceType = 'article' | 'transcript' | 'book';
export type TranslationStyle = 'professional' | 'casual' | 'literal';

export interface TranslationParagraph {
  index: number;
  original: string;
  translated: string;
}

export interface Translation {
  id: string;
  articleId: string | null;
  bookId: string | null;
  sourceType: TranslationSourceType;
  sourceLang: string | null;
  targetLang: string;
  paragraphs: TranslationParagraph[];
  model: string | null;
  promptTemplate: string | null;
  tokenCount: number;
  status: TranslationStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationStartInput {
  articleId?: string;
  bookId?: string;
  sourceType: TranslationSourceType;
  targetLang: string;
  provider?: TranslationProvider;
}

export interface TranslationGetInput {
  articleId?: string;
  bookId?: string;
  targetLang: string;
}

export interface TranslationProgressEvent {
  translationId: string;
  index: number;
  translated: string;
  progress: number; // 0-1
}

export interface TranslationSettings {
  provider: TranslationProvider;
  llm: {
    apiKey: string;
    baseUrl: string;
    model: string;
    style: TranslationStyle;
    customPrompt: string;
  };
  google: {
    apiKey: string;
  };
  microsoft: {
    apiKey: string;
    region: string;
  };
  defaultTargetLang: string;
  autoDetectLang: boolean;
  autoTranslateFeeds: string[];
  display: {
    fontSize: number;
    color: string;
    opacity: number;
    showOriginal: boolean;
  };
  shortcut: string;
}
```

**Step 3: 在 ElectronAPI 接口中添加翻译方法**

在 `types.ts` 的 `ElectronAPI` 接口中添加：

```typescript
  // Translation 沉浸式翻译
  translationStart: (input: TranslationStartInput) => Promise<Translation>;
  translationCancel: (id: string) => Promise<void>;
  translationGet: (input: TranslationGetInput) => Promise<Translation | null>;
  translationDelete: (id: string) => Promise<void>;
  translationList: (articleId: string) => Promise<Translation[]>;
  translationOnProgress: (callback: (event: TranslationProgressEvent) => void) => () => void;
  translationSettingsGet: () => Promise<TranslationSettings>;
  translationSettingsSet: (partial: Partial<TranslationSettings>) => Promise<void>;
```

**Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts
git commit -m "feat(translation): 添加 IPC 通道和类型定义"
```

---

### Task 3: TranslationEngine 接口与 LLM 实现

**Files:**
- Create: `src/main/translation/engine.ts` — 接口定义
- Create: `src/main/translation/llm-engine.ts` — LLM 翻译引擎实现

**Step 1: 创建引擎接口**

`src/main/translation/engine.ts`:

```typescript
export interface TranslationEngine {
  /** 翻译单段文本 */
  translate(text: string, sourceLang: string | null, targetLang: string): Promise<string>;
  /** 批量翻译 */
  translateBatch(texts: string[], sourceLang: string | null, targetLang: string): Promise<string[]>;
  /** 检测语言 */
  detectLanguage(text: string): Promise<string>;
}
```

**Step 2: 实现 LLM 翻译引擎**

`src/main/translation/llm-engine.ts`:

使用 AI SDK 的 `generateObject`，复用 `src/ai/providers/llm.ts` 中的 `createLLMProvider` 模式但使用独立配置。支持 style（professional/casual/literal）和 customPrompt。`translateBatch` 将多段文本合并为一个 prompt，要求 AI 返回数组结果。

**Step 3: Commit**

```bash
git add src/main/translation/
git commit -m "feat(translation): TranslationEngine 接口与 LLM 引擎实现"
```

---

### Task 4: Google 翻译引擎实现

**Files:**
- Create: `src/main/translation/google-engine.ts`

**Step 1: 实现 GoogleTranslationEngine**

调用 Google Cloud Translation API v2 (`https://translation.googleapis.com/language/translate/v2`)。`translateBatch` 利用 API 原生支持的批量翻译（`q` 参数可传数组）。`detectLanguage` 调用 detect endpoint。

**Step 2: Commit**

```bash
git add src/main/translation/google-engine.ts
git commit -m "feat(translation): Google Cloud Translation 引擎实现"
```

---

### Task 5: Microsoft 翻译引擎实现

**Files:**
- Create: `src/main/translation/microsoft-engine.ts`

**Step 1: 实现 MicrosoftTranslationEngine**

调用 Azure Translator API (`https://api.cognitive.microsofttranslator.com/translate`)。`translateBatch` 利用 API 原生批量支持（body 中传数组）。`detectLanguage` 调用 detect endpoint。

**Step 2: Commit**

```bash
git add src/main/translation/microsoft-engine.ts
git commit -m "feat(translation): Microsoft Azure Translator 引擎实现"
```

---

### Task 6: 引擎工厂 + 翻译服务层

**Files:**
- Create: `src/main/translation/factory.ts` — 根据 provider 配置创建引擎实例
- Create: `src/main/translation/service.ts` — 翻译业务逻辑（段落拆分、逐批翻译、进度推送、持久化）

**Step 1: 创建引擎工厂**

`src/main/translation/factory.ts`:

```typescript
import type { TranslationEngine } from './engine';
import type { TranslationSettings } from '../../shared/types';

export function createTranslationEngine(settings: TranslationSettings): TranslationEngine {
  switch (settings.provider) {
    case 'google': return new GoogleTranslationEngine(settings.google);
    case 'microsoft': return new MicrosoftTranslationEngine(settings.microsoft);
    case 'llm':
    default: return new LLMTranslationEngine(settings.llm);
  }
}
```

**Step 2: 创建翻译服务**

`src/main/translation/service.ts`:

核心逻辑：
1. `startTranslation(input)` — 创建 translations 记录，提取段落，逐批（每 10 段）调用引擎
2. 每批完成后通过 `BrowserWindow.webContents.send` 推送 progress 事件
3. 支持 `AbortController` 取消
4. 全部完成后更新 status 为 completed，保存 paragraphs JSON
5. `getTranslation(input)` — 查询已有翻译
6. `deleteTranslation(id)` — 软删除

段落提取逻辑：
- article: 解析 `article.content` HTML，使用 `cheerio` 或正则提取 `p, li, blockquote, h1-h6` 的 textContent
- transcript: 从 `transcripts` 表读取 segments JSON
- book: 按当前章节/页提取

**Step 3: Commit**

```bash
git add src/main/translation/
git commit -m "feat(translation): 引擎工厂与翻译服务层实现"
```

---

### Task 7: IPC Handler 注册 + Preload 桥接

**Files:**
- Create: `src/main/ipc/translation-handlers.ts`
- Modify: `src/main/ipc/index.ts` — 注册 translation handlers
- Modify: `src/preload.ts` — 暴露 translation 方法

**Step 1: 创建 translation-handlers.ts**

参考 `src/main/ipc/ai-handlers.ts` 的模式：

```typescript
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
// ... 引入翻译服务

export function registerTranslationHandlers() {
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_START, async (_event, input) => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_CANCEL, async (_event, id) => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_GET, async (_event, input) => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_DELETE, async (_event, id) => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_LIST, async (_event, articleId) => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_SETTINGS_GET, async () => { /* ... */ });
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_SETTINGS_SET, async (_event, partial) => { /* ... */ });
}
```

**Step 2: 在 index.ts 注册**

在 `src/main/ipc/index.ts` 中 import 并调用 `registerTranslationHandlers()`。

**Step 3: 在 preload.ts 添加桥接方法**

参考现有模式，在 `electronAPI` 对象中添加 translation 相关方法（invoke + on 模式）。

**Step 4: Commit**

```bash
git add src/main/ipc/translation-handlers.ts src/main/ipc/index.ts src/preload.ts
git commit -m "feat(translation): IPC handler 注册与 preload 桥接"
```

---

## Phase 2: highlight-engine 适配

### Task 8: 修改 highlight-engine 跳过翻译节点

**Files:**
- Modify: `src/renderer/highlight-engine.ts`

**Step 1: 修改 getTextNodes 过滤翻译节点**

当前代码 (`src/renderer/highlight-engine.ts:15-21`):

```typescript
export function getTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}
```

修改为：

```typescript
export function getTextNodes(root: Node, skipTranslation = true): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (skipTranslation && (node.parentElement?.closest('[data-translation]'))) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}
```

**Step 2: 修改 getBlockAncestor 支持翻译节点**

当前代码 (`src/renderer/highlight-engine.ts:112-121`):

```typescript
export function getBlockAncestor(node: Node, contentRoot: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== contentRoot) {
    if (current instanceof HTMLElement && current.matches(BLOCK_SELECTOR)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}
```

修改为同时识别翻译节点：

```typescript
export function getBlockAncestor(node: Node, contentRoot: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== contentRoot) {
    if (current instanceof HTMLElement) {
      if (current.matches(BLOCK_SELECTOR) || current.hasAttribute('data-translation')) {
        return current;
      }
    }
    current = current.parentNode;
  }
  return null;
}
```

**Step 3: 修改 rangeToBlockOffsets 中的 getTextNodes 调用**

`src/renderer/highlight-engine.ts:163` 中 `const nodes = getTextNodes(blockEl);`：

当 blockEl 本身是翻译节点时，需要传 `skipTranslation = false` 以便遍历其内部文本：

```typescript
export function rangeToBlockOffsets(blockEl: HTMLElement, range: Range): { startOffset: number; endOffset: number } | null {
  const isTranslation = blockEl.hasAttribute('data-translation');
  const nodes = getTextNodes(blockEl, !isTranslation);
  // ... 后续逻辑不变
```

**Step 4: Commit**

```bash
git add src/renderer/highlight-engine.ts
git commit -m "feat(translation): highlight-engine 适配翻译节点过滤"
```

---

## Phase 3: 翻译 DOM 注入层

### Task 9: 创建翻译 DOM 注入工具模块

**Files:**
- Create: `src/renderer/translation-injector.ts`

**Step 1: 实现注入/清除/切换函数**

```typescript
import { BLOCK_SELECTOR } from './highlight-engine';
import type { TranslationParagraph } from '../shared/types';

/** 为文章内容注入翻译段落 */
export function injectTranslations(
  contentRoot: HTMLElement,
  paragraphs: TranslationParagraph[],
  displaySettings: { fontSize: number; color: string; opacity: number },
): void {
  // 1. 清除已有翻译节点
  clearTranslations(contentRoot);
  // 2. 获取所有块级元素
  const blocks = contentRoot.querySelectorAll(BLOCK_SELECTOR);
  // 3. 对每个 paragraph，在对应 block 后插入翻译 div
  for (const para of paragraphs) {
    const block = blocks[para.index];
    if (!block) continue;
    const div = document.createElement('div');
    div.setAttribute('data-translation', 'true');
    div.setAttribute('data-para-index', String(para.index));
    div.className = 'z-translation';
    div.textContent = para.translated;
    div.style.fontSize = `${displaySettings.fontSize}px`;
    div.style.color = displaySettings.color;
    div.style.opacity = String(displaySettings.opacity);
    block.after(div);
  }
}

/** 为单个段落注入翻译（流式进度用） */
export function injectSingleTranslation(
  contentRoot: HTMLElement,
  para: TranslationParagraph,
  displaySettings: { fontSize: number; color: string; opacity: number },
): void {
  const blocks = contentRoot.querySelectorAll(BLOCK_SELECTOR);
  const block = blocks[para.index];
  if (!block) return;
  // 移除该段落已有的翻译
  const existing = block.nextElementSibling;
  if (existing?.hasAttribute('data-translation') &&
      existing.getAttribute('data-para-index') === String(para.index)) {
    existing.remove();
  }
  const div = document.createElement('div');
  div.setAttribute('data-translation', 'true');
  div.setAttribute('data-para-index', String(para.index));
  div.className = 'z-translation';
  div.textContent = para.translated;
  div.style.fontSize = `${displaySettings.fontSize}px`;
  div.style.color = displaySettings.color;
  div.style.opacity = String(displaySettings.opacity);
  block.after(div);
}

/** 清除所有翻译节点 */
export function clearTranslations(root: HTMLElement): void {
  root.querySelectorAll('[data-translation]').forEach(el => el.remove());
}

/** 切换翻译显示/隐藏 */
export function toggleTranslations(root: HTMLElement, visible: boolean): void {
  root.querySelectorAll('.z-translation').forEach(el => {
    el.classList.toggle('z-translation-hidden', !visible);
  });
}
```

**Step 2: Commit**

```bash
git add src/renderer/translation-injector.ts
git commit -m "feat(translation): 翻译 DOM 注入工具模块"
```

---

### Task 10: 翻译 CSS 样式

**Files:**
- Modify: `src/index.css`

**Step 1: 添加翻译样式**

在 `src/index.css` 末尾添加：

```css
/* ==================== 沉浸式翻译 ==================== */

.z-translation {
  margin-top: 4px;
  margin-bottom: 1rem;
  line-height: 1.6;
  animation: z-translation-fadein 0.3s ease;
}

.z-translation-hidden {
  display: none;
}

@keyframes z-translation-fadein {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(translation): 翻译节点 CSS 样式"
```

---

## Phase 4: ReaderView 集成

### Task 11: ReaderView 翻译按钮与状态管理

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 添加翻译状态**

在 ReaderView 组件中添加状态：

```typescript
const [translationVisible, setTranslationVisible] = useState(false);
const [translationLoading, setTranslationLoading] = useState(false);
const [translationProgress, setTranslationProgress] = useState<{ done: number; total: number } | null>(null);
const [translationData, setTranslationData] = useState<Translation | null>(null);
```

**Step 2: 添加翻译按钮 UI**

在工具栏区域（已有 Settings2、目录 等按钮的位置）添加 Languages 图标按钮，点击触发翻译流程。

**Step 3: 实现翻译触发逻辑**

```typescript
const handleTranslate = useCallback(async (targetLang: string) => {
  if (!article || !contentRef.current) return;

  // 1. 先检查缓存
  const cached = await window.electronAPI.translationGet({
    articleId: article.id,
    targetLang,
  });
  if (cached && cached.status === 'completed') {
    setTranslationData(cached);
    injectTranslations(contentRef.current, cached.paragraphs, displaySettings);
    applyHighlights(contentRef.current, highlights);
    setTranslationVisible(true);
    return;
  }

  // 2. 发起翻译
  setTranslationLoading(true);
  const translation = await window.electronAPI.translationStart({
    articleId: article.id,
    sourceType: 'article',
    targetLang,
  });
  setTranslationData(translation);
}, [article, highlights]);
```

**Step 4: 监听翻译进度事件**

```typescript
useEffect(() => {
  const unsubscribe = window.electronAPI.translationOnProgress((event) => {
    if (!contentRef.current || event.translationId !== translationData?.id) return;
    // 注入单个段落
    injectSingleTranslation(contentRef.current, { index: event.index, original: '', translated: event.translated }, displaySettings);
    // 刷新高亮
    applyHighlights(contentRef.current, highlights);
    setTranslationProgress({ done: Math.floor(event.progress * total), total });
    if (event.progress >= 1) {
      setTranslationLoading(false);
      setTranslationVisible(true);
    }
  });
  return unsubscribe;
}, [translationData, highlights]);
```

**Step 5: 文章打开时自动恢复翻译**

在现有的 article 加载 useEffect 中，innerHTML 设置之后、高亮恢复之前，检查并注入已缓存翻译。

**Step 6: 快捷键支持**

在现有的 keydown handler 中添加 `Cmd+Shift+T` 切换翻译显示/隐藏。

**Step 7: Commit**

```bash
git add src/renderer/components/ReaderView.tsx
git commit -m "feat(translation): ReaderView 翻译按钮与翻译流程集成"
```

---

### Task 12: 语言选择下拉菜单组件

**Files:**
- Create: `src/renderer/components/TranslationLangPicker.tsx`

**Step 1: 创建语言选择组件**

支持的语言列表：中文简体、中文繁体、英语、日语、韩语、法语、德语、西班牙语、俄语、阿拉伯语等常见语言。点击语言项触发 `onSelect(langCode)` 回调。

**Step 2: Commit**

```bash
git add src/renderer/components/TranslationLangPicker.tsx
git commit -m "feat(translation): 语言选择下拉菜单组件"
```

---

## Phase 5: TranscriptView 集成（视频/播客）

### Task 13: TranscriptView 翻译支持

**Files:**
- Modify: `src/renderer/components/TranscriptView.tsx`

**Step 1: 添加翻译 props 和状态**

在 TranscriptView 组件 props 中新增：

```typescript
interface TranscriptViewProps {
  // ... 现有 props
  translationParagraphs?: TranslationParagraph[];
  translationVisible?: boolean;
  translationDisplaySettings?: { fontSize: number; color: string; opacity: number };
}
```

**Step 2: 在 segment 渲染中注入翻译**

在每个 segment 的 JSX 中，条件渲染翻译内容：

```tsx
{translationVisible && translationParagraphs?.[index] && (
  <div data-translation="true" data-seg-index={index} className="z-translation"
    style={{ fontSize, color, opacity }}>
    {translationParagraphs[index].translated}
  </div>
)}
```

这样翻译追加在 segment div 内部，不影响 segmentRefs、activeIndex、点击跳转。

**Step 3: Commit**

```bash
git add src/renderer/components/TranscriptView.tsx
git commit -m "feat(translation): TranscriptView 段落翻译渲染"
```

---

### Task 14: VideoReaderView + PodcastReaderView 翻译集成

**Files:**
- Modify: `src/renderer/components/VideoReaderView.tsx`
- Modify: `src/renderer/components/PodcastReaderView.tsx`

**Step 1: VideoReaderView 添加翻译状态和按钮**

参考 Task 11 中 ReaderView 的模式，在 VideoReaderView 中：
- 添加翻译状态变量
- 在 TranscriptView 上方添加翻译按钮
- 翻译触发逻辑中 sourceType 使用 `'transcript'`
- 将 translationParagraphs 传递给 TranscriptView

**Step 2: PodcastReaderView 同样集成**

逻辑与 VideoReaderView 相同。

**Step 3: Commit**

```bash
git add src/renderer/components/VideoReaderView.tsx src/renderer/components/PodcastReaderView.tsx
git commit -m "feat(translation): 视频/播客阅读器翻译集成"
```

---

## Phase 6: 电子书翻译（懒加载）

### Task 15: BookReaderView 翻译支持

**Files:**
- Modify: `src/renderer/components/EpubReader.tsx`
- Modify: `src/renderer/components/BookReaderView.tsx`

**Step 1: 按页翻译逻辑**

在电子书翻页回调中：
1. 检查当前章节/页是否有翻译缓存
2. 如有，注入翻译 DOM
3. 如无，发起翻译请求
4. Prefetch 下一页翻译

电子书的 paragraphs JSON 通过 `chapterIndex + index` 定位。

**Step 2: Commit**

```bash
git add src/renderer/components/EpubReader.tsx src/renderer/components/BookReaderView.tsx
git commit -m "feat(translation): 电子书按页懒加载翻译"
```

---

## Phase 7: 配置面板

### Task 16: 翻译配置面板组件

**Files:**
- Create: `src/renderer/components/TranslationSettings.tsx`

**Step 1: 创建配置面板**

布局参考设计文档中的配置面板设计：
- 引擎切换（LLM / Google / Microsoft），选中时展开对应配置
- LLM: API Key, Base URL, 模型, 翻译风格, 自定义 Prompt
- Google: API Key
- Microsoft: API Key, Region
- 语言设置：默认目标语言, 自动检测开关
- 显示样式：字号滑块, 颜色选择, 透明度滑块, 显示原文开关
- 自动化：快捷键, 自动翻译 Feed 列表
- 测试连接按钮

配置读写通过 `window.electronAPI.translationSettingsGet/Set`。

**Step 2: Commit**

```bash
git add src/renderer/components/TranslationSettings.tsx
git commit -m "feat(translation): 翻译配置面板组件"
```

---

### Task 17: 配置面板入口集成

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx` 或对应的设置入口组件

**Step 1: 在设置页面添加翻译设置入口**

在现有设置页面中添加「翻译设置」菜单项，点击打开 TranslationSettings 面板。

**Step 2: Commit**

```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat(translation): 配置面板入口集成"
```

---

## Phase 8: 边界情况处理

### Task 18: 断点续传 + 内容变更检测

**Files:**
- Modify: `src/main/translation/service.ts`

**Step 1: 断点续传**

翻译失败后，再次调用 `TRANSLATION_START` 时：
1. 查询已有的 failed/translating 记录
2. 从 paragraphs JSON 中找到最后一个已翻译的 index
3. 从该 index + 1 开始继续翻译

**Step 2: 内容变更检测**

翻译前计算 article.content 的 hash，存入 translations 记录。下次打开时比对 hash，不一致则提示用户。

**Step 3: Commit**

```bash
git add src/main/translation/service.ts
git commit -m "feat(translation): 断点续传与内容变更检测"
```

---

### Task 19: 删除翻译时检查关联高亮

**Files:**
- Modify: `src/main/ipc/translation-handlers.ts`

**Step 1: 删除前检查高亮**

在 `TRANSLATION_DELETE` handler 中：
1. 查询 highlights 表中 anchorPath 包含 `data-translation` 的记录
2. 如果存在，返回高亮数量供前端提示
3. 前端确认后再执行删除

**Step 2: Commit**

```bash
git add src/main/ipc/translation-handlers.ts
git commit -m "feat(translation): 删除翻译时检查关联高亮"
```

---

## Phase 9: 国际化

### Task 20: i18n 翻译键

**Files:**
- Modify: 对应的 i18n JSON 文件

**Step 1: 添加翻译相关的 i18n 键**

包括：翻译按钮文案、进度提示、配置面板标签、错误提示、确认对话框等。

**Step 2: Commit**

```bash
git add src/renderer/i18n/
git commit -m "feat(translation): 添加翻译功能 i18n 键"
```

---

## Phase 10: 文档沉淀

### Task 21: 功能文档沉淀

**Files:**
- Create: `docs/immersive-translation.md`

**Step 1: 撰写文档**

包括：功能概述、翻译引擎配置指南、使用方法、快捷键、已知限制。

**Step 2: Commit**

```bash
git add docs/immersive-translation.md
git commit -m "docs: 沉浸式翻译功能文档"
```
