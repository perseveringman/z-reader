import type { RAGDatabase, ChunkSourceType } from '../providers/rag-db';
import type { ChunkingService } from './chunking';
import type { EmbeddingService } from './embedding';

/** 入库来源 */
export interface IngestSource {
  type: ChunkSourceType;
  id: string;
  text: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/** 入库结果 */
export interface IngestResult {
  sourceType: ChunkSourceType;
  sourceId: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  totalTokens: number;
  success: boolean;
  error?: string;
}

/** Ingestion Pipeline 依赖 */
export interface IngestionPipelineDeps {
  ragDb: RAGDatabase;
  chunkingService: ChunkingService;
  embeddingService: EmbeddingService;
}

/**
 * Ingestion Pipeline
 * 编排完整的内容入库流程：文本提取 -> 分块 -> Embedding -> 入库
 */
export class IngestionPipeline {
  constructor(private deps: IngestionPipelineDeps) {}

  /** 单条内容入库 */
  async ingest(source: IngestSource): Promise<IngestResult> {
    const { ragDb, chunkingService, embeddingService } = this.deps;
    const { type, id, text, metadata } = source;

    try {
      // 1. 删除旧的 chunks（如果存在）
      ragDb.deleteChunksBySource(type, id);

      // 2. 分块
      const chunkResults = chunkingService.chunk({
        text,
        sourceType: type,
        metadata,
        contextPrefix: source.title || undefined,
      });

      if (chunkResults.length === 0) {
        return {
          sourceType: type,
          sourceId: id,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          totalTokens: 0,
          success: true,
        };
      }

      // 3. 写入 chunks 表
      const chunkInputs = chunkResults.map((chunk, index) => ({
        sourceType: type,
        sourceId: id,
        chunkIndex: index,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: chunk.metadata,
      }));
      const chunkRows = ragDb.createChunks(chunkInputs);

      // 4. 如果 sqlite-vec 不可用，跳过 embedding
      if (!ragDb.isSqliteVecAvailable()) {
        return {
          sourceType: type,
          sourceId: id,
          chunksCreated: chunkRows.length,
          embeddingsGenerated: 0,
          totalTokens: 0,
          success: true,
        };
      }

      // 5. 生成 Embeddings
      const texts = chunkRows.map(c => c.content);
      const { embeddings, totalTokens } = await embeddingService.embedBatch(texts);

      // 6. 写入向量表并更新状态
      const embeddingItems = chunkRows.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: embeddings[index],
      }));
      ragDb.insertEmbeddings(embeddingItems);

      // 7. 更新 chunk 状态
      const modelInfo = embeddingService.getModelInfo();
      for (const chunk of chunkRows) {
        ragDb.updateChunkEmbeddingStatus(chunk.id, 'done', modelInfo.model);
      }

      return {
        sourceType: type,
        sourceId: id,
        chunksCreated: chunkRows.length,
        embeddingsGenerated: embeddings.length,
        totalTokens,
        success: true,
      };
    } catch (error) {
      // 标记失败状态
      try {
        const chunks = ragDb.getChunksBySource(type, id);
        for (const chunk of chunks) {
          if (chunk.embedding_status === 'pending') {
            ragDb.updateChunkEmbeddingStatus(chunk.id, 'failed');
          }
        }
      } catch {
        // 忽略清理错误
      }

      return {
        sourceType: type,
        sourceId: id,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        totalTokens: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 删除内容的向量索引 */
  remove(sourceType: ChunkSourceType, sourceId: string): void {
    this.deps.ragDb.deleteChunksBySource(sourceType, sourceId);
  }

  /** 处理待处理的 Embeddings（用于恢复失败任务） */
  async processPendingChunks(batchSize: number = 50): Promise<{
    processed: number;
    failed: number;
    totalTokens: number;
  }> {
    const { ragDb, embeddingService } = this.deps;

    if (!ragDb.isSqliteVecAvailable()) {
      return { processed: 0, failed: 0, totalTokens: 0 };
    }

    const pendingChunks = ragDb.getPendingChunks(batchSize);
    if (pendingChunks.length === 0) {
      return { processed: 0, failed: 0, totalTokens: 0 };
    }

    let processed = 0;
    let failed = 0;
    let totalTokens = 0;

    // 分批处理
    const texts = pendingChunks.map(c => c.content);
    try {
      const { embeddings, totalTokens: tokens } = await embeddingService.embedBatch(texts);
      totalTokens = tokens;

      const modelInfo = embeddingService.getModelInfo();
      const embeddingItems = pendingChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: embeddings[index],
      }));

      ragDb.insertEmbeddings(embeddingItems);

      for (const chunk of pendingChunks) {
        ragDb.updateChunkEmbeddingStatus(chunk.id, 'done', modelInfo.model);
        processed++;
      }
    } catch {
      for (const chunk of pendingChunks) {
        ragDb.updateChunkEmbeddingStatus(chunk.id, 'failed');
        failed++;
      }
    }

    return { processed, failed, totalTokens };
  }
}

/** 创建 Ingestion Pipeline 实例 */
export function createIngestionPipeline(deps: IngestionPipelineDeps): IngestionPipeline {
  return new IngestionPipeline(deps);
}
