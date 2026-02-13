import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { AIDatabase } from '../../ai/providers/db';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import type { AIProviderConfig } from '../../ai/providers/config';
import type { AISummarizeInput, AITranslateInput, AIAutoTagInput, AITaskLogItem } from '../../shared/types';
import type { TaskLogRow } from '../../ai/providers/db';

/** 获取 AI 数据库实例 */
function getAIDatabase(): AIDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  return new AIDatabase(sqlite);
}

/** 加载 AI 配置（合并默认值与用户保存的配置） */
function loadAIConfig(aiDb: AIDatabase): AIProviderConfig {
  const saved = aiDb.getSetting('aiConfig');
  if (saved && typeof saved === 'object') {
    return { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) };
  }
  return DEFAULT_AI_CONFIG;
}

/** 将 snake_case 的 TaskLogRow 转换为 camelCase 的 AITaskLogItem */
function mapTaskLogRow(row: TaskLogRow): AITaskLogItem {
  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    tokenCount: row.token_count,
    costUsd: row.cost_usd,
    createdAt: row.created_at,
  };
}

export function registerAIHandlers() {
  // 获取 AI 设置
  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_GET, async () => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    return {
      provider: config.provider,
      apiKey: config.apiKey,
      models: config.models,
    };
  });

  // 保存 AI 设置
  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_SET, async (_event, partial) => {
    const aiDb = getAIDatabase();
    const current = loadAIConfig(aiDb);
    const updated = { ...current, ...partial };
    aiDb.setSetting('aiConfig', updated);
  });

  // 摘要生成
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

  // 任务日志查询
  ipcMain.handle(IPC_CHANNELS.AI_TASK_LOGS, async (_event, limit?: number) => {
    const aiDb = getAIDatabase();
    const rows = aiDb.listTaskLogs(limit ?? 20);
    return rows.map(mapTaskLogRow);
  });
}
