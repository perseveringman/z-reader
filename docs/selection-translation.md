# 划词翻译 — 语言学习 Tab

## 功能概述

用户在文章阅读器中选中文字后，可通过工具栏的翻译按钮触发划词翻译。翻译结果展示在右侧面板的"语言学习（Learn）"Tab 中，支持基础翻译和 LLM 深度分析（语法、词汇、用法、临界知识）。

## 交互流程

1. 用户在阅读器中选中一段文字
2. 浮动工具栏出现，包含高亮按钮（amber）和翻译按钮（blue）
3. 点击翻译按钮：
   - 右侧面板自动切换到 Learn Tab
   - 工具栏关闭，选区清除
   - 后台调用翻译引擎（基础翻译 + LLM 分析）
   - 翻译完成后，Learn Tab 列表自动刷新，最新条目展开显示
4. 每条翻译记录支持展开/收折，hover 显示删除按钮

## 数据库表结构

### selection_translations

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| article_id | TEXT NOT NULL | 关联文章 ID |
| source_text | TEXT NOT NULL | 原始选中文字 |
| target_lang | TEXT NOT NULL | 目标语言 |
| translation | TEXT NOT NULL | 基础翻译结果 |
| detected_lang | TEXT | 检测到的源语言 |
| engine | TEXT NOT NULL | 翻译引擎（llm/google/microsoft） |
| analysis | TEXT | JSON 格式的 LLM 分析结果 |
| created_at | TEXT NOT NULL | 创建时间（ISO 8601） |
| updated_at | TEXT | 更新时间 |
| deleted_flg | INTEGER DEFAULT 0 | 软删除标记 |

索引：
- `idx_selection_translations_article_id`
- `idx_selection_translations_created`

## IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `selection:translate` | invoke | 翻译选中文字，返回 `TranslateTextResult` |
| `selection:translation:list` | invoke | 查询文章的划词翻译列表（时间倒序） |
| `selection:translation:delete` | invoke | 软删除单条划词翻译 |

## 组件结构

```
ReaderView
├── 工具栏（selection 模式）
│   ├── 高亮按钮（handleCreateHighlight）
│   └── 翻译按钮（handleSelectionTranslate）  ← 新增
└── ReaderDetailPanel
    └── Learn Tab  ← 新增
        └── LanguageLearningTab
            └── 翻译记录列表（可展开/收折）
```

## 核心类型

```typescript
// 翻译输入
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

// LLM 分析结果
interface SelectionTranslationAnalysis {
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
}
```

## 配置说明

翻译设置面板（`TranslationSettings`）新增"划词翻译分析"区块，包含 5 个开关：

| 模块 | 默认值 | 说明 |
|------|--------|------|
| 整句翻译 | 开 | 提供完整通顺的句子翻译 |
| 语法结构分析 | 开 | 分析句型、从句、时态等 |
| 主干/次干词汇标注 | 开 | 标注核心词汇和辅助词汇 |
| 用法拓展 | 开 | 常见搭配和造句示例 |
| 临界知识 | 关 | 相关的元知识和思维模型 |

配置存储在 `aiSettings` 表的 `translationConfig` key 中，字段路径：`selectionAnalysis.*`。

## LLM 分析实现

- 使用 `@ai-sdk/openai` + `generateObject` 返回结构化结果
- 动态构建 Zod Schema：仅包含用户开启的模块
- `maxTokens` = `max(源文本长度 × 5 + 500, 2048)`
- LLM 分析失败时降级为纯基础翻译，不阻塞流程

## 已知限制

- 仅支持文章（`articleId`）维度，暂不支持电子书
- 划词翻译不参与全文翻译的渲染（两套独立流程）
- LLM 分析仅在 `provider === 'llm'` 时触发，Google/Microsoft 引擎只有基础翻译

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/main/db/schema.ts` | `selectionTranslations` 表定义 |
| `src/main/db/index.ts` | 建表迁移 SQL |
| `src/shared/types.ts` | 类型定义（`SelectionTranslation` 等） |
| `src/shared/ipc-channels.ts` | IPC 通道常量 |
| `src/main/translation/service.ts` | `translateText`、`listSelectionTranslations`、`deleteSelectionTranslation` |
| `src/main/ipc/translation-handlers.ts` | IPC handler 注册 |
| `src/preload.ts` | Preload 桥接方法 |
| `src/renderer/components/LanguageLearningTab.tsx` | 语言学习 Tab 组件 |
| `src/renderer/components/ReaderDetailPanel.tsx` | 集成 Learn Tab |
| `src/renderer/components/ReaderView.tsx` | 工具栏翻译按钮 |
| `src/renderer/components/TranslationSettings.tsx` | 划词分析配置 UI |
