import { getDatabase, getSqlite } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { getEmbeddingConfig } from '../../ai/providers/config';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createFeedRelevanceService } from '../../ai/services/feed-relevance';
import { loadSettings } from '../services/settings-service';

/**
 * 异步触发 Feed 文章相关度计算
 * 当 Feed 拉取到新文章时自动调用
 * 需检查 feedSmartRecommendEnabled 设置
 * 不阻塞主流程，错误静默处理
 */
export async function triggerFeedRelevanceCompute(article: {
  id: string;
  title?: string | null;
  contentText?: string | null;
}): Promise<void> {
  const db = getDatabase();
  const sqlite = getSqlite();
  if (!db || !sqlite) return;

  // 检查功能是否启用（从 settings JSON 文件读取）
  try {
    const appSettings = loadSettings();
    if (!appSettings.feedSmartRecommendEnabled) {
      return; // 功能未启用
    }
  } catch {
    return; // 设置读取失败，默认关闭
  }

  // 没有内容则跳过
  if (!article.contentText || article.contentText.trim().length === 0) {
    return;
  }

  // 检查 Embedding 配置
  const embeddingConfig = getEmbeddingConfig(sqlite);
  if (!embeddingConfig) {
    return; // Embedding API Key 未配置，跳过
  }

  // 创建服务
  const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
  ragDb.initTables();

  // 检查是否有 Library 索引数据（没有则跳过，避免无意义计算）
  const hasLibraryChunks = sqlite.prepare(
    "SELECT 1 FROM chunks WHERE source_type = 'article' LIMIT 1"
  ).get();
  if (!hasLibraryChunks) {
    return;
  }

  const embeddingService = createEmbeddingService(embeddingConfig);
  const relevanceService = createFeedRelevanceService({
    embeddingService,
    ragDb,
    sqlite,
  });

  const relevance = await relevanceService.computeRelevance(
    article.title ?? '',
    (article.contentText ?? '').slice(0, 2000)
  );

  // 合并到 metadata
  const [existing] = await db
    .select({ metadata: schema.articles.metadata })
    .from(schema.articles)
    .where(eq(schema.articles.id, article.id));

  let metadata: Record<string, unknown> = {};
  if (existing?.metadata) {
    try {
      metadata = JSON.parse(existing.metadata);
    } catch {
      metadata = {};
    }
  }
  metadata.feedRelevance = relevance;

  await db
    .update(schema.articles)
    .set({ metadata: JSON.stringify(metadata), updatedAt: new Date().toISOString() })
    .where(eq(schema.articles.id, article.id));

  if (relevance.label !== 'none') {
    console.log(
      `Feed relevance: "${article.title}" → ${relevance.label} (${relevance.score}), matches: ${relevance.topMatches.join(', ')}`
    );
  }
}
