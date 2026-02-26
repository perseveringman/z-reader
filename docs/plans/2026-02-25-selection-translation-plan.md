# 划词翻译 — 语言学习 Tab 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在文章阅读器中新增划词翻译功能，翻译结果展示在右侧"语言学习" Tab 中，LLM 引擎提供深度分析。

**Architecture:** 工具栏新增翻译按钮 → 新 IPC 通道调用翻译引擎 → 结果持久化到 `selection_translations` 表 → 右侧面板语言学习 Tab 列表展示，支持收折/展开。LLM 引擎使用 `generateObject` 返回结构化分析（语法、词汇、用法、临界知识）。

**Tech Stack:** Electron + React + TypeScript, Drizzle ORM, AI SDK (`generateObject` + zod), Tailwind CSS, lucide-react

---

### Task 1: 数据库 Schema + 迁移

**Files:**
- Modify: `src/main/db/schema.ts` (末尾新增表定义)
- Modify: `src/main/db/index.ts` (末尾新增迁移 SQL)

**Step 1: 在 schema.ts 末尾新增 selectionTranslations 表定义**

在 `translations` 表定义之后添加：

```typescript
// ==================== selection_translations 划词翻译表 ====================
export const selectionTranslations = sqliteTable('selection_translations', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id),
  sourceText: text('source_text').notNull(),
  targetLang: text('target_lang').notNull(),
  translation: text('translation').notNull(),
  detectedLang: text('detected_lang'),
  engine: text('engine').notNull(),
  analysis: text('analysis'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  deletedFlg: integer('deleted_flg').default(0),
});
```

**Step 2: 在 db/index.ts 的 initTables 函数末尾添加迁移 SQL**

在 `// Migration: articles 表新增 metadata 列` 之后添加：

```typescript
  // Migration: selection_translations 划词翻译表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS selection_translations (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id),
      source_text TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      translation TEXT NOT NULL,
      detected_lang TEXT,
      engine TEXT NOT NULL,
      analysis TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_flg INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_selection_translations_article_id ON selection_translations(article_id);
    CREATE INDEX IF NOT EXISTS idx_selection_translations_created ON selection_translations(created_at);
  `);
```

**Step 3: 验证应用可启动**

Run: `pnpm start`
Expected: 应用正常启动，无错误

**Step 4: 提交**

```bash
git add src/main/db/schema.ts src/main/db/index.ts
git commit -m "feat(db): 新增 selection_translations 划词翻译表"
```

---

### Task 2: 类型定义 + IPC 通道

**Files:**
- Modify: `src/shared/types.ts` (新增类型 + 扩展 ElectronAPI + 扩展 TranslationSettings)
- Modify: `src/shared/ipc-channels.ts` (新增 3 个通道)

**Step 1: 在 types.ts 的 TranslationSettings 接口末尾新增 selectionAnalysis 字段**

在 `src/shared/types.ts:791`（`shortcut: string;` 之后，`}` 之前）添加：

```typescript
  selectionAnalysis: {
    sentenceTranslation: boolean;
    grammarStructure: boolean;
    keyVocabulary: boolean;
    usageExtension: boolean;
    criticalKnowledge: boolean;
  };
```

**Step 2: 在 types.ts 的 Translation 相关类型之后新增划词翻译类型**

在 `TranslationSettings` 接口定义结束后添加：

```typescript
// ==================== 划词翻译类型 ====================

export interface SelectionTranslationAnalysis {
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

export interface TranslateTextInput {
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

export interface TranslateTextResult {
  id: string;
  translation: string;
  detectedLang?: string;
  analysis?: SelectionTranslationAnalysis;
  createdAt: string;
}
```

**Step 3: 在 ElectronAPI 接口的 Translation 区块末尾新增 3 个方法**

在 `translationSettingsSet` 之后添加：

```typescript
  // 划词翻译
  selectionTranslate: (input: TranslateTextInput) => Promise<TranslateTextResult>;
  selectionTranslationList: (articleId: string) => Promise<SelectionTranslation[]>;
  selectionTranslationDelete: (id: string) => Promise<void>;
```

**Step 4: 在 ipc-channels.ts 的 Translation 区块末尾新增 3 个通道**

在 `TRANSLATION_SETTINGS_SET` 之后添加：

```typescript
  // 划词翻译
  SELECTION_TRANSLATE: 'selection:translate',
  SELECTION_TRANSLATION_LIST: 'selection:translation:list',
  SELECTION_TRANSLATION_DELETE: 'selection:translation:delete',
```

**Step 5: 提交**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat(types): 新增划词翻译类型定义和 IPC 通道"
```

---

### Task 3: 后端翻译服务 — translateText 函数

**Files:**
- Modify: `src/main/translation/service.ts` (新增 `translateText` 函数和 LLM 分析逻辑)

**Step 1: 在 service.ts 顶部 import 中新增需要的类型**

在已有 import 的 type 列表中添加 `TranslateTextInput`, `TranslateTextResult`, `SelectionTranslationAnalysis`。

**Step 2: 在 service.ts 末尾（`mapRowToTranslation` 之后）新增 translateText 函数**

```typescript
// ==================== 划词翻译 ====================

/**
 * 划词翻译：翻译单段选中文字
 *
 * 1. 加载翻译设置，创建引擎
 * 2. 调用引擎 translate() 获取基础翻译
 * 3. 如果是 LLM 引擎且开启分析，用 generateObject 获取结构化分析
 * 4. 持久化到 selection_translations 表
 * 5. 返回结果
 */
export async function translateText(input: TranslateTextInput): Promise<TranslateTextResult> {
  const db = getDatabase();
  const settings = loadTranslationSettings();
  const provider = settings.provider;
  const engineSettings: TranslationSettings = { ...settings, provider };
  const engine = createTranslationEngine(engineSettings);

  // 基础翻译
  const translation = await engine.translate(input.text, input.sourceLang, input.targetLang);

  // 语言检测
  let detectedLang: string | undefined;
  if (settings.autoDetectLang) {
    try {
      detectedLang = await engine.detectLanguage(input.text);
    } catch {
      // 检测失败不阻塞
    }
  }

  // LLM 深度分析
  let analysis: SelectionTranslationAnalysis | undefined;
  if (provider === 'llm' && input.useLLMAnalysis && settings.llm.apiKey) {
    try {
      analysis = await performLLMAnalysis(input.text, translation, input.targetLang, settings.llm, input.enabledModules);
    } catch (err) {
      console.warn('LLM 分析失败，跳过:', err);
    }
  }

  // 持久化
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(schema.selectionTranslations).values({
    id,
    articleId: input.articleId,
    sourceText: input.text,
    targetLang: input.targetLang,
    translation,
    detectedLang: detectedLang ?? null,
    engine: provider,
    analysis: analysis ? JSON.stringify(analysis) : null,
    createdAt: now,
    updatedAt: now,
    deletedFlg: 0,
  });

  return {
    id,
    translation,
    detectedLang,
    analysis,
    createdAt: now,
  };
}

/**
 * LLM 深度语言分析
 */
async function performLLMAnalysis(
  sourceText: string,
  translatedText: string,
  targetLang: string,
  llmConfig: TranslationSettings['llm'],
  enabledModules?: TranslateTextInput['enabledModules'],
): Promise<SelectionTranslationAnalysis> {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const { generateObject } = await import('ai');
  const { z } = await import('zod');

  const provider = createOpenAI({
    baseURL: llmConfig.baseUrl || 'https://api.openai.com/v1',
    apiKey: llmConfig.apiKey,
  });
  const model = provider.chat(llmConfig.model || 'gpt-4o-mini');

  // 根据 enabledModules 构建 schema 和 prompt
  const modules = enabledModules ?? {
    sentenceTranslation: true,
    grammarStructure: true,
    keyVocabulary: true,
    usageExtension: true,
    criticalKnowledge: false,
  };

  const schemaFields: Record<string, z.ZodTypeAny> = {};
  const promptParts: string[] = [];

  if (modules.sentenceTranslation) {
    schemaFields.sentenceTranslation = z.string().describe('完整的句子翻译，语句通顺自然');
    promptParts.push('1. 句子翻译：提供完整通顺的翻译');
  }
  if (modules.grammarStructure) {
    schemaFields.grammarStructure = z.string().describe('语法结构分析，包括句型、从句、时态等');
    promptParts.push('2. 语法结构：分析句型结构、从句、时态、语态等');
  }
  if (modules.keyVocabulary) {
    schemaFields.keyVocabulary = z.array(z.object({
      word: z.string(),
      role: z.enum(['main', 'secondary']),
      meaning: z.string(),
      partOfSpeech: z.string(),
    })).describe('主干词汇和次干词汇标注');
    promptParts.push('3. 词汇标注：标注主干词汇(main)和次干词汇(secondary)，含词性和释义');
  }
  if (modules.usageExtension) {
    schemaFields.usageExtension = z.string().describe('用法拓展，包括常见搭配、例句');
    promptParts.push('4. 用法拓展：提供常见搭配、造句示例');
  }
  if (modules.criticalKnowledge) {
    schemaFields.criticalKnowledge = z.string().describe('临界知识：与该文本相关的元知识、思维模型或规律');
    promptParts.push('5. 临界知识：提炼相关的元知识、思维模型或底层规律');
  }

  if (Object.keys(schemaFields).length === 0) return {};

  const analysisSchema = z.object(schemaFields);

  const prompt = `你是一位专业的语言学习助手。请对以下文本进行深度分析，目标语言为 ${targetLang}。

## 原文
${sourceText}

## 参考翻译
${translatedText}

## 分析要求
${promptParts.join('\n')}

请用 ${targetLang} 回答分析内容。`;

  const maxOutputTokens = Math.max(sourceText.length * 5 + 500, 2048);

  const { object } = await generateObject({
    model,
    schema: analysisSchema,
    prompt,
    maxOutputTokens,
  });

  return object as SelectionTranslationAnalysis;
}

/**
 * 查询文章的划词翻译列表（时间倒序）
 */
export async function listSelectionTranslations(articleId: string): Promise<import('../../shared/types').SelectionTranslation[]> {
  const db = getDatabase();

  const rows = await db
    .select()
    .from(schema.selectionTranslations)
    .where(
      and(
        eq(schema.selectionTranslations.articleId, articleId),
        eq(schema.selectionTranslations.deletedFlg, 0),
      ),
    )
    .orderBy(desc(schema.selectionTranslations.createdAt));

  return rows.map((row) => ({
    id: row.id,
    articleId: row.articleId,
    sourceText: row.sourceText,
    targetLang: row.targetLang,
    translation: row.translation,
    detectedLang: row.detectedLang,
    engine: row.engine,
    analysis: row.analysis ? JSON.parse(row.analysis) : null,
    createdAt: row.createdAt,
  }));
}

/**
 * 软删除单条划词翻译
 */
export async function deleteSelectionTranslation(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db
    .update(schema.selectionTranslations)
    .set({ deletedFlg: 1, updatedAt: now })
    .where(eq(schema.selectionTranslations.id, id));
}
```

**Step 3: 提交**

```bash
git add src/main/translation/service.ts
git commit -m "feat(translation): 新增 translateText 划词翻译服务函数"
```

---

### Task 4: IPC Handler + Preload 桥接

**Files:**
- Modify: `src/main/ipc/translation-handlers.ts` (新增 3 个 handler)
- Modify: `src/preload.ts` (新增 3 个桥接方法)

**Step 1: 在 translation-handlers.ts 的 import 中新增**

在已有 import 列表中添加 `translateText`, `listSelectionTranslations`, `deleteSelectionTranslation`。在类型 import 中添加 `TranslateTextInput`。

**Step 2: 在 registerTranslationHandlers 函数末尾新增 3 个 handler**

在 `TRANSLATION_SETTINGS_SET` handler 之后添加：

```typescript
  // 划词翻译
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATE, async (_event, input: TranslateTextInput) => {
    return translateText(input);
  });

  // 划词翻译列表
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATION_LIST, async (_event, articleId: string) => {
    return listSelectionTranslations(articleId);
  });

  // 删除划词翻译
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATION_DELETE, async (_event, id: string) => {
    return deleteSelectionTranslation(id);
  });
```

**Step 3: 在 preload.ts 的 electronAPI 对象中新增 3 个桥接方法**

在 `translationSettingsSet` 之后添加：

```typescript
  selectionTranslate: (input) => ipcRenderer.invoke(IPC_CHANNELS.SELECTION_TRANSLATE, input),
  selectionTranslationList: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.SELECTION_TRANSLATION_LIST, articleId),
  selectionTranslationDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.SELECTION_TRANSLATION_DELETE, id),
```

**Step 4: 验证 TypeScript 编译**

Run: `pnpm start`
Expected: 应用正常启动

**Step 5: 提交**

```bash
git add src/main/ipc/translation-handlers.ts src/preload.ts
git commit -m "feat(ipc): 注册划词翻译 IPC handler 和 preload 桥接"
```

---

### Task 5: TranslationSettings 默认值更新

**Files:**
- Modify: `src/main/translation/service.ts` (DEFAULT_SETTINGS 添加 selectionAnalysis)
- Modify: `src/renderer/components/TranslationSettings.tsx` (DEFAULT_SETTINGS 同步)

**Step 1: 在 service.ts 的 DEFAULT_SETTINGS 中添加 selectionAnalysis**

在 `shortcut: 'CmdOrCtrl+Shift+T',` 之后添加：

```typescript
  selectionAnalysis: {
    sentenceTranslation: true,
    grammarStructure: true,
    keyVocabulary: true,
    usageExtension: true,
    criticalKnowledge: false,
  },
```

**Step 2: 在 TranslationSettings.tsx 的 DEFAULT_SETTINGS 中添加同样的字段**

在 `shortcut: 'CmdOrCtrl+Shift+T',` 之后添加同样的 `selectionAnalysis` 对象。

**Step 3: 在 loadTranslationSettings 的合并逻辑中添加 selectionAnalysis 的深度合并**

在 `display:` 合并行之后添加：

```typescript
    selectionAnalysis: { ...DEFAULT_SETTINGS.selectionAnalysis, ...(saved.selectionAnalysis || {}) },
```

**Step 4: 在 saveTranslationSettings 的合并逻辑中添加 selectionAnalysis**

在 `display:` 合并行之后添加：

```typescript
    selectionAnalysis: { ...current.selectionAnalysis, ...(partial.selectionAnalysis || {}) },
```

**Step 5: 提交**

```bash
git add src/main/translation/service.ts src/renderer/components/TranslationSettings.tsx
git commit -m "feat(settings): TranslationSettings 新增 selectionAnalysis 配置"
```

---

### Task 6: 翻译设置面板 — 划词分析模块配置 UI

**Files:**
- Modify: `src/renderer/components/TranslationSettings.tsx` (新增配置区)

**Step 1: 新增 updateSelectionAnalysis 回调**

在 `updateDisplay` 之后添加：

```typescript
  const updateSelectionAnalysis = useCallback(
    (partial: Partial<TranslationSettingsData['selectionAnalysis']>) => {
      setSettings((prev) => {
        const nextSA = { ...prev.selectionAnalysis, ...partial };
        const next = { ...prev, selectionAnalysis: nextSA };
        window.electronAPI.translationSettingsSet({ selectionAnalysis: nextSA }).catch((err) => {
          console.error('保存划词分析配置失败:', err);
        });
        return next;
      });
    },
    [],
  );
```

**Step 2: 在快捷键 section 之后新增划词翻译配置区**

在 `</section>` (快捷键区之后) 添加：

```tsx
            {/* ==================== 划词翻译分析 ==================== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Languages size={16} className="text-amber-400" />
                <h3 className="text-sm font-medium text-white">划词翻译分析</h3>
              </div>
              <p className="text-[11px] text-gray-500 mb-4">
                使用 LLM 引擎时，划词翻译可提供以下深度分析模块（非 LLM 引擎仅显示基础翻译）
              </p>

              <div className="space-y-3">
                {([
                  { key: 'sentenceTranslation' as const, label: '整句翻译', desc: '提供完整通顺的句子翻译' },
                  { key: 'grammarStructure' as const, label: '语法结构分析', desc: '分析句型、从句、时态等' },
                  { key: 'keyVocabulary' as const, label: '主干/次干词汇标注', desc: '标注核心词汇和辅助词汇' },
                  { key: 'usageExtension' as const, label: '用法拓展', desc: '常见搭配和造句示例' },
                  { key: 'criticalKnowledge' as const, label: '临界知识', desc: '相关的元知识和思维模型' },
                ] as const).map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{item.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => updateSelectionAnalysis({ [item.key]: !settings.selectionAnalysis[item.key] })}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                        settings.selectionAnalysis[item.key]
                          ? 'bg-amber-500'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          settings.selectionAnalysis[item.key] ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>
```

**Step 3: 验证设置面板显示**

Run: `pnpm start`
Expected: 翻译设置面板底部出现"划词翻译分析"区，5 个 Switch 开关正常工作

**Step 4: 提交**

```bash
git add src/renderer/components/TranslationSettings.tsx
git commit -m "feat(ui): 翻译设置面板新增划词分析模块配置"
```

---

### Task 7: 语言学习 Tab 组件

**Files:**
- Create: `src/renderer/components/LanguageLearningTab.tsx`

**Step 1: 创建 LanguageLearningTab 组件**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, ChevronDown, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import type { SelectionTranslation, SelectionTranslationAnalysis } from '../../shared/types';

interface LanguageLearningTabProps {
  articleId: string;
  /** 新翻译完成时外部通知刷新 */
  refreshTrigger?: number;
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '今天';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function LanguageLearningTab({ articleId, refreshTrigger }: LanguageLearningTabProps) {
  const [items, setItems] = useState<SelectionTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const list = await window.electronAPI.selectionTranslationList(articleId);
      setItems(list);
      // 自动展开最新的一条
      if (list.length > 0 && expandedId === null) {
        setExpandedId(list[0].id);
      }
    } catch (err) {
      console.error('加载划词翻译列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [articleId, expandedId]);

  useEffect(() => {
    setLoading(true);
    loadItems();
  }, [articleId, refreshTrigger, loadItems]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electronAPI.selectionTranslationDelete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error('删除划词翻译失败:', err);
    }
  }, [expandedId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <div className="text-center text-gray-500">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">选中文字并点击翻译按钮</p>
          <p className="text-xs mt-1 text-gray-600">翻译结果将在此处展示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-lg border border-white/5 bg-[#1a1a1a] overflow-hidden"
          >
            {/* 头部 */}
            <button
              onClick={() => toggleExpand(item.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors cursor-pointer group"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              )}
              <span className="flex-1 text-[13px] text-gray-300 truncate">
                &ldquo;{item.sourceText}&rdquo;
              </span>
              <span className="text-[10px] text-gray-600 shrink-0">
                {formatDate(item.createdAt)} {formatTime(item.createdAt)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-red-400 transition-all cursor-pointer shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>

            {/* 详情 */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3">
                {/* 基础翻译 */}
                <AnalysisBlock title="翻译" content={item.translation} />

                {/* LLM 分析模块 */}
                {item.analysis && (
                  <>
                    {item.analysis.sentenceTranslation && (
                      <AnalysisBlock title="整句翻译" content={item.analysis.sentenceTranslation} />
                    )}
                    {item.analysis.grammarStructure && (
                      <AnalysisBlock title="语法结构" content={item.analysis.grammarStructure} />
                    )}
                    {item.analysis.keyVocabulary && item.analysis.keyVocabulary.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">词汇标注</h4>
                        <div className="space-y-1">
                          {item.analysis.keyVocabulary.map((v, i) => (
                            <div key={i} className="flex items-center gap-2 text-[12px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.role === 'main' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                              <span className="text-white font-medium">{v.word}</span>
                              <span className="text-gray-500">({v.partOfSpeech})</span>
                              <span className="text-gray-400">{v.meaning}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.analysis.usageExtension && (
                      <AnalysisBlock title="用法拓展" content={item.analysis.usageExtension} />
                    )}
                    {item.analysis.criticalKnowledge && (
                      <AnalysisBlock title="临界知识" content={item.analysis.criticalKnowledge} />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 分析区块通用组件 */
function AnalysisBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/LanguageLearningTab.tsx
git commit -m "feat(ui): 新增 LanguageLearningTab 语言学习面板组件"
```

---

### Task 8: ReaderDetailPanel 集成语言学习 Tab

**Files:**
- Modify: `src/renderer/components/ReaderDetailPanel.tsx`

**Step 1: 新增 import**

在文件顶部 import 区添加：

```typescript
import { GraduationCap } from 'lucide-react';
import { LanguageLearningTab } from './LanguageLearningTab';
```

**Step 2: 扩展 DetailTab 类型**

将 `type DetailTab = 'info' | 'notebook' | 'mindmap' | 'chat';` 改为：

```typescript
type DetailTab = 'info' | 'notebook' | 'mindmap' | 'chat' | 'learn';
```

**Step 3: 在 ReaderDetailPanelProps 中新增 props**

```typescript
  /** 划词翻译刷新触发器 */
  selectionTranslationRefresh?: number;
```

**Step 4: 在 Tab 数组中新增 learn Tab**

在 `{ key: 'chat' as DetailTab, label: 'Chat' },` 之后添加：

```typescript
          { key: 'learn' as DetailTab, label: 'Learn' },
```

**Step 5: 在内容区域添加 learn Tab 渲染**

在 `{activeTab === 'mindmap' && (` 区块之后添加：

```tsx
            {activeTab === 'learn' && (
              <LanguageLearningTab
                articleId={articleId}
                refreshTrigger={selectionTranslationRefresh}
              />
            )}
```

**Step 6: 从 props 解构 selectionTranslationRefresh**

更新组件函数签名，从 props 中解构 `selectionTranslationRefresh`。

**Step 7: 提交**

```bash
git add src/renderer/components/ReaderDetailPanel.tsx
git commit -m "feat(ui): ReaderDetailPanel 集成语言学习 Tab"
```

---

### Task 9: ReaderView 工具栏翻译按钮 + 交互逻辑

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 新增翻译相关 state**

在现有翻译状态区（约 line 82-86）之后添加：

```typescript
  const [selectionTranslating, setSelectionTranslating] = useState(false);
  const [selectionTranslationRefresh, setSelectionTranslationRefresh] = useState(0);
```

**Step 2: 新增 handleSelectionTranslate 回调**

在 `handleTranslate` 之后添加：

```typescript
  const handleSelectionTranslate = useCallback(async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !article) return;

    // 切到语言学习 Tab
    setForceTab({ tab: 'learn' as any, ts: Date.now() });
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
      });
      setSelectionTranslationRefresh((prev) => prev + 1);
    } catch (err) {
      console.error('划词翻译失败:', err);
    } finally {
      setSelectionTranslating(false);
    }
  }, [article, defaultTargetLang]);
```

**Step 3: 在 selection 模式工具栏中添加翻译按钮**

找到 `{toolbar.mode === 'selection' ? (` 区块，将现有的单个高亮按钮改为包含翻译按钮：

```tsx
          {toolbar.mode === 'selection' ? (
            <>
              <button
                onClick={handleCreateHighlight}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-500/20 hover:bg-amber-500/30 transition-colors cursor-pointer"
                title="高亮"
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-400" />
              </button>
              <button
                onClick={handleSelectionTranslate}
                disabled={selectionTranslating}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors cursor-pointer disabled:opacity-50"
                title="翻译"
              >
                {selectionTranslating ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5 text-blue-400" />
                )}
              </button>
            </>
          ) : (
```

**Step 4: 传递 selectionTranslationRefresh 给 ReaderDetailPanel**

在 `<ReaderDetailPanel` 中添加 prop：

```tsx
          selectionTranslationRefresh={selectionTranslationRefresh}
```

**Step 5: 验证完整交互**

Run: `pnpm start`
Expected: 选中文字 → 工具栏出现高亮+翻译两个按钮 → 点击翻译 → 右侧面板切到 Learn Tab → 显示翻译结果

**Step 6: 提交**

```bash
git add src/renderer/components/ReaderView.tsx
git commit -m "feat(ui): ReaderView 工具栏新增划词翻译按钮"
```

---

### Task 10: i18n 国际化

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

**Step 1: 在 zh.json 的 translation 区块末尾新增**

```json
    "selectionAnalysis": "划词翻译分析",
    "selectionAnalysisDesc": "使用 LLM 引擎时，划词翻译可提供以下深度分析模块",
    "sentenceTranslation": "整句翻译",
    "grammarStructure": "语法结构分析",
    "keyVocabulary": "主干/次干词汇标注",
    "usageExtension": "用法拓展",
    "criticalKnowledge": "临界知识",
    "learn": "语言学习",
    "learnEmpty": "选中文字并点击翻译按钮",
    "learnEmptyHint": "翻译结果将在此处展示"
```

**Step 2: 在 en.json 的 translation 区块末尾新增对应英文**

```json
    "selectionAnalysis": "Selection Analysis",
    "selectionAnalysisDesc": "Deep analysis modules available with LLM engine",
    "sentenceTranslation": "Sentence Translation",
    "grammarStructure": "Grammar Structure",
    "keyVocabulary": "Key Vocabulary",
    "usageExtension": "Usage Extension",
    "criticalKnowledge": "Critical Knowledge",
    "learn": "Language Learning",
    "learnEmpty": "Select text and click translate",
    "learnEmptyHint": "Translation results will appear here"
```

**Step 3: 提交**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(i18n): 新增划词翻译和语言学习相关国际化文案"
```

---

### Task 11: 功能文档

**Files:**
- Create: `docs/selection-translation.md`

**Step 1: 撰写功能文档**

文档内容包含：
- 功能概述
- 交互流程
- 数据库表结构
- IPC 通道列表
- 组件结构
- 配置说明
- 已知限制和后续计划

**Step 2: 提交**

```bash
git add docs/selection-translation.md
git commit -m "docs: 划词翻译功能文档"
```
