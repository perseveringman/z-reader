import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getDatabase, getSqlite } from '../db';
import { articles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AIDatabase } from '../../ai/providers/db';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import { ChatService } from '../../ai/services/chat';
import { createToolContext } from '../ai/tool-context-factory';
import type { AIProviderConfig } from '../../ai/providers/config';
import type {
  AISummarizeInput,
  AITranslateInput,
  AIAutoTagInput,
  AIExtractTopicsInput,
  AITaskLogItem,
  AITaskLogDetail,
  ChatSendInput,
  ChatSession,
} from '../../shared/types';
import type { TaskLogRow, ChatSessionRow } from '../../ai/providers/db';

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

/** 将 TaskLogRow 转换为包含完整详情的 AITaskLogDetail */
function mapTaskLogDetail(row: TaskLogRow): AITaskLogDetail {
  return {
    ...mapTaskLogRow(row),
    inputJson: row.input_json,
    outputJson: row.output_json,
    tracesJson: row.traces_json,
    errorText: row.error_text,
  };
}

/** 将 snake_case 的 ChatSessionRow 转换为 camelCase 的 ChatSession */
function mapChatSessionRow(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    articleId: row.article_id,
    messages: JSON.parse(row.messages_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

    // 将摘要写回文章
    await db.update(articles).set({ summary: result.object.summary }).where(eq(articles.id, input.articleId));

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
    const { articles, tags, articleTags } = await import('../db/schema');
    const { eq, and } = await import('drizzle-orm');
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

    // 将推荐标签关联到文章
    const { randomUUID } = await import('node:crypto');
    const now = new Date().toISOString();
    const allExistingTags = await db.select().from(tags).where(eq(tags.deletedFlg, 0)).all();
    const tagMap = new Map(allExistingTags.map(t => [t.name.toLowerCase(), t.id]));

    for (const tagName of result.object.tags) {
      let tagId = tagMap.get(tagName.toLowerCase());
      // 标签不存在则创建
      if (!tagId) {
        tagId = randomUUID();
        await db.insert(tags).values({
          id: tagId,
          name: tagName,
          parentId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      // 检查关联是否已存在
      const existing = await db.select().from(articleTags)
        .where(and(eq(articleTags.articleId, input.articleId), eq(articleTags.tagId, tagId)));
      if (existing.length === 0) {
        await db.insert(articleTags).values({
          articleId: input.articleId,
          tagId,
          createdAt: now,
        });
      }
    }

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

  // 任务日志详情
  ipcMain.handle(IPC_CHANNELS.AI_TASK_LOG_DETAIL, async (_event, logId: string) => {
    const aiDb = getAIDatabase();
    const row = aiDb.getTaskLog(logId);
    return row ? mapTaskLogDetail(row) : null;
  });

  // ==================== AI Chat 流式通信 ====================

  // 流式 Chat 发送（使用 ipcMain.on 而非 handle，支持持续推送 chunk）
  ipcMain.on(IPC_CHANNELS.AI_CHAT_SEND, async (event, input: ChatSendInput) => {
    try {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const llm = createLLMProvider(config);
      const toolCtx = createToolContext(getDatabase());
      const chatService = new ChatService({
        getModel: llm.getModel.bind(llm),
        toolContext: toolCtx,
        aiDb,
      });

      // 获取文章上下文（如有）
      let articleContext: string | null = null;
      if (input.articleId) {
        const db = getDatabase();
        const article = await db
          .select()
          .from(articles)
          .where(eq(articles.id, input.articleId))
          .get();
        if (article) {
          articleContext = article.contentText || article.summary || null;
        }
      }

      await chatService.sendMessage(
        input.sessionId,
        input.message,
        articleContext,
        (chunk) => {
          // 通过 event.sender.send 逐块推送到渲染进程
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AI_CHAT_STREAM, chunk);
          }
        },
      );
    } catch (err) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_CHAT_STREAM, {
          type: 'error',
          error: String(err),
        });
      }
    }
  });

  // Chat Session CRUD（使用 ipcMain.handle，返回 Promise）

  // 创建 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_CREATE,
    async (_event, articleId?: string) => {
      const aiDb = getAIDatabase();
      // 初始化 chat sessions 表（如尚未创建）
      aiDb.initTables();
      const row = aiDb.createChatSession(articleId);
      return mapChatSessionRow(row);
    },
  );

  // 查询 Chat 会话列表
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_SESSION_LIST, async () => {
    const aiDb = getAIDatabase();
    return aiDb.listChatSessions().map(mapChatSessionRow);
  });

  // 获取单个 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_GET,
    async (_event, id: string) => {
      const aiDb = getAIDatabase();
      const row = aiDb.getChatSession(id);
      return row ? mapChatSessionRow(row) : null;
    },
  );

  // 删除 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_DELETE,
    async (_event, id: string) => {
      const aiDb = getAIDatabase();
      aiDb.deleteChatSession(id);
    },
  );

  // ==================== AI 主题提取 ====================

  ipcMain.handle(
    IPC_CHANNELS.AI_EXTRACT_TOPICS,
    async (_event, input: AIExtractTopicsInput) => {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const { generateObject } = await import('ai');
      const { z } = await import('zod');
      const llm = createLLMProvider(config);

      const db = getDatabase();
      const article = await db
        .select()
        .from(articles)
        .where(eq(articles.id, input.articleId))
        .get();
      if (!article) throw new Error('文章不存在');

      const contentText =
        article.contentText || article.content || article.summary || '';

      const result = await generateObject({
        model: llm.getModel('fast'),
        schema: z.object({
          topics: z
            .array(z.string())
            .describe('文章的 3-5 个核心主题关键词'),
        }),
        prompt: `提取以下文章的 3-5 个核心主题关键词，返回简短的词组。\n\n标题：${article.title}\n\n${contentText.slice(0, 4000)}`,
      });

      const tokenCount = result.usage?.totalTokens ?? 0;

      aiDb.insertTaskLog({
        taskType: 'extract_topics',
        status: 'completed',
        inputJson: JSON.stringify(input),
        outputJson: JSON.stringify(result.object),
        tokenCount,
        costUsd: 0,
      });

      return { topics: result.object.topics, tokenCount };
    },
  );
}
