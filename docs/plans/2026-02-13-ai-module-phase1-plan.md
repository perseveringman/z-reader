# Z-Reader AI Module Phase 1 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Z-Reader 集成基础 AI 能力——LLM Provider 接入、内容摘要、翻译、自动标签三个核心 Skill，以及 AI 设置面板和执行追踪。

**Architecture:** 基于 Vercel AI SDK 的三层架构（Provider/Service/Skills）。代码位于 `src/ai/`，通过 IPC 桥接到 Electron 主进程/渲染进程。先清理旧 Agent 残留代码，再逐步构建新模块。

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/openai`), Zod, better-sqlite3 + Drizzle ORM, TypeScript, Vitest

**前置依赖:** `pnpm add ai @ai-sdk/openai zod`

---

## Task 1: 清理旧 Agent 残留代码

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 删除 AGENT_* channels
- Modify: `src/shared/types.ts` — 删除 Agent 相关类型和 ElectronAPI 中的 agent 方法
- Modify: `src/preload.ts` — 删除 agent 相关桥接
- Modify: `src/main/ipc/index.ts` — 移除 `registerAgentHandlers` 导入和调用
- Delete: `src/main/ipc/agent-handlers.ts`
- Delete: `src/shared/agent-protocol/` 目录
- Modify: `src/main/db/schema.ts` — 删除 agent 相关表定义（agentTasks, agentTaskEvents, agentMemories, agentTraces, agentGraphSnapshots）
- Modify: `src/main/db/index.ts` — 删除 agent 相关表的建表和迁移语句
- Modify: `src/renderer/components/PreferencesDialog.tsx` — 删除 Agent 运维面板相关代码
- Delete: `src/renderer/utils/agent-resume-audit.ts`

**Step 1: 清理 IPC channels**

在 `src/shared/ipc-channels.ts` 中删除第 104-114 行的 Agent 相关 channels：
```typescript
// 删除以下内容：
  // Agent
  AGENT_APPROVAL_LIST: 'agent:approval:list',
  AGENT_APPROVAL_DECIDE: 'agent:approval:decide',
  AGENT_REPLAY_GET: 'agent:replay:get',
  AGENT_POLICY_GET: 'agent:policy:get',
  AGENT_POLICY_SET: 'agent:policy:set',
  AGENT_SNAPSHOT_LIST: 'agent:snapshot:list',
  AGENT_SNAPSHOT_CLEANUP: 'agent:snapshot:cleanup',
  AGENT_RESUME_PREVIEW: 'agent:resume:preview',
  AGENT_RESUME_EXECUTE: 'agent:resume:execute',
  AGENT_RESUME_SPECIALISTS_LIST: 'agent:resume:specialists:list',
```

**Step 2: 清理 shared/types.ts**

删除所有 Agent 相关类型定义（搜索 `Agent` 前缀的接口/类型），以及 ElectronAPI 中第 656-666 行的 agent 方法。

**Step 3: 清理 preload.ts**

删除所有 `agent` 开头的桥接方法。

**Step 4: 清理 IPC 注册**

在 `src/main/ipc/index.ts` 中删除 `import { registerAgentHandlers }` 和 `registerAgentHandlers()` 调用。删除 `src/main/ipc/agent-handlers.ts` 文件。

**Step 5: 清理 agent-protocol 目录**

删除 `src/shared/agent-protocol/` 整个目录。

**Step 6: 清理数据库 schema**

在 `src/main/db/schema.ts` 中删除 `agentTasks`、`agentTaskEvents`、`agentMemories`、`agentTraces`、`agentGraphSnapshots` 五张表的定义。

在 `src/main/db/index.ts` 中删除这些表的 `CREATE TABLE IF NOT EXISTS` 语句和 `ALTER TABLE` 迁移语句。

**Step 7: 清理 PreferencesDialog 和 utils**

在 `src/renderer/components/PreferencesDialog.tsx` 中删除 Agent 运维面板相关的 state、函数和 JSX。删除 `src/renderer/utils/agent-resume-audit.ts` 文件。

**Step 8: 验证编译通过**

Run: `pnpm lint`
Expected: 无 Agent 相关报错

**Step 9: 提交**

```bash
git add -A
git commit -m "chore: 清理旧 Agent 底座残留代码"
```

---

## Task 2: 安装依赖 + 创建 AI 模块骨架

**Files:**
- Modify: `package.json` — 添加 AI SDK 依赖
- Create: `src/ai/providers/llm.ts`
- Create: `src/ai/providers/config.ts`
- Create: `src/ai/skills/types.ts`
- Create: `src/ai/index.ts`

**Step 1: 安装依赖**

Run: `pnpm add ai @ai-sdk/openai zod`

**Step 2: 创建 Skill 接口定义**

Create `src/ai/skills/types.ts`:
```typescript
import type { z, ZodSchema } from 'zod';

/** AI 上下文，传递给每个 Skill */
export interface AIContext {
  /** 获取模型实例，按任务类型选择 */
  getModel: (task: 'fast' | 'smart' | 'cheap') => ReturnType<typeof import('@ai-sdk/openai').createOpenAI>;
  /** 获取文章全文（通过注入的回调） */
  getArticleContent?: (articleId: string) => Promise<string | null>;
}

/** AI Skill 标准接口 */
export interface AISkill<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  execute: (input: TInput, ctx: AIContext) => Promise<TOutput>;
}

/** AI 任务状态 */
export type AITaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/** AI 任务日志记录 */
export interface AITaskLog {
  id: string;
  taskType: string;
  status: AITaskStatus;
  inputJson: string;
  outputJson: string | null;
  tracesJson: string | null;
  tokenCount: number;
  costUsd: number;
  errorText: string | null;
  metadataJson: string | null;
  createdAt: string;
}
```

**Step 3: 创建 AI 配置模块**

Create `src/ai/providers/config.ts`:
```typescript
/** AI Provider 配置 */
export interface AIProviderConfig {
  provider: 'openrouter' | 'minimax';
  apiKey: string;
  /** 模型映射 */
  models: {
    fast: string;    // 快速任务（标签、简单分析）
    smart: string;   // 复杂任务（摘要、对话）
    cheap: string;   // 低成本任务（翻译等）
  };
}

/** 默认模型配置 */
export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openrouter',
  apiKey: '',
  models: {
    fast: 'google/gemini-2.0-flash-001',
    smart: 'anthropic/claude-sonnet-4',
    cheap: 'google/gemini-2.0-flash-001',
  },
};
```

**Step 4: 创建 LLM Provider**

Create `src/ai/providers/llm.ts`:
```typescript
import { createOpenAI } from '@ai-sdk/openai';
import type { AIProviderConfig } from './config';
import { DEFAULT_AI_CONFIG } from './config';

/** 创建 LLM Provider 实例 */
export function createLLMProvider(config: AIProviderConfig) {
  if (!config.apiKey) {
    throw new Error('AI API Key 未配置');
  }

  const baseURL = config.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.minimax.chat/v1';

  const provider = createOpenAI({
    baseURL,
    apiKey: config.apiKey,
  });

  return {
    /** 根据任务类型获取模型 */
    getModel(task: 'fast' | 'smart' | 'cheap') {
      const modelId = config.models[task] || DEFAULT_AI_CONFIG.models[task];
      return provider(modelId);
    },
    provider,
  };
}
```

**Step 5: 创建统一导出**

Create `src/ai/index.ts`:
```typescript
export { createLLMProvider } from './providers/llm';
export { DEFAULT_AI_CONFIG } from './providers/config';
export type { AIProviderConfig } from './providers/config';
export type { AISkill, AIContext, AITaskStatus, AITaskLog } from './skills/types';
```

**Step 6: 验证**

Run: `pnpm lint`

**Step 7: 提交**

```bash
git add src/ai/ package.json pnpm-lock.yaml
git commit -m "feat(ai): AI 模块骨架 + Vercel AI SDK 集成"
```

---

## Task 3: AI 数据库表 + 配置持久化

**Files:**
- Modify: `src/main/db/schema.ts` — 添加 AI 相关表
- Modify: `src/main/db/index.ts` — 添加建表语句
- Create: `src/ai/providers/db.ts` — AI 数据库操作
- Test: `tests/ai-db.test.ts`

**Step 1: 写测试**

Create `tests/ai-db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AIDatabase } from '../src/ai/providers/db';

describe('AIDatabase', () => {
  let sqlite: Database.Database;
  let aiDb: AIDatabase;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    aiDb = new AIDatabase(sqlite);
    aiDb.initTables();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('保存和读取 AI 设置', () => {
    aiDb.setSetting('apiKey', 'test-key-123');
    expect(aiDb.getSetting('apiKey')).toBe('test-key-123');
  });

  it('读取不存在的设置返回 null', () => {
    expect(aiDb.getSetting('nonexistent')).toBeNull();
  });

  it('更新已有设置', () => {
    aiDb.setSetting('apiKey', 'old-key');
    aiDb.setSetting('apiKey', 'new-key');
    expect(aiDb.getSetting('apiKey')).toBe('new-key');
  });

  it('插入和查询任务日志', () => {
    const log = aiDb.insertTaskLog({
      taskType: 'summarize',
      status: 'completed',
      inputJson: '{"articleId":"1"}',
      outputJson: '{"summary":"test"}',
      tokenCount: 100,
      costUsd: 0.001,
    });

    expect(log.id).toBeDefined();
    expect(log.taskType).toBe('summarize');

    const logs = aiDb.listTaskLogs(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].tokenCount).toBe(100);
  });

  it('查询最近 N 条任务日志', () => {
    for (let i = 0; i < 5; i++) {
      aiDb.insertTaskLog({
        taskType: `task-${i}`,
        status: 'completed',
        inputJson: '{}',
        outputJson: '{}',
        tokenCount: i * 10,
        costUsd: 0,
      });
    }

    const logs = aiDb.listTaskLogs(3);
    expect(logs).toHaveLength(3);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm test tests/ai-db.test.ts`
Expected: FAIL — `AIDatabase` 不存在

**Step 3: 实现 AIDatabase**

Create `src/ai/providers/db.ts`:
```typescript
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface InsertTaskLogInput {
  taskType: string;
  status: string;
  inputJson: string;
  outputJson: string | null;
  tracesJson?: string | null;
  tokenCount: number;
  costUsd: number;
  errorText?: string | null;
  metadataJson?: string | null;
}

export interface TaskLogRow {
  id: string;
  taskType: string;
  status: string;
  inputJson: string;
  outputJson: string | null;
  tracesJson: string | null;
  tokenCount: number;
  costUsd: number;
  errorText: string | null;
  metadataJson: string | null;
  createdAt: string;
}

export class AIDatabase {
  constructor(private sqlite: Database.Database) {}

  /** 初始化 AI 相关表 */
  initTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ai_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_task_logs (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_json TEXT,
        output_json TEXT,
        traces_json TEXT,
        token_count INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        error_text TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_task_logs_type ON ai_task_logs(task_type);
      CREATE INDEX IF NOT EXISTS idx_ai_task_logs_created ON ai_task_logs(created_at);
    `);
  }

  /** 读取设置 */
  getSetting(key: string): string | null {
    const row = this.sqlite.prepare(
      'SELECT value_json FROM ai_settings WHERE key = ?'
    ).get(key) as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) : null;
  }

  /** 保存设置（upsert） */
  setSetting(key: string, value: unknown): void {
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      INSERT INTO ai_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now);
  }

  /** 插入任务日志 */
  insertTaskLog(input: InsertTaskLogInput): TaskLogRow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      INSERT INTO ai_task_logs (id, task_type, status, input_json, output_json, traces_json, token_count, cost_usd, error_text, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.taskType, input.status,
      input.inputJson, input.outputJson ?? null,
      input.tracesJson ?? null, input.tokenCount, input.costUsd,
      input.errorText ?? null, input.metadataJson ?? null, now
    );
    return { id, ...input, tracesJson: input.tracesJson ?? null, errorText: input.errorText ?? null, metadataJson: input.metadataJson ?? null, createdAt: now };
  }

  /** 查询最近 N 条任务日志 */
  listTaskLogs(limit: number): TaskLogRow[] {
    return this.sqlite.prepare(
      'SELECT * FROM ai_task_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as TaskLogRow[];
  }
}
```

**Step 4: 运行测试确认通过**

Run: `pnpm test tests/ai-db.test.ts`
Expected: PASS

**Step 5: 在主库 schema 中添加 AI 表定义**

在 `src/main/db/schema.ts` 末尾添加：
```typescript
// ==================== AI 模块表 ====================
export const aiSettings = sqliteTable('ai_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const aiTaskLogs = sqliteTable('ai_task_logs', {
  id: text('id').primaryKey(),
  taskType: text('task_type').notNull(),
  status: text('status').notNull().default('pending'),
  inputJson: text('input_json'),
  outputJson: text('output_json'),
  tracesJson: text('traces_json'),
  tokenCount: integer('token_count').default(0),
  costUsd: real('cost_usd').default(0),
  errorText: text('error_text'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull(),
});
```

在 `src/main/db/index.ts` 的 `initTables()` 中添加建表语句（与 `AIDatabase.initTables()` 保持一致）。

**Step 6: 提交**

```bash
git add src/ai/providers/db.ts src/main/db/schema.ts src/main/db/index.ts tests/ai-db.test.ts
git commit -m "feat(ai): AI 数据库表 + 配置持久化"
```

---

## Task 4: IPC 桥接层（AI 设置 + Skill 调用）

**Files:**
- Modify: `src/shared/ipc-channels.ts` — 添加 AI channels
- Modify: `src/shared/types.ts` — 添加 AI 相关类型和 ElectronAPI 方法
- Create: `src/main/ipc/ai-handlers.ts` — AI IPC handlers
- Modify: `src/main/ipc/index.ts` — 注册 AI handlers
- Modify: `src/preload.ts` — 添加 AI 桥接
- Modify: `src/shared/global.d.ts` — 如需更新

**Step 1: 添加 AI IPC Channels**

在 `src/shared/ipc-channels.ts` 中添加：
```typescript
  // AI
  AI_SETTINGS_GET: 'ai:settings:get',
  AI_SETTINGS_SET: 'ai:settings:set',
  AI_SUMMARIZE: 'ai:summarize',
  AI_TRANSLATE: 'ai:translate',
  AI_AUTO_TAG: 'ai:autoTag',
  AI_TASK_LOGS: 'ai:taskLogs',
```

**Step 2: 添加 AI 共享类型**

在 `src/shared/types.ts` 中添加：
```typescript
// ==================== AI 模块类型 ====================
export interface AISettingsData {
  provider: 'openrouter' | 'minimax';
  apiKey: string;
  models: {
    fast: string;
    smart: string;
    cheap: string;
  };
}

export interface AISummarizeInput {
  articleId: string;
  language?: string;
}

export interface AISummarizeResult {
  summary: string;
  tokenCount: number;
}

export interface AITranslateInput {
  articleId: string;
  targetLanguage: string;
}

export interface AITranslateResult {
  translatedTitle: string;
  translatedContent: string;
  tokenCount: number;
}

export interface AIAutoTagInput {
  articleId: string;
}

export interface AIAutoTagResult {
  tags: string[];
  tokenCount: number;
}

export interface AITaskLogItem {
  id: string;
  taskType: string;
  status: string;
  tokenCount: number;
  costUsd: number;
  createdAt: string;
}
```

在 `ElectronAPI` 接口中添加：
```typescript
  // AI 操作
  aiSettingsGet: () => Promise<AISettingsData>;
  aiSettingsSet: (settings: Partial<AISettingsData>) => Promise<void>;
  aiSummarize: (input: AISummarizeInput) => Promise<AISummarizeResult>;
  aiTranslate: (input: AITranslateInput) => Promise<AITranslateResult>;
  aiAutoTag: (input: AIAutoTagInput) => Promise<AIAutoTagResult>;
  aiTaskLogs: (limit?: number) => Promise<AITaskLogItem[]>;
```

**Step 3: 创建 AI IPC handlers**

Create `src/main/ipc/ai-handlers.ts`:
```typescript
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { AIDatabase } from '../../ai/providers/db';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import type { AIProviderConfig } from '../../ai/providers/config';
import type { AISummarizeInput, AITranslateInput, AIAutoTagInput } from '../../shared/types';

function getAIDatabase(): AIDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  const aiDb = new AIDatabase(sqlite);
  return aiDb;
}

function loadAIConfig(aiDb: AIDatabase): AIProviderConfig {
  const saved = aiDb.getSetting('aiConfig');
  if (saved && typeof saved === 'object') {
    return { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) };
  }
  return DEFAULT_AI_CONFIG;
}

export function registerAIHandlers() {
  // 设置
  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_GET, async () => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    return {
      provider: config.provider,
      apiKey: config.apiKey,
      models: config.models,
    };
  });

  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_SET, async (_event, partial) => {
    const aiDb = getAIDatabase();
    const current = loadAIConfig(aiDb);
    const updated = { ...current, ...partial };
    aiDb.setSetting('aiConfig', updated);
  });

  // 摘要
  ipcMain.handle(IPC_CHANNELS.AI_SUMMARIZE, async (_event, input: AISummarizeInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    // 获取文章内容
    const { getDatabase } = await import('../db');
    const { articles } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    const contentText = article.contentText || article.content || article.summary || '';
    const lang = input.language || 'zh-CN';

    const result = await generateObject({
      model: llm.getModel('smart'),
      schema: z.object({
        summary: z.string().describe('文章摘要，200-400字'),
      }),
      prompt: `请用${lang === 'zh-CN' ? '中文' : lang}为以下文章写一段 200-400 字的摘要：\n\n标题：${article.title}\n\n${contentText.slice(0, 8000)}`,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;
    aiDb.insertTaskLog({
      taskType: 'summarize',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { summary: result.object.summary, tokenCount };
  });

  // 翻译
  ipcMain.handle(IPC_CHANNELS.AI_TRANSLATE, async (_event, input: AITranslateInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    const { getDatabase } = await import('../db');
    const { articles } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    const contentText = article.contentText || article.content || '';

    const result = await generateObject({
      model: llm.getModel('cheap'),
      schema: z.object({
        translatedTitle: z.string(),
        translatedContent: z.string(),
      }),
      prompt: `将以下内容翻译为${input.targetLanguage}。保持原文格式。\n\n标题：${article.title}\n\n${contentText.slice(0, 8000)}`,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;
    aiDb.insertTaskLog({
      taskType: 'translate',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { ...result.object, tokenCount };
  });

  // 自动标签
  ipcMain.handle(IPC_CHANNELS.AI_AUTO_TAG, async (_event, input: AIAutoTagInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    const { getDatabase } = await import('../db');
    const { articles, tags } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    // 获取已有标签列表供 AI 参考
    const existingTags = await db.select().from(tags).all();
    const tagNames = existingTags.map(t => t.name);

    const contentText = article.contentText || article.content || article.summary || '';

    const result = await generateObject({
      model: llm.getModel('fast'),
      schema: z.object({
        tags: z.array(z.string()).describe('3-5 个最相关的标签'),
      }),
      prompt: `基于以下文章内容，推荐 3-5 个最相关的标签。${tagNames.length > 0 ? `优先从已有标签中选择：[${tagNames.join(', ')}]。` : ''}如果已有标签不够匹配，可以建议新标签。\n\n标题：${article.title}\n\n${contentText.slice(0, 4000)}`,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;
    aiDb.insertTaskLog({
      taskType: 'auto_tag',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { tags: result.object.tags, tokenCount };
  });

  // 任务日志
  ipcMain.handle(IPC_CHANNELS.AI_TASK_LOGS, async (_event, limit?: number) => {
    const aiDb = getAIDatabase();
    return aiDb.listTaskLogs(limit ?? 20);
  });
}
```

**Step 4: 注册 AI handlers**

在 `src/main/ipc/index.ts` 添加：
```typescript
import { registerAIHandlers } from './ai-handlers';
// 在 registerAllIpcHandlers() 中添加：
registerAIHandlers();
```

**Step 5: 添加 preload 桥接**

在 `src/preload.ts` 添加 AI 方法：
```typescript
  // AI
  aiSettingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_GET),
  aiSettingsSet: (settings) => ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_SET, settings),
  aiSummarize: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_SUMMARIZE, input),
  aiTranslate: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_TRANSLATE, input),
  aiAutoTag: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_AUTO_TAG, input),
  aiTaskLogs: (limit) => ipcRenderer.invoke(IPC_CHANNELS.AI_TASK_LOGS, limit),
```

**Step 6: 在 db/index.ts 的 initTables 中添加 AI 表初始化**

在 `initTables()` 函数中调用 `AIDatabase` 的初始化或直接添加 SQL 建表语句。

**Step 7: 验证**

Run: `pnpm lint`

**Step 8: 提交**

```bash
git add src/main/ipc/ai-handlers.ts src/main/ipc/index.ts src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/db/index.ts
git commit -m "feat(ai): IPC 桥接层 - AI 设置/摘要/翻译/标签"
```

---

## Task 5: AI 设置面板 UI

**Files:**
- Modify: `src/renderer/components/PreferencesDialog.tsx` — 添加 AI 设置区域
- Modify: `src/locales/zh.json` — 添加 AI 相关中文翻译
- Modify: `src/locales/en.json` — 添加 AI 相关英文翻译

**Step 1: 添加国际化文案**

在 `src/locales/zh.json` 中添加：
```json
"ai": {
  "settings": "AI 设置",
  "provider": "AI 服务商",
  "apiKey": "API Key",
  "apiKeyPlaceholder": "输入你的 API Key",
  "modelFast": "快速模型",
  "modelSmart": "智能模型",
  "modelCheap": "经济模型",
  "save": "保存",
  "saved": "已保存",
  "testConnection": "测试连接",
  "connectionOk": "连接成功",
  "connectionFailed": "连接失败",
  "notConfigured": "未配置",
  "summarize": "AI 摘要",
  "translate": "AI 翻译",
  "autoTag": "AI 标签",
  "generating": "生成中...",
  "translateTo": "翻译为",
  "taskLogs": "AI 调用记录",
  "tokenUsage": "Token 用量",
  "noLogs": "暂无调用记录"
}
```

在 `src/locales/en.json` 中添加对应英文。

**Step 2: 在 PreferencesDialog 中添加 AI 设置区域**

在 `src/renderer/components/PreferencesDialog.tsx` 中添加一个 AI 设置区块：
- Provider 选择（openrouter / minimax 下拉）
- API Key 输入（password 类型，带显示/隐藏切换）
- 三个模型 ID 输入（fast/smart/cheap）
- 保存按钮
- 简单的调用日志展示（最近 10 条）

**Step 3: 验证**

Run: `pnpm start` — 手动验证设置面板可正常显示和保存

**Step 4: 提交**

```bash
git add src/renderer/components/PreferencesDialog.tsx src/locales/zh.json src/locales/en.json
git commit -m "feat(ai): AI 设置面板 UI"
```

---

## Task 6: 文章详情页 AI 操作按钮

**Files:**
- Modify: `src/renderer/components/DetailPanel.tsx` — 在 info tab 添加 AI 操作按钮

**Step 1: 在 DetailPanel 中添加 AI 操作区域**

在 `info` tab 的元信息区域下方添加 AI 操作按钮组：

- **AI 摘要** 按钮：点击调用 `window.electronAPI.aiSummarize({ articleId })`，结果显示在按钮下方
- **AI 翻译** 按钮：点击后展开语言选择（中文/英文/日文），选择后调用翻译
- **AI 标签** 按钮：点击调用自动标签，显示推荐标签列表，用户可一键添加

每个按钮有三种状态：
- 空闲：显示操作名称 + 图标
- 加载中：显示 spinner + "生成中..."
- 完成：显示结果内容

错误处理：
- API Key 未配置时，提示用户去设置中配置
- 调用失败时显示错误信息

**Step 2: 替换 chat tab 占位内容**

将 `chat` tab 的占位从 "AI（二期功能）" 改为 "AI 对话功能将在 Phase 2 中上线"（保留占位，但更新文案）。

**Step 3: 验证**

Run: `pnpm start` — 手动验证按钮显示、点击调用、结果展示

**Step 4: 提交**

```bash
git add src/renderer/components/DetailPanel.tsx
git commit -m "feat(ai): 文章详情页 AI 操作按钮（摘要/翻译/标签）"
```

---

## Task 7: 执行追踪服务

**Files:**
- Create: `src/ai/services/trace.ts`
- Test: `tests/ai-trace.test.ts`

**Step 1: 写测试**

Create `tests/ai-trace.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { AITraceCollector } from '../src/ai/services/trace';

describe('AITraceCollector', () => {
  it('记录并输出 trace step', () => {
    const collector = new AITraceCollector('summarize', 'test-task-1');
    collector.addStep({ type: 'llm_call', input: 'prompt...', output: 'result...', durationMs: 500, tokenCount: 150 });
    const trace = collector.finalize();

    expect(trace.taskType).toBe('summarize');
    expect(trace.steps).toHaveLength(1);
    expect(trace.totalTokens).toBe(150);
    expect(trace.totalDurationMs).toBeGreaterThan(0);
  });

  it('累计多步 token', () => {
    const collector = new AITraceCollector('chat', 'test-2');
    collector.addStep({ type: 'llm_call', input: '', output: '', durationMs: 100, tokenCount: 50 });
    collector.addStep({ type: 'tool_call', input: '', output: '', durationMs: 200, tokenCount: 30 });
    const trace = collector.finalize();

    expect(trace.steps).toHaveLength(2);
    expect(trace.totalTokens).toBe(80);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm test tests/ai-trace.test.ts`

**Step 3: 实现 trace 服务**

Create `src/ai/services/trace.ts`:
```typescript
export interface AITraceStep {
  type: 'llm_call' | 'tool_call' | 'error';
  input: string;
  output: string;
  durationMs: number;
  tokenCount: number;
  error?: string;
}

export interface AIExecutionTrace {
  taskId: string;
  taskType: string;
  steps: AITraceStep[];
  totalTokens: number;
  totalDurationMs: number;
  startedAt: string;
  completedAt: string;
}

export class AITraceCollector {
  private steps: AITraceStep[] = [];
  private startedAt = new Date().toISOString();

  constructor(
    private taskType: string,
    private taskId: string,
  ) {}

  addStep(step: AITraceStep) {
    this.steps.push(step);
  }

  finalize(): AIExecutionTrace {
    return {
      taskId: this.taskId,
      taskType: this.taskType,
      steps: this.steps,
      totalTokens: this.steps.reduce((sum, s) => sum + s.tokenCount, 0),
      totalDurationMs: this.steps.reduce((sum, s) => sum + s.durationMs, 0),
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
```

**Step 4: 运行测试确认通过**

Run: `pnpm test tests/ai-trace.test.ts`
Expected: PASS

**Step 5: 更新 index 导出**

在 `src/ai/index.ts` 添加：
```typescript
export { AITraceCollector } from './services/trace';
export type { AITraceStep, AIExecutionTrace } from './services/trace';
```

**Step 6: 提交**

```bash
git add src/ai/services/trace.ts tests/ai-trace.test.ts src/ai/index.ts
git commit -m "feat(ai): 执行追踪服务"
```

---

## Task 8: 集成测试 + 收尾

**Files:**
- Test: `tests/ai-llm-provider.test.ts` — LLM Provider 单元测试
- Modify: `src/ai/index.ts` — 确认所有导出完整

**Step 1: LLM Provider 单元测试**

Create `tests/ai-llm-provider.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '../src/ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../src/ai/providers/config';

describe('createLLMProvider', () => {
  it('无 API Key 时抛出错误', () => {
    expect(() => createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: '' }))
      .toThrow('AI API Key 未配置');
  });

  it('有 API Key 时成功创建 provider', () => {
    const llm = createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: 'test-key' });
    expect(llm.getModel).toBeDefined();
    expect(typeof llm.getModel).toBe('function');
  });

  it('getModel 返回对应任务类型的模型', () => {
    const llm = createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: 'test-key' });
    const fastModel = llm.getModel('fast');
    const smartModel = llm.getModel('smart');
    expect(fastModel).toBeDefined();
    expect(smartModel).toBeDefined();
  });
});
```

**Step 2: 运行全部 AI 测试**

Run: `pnpm test tests/ai-*.test.ts`
Expected: 全部 PASS

**Step 3: 运行 lint 确认无错误**

Run: `pnpm lint`

**Step 4: 提交**

```bash
git add tests/ai-llm-provider.test.ts
git commit -m "test(ai): LLM Provider 单元测试"
```

**Step 5: 验证全量测试**

Run: `pnpm test`
Expected: 所有测试通过（包括既有测试和新增 AI 测试）

---

## 总结

| Task | 内容 | 关键产出 |
|------|------|----------|
| 1 | 清理旧 Agent 残留 | 干净的代码库 |
| 2 | AI 模块骨架 + 依赖安装 | `src/ai/` 目录 + Vercel AI SDK |
| 3 | AI 数据库表 + 配置持久化 | `AIDatabase` + 2 张表 + 测试 |
| 4 | IPC 桥接层 | handlers + channels + preload |
| 5 | AI 设置面板 UI | PreferencesDialog AI 区域 |
| 6 | 文章详情页 AI 按钮 | DetailPanel 摘要/翻译/标签按钮 |
| 7 | 执行追踪服务 | `AITraceCollector` + 测试 |
| 8 | 集成测试 + 收尾 | LLM Provider 测试 + 全量验证 |
