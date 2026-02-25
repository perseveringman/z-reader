# 沉浸式翻译功能

## 1. 功能概述

沉浸式翻译（Immersive Translation）在原文段落下方直接显示翻译文本，保持双语对照阅读体验。

核心特性：

- **双语对照**：翻译文本以较浅颜色显示在原文段落正下方，不遮挡原文
- **多内容类型**：支持文章（HTML）、视频字幕（transcript）、播客转写三种内容
- **持久化存储**：翻译结果保存到 SQLite `translations` 表，再次打开自动恢复
- **无侵入**：翻译节点不影响高亮、导航、自动滚动、click-to-seek 等原有功能
- **三引擎可选**：LLM（AI SDK）、Google Cloud Translation、Microsoft Azure Translator

---

## 2. 架构设计

### 2.1 整体架构

```
渲染进程 (Renderer)                    主进程 (Main)
┌──────────────────────┐          ┌──────────────────────────┐
│ ReaderView           │          │ translation-handlers.ts  │
│ VideoReaderView      │ ──IPC──> │         │                │
│ PodcastReaderView    │          │    service.ts            │
│ BookReaderView       │          │    ┌─────┴─────┐         │
├──────────────────────┤          │    │ factory.ts │         │
│ translation-injector │          │    └─────┬─────┘         │
│ highlight-engine     │          │    ┌─────┴─────────┐     │
│ TranslationLangPicker│          │    │ llm-engine     │     │
│ TranslationSettings  │          │    │ google-engine  │     │
└──────────────────────┘          │    │ microsoft-engine│    │
                                  │    └────────────────┘     │
                                  │    SQLite (translations)  │
                                  └──────────────────────────┘
```

### 2.2 翻译引擎

#### 接口定义

`src/main/translation/engine.ts` 定义了 `TranslationEngine` 抽象接口：

```typescript
export interface TranslationEngine {
  translate(text: string, sourceLang: string | null, targetLang: string): Promise<string>;
  translateBatch(texts: string[], sourceLang: string | null, targetLang: string): Promise<string[]>;
  detectLanguage(text: string): Promise<string>;
}
```

#### LLM 引擎 (`llm-engine.ts`)

- 使用 AI SDK 的 `@ai-sdk/openai` provider（OpenAI 兼容格式）
- 单段翻译：`generateText()` 直接返回译文
- 批量翻译：`generateObject()` + zod schema 做结构化 JSON 输出，确保返回数组长度与输入一致
- 语言检测：`generateObject()` 返回 BCP 47 格式的语言代码
- 支持三种翻译风格：`professional`（专业）、`casual`（口语）、`literal`（直译）
- 支持自定义 prompt，优先级高于风格预设
- 配置项独立于主 AI 配置（独立的 apiKey / baseUrl / model）

#### Google 翻译引擎 (`google-engine.ts`)

- 调用 Google Cloud Translation API v2 REST 接口
- 基础 URL：`https://translation.googleapis.com/language/translate/v2`
- 批量翻译：利用 API 原生支持的 `q` 数组参数，一次请求翻译多段
- 语言检测：调用 `/detect` 端点
- 使用 Node.js 原生 `fetch`，无额外依赖

#### Microsoft 翻译引擎 (`microsoft-engine.ts`)

- 调用 Azure Translator API v3.0
- 基础 URL：`https://api.cognitive.microsofttranslator.com`
- 请求头需要 `Ocp-Apim-Subscription-Key` 和 `Ocp-Apim-Subscription-Region`
- 批量翻译：利用 API 原生支持的请求体数组 `[{Text: "..."}, ...]`
- 使用 Node.js 原生 `fetch`，无额外依赖

#### 工厂模式 (`factory.ts`)

```typescript
export function createTranslationEngine(settings: TranslationSettings): TranslationEngine {
  switch (settings.provider) {
    case 'google':  return new GoogleTranslationEngine(settings.google);
    case 'microsoft': return new MicrosoftTranslationEngine(settings.microsoft);
    case 'llm':
    default:        return new LLMTranslationEngine(settings.llm);
  }
}
```

### 2.3 服务层 (`service.ts`)

核心翻译服务，位于 `src/main/translation/service.ts`，负责：

**设置管理**：
- `loadTranslationSettings()` / `saveTranslationSettings()`：从 `aiSettings` 键值存储读写配置
- 深度合并策略：确保 llm/google/microsoft/display 等子对象字段完整

**段落提取**：
- `extractParagraphs(input)`：根据 `sourceType` 从不同数据源提取文本
  - `article`：正则匹配 `<p>`, `<li>`, `<blockquote>`, `<h1>~<h6>` 标签内容，去除内部 HTML 标签
  - `transcript`：从 `transcripts` 表读取 segments JSON，提取每个 segment 的 `text`
  - `book`：预留，返回空数组

**翻译执行**：
- `startTranslation(input)` 主流程：
  1. 加载配置 + 创建引擎
  2. 提取原文段落
  3. 自动检测源语言（取前 3 段作为样本）
  4. 检查断点续传（查找 failed/translating 状态的已有记录）
  5. 创建 translations 记录（status: `translating`）
  6. 异步启动 `translateInBackground()`，立即返回

**批量翻译**：
- `BATCH_SIZE = 10`：每批翻译 10 个段落
- 每批完成后更新数据库并通过 `broadcastProgress()` 推送进度
- 进度通过 `BrowserWindow.getAllWindows().webContents.send()` 推送到所有窗口

**取消控制**：
- 使用 `AbortController` 存储在 `runningTranslations` Map 中
- `cancelTranslation(id)` 调用 `controller.abort()`
- 仅在批次间检查 `abortController.signal.aborted`，不能中断正在执行的单次引擎调用

**断点续传**：
- 启动翻译前查询相同 articleId/bookId + targetLang 且 status 为 failed/translating 的记录
- 找到后解析已有段落，定位最后一个已翻译 index
- 合并已翻译段落到新数组，从断点处继续翻译

**内容变更检测**：
- `checkContentChanged(currentParagraphs, savedParagraphs)` 比较策略：
  - 段落数量是否一致
  - 首段原文文本是否一致
  - 末段原文文本是否一致
- 返回 `contentChanged` 布尔字段，由 UI 决定是否提示用户

### 2.4 IPC 通信

8 个 IPC 通道定义在 `src/shared/ipc-channels.ts`：

| 通道常量 | 通道值 | 方向 | 说明 |
|---------|--------|------|------|
| `TRANSLATION_START` | `translation:start` | Renderer -> Main | 启动翻译任务 |
| `TRANSLATION_CANCEL` | `translation:cancel` | Renderer -> Main | 取消翻译任务 |
| `TRANSLATION_GET` | `translation:get` | Renderer -> Main | 查询已有翻译 |
| `TRANSLATION_DELETE` | `translation:delete` | Renderer -> Main | 删除翻译（含高亮检查） |
| `TRANSLATION_LIST` | `translation:list` | Renderer -> Main | 列出文章所有翻译版本 |
| `TRANSLATION_ON_PROGRESS` | `translation:onProgress` | Main -> Renderer | 翻译进度推送 |
| `TRANSLATION_SETTINGS_GET` | `translation:settings:get` | Renderer -> Main | 获取翻译设置 |
| `TRANSLATION_SETTINGS_SET` | `translation:settings:set` | Renderer -> Main | 保存翻译设置（部分更新） |

Handler 注册在 `src/main/ipc/translation-handlers.ts`。

Preload 桥接在 `src/preload.ts` 暴露 8 个方法：
- `translationStart`, `translationCancel`, `translationGet`, `translationDelete`, `translationList`
- `translationOnProgress`（事件监听，返回取消函数）
- `translationSettingsGet`, `translationSettingsSet`

**删除翻译的高亮保护**：
`TRANSLATION_DELETE` handler 在未确认时检查 `highlights` 表中 `anchorPath` 包含 `data-translation` 的记录，如有关联高亮则返回 `{ needConfirm: true, highlightCount }` 让 UI 弹出确认提示。

### 2.5 DOM 注入

翻译节点注入工具模块：`src/renderer/translation-injector.ts`

**翻译节点结构**：

```html
<div data-translation="true" data-para-index="N" class="z-translation">
  翻译文本...
</div>
```

关键设计：使用 `<div>` 而非 `<p>/<li>/<blockquote>`，避免匹配 `BLOCK_SELECTOR`（`p, li, blockquote`），防止翻译节点被错误识别为原文段落。

**导出函数**：

| 函数 | 说明 |
|------|------|
| `injectTranslations(root, paragraphs, display)` | 批量注入翻译（先清除再注入） |
| `injectSingleTranslation(root, para, display)` | 单段注入（流式进度用） |
| `clearTranslations(root)` | 清除所有 `[data-translation]` 节点 |
| `toggleTranslations(root, visible)` | 切换 `.z-translation-hidden` 类控制显示/隐藏 |

### 2.6 高亮引擎适配

`src/renderer/highlight-engine.ts` 做了以下适配：

- `getTextNodes(root, skipTranslation = true)`：默认跳过 `[data-translation]` 节点内的文本，保护原文偏移量计算
- `offsetsToRange(root, start, end)`：当 `root` 是翻译节点时，设置 `skipTranslation = false`，正常遍历翻译节点内部文本
- `getBlockAncestor(node, contentRoot)`：识别 `data-translation` 属性，将翻译节点视为合法块级祖先，支持在翻译文本上创建高亮
- `rangeToBlockOffsets(blockEl, range)`：翻译节点内不跳过自身文本

### 2.7 数据库

`translations` 表定义在 `src/main/db/schema.ts`：

```typescript
export const translations = sqliteTable('translations', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  bookId: text('book_id').references(() => books.id),
  sourceType: text('source_type').notNull(),   // 'article' | 'transcript' | 'book'
  sourceLang: text('source_lang'),
  targetLang: text('target_lang').notNull(),
  paragraphs: text('paragraphs'),              // JSON: [{index, original, translated}]
  model: text('model'),
  promptTemplate: text('prompt_template'),
  tokenCount: integer('token_count').default(0),
  status: text('status').default('pending'),   // 'pending' | 'translating' | 'completed' | 'failed'
  progress: real('progress').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});
```

翻译记录通过 `articleId/bookId` + `targetLang` 唯一标识。查询时取 status 为 `completed` 且 `deletedFlg = 0` 的最新记录。

---

## 3. UI 组件

### 3.1 ReaderView (`src/renderer/components/ReaderView.tsx`)

文章阅读器集成翻译功能：

- **翻译按钮**：工具栏中的 Languages 图标，包裹在 `TranslationLangPicker` 中
- **快捷键**：`Cmd/Ctrl+Shift+T` 切换翻译显示/隐藏
- **状态管理**：`translationVisible`, `translationLoading`, `translationProgress`, `translationData`
- **翻译流程**：
  1. 点击按钮 -> 选择目标语言 -> 调用 `handleTranslate(targetLang)`
  2. 先检查缓存（`translationGet`），有则直接注入并恢复
  3. 无缓存则调用 `translationStart` 启动翻译
  4. 监听 `translationOnProgress` 事件，每收到一批结果调用 `injectSingleTranslation`
  5. 翻译完成后自动调用 `applyHighlights()` 恢复高亮
- **显示设置**：通过 `translationDisplayRef` 传递 fontSize / color / opacity

### 3.2 TranslationLangPicker (`src/renderer/components/TranslationLangPicker.tsx`)

目标语言选择下拉菜单，支持 14 种语言：

简体中文、繁体中文、English、日本語、한국어、Francais、Deutsch、Espanol、Русский、العربية、Portugues、Italiano、Tieng Viet、ไทย

- 点击触发元素展开/收起
- 当前选中语言显示勾选图标
- 点击外部自动关闭
- 导出 `LANGUAGES` 常量供其他组件复用

### 3.3 TranslationSettings (`src/renderer/components/TranslationSettings.tsx`)

完整的翻译配置面板（模态框），包含四个配置区：

1. **翻译引擎**：LLM / Google / Microsoft 选项卡切换
   - LLM：API Key（密码遮罩 + 明文切换）、Base URL、模型名称、翻译风格（专业/口语/直译）、自定义 Prompt
   - Google：API Key
   - Microsoft：API Key + Region
2. **语言设置**：默认目标语言下拉选择、自动检测源语言开关
3. **显示样式**：译文字号（10-28px）、译文颜色（hex + 颜色选择器）、透明度（0-100% 滑块）、默认显示原文开关
4. **快捷键**：当前快捷键显示 + 录制按钮，点击后按下组合键即可设置

所有配置修改后通过 `translationSettingsSet` 自动保存。

### 3.4 视频/播客阅读器集成

**VideoReaderView** (`src/renderer/components/VideoReaderView.tsx`)：
- 与 ReaderView 类似的翻译状态管理
- 翻译段落通过 props 传递给 TranscriptView

**PodcastReaderView** (`src/renderer/components/PodcastReaderView.tsx`)：
- 与 VideoReaderView 相同的翻译集成模式

**TranscriptView** (`src/renderer/components/TranscriptView.tsx`)：
- 接收 `translationParagraphs`, `translationVisible`, `translationDisplaySettings` 三个 props
- 翻译节点嵌套在 segment `<span>` 内部：

```html
<span data-seg-index="N">
  原文文本...
  <div data-translation="true" data-seg-index="N" class="z-translation" style="...">
    翻译文本...
  </div>
</span>
```

### 3.5 BookReaderView (`src/renderer/components/BookReaderView.tsx`)

占位实现，预留了翻译状态变量（`translationVisible`, `translationLoading`, `translationData`），翻译按钮 UI 已存在，但实际翻译逻辑待后续完成 lazy-load 接口。

### 3.6 Sidebar 入口 (`src/renderer/components/Sidebar.tsx`)

侧边栏底部工具区域包含 Languages 图标按钮，点击打开 `TranslationSettings` 配置面板。

---

## 4. 翻译引擎配置指南

### LLM 引擎

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | OpenAI 兼容的 API 密钥 | (必填) |
| Base URL | API 端点地址 | `https://api.openai.com/v1` |
| Model | 模型名称 | `gpt-4o-mini` |
| Style | 翻译风格 | `professional` |
| Custom Prompt | 自定义翻译提示词 | (空) |

支持所有 OpenAI 兼容的 API（如 DeepSeek、Moonshot 等），只需修改 Base URL 和模型名称。

### Google 翻译

| 配置项 | 说明 |
|--------|------|
| API Key | Google Cloud Translation API Key |

获取方式：在 Google Cloud Console 启用 Cloud Translation API，创建 API Key。

### Microsoft 翻译

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | Azure Translator API Key | (必填) |
| Region | 资源所在区域 | `eastasia` |

获取方式：在 Azure Portal 创建 Translator 资源，获取 Key 和 Region。

---

## 5. 使用方法

### 基本操作

1. **开始翻译**：点击阅读器工具栏的 Languages 图标 -> 在下拉菜单选择目标语言 -> 翻译自动开始
2. **切换显示/隐藏**：快捷键 `Cmd/Ctrl+Shift+T` 或再次点击翻译按钮
3. **查看进度**：翻译进行中按钮显示 loading 状态，tooltip 显示已完成段落数
4. **自动恢复**：翻译完成后自动保存，下次打开同一篇文章自动恢复翻译
5. **翻译文本高亮**：可以在翻译文本上选中文字并创建高亮/笔记

### 配置入口

- 侧边栏底部 Languages 图标 -> 打开翻译设置面板
- 可配置引擎、API 凭据、默认语言、显示样式、快捷键

---

## 6. 已知限制

1. **取消粒度**：取消翻译仅在批次间生效（每 10 段检查一次），不能中断正在进行的单次引擎调用
2. **BookReaderView**：翻译功能为占位实现，需后续完成电子书内容的 lazy-load 段落提取逻辑
3. **高亮关联**：翻译文本上的高亮在删除翻译时会一并丢失（删除前有确认提示，显示受影响的高亮数量）
4. **变更检测精度**：内容变更检测仅比较段落数量和首尾段落文本，非精确 hash，理论上存在漏检
5. **段落提取**：主进程无真实 DOM，使用正则匹配 HTML 块级标签，复杂嵌套结构可能提取不完整

---

## 7. 文件清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/main/translation/engine.ts` | TranslationEngine 抽象接口定义 |
| `src/main/translation/llm-engine.ts` | LLM 翻译引擎（AI SDK + zod） |
| `src/main/translation/google-engine.ts` | Google Cloud Translation API v2 引擎 |
| `src/main/translation/microsoft-engine.ts` | Microsoft Azure Translator API 引擎 |
| `src/main/translation/factory.ts` | 引擎工厂，根据配置创建实例 |
| `src/main/translation/service.ts` | 翻译服务核心逻辑 |
| `src/main/ipc/translation-handlers.ts` | IPC handler 注册 |
| `src/renderer/translation-injector.ts` | DOM 翻译节点注入工具 |
| `src/renderer/components/TranslationLangPicker.tsx` | 目标语言选择下拉菜单 |
| `src/renderer/components/TranslationSettings.tsx` | 翻译配置面板 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/shared/types.ts` | 新增 Translation 相关类型定义 |
| `src/shared/ipc-channels.ts` | 新增 8 个翻译 IPC 通道常量 |
| `src/preload.ts` | 新增 8 个翻译桥接方法 |
| `src/shared/global.d.ts` | 新增 electronAPI 翻译方法类型声明 |
| `src/main/db/schema.ts` | 新增 `translations` 表定义 |
| `src/renderer/highlight-engine.ts` | 适配翻译节点：`getTextNodes` 跳过翻译节点、`getBlockAncestor` 识别翻译节点 |
| `src/renderer/components/ReaderView.tsx` | 集成翻译按钮、状态管理、进度监听、DOM 注入 |
| `src/renderer/components/VideoReaderView.tsx` | 字幕翻译集成 |
| `src/renderer/components/PodcastReaderView.tsx` | 播客翻译集成 |
| `src/renderer/components/BookReaderView.tsx` | 翻译占位实现 |
| `src/renderer/components/TranscriptView.tsx` | 接收翻译段落 props，渲染翻译 div |
| `src/renderer/components/Sidebar.tsx` | 新增翻译设置入口按钮 |
| `src/index.css` | 新增 `.z-translation` / `.z-translation-hidden` 样式 |
