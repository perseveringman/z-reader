import { getSqlite } from '../db';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { getEmbeddingConfig } from '../../ai/providers/config';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createChunkingService } from '../../ai/services/chunking';
import { createIngestionPipeline } from '../../ai/services/ingestion';

/**
 * 异步触发文章 RAG 索引
 * 当文章被保存到 Library 时自动调用
 * 不阻塞主流程，错误静默处理
 */
export async function triggerRAGIndexForArticle(article: {
  id: string;
  contentText?: string | null;
  title?: string | null;
  author?: string | null;
}): Promise<void> {
  // 没有文本内容则跳过
  const text = article.contentText;
  if (!text || text.trim().length === 0) {
    return;
  }

  const sqlite = getSqlite();
  if (!sqlite) return;

  // 检查 Embedding 配置
  const embeddingConfig = getEmbeddingConfig(sqlite);
  if (!embeddingConfig) {
    // Embedding API Key 未配置，跳过自动索引
    return;
  }

  // 构建索引
  const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
  ragDb.initTables();

  const embeddingService = createEmbeddingService(embeddingConfig);
  const chunkingService = createChunkingService();
  const pipeline = createIngestionPipeline({
    ragDb,
    chunkingService,
    embeddingService,
  });

  const result = await pipeline.ingest({
    type: 'article',
    id: article.id,
    text,
    metadata: {
      title: article.title ?? undefined,
      author: article.author ?? undefined,
    },
  });

  if (result.success) {
    console.log(`RAG indexed article "${article.title ?? article.id}": ${result.chunksCreated} chunks, ${result.embeddingsGenerated} embeddings`);
  } else {
    console.warn(`RAG index failed for article "${article.title ?? article.id}": ${result.error}`);
  }
}
