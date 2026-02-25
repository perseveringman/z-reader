import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getDatabase, getSqlite } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { AIDatabase } from '../../ai/providers/db';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createChunkingService } from '../../ai/services/chunking';
import { createIngestionPipeline } from '../../ai/services/ingestion';
import { createHybridRetriever } from '../../ai/services/retriever';
import { createContextBuilder } from '../../ai/services/context-builder';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG, getEmbeddingConfig } from '../../ai/providers/config';
import { streamText } from 'ai';
import type { AIProviderConfig } from '../../ai/providers/config';
import type { ChunkSourceType } from '../../ai/providers/rag-db';
import type { SearchQuery } from '../../ai/services/retriever';
import type { RAGChatSendInput } from '../../shared/types';

/** RAG 数据库单例（进程级） */
let ragDbInstance: RAGDatabase | null = null;

/** 获取 RAG 数据库实例 */
function getRAGDatabase(): RAGDatabase {
  if (ragDbInstance) return ragDbInstance;
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  const embeddingConfig = getEmbeddingConfig(sqlite);
  ragDbInstance = new RAGDatabase(sqlite, embeddingConfig?.dimensions);
  return ragDbInstance;
}

/** 获取 AI 数据库实例 */
function getAIDatabase(): AIDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  return new AIDatabase(sqlite);
}

/** 加载 AI 配置 */
function loadAIConfig(aiDb: AIDatabase): AIProviderConfig {
  const saved = aiDb.getSetting('aiConfig');
  if (saved && typeof saved === 'object') {
    return { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) };
  }
  return DEFAULT_AI_CONFIG;
}

export function registerRAGHandlers() {
  const ragDb = getRAGDatabase();
  ragDb.initTables();

  // 内容入库
  ipcMain.handle(
    IPC_CHANNELS.RAG_INGEST,
    async (
      _event,
      input: { sourceType: ChunkSourceType; sourceId: string; text: string; metadata?: Record<string, unknown> }
    ) => {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const sqlite = getSqlite();
      if (!sqlite) throw new Error('数据库未初始化');
      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) throw new Error('请先配置 Embedding API Key');

      const embeddingService = createEmbeddingService(embeddingConfig);
      const chunkingService = createChunkingService();
      const pipeline = createIngestionPipeline({
        ragDb,
        chunkingService,
        embeddingService,
      });

      return pipeline.ingest({
        type: input.sourceType,
        id: input.sourceId,
        text: input.text,
        metadata: input.metadata,
      });
    }
  );

  // 检索
  ipcMain.handle(
    IPC_CHANNELS.RAG_SEARCH,
    async (_event, query: SearchQuery) => {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const sqlite = getSqlite();
      if (!sqlite) throw new Error('数据库未初始化');

      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) throw new Error('请先配置 Embedding API Key');

      const embeddingService = createEmbeddingService(embeddingConfig);
      const retriever = createHybridRetriever(sqlite, ragDb, embeddingService);

      return retriever.search(query);
    }
  );

  // 删除索引
  ipcMain.handle(
    IPC_CHANNELS.RAG_REMOVE,
    async (_event, input: { sourceType: ChunkSourceType; sourceId: string }) => {
      ragDb.deleteChunksBySource(input.sourceType, input.sourceId);
    }
  );

  // 获取索引状态
  ipcMain.handle(
    IPC_CHANNELS.RAG_GET_STATUS,
    async (_event, input: { sourceType: ChunkSourceType; sourceId: string }) => {
      return ragDb.getSourceIndexStatus(input.sourceType, input.sourceId);
    }
  );

  // 处理待处理的 Embeddings
  ipcMain.handle(IPC_CHANNELS.RAG_PROCESS_PENDING, async () => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const sqlite = getSqlite();
    if (!sqlite) throw new Error('数据库未初始化');
    const embeddingConfig = getEmbeddingConfig(sqlite);
    if (!embeddingConfig) throw new Error('请先配置 Embedding API Key');

    const embeddingService = createEmbeddingService(embeddingConfig);
    const chunkingService = createChunkingService();
    const pipeline = createIngestionPipeline({
      ragDb,
      chunkingService,
      embeddingService,
    });

    return pipeline.processPendingChunks();
  });

  // RAG Chat（流式）
  ipcMain.on(IPC_CHANNELS.RAG_CHAT_SEND, async (event, input: RAGChatSendInput) => {
    try {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const sqlite = getSqlite();
      if (!sqlite) throw new Error('数据库未初始化');
      const db = getDatabase();

      // 1. 检索相关内容
      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) throw new Error('请先配置 Embedding API Key');

      const embeddingService = createEmbeddingService(embeddingConfig);
      const retriever = createHybridRetriever(sqlite, ragDb, embeddingService);
      const searchResults = await retriever.search({
        text: input.message,
        topK: 5,
        filters: input.filters,
      });

      // 2. 构建上下文
      const contextBuilder = createContextBuilder({
        maxTokens: 4000,
        includeReferences: true,
        getSourceTitle: async (sourceType, sourceId) => {
          if (sourceType === 'article') {
            const [article] = await db.select({ title: schema.articles.title })
              .from(schema.articles)
              .where(eq(schema.articles.id, sourceId));
            return article?.title ?? null;
          }
          return null;
        },
      });
      const context = await contextBuilder.build(searchResults);

      // 3. 构建系统提示
      const systemPrompt = `你是 Z-Reader 的 AI 助手，帮助用户管理和理解他们的 RSS 订阅内容。
你可以基于用户的个人知识库回答问题。
${context.text ? contextBuilder.buildSystemPromptSuffix(context.references) : ''}
${context.text ? `\n检索到的相关内容：\n\n${context.text}` : '未在知识库中找到相关内容，请基于通用知识回答。'}`;

      // 4. 调用 LLM
      const llm = createLLMProvider(config);
      const result = streamText({
        model: llm.getModel('smart'),
        system: systemPrompt,
        messages: [{ role: 'user', content: input.message }],
      });

      // 5. 流式推送
      let fullText = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.text;
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.RAG_CHAT_STREAM, {
              type: 'text-delta',
              textDelta: part.text,
            });
          }
        }
      }

      // 6. 完成
      const totalUsage = await result.usage;
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.RAG_CHAT_STREAM, {
          type: 'done',
          tokenCount: totalUsage?.totalTokens ?? 0,
          fullText,
          references: context.references,
        });
      }
    } catch (error) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.RAG_CHAT_STREAM, {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}
