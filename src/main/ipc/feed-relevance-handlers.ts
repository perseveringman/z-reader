import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getDatabase, getSqlite } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { getEmbeddingConfig } from '../../ai/providers/config';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createFeedRelevanceService } from '../../ai/services/feed-relevance';
import type {
  FeedRelevanceComputeInput,
  FeedRelevanceBatchInput,
  FeedRelevanceResult,
  FeedRelevanceInfo,
} from '../../shared/types';

/**
 * 辅助: 将 FeedRelevanceInfo 合并到 articles.metadata JSON 中
 */
function mergeMetadata(existing: string | null | undefined, relevance: FeedRelevanceInfo): string {
  let metadata: Record<string, unknown> = {};
  if (existing) {
    try {
      metadata = JSON.parse(existing);
    } catch {
      metadata = {};
    }
  }
  metadata.feedRelevance = relevance;
  return JSON.stringify(metadata);
}

export function registerFeedRelevanceHandlers() {
  /**
   * FEED_RELEVANCE_COMPUTE — 单篇文章计算相关度
   */
  ipcMain.handle(
    IPC_CHANNELS.FEED_RELEVANCE_COMPUTE,
    async (_event, input: FeedRelevanceComputeInput): Promise<FeedRelevanceResult> => {
      const db = getDatabase();
      const sqlite = getSqlite();
      if (!db || !sqlite) throw new Error('Database not initialized');

      // 获取文章
      const [article] = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.id, input.articleId));
      if (!article) throw new Error(`Article not found: ${input.articleId}`);

      // 检查 Embedding 配置
      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) {
        throw new Error('Embedding API Key 未配置');
      }

      // 创建服务
      const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
      ragDb.initTables();
      const embeddingService = createEmbeddingService(embeddingConfig);
      const relevanceService = createFeedRelevanceService({
        embeddingService,
        ragDb,
        sqlite,
      });

      // 计算相关度
      const relevance = await relevanceService.computeRelevance(
        article.title ?? '',
        (article.contentText ?? '').slice(0, 2000)
      );

      // 存储到 metadata
      const newMetadata = mergeMetadata(article.metadata, relevance);
      await db
        .update(schema.articles)
        .set({ metadata: newMetadata, updatedAt: new Date().toISOString() })
        .where(eq(schema.articles.id, input.articleId));

      return { articleId: input.articleId, relevance };
    }
  );

  /**
   * FEED_RELEVANCE_BATCH — 批量计算相关度
   */
  ipcMain.handle(
    IPC_CHANNELS.FEED_RELEVANCE_BATCH,
    async (_event, input: FeedRelevanceBatchInput): Promise<FeedRelevanceResult[]> => {
      const db = getDatabase();
      const sqlite = getSqlite();
      if (!db || !sqlite) throw new Error('Database not initialized');

      // 检查 Embedding 配置
      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) {
        throw new Error('Embedding API Key 未配置');
      }

      // 创建服务（复用同一实例）
      const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
      ragDb.initTables();
      const embeddingService = createEmbeddingService(embeddingConfig);
      const relevanceService = createFeedRelevanceService({
        embeddingService,
        ragDb,
        sqlite,
      });

      const results: FeedRelevanceResult[] = [];

      for (const articleId of input.articleIds) {
        try {
          const [article] = await db
            .select()
            .from(schema.articles)
            .where(eq(schema.articles.id, articleId));
          if (!article) continue;

          const relevance = await relevanceService.computeRelevance(
            article.title ?? '',
            (article.contentText ?? '').slice(0, 2000)
          );

          // 存储
          const newMetadata = mergeMetadata(article.metadata, relevance);
          await db
            .update(schema.articles)
            .set({ metadata: newMetadata, updatedAt: new Date().toISOString() })
            .where(eq(schema.articles.id, articleId));

          results.push({ articleId, relevance });
        } catch (error) {
          console.error(`Feed relevance compute failed for ${articleId}:`, error);
        }
      }

      return results;
    }
  );
}
