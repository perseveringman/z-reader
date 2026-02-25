import type Database from 'better-sqlite3';
import type { RAGDatabase, ChunkSourceType } from '../providers/rag-db';
import type { EmbeddingService } from './embedding';

/** 检索查询 */
export interface SearchQuery {
  text: string;
  topK?: number;
  filters?: SearchFilters;
  mode?: 'hybrid' | 'vector' | 'keyword';
}

/** 检索过滤条件 */
export interface SearchFilters {
  sourceTypes?: ChunkSourceType[];
  sourceIds?: string[];
  partition?: 'library' | 'feed';
}

/** 检索结果 */
export interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  sourceType: ChunkSourceType;
  sourceId: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

/** RRF 常数 */
const RRF_K = 60;

/**
 * Hybrid Retriever
 * 实现向量 + FTS5 混合检索
 */
export class HybridRetriever {
  constructor(
    private sqlite: Database.Database,
    private ragDb: RAGDatabase,
    private embeddingService: EmbeddingService
  ) {}

  /** 混合检索 */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const { text, topK = 10, filters, mode = 'hybrid' } = query;

    if (!text.trim()) {
      return [];
    }

    let vectorResults: Array<{ chunkId: string; rank: number }> = [];
    let keywordResults: Array<{ chunkId: string; rank: number }> = [];

    // 向量检索路径
    if ((mode === 'hybrid' || mode === 'vector') && this.ragDb.isSqliteVecAvailable()) {
      vectorResults = await this.vectorSearch(text, topK * 2, filters);
    }

    // 关键词检索路径
    if (mode === 'hybrid' || mode === 'keyword') {
      keywordResults = this.keywordSearch(text, topK * 2, filters);
    }

    // RRF 融合
    const fusedResults = this.rrfFusion(vectorResults, keywordResults, topK);

    // 获取 chunk 详情
    const chunkIds = fusedResults.map(r => r.chunkId);
    const chunks = this.ragDb.getChunks(chunkIds);
    const chunkMap = new Map(chunks.map(c => [c.id, c]));

    return fusedResults.map(result => {
      const chunk = chunkMap.get(result.chunkId);
      if (!chunk) return null;

      return {
        chunkId: result.chunkId,
        content: chunk.content,
        score: result.score,
        sourceType: chunk.source_type as ChunkSourceType,
        sourceId: chunk.source_id,
        chunkIndex: chunk.chunk_index,
        metadata: chunk.metadata_json ? JSON.parse(chunk.metadata_json) : {},
      };
    }).filter((r): r is SearchResult => r !== null);
  }

  /** 向量检索 */
  private async vectorSearch(
    text: string,
    topK: number,
    filters?: SearchFilters
  ): Promise<Array<{ chunkId: string; rank: number }>> {
    try {
      // 生成查询向量
      const { embedding } = await this.embeddingService.embed(text);

      // KNN 搜索
      let results = this.ragDb.searchVectors(embedding, topK * 2);

      // 应用过滤器
      if (filters) {
        const filteredChunkIds = this.applyFilters(
          results.map(r => r.chunkId),
          filters
        );
        results = results.filter(r => filteredChunkIds.has(r.chunkId));
      }

      // 返回排名
      return results.slice(0, topK).map((r, index) => ({
        chunkId: r.chunkId,
        rank: index + 1,
      }));
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  /** 关键词检索（通过 FTS5 + chunks 表关联） */
  private keywordSearch(
    text: string,
    topK: number,
    filters?: SearchFilters
  ): Array<{ chunkId: string; rank: number }> {
    try {
      // 构建 FTS5 查询
      const ftsQuery = this.buildFtsQuery(text);
      if (!ftsQuery) return [];

      // 通过 articles_fts 获取匹配的 article IDs
      const matchedArticles = this.sqlite.prepare(`
        SELECT a.id
        FROM articles a
        INNER JOIN articles_fts fts ON a.rowid = fts.rowid
        WHERE articles_fts MATCH ? AND a.deleted_flg = 0
        LIMIT ?
      `).all(ftsQuery, topK * 2) as Array<{ id: string }>;

      if (matchedArticles.length === 0) {
        return [];
      }

      const articleIds = matchedArticles.map(a => a.id);

      // 获取这些文章的 chunks
      const placeholders = articleIds.map(() => '?').join(',');
      let chunkResults = this.sqlite.prepare(`
        SELECT id, source_id
        FROM chunks
        WHERE source_type = 'article' AND source_id IN (${placeholders})
        ORDER BY chunk_index ASC
      `).all(...articleIds) as Array<{ id: string; source_id: string }>;

      // 应用过滤器
      if (filters) {
        const filteredChunkIds = this.applyFilters(
          chunkResults.map(r => r.id),
          filters
        );
        chunkResults = chunkResults.filter(r => filteredChunkIds.has(r.id));
      }

      // 返回排名（按文章匹配顺序，每篇文章只取第一个 chunk）
      const seen = new Set<string>();
      const results: Array<{ chunkId: string; rank: number }> = [];
      let rank = 1;

      for (const chunk of chunkResults) {
        if (!seen.has(chunk.source_id) && results.length < topK) {
          results.push({ chunkId: chunk.id, rank: rank++ });
          seen.add(chunk.source_id);
        }
      }

      return results;
    } catch (error) {
      console.error('Keyword search failed:', error);
      return [];
    }
  }

  /** 构建 FTS5 查询 */
  private buildFtsQuery(text: string): string {
    // 移除特殊字符，用空格分词
    const terms = text
      .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (terms.length === 0) return '';

    // 使用 OR 连接多个词
    return terms.map(t => `"${t}"`).join(' OR ');
  }

  /** 应用过滤器，返回符合条件的 chunk IDs */
  private applyFilters(chunkIds: string[], filters: SearchFilters): Set<string> {
    if (chunkIds.length === 0) return new Set();

    const conditions: string[] = [];
    const params: unknown[] = [];

    // source type 过滤
    if (filters.sourceTypes && filters.sourceTypes.length > 0) {
      const placeholders = filters.sourceTypes.map(() => '?').join(',');
      conditions.push(`source_type IN (${placeholders})`);
      params.push(...filters.sourceTypes);
    }

    // source ID 过滤
    if (filters.sourceIds && filters.sourceIds.length > 0) {
      const placeholders = filters.sourceIds.map(() => '?').join(',');
      conditions.push(`source_id IN (${placeholders})`);
      params.push(...filters.sourceIds);
    }

    if (conditions.length === 0) {
      return new Set(chunkIds);
    }

    const idPlaceholders = chunkIds.map(() => '?').join(',');
    const whereClause = conditions.join(' AND ');

    const filteredChunks = this.sqlite.prepare(`
      SELECT id FROM chunks
      WHERE id IN (${idPlaceholders}) AND ${whereClause}
    `).all(...chunkIds, ...params) as Array<{ id: string }>;

    return new Set(filteredChunks.map(c => c.id));
  }

  /** Reciprocal Rank Fusion */
  private rrfFusion(
    vectorResults: Array<{ chunkId: string; rank: number }>,
    keywordResults: Array<{ chunkId: string; rank: number }>,
    topK: number
  ): Array<{ chunkId: string; score: number }> {
    const scores = new Map<string, number>();

    // 向量结果贡献
    for (const { chunkId, rank } of vectorResults) {
      const score = 1 / (RRF_K + rank);
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + score);
    }

    // 关键词结果贡献
    for (const { chunkId, rank } of keywordResults) {
      const score = 1 / (RRF_K + rank);
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + score);
    }

    // 排序并取 top K
    return Array.from(scores.entries())
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

/** 创建 Hybrid Retriever 实例 */
export function createHybridRetriever(
  sqlite: Database.Database,
  ragDb: RAGDatabase,
  embeddingService: EmbeddingService
): HybridRetriever {
  return new HybridRetriever(sqlite, ragDb, embeddingService);
}
