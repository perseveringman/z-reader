import { getSqlite } from '../db';
import { KGDatabase } from '../../ai/providers/kg-db';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { AIDatabase } from '../../ai/providers/db';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import { createLLMProvider } from '../../ai/providers/llm';
import { createEntityExtractionService } from '../../ai/services/entity-extraction';
import { createKGIngestionPipeline } from '../../ai/services/kg-ingestion';
import type { AIProviderConfig } from '../../ai/providers/config';

/**
 * 异步触发文章知识图谱实体抽取
 * 当文章被保存到 Library 并完成 RAG 索引后自动调用
 * 依赖 RAG 的 chunks 数据（必须在 RAG 索引完成后调用）
 * 不阻塞主流程，错误静默处理
 */
export async function triggerKGExtractForArticle(article: {
  id: string;
  contentText?: string | null;
  title?: string | null;
}): Promise<void> {
  // 没有文本内容则跳过
  const text = article.contentText;
  if (!text || text.trim().length === 0) {
    return;
  }

  const sqlite = getSqlite();
  if (!sqlite) return;

  // 检查 AI 配置
  const aiDb = new AIDatabase(sqlite);
  const saved = aiDb.getSetting('aiConfig');
  const config: AIProviderConfig =
    saved && typeof saved === 'object'
      ? { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) }
      : DEFAULT_AI_CONFIG;

  if (!config.apiKey) {
    // API Key 未配置，跳过自动抽取
    return;
  }

  // 从 RAG 获取 chunks
  const ragDb = new RAGDatabase(sqlite);
  const chunks = ragDb.getChunksBySource('article', article.id);

  if (chunks.length === 0) {
    // RAG 尚未索引该文章，跳过
    return;
  }

  // 初始化 KG 数据库
  const kgDb = new KGDatabase(sqlite);
  kgDb.initTables();

  // 创建抽取服务和管道
  const llm = createLLMProvider(config);
  const extractionService = createEntityExtractionService({
    getModel: (task) => llm.getModel(task),
  });
  const pipeline = createKGIngestionPipeline({
    kgDb,
    extractionService,
  });

  const result = await pipeline.ingest({
    sourceType: 'article',
    sourceId: article.id,
    sourceTitle: article.title ?? article.id,
    chunks: chunks.map((c) => ({ chunkId: c.id, content: c.content })),
  });

  if (result.success) {
    console.log(
      `KG extracted for article "${article.title ?? article.id}": ${result.entitiesCreated} new entities, ${result.entitiesUpdated} updated, ${result.relationsCreated} new relations`
    );
  } else {
    console.warn(
      `KG extraction failed for article "${article.title ?? article.id}": ${result.error}`
    );
  }
}
