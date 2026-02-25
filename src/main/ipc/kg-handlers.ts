import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { KGDatabase } from '../../ai/providers/kg-db';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { AIDatabase } from '../../ai/providers/db';
import { createEntityExtractionService } from '../../ai/services/entity-extraction';
import { createKGIngestionPipeline } from '../../ai/services/kg-ingestion';
import { createKGService } from '../../ai/services/kg-service';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import type { AIProviderConfig } from '../../ai/providers/config';
import type { EntitySourceType } from '../../ai/providers/kg-db';
import type { EntityType } from '../../ai/providers/kg-db';
import type { KGExtractInput } from '../../shared/types';

/** KG 数据库单例（进程级） */
let kgDbInstance: KGDatabase | null = null;

/** 获取 KG 数据库实例 */
function getKGDatabase(): KGDatabase {
  if (kgDbInstance) return kgDbInstance;
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  kgDbInstance = new KGDatabase(sqlite);
  return kgDbInstance;
}

/** 获取 RAG 数据库实例（读取 chunks） */
function getRAGDatabase(): RAGDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  return new RAGDatabase(sqlite);
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

export function registerKGHandlers() {
  const kgDb = getKGDatabase();
  kgDb.initTables();

  // 手动触发实体抽取
  ipcMain.handle(
    IPC_CHANNELS.KG_EXTRACT,
    async (_event, input: KGExtractInput) => {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      // 从 RAG 获取 chunks
      const ragDb = getRAGDatabase();
      const chunks = ragDb.getChunksBySource(
        input.sourceType as EntitySourceType,
        input.sourceId
      );

      if (chunks.length === 0) {
        return {
          entitiesCreated: 0,
          entitiesUpdated: 0,
          relationsCreated: 0,
          relationsUpdated: 0,
          success: true,
          error: '没有找到 RAG chunks，请先索引该内容',
        };
      }

      // 创建抽取服务和管道
      const llm = createLLMProvider(config);
      const extractionService = createEntityExtractionService({
        getModel: (task) => llm.getModel(task),
      });
      const pipeline = createKGIngestionPipeline({
        kgDb,
        extractionService,
      });

      // 获取来源标题（用 chunk metadata 或 sourceId 回退）
      const firstChunkMeta = chunks[0].metadata_json
        ? JSON.parse(chunks[0].metadata_json)
        : {};
      const sourceTitle =
        firstChunkMeta.title || `${input.sourceType}:${input.sourceId}`;

      return pipeline.ingest({
        sourceType: input.sourceType as EntitySourceType,
        sourceId: input.sourceId,
        sourceTitle,
        chunks: chunks.map((c) => ({ chunkId: c.id, content: c.content })),
      });
    }
  );

  // 获取文章局部图谱
  ipcMain.handle(
    IPC_CHANNELS.KG_GET_ARTICLE_GRAPH,
    async (_event, sourceType: string, sourceId: string) => {
      const service = createKGService(kgDb);
      return service.getArticleGraph(
        sourceType as EntitySourceType,
        sourceId
      );
    }
  );

  // 获取全局概览图谱
  ipcMain.handle(
    IPC_CHANNELS.KG_GET_OVERVIEW,
    async (_event, topN?: number) => {
      const service = createKGService(kgDb);
      return service.getOverview(topN);
    }
  );

  // 搜索实体
  ipcMain.handle(
    IPC_CHANNELS.KG_SEARCH_ENTITIES,
    async (_event, query: string, type?: string) => {
      const service = createKGService(kgDb);
      const entities = service.searchEntities(
        query,
        type as EntityType | undefined
      );
      // 转换为前端友好的格式
      return entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        aliases: JSON.parse(e.aliases_json || '[]'),
        mentionCount: e.mention_count,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      }));
    }
  );

  // 获取实体子图
  ipcMain.handle(
    IPC_CHANNELS.KG_GET_SUBGRAPH,
    async (_event, entityId: string, depth?: number) => {
      const service = createKGService(kgDb);
      return service.getSubgraph(entityId, depth);
    }
  );

  // 获取图谱统计
  ipcMain.handle(IPC_CHANNELS.KG_GET_STATS, async () => {
    const service = createKGService(kgDb);
    return service.getStats();
  });

  // 删除来源的图谱数据
  ipcMain.handle(
    IPC_CHANNELS.KG_REMOVE,
    async (_event, sourceType: string, sourceId: string) => {
      kgDb.deleteEntitiesBySource(
        sourceType as EntitySourceType,
        sourceId
      );
    }
  );
}
