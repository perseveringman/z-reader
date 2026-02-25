import type Database from 'better-sqlite3';
import { RAGDatabase } from '../providers/rag-db';
import { KGDatabase } from '../providers/kg-db';
import { AIDatabase } from '../providers/db';
import { DEFAULT_AI_CONFIG, getEmbeddingConfig } from '../providers/config';
import { createLLMProvider } from '../providers/llm';
import { createEmbeddingService } from './embedding';
import { createChunkingService } from './chunking';
import { createIngestionPipeline } from './ingestion';
import { createEntityExtractionService } from './entity-extraction';
import { createKGIngestionPipeline } from './kg-ingestion';
import { createFeedRelevanceService } from './feed-relevance';
import type { AIProviderConfig } from '../providers/config';
import type { RAGBackfillProgress, RAGBackfillStatus } from '../../shared/types';

/** 回填状态 */
let running = false;
let cancelled = false;
let currentPhase: RAGBackfillProgress['phase'] = 'indexing';
let currentIdx = 0;
let totalCount = 0;
let currentTitle = '';

/**
 * 批量回填服务
 * 对 Library 文章进行 RAG 索引 + KG 抽取
 * 对 Feed 文章计算相关度
 */
export async function runBackfill(options: {
  sqlite: Database.Database;
  batchSize: number;
  broadcastProgress: (progress: RAGBackfillProgress) => void;
}): Promise<void> {
  if (running) {
    throw new Error('Backfill already running');
  }

  const { sqlite, batchSize, broadcastProgress } = options;
  running = true;
  cancelled = false;

  try {
    // 获取 Embedding 配置
    const embeddingConfig = getEmbeddingConfig(sqlite);
    if (!embeddingConfig) {
      throw new Error('Embedding API Key 未配置');
    }

    // 获取 AI 配置（用于 LLM / KG）
    const aiDb = new AIDatabase(sqlite);
    const saved = aiDb.getSetting('aiConfig');
    const config: AIProviderConfig =
      saved && typeof saved === 'object'
        ? { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) }
        : DEFAULT_AI_CONFIG;

    // 初始化服务
    const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
    ragDb.initTables();
    const kgDb = new KGDatabase(sqlite);
    kgDb.initTables();

    const embeddingService = createEmbeddingService(embeddingConfig);
    const chunkingService = createChunkingService();
    const pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

    let kgPipeline: ReturnType<typeof createKGIngestionPipeline> | null = null;
    if (config.apiKey) {
      const llm = createLLMProvider(config);
      const extractionService = createEntityExtractionService({
        getModel: (task) => llm.getModel(task),
      });
      kgPipeline = createKGIngestionPipeline({ kgDb, extractionService });
    }

    // ========== Phase 1: Library 文章 → RAG + KG ==========
    currentPhase = 'indexing';

    // 查找未索引的 Library 文章
    const unindexedArticles = sqlite.prepare(`
      SELECT a.id, a.title, a.content_text, a.author
      FROM articles a
      WHERE a.source = 'library'
        AND a.deleted_flg = 0
        AND a.content_text IS NOT NULL
        AND a.content_text != ''
        AND a.id NOT IN (SELECT DISTINCT source_id FROM chunks WHERE source_type = 'article')
      ORDER BY a.created_at DESC
    `).all() as Array<{ id: string; title: string | null; content_text: string; author: string | null }>;

    totalCount = unindexedArticles.length;
    currentIdx = 0;

    broadcastProgress({
      phase: 'indexing',
      current: 0,
      total: totalCount,
    });

    // 分批处理
    for (let i = 0; i < unindexedArticles.length; i += batchSize) {
      if (cancelled) break;

      const batch = unindexedArticles.slice(i, i + batchSize);
      for (const article of batch) {
        if (cancelled) break;

        currentIdx++;
        currentTitle = article.title ?? article.id;

        broadcastProgress({
          phase: 'indexing',
          current: currentIdx,
          total: totalCount,
          currentTitle,
        });

        try {
          // RAG 索引
          const ingestResult = await pipeline.ingest({
            type: 'article',
            id: article.id,
            text: article.content_text,
            metadata: {
              title: article.title ?? undefined,
              author: article.author ?? undefined,
            },
          });

          if (ingestResult.success && kgPipeline) {
            // KG 抽取
            const chunks = ragDb.getChunksBySource('article', article.id);
            if (chunks.length > 0) {
              await kgPipeline.ingest({
                sourceType: 'article',
                sourceId: article.id,
                sourceTitle: article.title ?? article.id,
                chunks: chunks.map((c) => ({ chunkId: c.id, content: c.content })),
              });
            }
          }
        } catch (error) {
          console.error(`Backfill failed for article ${article.id}:`, error);
          // 继续处理下一篇
        }
      }
    }

    // Phase 1.5: 处理因迁移（如距离函数变更）而被重置为 pending 的旧 chunks
    if (!cancelled) {
      let totalPending = 0;
      let totalPendingTokens = 0;
      // 循环处理所有 pending chunks，每批最多 batchSize 条
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pendingResult = await pipeline.processPendingChunks(batchSize);
        if (pendingResult.processed === 0 && pendingResult.failed === 0) break;
        totalPending += pendingResult.processed;
        totalPendingTokens += pendingResult.totalTokens;
        if (cancelled) break;
      }
      if (totalPending > 0) {
        console.log(`Processed ${totalPending} pending chunks (${totalPendingTokens} tokens)`);
      }
    }

    // ========== Phase 2: Feed 文章 → 相关度计算 ==========
    if (!cancelled) {
      currentPhase = 'relevance';

      const relevanceService = createFeedRelevanceService({
        embeddingService,
        ragDb,
        sqlite,
      });

      // 查找未计算相关度的 Feed 文章
      const unscored = sqlite.prepare(`
        SELECT a.id, a.title, a.content_text, a.metadata
        FROM articles a
        WHERE a.source = 'feed'
          AND a.deleted_flg = 0
          AND a.content_text IS NOT NULL
          AND a.content_text != ''
          AND (a.metadata IS NULL OR a.metadata NOT LIKE '%feedRelevance%')
        ORDER BY a.created_at DESC
      `).all() as Array<{ id: string; title: string | null; content_text: string; metadata: string | null }>;

      totalCount = unscored.length;
      currentIdx = 0;

      broadcastProgress({
        phase: 'relevance',
        current: 0,
        total: totalCount,
      });

      for (const article of unscored) {
        if (cancelled) break;

        currentIdx++;
        currentTitle = article.title ?? article.id;

        broadcastProgress({
          phase: 'relevance',
          current: currentIdx,
          total: totalCount,
          currentTitle,
        });

        try {
          const relevance = await relevanceService.computeRelevance(
            article.title ?? '',
            (article.content_text ?? '').slice(0, 2000)
          );

          // 合并 metadata
          let metadata: Record<string, unknown> = {};
          if (article.metadata) {
            try {
              metadata = JSON.parse(article.metadata);
            } catch {
              metadata = {};
            }
          }
          metadata.feedRelevance = relevance;

          sqlite.prepare(
            `UPDATE articles SET metadata = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(metadata), new Date().toISOString(), article.id);
        } catch (error) {
          console.error(`Feed relevance failed for ${article.id}:`, error);
        }
      }
    }

    // 完成
    broadcastProgress({
      phase: 'done',
      current: 0,
      total: 0,
    });
  } finally {
    running = false;
    cancelled = false;
    currentPhase = 'indexing';
    currentIdx = 0;
    totalCount = 0;
    currentTitle = '';
  }
}

/** 取消回填 */
export function cancelBackfill(): void {
  if (running) {
    cancelled = true;
  }
}

/** 获取回填状态 */
export function getBackfillStatus(): RAGBackfillStatus {
  return {
    running,
    phase: running ? currentPhase : undefined,
    current: running ? currentIdx : undefined,
    total: running ? totalCount : undefined,
  };
}
