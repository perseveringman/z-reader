import type { EmbeddingService } from './embedding';
import type { RAGDatabase, ChunkRow } from '../providers/rag-db';
import type { FeedRelevanceInfo } from '../../shared/types';
import type Database from 'better-sqlite3';

interface FeedRelevanceServiceDeps {
  embeddingService: EmbeddingService;
  ragDb: RAGDatabase;
  sqlite: Database.Database;
}

/**
 * Feed 智能推荐服务
 * 将 Feed 新文章与 Library 已有文章进行相关度比较
 * 通过向量相似度判断推荐优先级
 */
export function createFeedRelevanceService(deps: FeedRelevanceServiceDeps) {
  const { embeddingService, ragDb, sqlite } = deps;

  return {
    /**
     * 计算文章与 Library 的相关度
     * @param title 文章标题
     * @param contentPreview 文章内容预览（前 2000 字）
     */
    async computeRelevance(title: string, contentPreview: string): Promise<FeedRelevanceInfo> {
      const queryText = `${title}\n${contentPreview}`.slice(0, 2000);

      // 1. 生成查询向量
      const { embedding } = await embeddingService.embed(queryText);

      // 2. KNN 搜索所有 chunks（取多一些候选用于后过滤）
      const vectorResults = ragDb.searchVectors(embedding, 20);

      if (vectorResults.length === 0) {
        return { score: 0, label: 'none', topMatches: [], computedAt: new Date().toISOString() };
      }

      // 3. 获取 chunk 详情以拿到 sourceId
      const chunkIds = vectorResults.map(r => r.chunkId);
      const chunks = ragDb.getChunks(chunkIds);
      const chunkMap = new Map<string, ChunkRow>(chunks.map(c => [c.id, c]));

      // 4. 收集 article sourceIds
      const articleSourceIds = new Set<string>();
      for (const chunk of chunks) {
        if (chunk.source_type === 'article') {
          articleSourceIds.add(chunk.source_id);
        }
      }

      if (articleSourceIds.size === 0) {
        return { score: 0, label: 'none', topMatches: [], computedAt: new Date().toISOString() };
      }

      // 5. 查询 Library 文章（source='library'）
      const sourceIdArr = Array.from(articleSourceIds);
      const placeholders = sourceIdArr.map(() => '?').join(',');
      const libraryArticles = sqlite.prepare(
        `SELECT id, title FROM articles WHERE id IN (${placeholders}) AND source = 'library' AND deleted_flg = 0`
      ).all(...sourceIdArr) as Array<{ id: string; title: string | null }>;

      if (libraryArticles.length === 0) {
        return { score: 0, label: 'none', topMatches: [], computedAt: new Date().toISOString() };
      }

      const libraryArticleIds = new Set(libraryArticles.map(a => a.id));
      const titleMap = new Map(libraryArticles.map(a => [a.id, a.title ?? 'Unknown']));

      // 6. 过滤出 Library 相关结果并计算相似度
      //    sqlite-vec 的 distance 是 cosine distance (0~2)，similarity = 1 - distance
      const libraryHits: Array<{ sourceId: string; similarity: number }> = [];

      for (const vr of vectorResults) {
        const chunk = chunkMap.get(vr.chunkId);
        if (!chunk || chunk.source_type !== 'article') continue;
        if (!libraryArticleIds.has(chunk.source_id)) continue;

        const similarity = 1 - vr.distance;
        libraryHits.push({ sourceId: chunk.source_id, similarity });
      }

      if (libraryHits.length === 0) {
        return { score: 0, label: 'none', topMatches: [], computedAt: new Date().toISOString() };
      }

      // 7. 取每篇文章的最高 similarity（一篇文章可能有多个 chunks 命中）
      const bestPerArticle = new Map<string, number>();
      for (const hit of libraryHits) {
        const existing = bestPerArticle.get(hit.sourceId) ?? -Infinity;
        if (hit.similarity > existing) {
          bestPerArticle.set(hit.sourceId, hit.similarity);
        }
      }

      // 8. 计算总体分数（取 top match 的 similarity）
      const sortedArticles = Array.from(bestPerArticle.entries())
        .sort((a, b) => b[1] - a[1]);

      if (sortedArticles.length === 0) {
        return { score: 0, label: 'none', topMatches: [], computedAt: new Date().toISOString() };
      }

      const topScore = sortedArticles[0][1];
      const label = topScore > 0.70 ? 'high' : topScore > 0.55 ? 'medium' : 'none';
      const topMatches = sortedArticles.slice(0, 3).map(([id]) => titleMap.get(id) ?? 'Unknown');

      return {
        score: Math.round(topScore * 1000) / 1000,
        label,
        topMatches,
        computedAt: new Date().toISOString(),
      };
    },
  };
}
