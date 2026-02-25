import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { KGDatabase } from '../../ai/providers/kg-db';
import { AIDatabase } from '../../ai/providers/db';
import { DEFAULT_AI_CONFIG, getEmbeddingConfig } from '../../ai/providers/config';
import { createLLMProvider } from '../../ai/providers/llm';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createHybridRetriever } from '../../ai/services/retriever';
import { createKGService } from '../../ai/services/kg-service';
import { createWritingAssistService } from '../../ai/services/writing-assist';
import type { AIProviderConfig } from '../../ai/providers/config';
import type { WritingAssistSearchInput, WritingAssistGenerateInput } from '../../shared/types';

/**
 * 辅助: 获取 AI 配置并验证
 */
function getAIConfig(sqlite: ReturnType<typeof getSqlite>): AIProviderConfig {
  if (!sqlite) throw new Error('Database not initialized');

  const aiDb = new AIDatabase(sqlite);
  const saved = aiDb.getSetting('aiConfig');
  const config: AIProviderConfig =
    saved && typeof saved === 'object'
      ? { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) }
      : DEFAULT_AI_CONFIG;

  if (!config.apiKey) {
    throw new Error('AI API Key 未配置，请在设置中配置后使用');
  }

  return config;
}

export function registerWritingAssistHandlers() {
  /**
   * WRITING_ASSIST_SEARCH — 搜索相关材料（request-response）
   */
  ipcMain.handle(
    IPC_CHANNELS.WRITING_ASSIST_SEARCH,
    async (_event, input: WritingAssistSearchInput) => {
      const sqlite = getSqlite();
      if (!sqlite) throw new Error('Database not initialized');

      const config = getAIConfig(sqlite);

      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) throw new Error('Embedding API Key 未配置');

      // 初始化服务
      const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
      ragDb.initTables();
      const embeddingService = createEmbeddingService(embeddingConfig);
      const retriever = createHybridRetriever(sqlite, ragDb, embeddingService);

      // KG 服务（可选）
      let kgSearchEntities: ((query: string) => ReturnType<ReturnType<typeof createKGService>['searchEntities']>) | undefined;
      try {
        const kgDb = new KGDatabase(sqlite);
        kgDb.initTables();
        const kgService = createKGService(kgDb);
        kgSearchEntities = (query: string) => kgService.searchEntities(query);
      } catch {
        // KG 未初始化，忽略
      }

      const llm = createLLMProvider(config);
      const writingService = createWritingAssistService({
        retriever,
        sqlite,
        getModel: (task) => llm.getModel(task),
        kgSearchEntities,
      });

      return writingService.search(input.topic, input.topK);
    }
  );

  /**
   * WRITING_ASSIST_GENERATE — 流式生成写作素材
   * 使用 ipcMain.on + event.sender.send 模式
   */
  ipcMain.on(
    IPC_CHANNELS.WRITING_ASSIST_GENERATE,
    async (event, input: WritingAssistGenerateInput) => {
      try {
        const sqlite = getSqlite();
        if (!sqlite) throw new Error('Database not initialized');

        const config = getAIConfig(sqlite);

        const embeddingConfig = getEmbeddingConfig(sqlite);
        if (!embeddingConfig) throw new Error('Embedding API Key 未配置');

        // 初始化服务
        const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
        ragDb.initTables();
        const embeddingService = createEmbeddingService(embeddingConfig);
        const retriever = createHybridRetriever(sqlite, ragDb, embeddingService);

        const llm = createLLMProvider(config);
        const writingService = createWritingAssistService({
          retriever,
          sqlite,
          getModel: (task) => llm.getModel(task),
        });

        // 流式生成
        for await (const chunk of writingService.generateStream(input.topic, input.searchResults)) {
          if (event.sender.isDestroyed()) break;
          event.sender.send(IPC_CHANNELS.WRITING_ASSIST_STREAM, chunk);
        }
      } catch (error) {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.WRITING_ASSIST_STREAM, {
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  );
}
