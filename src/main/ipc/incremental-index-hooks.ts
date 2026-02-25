import { getSqlite } from '../db';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { KGDatabase } from '../../ai/providers/kg-db';
import { AIDatabase } from '../../ai/providers/db';
import { DEFAULT_AI_CONFIG, getEmbeddingConfig } from '../../ai/providers/config';
import { createLLMProvider } from '../../ai/providers/llm';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createChunkingService } from '../../ai/services/chunking';
import { createIngestionPipeline } from '../../ai/services/ingestion';
import { createEntityExtractionService } from '../../ai/services/entity-extraction';
import { createKGIngestionPipeline } from '../../ai/services/kg-ingestion';
import type { AIProviderConfig } from '../../ai/providers/config';

/**
 * 辅助: 获取 AI 配置（用于 LLM 任务）
 */
function getAIConfig(sqlite: ReturnType<typeof getSqlite>): AIProviderConfig | null {
  if (!sqlite) return null;
  const aiDb = new AIDatabase(sqlite);
  const saved = aiDb.getSetting('aiConfig');
  const config: AIProviderConfig =
    saved && typeof saved === 'object'
      ? { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) }
      : DEFAULT_AI_CONFIG;
  return config.apiKey ? config : null;
}

/**
 * 文章编辑后重新索引 RAG + KG
 * 用于 contentText 发生变化的场景
 */
export async function triggerReindexArticle(articleId: string): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) return;

  const embeddingConfig = getEmbeddingConfig(sqlite);
  if (!embeddingConfig) return;

  const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
  ragDb.initTables();

  // 1. 删除旧的 RAG chunks
  ragDb.deleteChunksBySource('article', articleId);

  // 2. 获取更新后的文章内容
  const article = sqlite.prepare(
    'SELECT id, title, content_text, author FROM articles WHERE id = ? AND deleted_flg = 0'
  ).get(articleId) as { id: string; title: string | null; content_text: string | null; author: string | null } | undefined;

  if (!article || !article.content_text?.trim()) {
    return;
  }

  // 3. 重新 RAG 索引
  const embeddingService = createEmbeddingService(embeddingConfig);
  const chunkingService = createChunkingService();
  const pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

  const ingestResult = await pipeline.ingest({
    type: 'article',
    id: article.id,
    text: article.content_text,
    metadata: {
      title: article.title ?? undefined,
      author: article.author ?? undefined,
    },
  });

  if (!ingestResult.success) {
    console.warn(`Reindex RAG failed for article ${articleId}: ${ingestResult.error}`);
    return;
  }

  // 4. 删除旧的 KG sources
  const kgDb = new KGDatabase(sqlite);
  kgDb.initTables();
  kgDb.deleteEntitiesBySource('article', articleId);

  // 5. 重新 KG 抽取
  const aiConfig = getAIConfig(sqlite);
  const chunks = ragDb.getChunksBySource('article', articleId);
  if (chunks.length > 0 && aiConfig) {
    const llm = createLLMProvider(aiConfig);
    const extractionService = createEntityExtractionService({
      getModel: (task) => llm.getModel(task),
    });
    const kgPipeline = createKGIngestionPipeline({ kgDb, extractionService });

    const kgResult = await kgPipeline.ingest({
      sourceType: 'article',
      sourceId: articleId,
      sourceTitle: article.title ?? articleId,
      chunks: chunks.map((c) => ({ chunkId: c.id, content: c.content })),
    });

    if (kgResult.success) {
      console.log(
        `Reindexed article "${article.title}": RAG ${ingestResult.chunksCreated} chunks, KG ${kgResult.entitiesCreated} entities`
      );
    }
  }
}

/**
 * 文章删除后清理索引
 * 用于软删除和永久删除场景
 */
export async function triggerCleanupArticle(articleId: string): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) return;

  try {
    // RAG 清理
    const ragDb = new RAGDatabase(sqlite);
    ragDb.initTables();
    ragDb.deleteChunksBySource('article', articleId);

    // KG 清理
    const kgDb = new KGDatabase(sqlite);
    kgDb.initTables();
    kgDb.deleteEntitiesBySource('article', articleId);

    console.log(`Cleaned up RAG/KG index for article ${articleId}`);
  } catch (error) {
    console.error(`Cleanup failed for article ${articleId}:`, error);
  }
}

/**
 * 高亮创建后索引到 RAG
 * 将高亮文本作为独立 source 入库
 */
export async function triggerIndexHighlight(highlight: {
  id: string;
  articleId: string;
  text: string;
}): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) return;

  const embeddingConfig = getEmbeddingConfig(sqlite);
  if (!embeddingConfig) return;

  if (!highlight.text.trim()) return;

  const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
  ragDb.initTables();

  const embeddingService = createEmbeddingService(embeddingConfig);
  const chunkingService = createChunkingService();
  const pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

  // 获取文章标题作为元数据
  const article = sqlite.prepare(
    'SELECT title FROM articles WHERE id = ?'
  ).get(highlight.articleId) as { title: string | null } | undefined;

  const result = await pipeline.ingest({
    type: 'highlight',
    id: highlight.id,
    text: highlight.text,
    metadata: {
      articleId: highlight.articleId,
      articleTitle: article?.title ?? undefined,
    },
  });

  if (result.success) {
    console.log(`Indexed highlight ${highlight.id}: ${result.chunksCreated} chunks`);
  }
}

/**
 * 高亮删除后清理 RAG 索引
 */
export async function triggerCleanupHighlight(highlightId: string): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) return;

  try {
    const ragDb = new RAGDatabase(sqlite);
    ragDb.initTables();
    ragDb.deleteChunksBySource('highlight', highlightId);
  } catch (error) {
    console.error(`Cleanup failed for highlight ${highlightId}:`, error);
  }
}
