# 沉浸式翻译功能设计

## 概述

在阅读器中增加一键沉浸式翻译功能，使用 AI 或专业翻译 API 将文章、视频字幕、播客转写、电子书等内容逐段翻译，译文显示在对应原文段落下方（类似沉浸式翻译浏览器插件），同时保持阅读器所有现有功能（高亮、段落焦点、j/k 导航、自动滚动等）不受影响。

## 核心设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 架构方案 | DOM 注入 | 最贴合沉浸式翻译体验，对现有功能侵入最小 |
| 翻译粒度 | 段落级对照 | 阅读体验与翻译成本的平衡 |
| 翻译方向 | 多语言互译 | 任意语言间翻译，目标语言可配置 |
| AI 配置 | 独立于主 AI 配置 | 翻译可使用不同提供商/模型 |
| 翻译引擎 | LLM + Google + Microsoft | LLM 质量高可定制，Google/Microsoft 速度快成本低 |
| 高亮机制 | 复用现有高亮系统（路线 1） | 零改动复用高亮/笔记/标签/分享卡片等功能 |
| 存储方式 | 独立 translations 表 | 支持多语言版本，段落级存储 |
| 文章触发 | 一键全文翻译 | 点击后翻译全文所有段落 |
| 电子书触发 | 按页懒加载翻译 | 电子书内容太大，按页翻译 + prefetch 下一页 |

## 架构设计

### 翻译节点约束

- 统一使用 `<div data-translation="true" data-para-index="N">` 标签
- 不使用 `p / li / blockquote`，不匹配 `BLOCK_SELECTOR`，段落焦点和 j/k 导航不受影响
- `highlight-engine` 的 `getTextNodes` 默认跳过 `[data-translation]` 节点（保护原文 offset）
- 用户在译文上划线时，`getBlockAncestor` 识别翻译节点，`anchorPath` 天然包含 `div[data-translation]` 路径

### 对现有功能的影响

| 功能 | 影响 | 解决方式 |
|---|---|---|
| 高亮 | `getTextNodes` 会遍历到译文文本节点 | 加一行过滤：跳过 `[data-translation]` 子节点 |
| 段落焦点 (j/k + 蓝条) | 翻译节点用 div 不匹配 `BLOCK_SELECTOR` | 零改动 |
| 视频/播客自动滚动 | TranscriptView 独立组件 | 翻译追加在 segment div 内部，不影响 segmentRefs |
| 点击段落跳转进度 | segment click 事件绑定不变 | 零改动 |
| 译文高亮 | 复用 anchorPath + offset 机制 | anchorPath 中包含 `div[data-translation]` 自动区分 |

### 高亮刷新策略

每次注入翻译段落后调用 `applyHighlights()` 全量刷新，确保所有高亮（原文 + 译文）正确渲染：

```
innerHTML 设置原文 → applyHighlights()
翻译 progress 每批段落注入后 → applyHighlights()
翻译全部完成后 → applyHighlights()
```

`applyHighlights` 是幂等操作（先清后建），频繁调用无副作用。

### 适配的 4 种 Reader

| Reader | 翻译对象 | 注入方式 |
|---|---|---|
| ReaderView（文章） | article.content 的块级元素 | 在每个 p/li/blockquote 后插入兄弟节点 |
| VideoReaderView | TranscriptView 的 segment | 在 segment div 内部追加子元素 |
| PodcastReaderView | TranscriptView 的 segment | 同上 |
| BookReaderView（电子书） | 当前页/章节的块级元素 | 按页懒加载翻译，注入方式同文章 |

## 数据库设计

### translations 表

```sql
CREATE TABLE translations (
  id              TEXT PRIMARY KEY,
  article_id      TEXT REFERENCES articles(id),
  book_id         TEXT REFERENCES books(id),
  source_type     TEXT NOT NULL,          -- 'article' | 'transcript' | 'book'
  source_lang     TEXT,                   -- 源语言代码 (如 'en', 'ja')
  target_lang     TEXT NOT NULL,          -- 目标语言代码 (如 'zh-CN')
  paragraphs      TEXT,                   -- JSON: [{index, original, translated}]
  model           TEXT,                   -- 使用的引擎/模型 (如 'google', 'gpt-4o-mini')
  prompt_template TEXT,                   -- 使用的翻译 prompt
  token_count     INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'pending', -- 'pending' | 'translating' | 'completed' | 'failed'
  progress        REAL DEFAULT 0,         -- 0-1 翻译进度
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_flg     INTEGER DEFAULT 0
);
```

- 同一篇文章可有多条翻译记录（不同引擎/不同目标语言），默认展示最新一条
- 电子书按章节存储，paragraphs JSON 中通过 chapterIndex + index 定位

### 翻译配置（复用 aiSettings 键值存储）

| key | 示例值 | 说明 |
|---|---|---|
| `translation.provider` | `llm` / `google` / `microsoft` | 翻译引擎类型 |
| `translation.llm.apiKey` | `sk-xxx` | LLM API Key |
| `translation.llm.baseUrl` | `https://api.openai.com/v1` | LLM 端点 |
| `translation.llm.model` | `gpt-4o-mini` | LLM 模型 |
| `translation.llm.style` | `professional` | 翻译风格：professional / casual / literal |
| `translation.llm.customPrompt` | `你是一位专业翻译...` | 自定义 prompt |
| `translation.google.apiKey` | `AIza...` | Google Translation API Key |
| `translation.microsoft.apiKey` | `xxx` | Azure Translator API Key |
| `translation.microsoft.region` | `eastasia` | Azure 区域 |
| `translation.defaultTargetLang` | `zh-CN` | 默认目标语言 |
| `translation.autoDetectLang` | `true` | 自动检测源语言 |
| `translation.autoTranslateFeeds` | `["feedId1"]` | 自动翻译的 Feed 列表 |
| `translation.display.fontSize` | `14` | 译文字号 |
| `translation.display.color` | `#9ca3af` | 译文颜色 |
| `translation.display.opacity` | `0.85` | 译文透明度 |
| `translation.display.showOriginal` | `true` | 是否显示原文 |
| `translation.shortcut` | `Cmd+Shift+T` | 翻译快捷键 |

## 翻译引擎抽象

```
TranslationEngine (接口)
├── translate(text, sourceLang, targetLang) → string
├── translateBatch(texts[], sourceLang, targetLang) → string[]
├── detectLanguage(text) → string
│
├── LLMTranslationEngine      — AI SDK (generateObject)，支持风格/prompt 定制
├── GoogleTranslationEngine   — Google Cloud Translation API v2
└── MicrosoftTranslationEngine — Azure Translator API
```

## IPC 通信设计

| 通道 | 方向 | 用途 |
|---|---|---|
| `TRANSLATION_START` | invoke | 发起翻译 (articleId, targetLang, provider) |
| `TRANSLATION_CANCEL` | invoke | 取消进行中的翻译 |
| `TRANSLATION_GET` | invoke | 查询已有翻译 (articleId, targetLang) |
| `TRANSLATION_DELETE` | invoke | 删除翻译结果 |
| `TRANSLATION_LIST` | invoke | 查询文章的所有翻译版本 |
| `TRANSLATION_ON_PROGRESS` | on | 流式推送翻译进度（段落级） |
| `TRANSLATION_SETTINGS_GET` | invoke | 读取翻译配置 |
| `TRANSLATION_SETTINGS_SET` | invoke | 保存翻译配置 |

### 翻译流程

```
用户点击翻译按钮
  → 渲染进程 invoke TRANSLATION_GET(articleId, targetLang)
    → 有缓存？
      ├── 是 → 直接注入 DOM，完成
      └── 否 → invoke TRANSLATION_START
             → 主进程：
               1. 创建 translations 记录 (status: translating)
               2. 提取原文段落（HTML 块级元素 / transcript segments）
               3. 逐批调用 TranslationEngine.translateBatch()（每批 10 段）
               4. 每完成一批 → send TRANSLATION_ON_PROGRESS({index, translated})
               5. 全部完成 → 更新 status: completed
             → 渲染进程：
               - 收到 progress → 实时注入翻译 DOM + applyHighlights()
               - 全部完成后整体可用
```

### 文章打开时的自动恢复

```
ReaderView 加载 article
  → invoke TRANSLATION_GET(articleId, 默认 targetLang)
    → 有已完成翻译？
      ├── 是 → 注入翻译 DOM → applyHighlights()（包括译文高亮）
      └── 否 → 正常渲染
```

### 取消机制

用 AbortController，用户取消时 abort 当前翻译请求，已翻译段落保留，status 设为 failed。

## UI 设计

### 翻译按钮

- 位于 ReaderView 顶部工具栏，图标 `Languages`（lucide-react）
- 点击弹出语言选择下拉菜单
- 视频/播客的 TranscriptView 顶部同样增加翻译按钮

### 译文 DOM 结构

文章：
```html
<p>The quick brown fox jumps over the lazy dog.</p>
<div data-translation="true" data-para-index="0" class="z-translation">
  敏捷的棕色狐狸跳过了懒狗。
</div>
```

TranscriptView：
```html
<div class="segment" data-index="0">
  <span class="timestamp">00:01</span>
  <span class="text">Hello world</span>
  <div data-translation="true" data-seg-index="0" class="z-translation">
    你好世界
  </div>
</div>
```

### 译文样式 (.z-translation)

- 字号：可配置，默认比原文小 1px
- 颜色：可配置，默认 #9ca3af
- 透明度：可配置，默认 0.85
- 翻译进行中：fadeIn 0.3s 淡入动画
- 隐藏：`.z-translation-hidden { display: none }`，不删除 DOM，高亮不受影响

### 翻译状态

| 状态 | UI 表现 |
|---|---|
| 未翻译 | 按钮正常态 |
| 翻译中 | 按钮 loading，工具栏显示进度（如「翻译中 12/36」） |
| 已翻译（显示中） | 按钮高亮态，点击隐藏译文 |
| 已翻译（隐藏中） | 按钮正常态，点击重新显示 |
| 翻译失败 | toast 提示，部分已翻译段落保留 |

### 快捷键

`Cmd+Shift+T`（可配置）切换翻译显示/隐藏。

### 翻译配置面板

```
翻译设置
├── 翻译引擎
│   ├── [切换] 当前引擎：LLM / Google / Microsoft
│   ├── LLM 配置区（选中时展开）
│   │   ├── API Key / Base URL / 模型选择
│   │   ├── 翻译风格：专业 / 口语 / 直译
│   │   └── 自定义 Prompt
│   ├── Google 配置区（选中时展开）
│   │   └── API Key
│   └── Microsoft 配置区（选中时展开）
│       ├── API Key
│       └── Region
├── 语言设置
│   ├── 默认目标语言
│   └── [开关] 自动检测源语言
├── 显示样式
│   ├── 译文字号 / 颜色 / 透明度
│   └── [开关] 默认显示原文
├── 自动化
│   ├── 快捷键绑定
│   └── 自动翻译 Feed 列表
└── [按钮] 测试连接
```

## 电子书翻译

按页懒加载：
```
用户点击翻译 → 翻译当前页段落
用户翻页 → 检查缓存，无缓存则翻译当前页 + prefetch 下一页
```

translations 记录按章节存储，paragraphs JSON 中通过 chapterIndex + index 定位。

## 边界情况

| 场景 | 处理方式 |
|---|---|
| 文章内容更新 | 检测 content hash 变化，提示「原文已更新，翻译可能过时」，可一键重新翻译 |
| 翻译中途断网 | 已完成段落保留，status: failed，可「继续翻译」从断点恢复 |
| 同一文章换引擎翻译 | 新建翻译记录，不覆盖旧的，默认展示最新 |
| 删除有高亮的翻译 | 提示用户「该翻译下有 N 条高亮，删除后高亮将无法显示」 |
| 源语言 = 目标语言 | 前端提示，不阻止 |
| 超长文章 (> 100 段) | 分批翻译，每批 10 段，progress 事件逐步展示 |
