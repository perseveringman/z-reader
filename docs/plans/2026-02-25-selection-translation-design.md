# 划词翻译 — 语言学习 Tab 设计文档

## 概述

在文章阅读器中新增划词翻译功能，用户选中文字后通过浮动工具栏上的翻译按钮触发翻译。翻译结果展示在右侧详情面板新增的"语言学习" Tab 中，每次翻译持久化到数据库，以时间倒序列表形式展示，支持收折/展开。

## 目标

1. 用户可以在阅读文章时选中任意文字，一键翻译
2. 翻译结果展示在右侧"语言学习" Tab，支持持久化与回看
3. 使用 LLM 引擎时提供丰富的语言分析（语法、词汇、用法、临界知识）
4. 分析模块可配置显隐
5. 为后续语言学习功能扩展预留空间

## 交互流程

```
用户选中文字 → selection 工具栏弹出 [高亮] [翻译]
    ↓ 点击翻译按钮
获取选区文本 → 发送 IPC → 右侧切到语言学习 Tab (Loading)
    ↓ 后端翻译完成
新条目插入列表顶部 → 自动展开显示翻译详情
```

## 架构设计

### 1. 工具栏变更

现有 `selection` 模式工具栏只有高亮按钮，新增翻译按钮：

```
[ 🖍️ 高亮 ] [ 🔤 翻译 ]
```

- 使用 `Languages` icon（lucide-react，已 import）
- 点击后获取 `selectionRangeRef.current` 文本，调用新 IPC
- 通过 `forceTab` 切到语言学习 Tab
- 关闭工具栏、清除选区

### 2. 新 IPC 通道

**`translation:translateText`** — 翻译单段选中文字

请求：
```typescript
interface TranslateTextInput {
  text: string;
  sourceLang: string | null;
  targetLang: string;
  articleId: string;
  useLLMAnalysis: boolean;
  enabledModules?: {
    sentenceTranslation: boolean;
    grammarStructure: boolean;
    keyVocabulary: boolean;
    usageExtension: boolean;
    criticalKnowledge: boolean;
  };
}
```

响应：
```typescript
interface TranslateTextResult {
  id: string;                // 持久化记录 ID
  translation: string;        // 基础翻译
  detectedLang?: string;
  analysis?: {
    sentenceTranslation?: string;
    grammarStructure?: string;
    keyVocabulary?: Array<{
      word: string;
      role: 'main' | 'secondary';
      meaning: string;
      partOfSpeech: string;
    }>;
    usageExtension?: string;
    criticalKnowledge?: string;
  };
  createdAt: string;
}
```

**`translation:selectionList`** — 查询文章的划词翻译列表

请求：`{ articleId: string }`
响应：`SelectionTranslation[]`

**`translation:selectionDelete`** — 删除单条划词翻译

请求：`{ id: string }`
响应：`void`

### 3. 数据库 Schema

新增 `selection_translations` 表：

```typescript
export const selectionTranslations = sqliteTable('selection_translations', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull(),
  sourceText: text('source_text').notNull(),
  targetLang: text('target_lang').notNull(),
  translation: text('translation').notNull(),
  detectedLang: text('detected_lang'),
  engine: text('engine').notNull(),          // 'llm' | 'google' | 'microsoft'
  analysis: text('analysis'),                // JSON 序列化的分析结果
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  deletedFlg: integer('deleted_flg').default(0),
});
```

### 4. 后端翻译逻辑

```
读取 TranslationSettings → 确定当前引擎
    ↓
非 LLM 引擎 → 调用 engine.translate() → 返回基础翻译
LLM 引擎 + useLLMAnalysis=true → 调用 generateObject() 结构化分析
    ↓
结果写入 selection_translations 表 → 返回完整结果
```

LLM 分析 prompt 核心结构：
- 要求返回 JSON 格式
- 包含 5 个分析模块（根据 enabledModules 裁剪 prompt）
- 使用 `generateObject` + zod schema 确保结构化输出

### 5. 语言学习 Tab

**Tab 位置**：`ReaderDetailPanel` Tab 栏末尾

```
info | notebook | chat | 语言学习
```

Tab icon：`GraduationCap`（lucide-react）

**Tab 内容**：列表形式，时间倒序

```
┌──────────────────────────────────┐
│ 🎓 语言学习                      │
│                                  │
│ ▼ "the critical knowledge..."    │  ← 展开状态
│   12:34 PM                       │
│   ┌──────────────────────────┐   │
│   │ 翻译：临界知识...          │   │
│   │ 语法分析：...             │   │
│   │ 词汇标注：...             │   │
│   │ 用法拓展：...             │   │
│   │ 临界知识：...             │   │
│   └──────────────────────────┘   │
│                                  │
│ ▸ "paradigm shift"               │  ← 折叠状态
│   12:30 PM                       │
│                                  │
│ ▸ "unprecedented challenge"      │
│   12:25 PM                       │
└──────────────────────────────────┘
```

**组件结构**：

```
LanguageLearningTab
  ├── 空状态提示（无翻译记录时）
  └── SelectionTranslationList
       └── SelectionTranslationItem (可收折)
            ├── 头部：原文摘要 + 时间 + 删除按钮
            └── 详情面板（展开时）
                 ├── 翻译区块
                 ├── 语法分析区块（LLM only, 可配置）
                 ├── 词汇标注区块（LLM only, 可配置）
                 ├── 用法拓展区块（LLM only, 可配置）
                 └── 临界知识区块（LLM only, 可配置）
```

### 6. 分析模块配置

在 `TranslationSettings` 中新增配置区：

```typescript
// 扩展 TranslationSettings 类型
interface TranslationSettings {
  // ... 已有字段
  selectionAnalysis: {
    sentenceTranslation: boolean;  // 默认 true
    grammarStructure: boolean;     // 默认 true
    keyVocabulary: boolean;        // 默认 true
    usageExtension: boolean;       // 默认 true
    criticalKnowledge: boolean;    // 默认 false
  };
}
```

配置 UI 放在翻译设置面板的"划词翻译"分区，使用 Switch 组件控制各模块开关。

### 7. 作用范围

本期只在 `ReaderView`（文章阅读器）中实现。`VideoReaderView` 和 `PodcastReaderView` 使用 `TranscriptView` 组件，浮动工具栏架构不同，后续迭代扩展。

## 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| Schema | `src/main/db/schema.ts` | 新增 `selectionTranslations` 表 |
| IPC | `src/shared/ipc-channels.ts` | 新增 3 个通道 |
| IPC | `src/main/ipc/translation-handlers.ts` | 新增 3 个 handler |
| Preload | `src/preload.ts` | 暴露 3 个新方法 |
| Types | `src/shared/types.ts` | 新增类型 |
| Types | `src/shared/global.d.ts` | 更新 electronAPI 类型 |
| 翻译服务 | `src/main/translation/service.ts` | 新增 `translateText()` 函数 |
| 组件 | `src/renderer/components/LanguageLearningTab.tsx` | 新增语言学习 Tab 组件 |
| 组件 | `src/renderer/components/ReaderDetailPanel.tsx` | 新增 Tab |
| 组件 | `src/renderer/components/ReaderView.tsx` | 工具栏新增翻译按钮 |
| 组件 | `src/renderer/components/TranslationSettings.tsx` | 新增分析模块配置 |
| i18n | `src/locales/zh.json`, `src/locales/en.json` | 新增国际化文案 |

## 技术约束

- 复用现有 `TranslationEngine` 接口和已配置的引擎
- 数据库操作走 Drizzle ORM
- LLM 分析使用 AI SDK 的 `generateObject` + zod schema
- 前端组件遵循 Shadcn/UI 风格
- 保留 `updated_at` 和 `deleted_flg` 字段
