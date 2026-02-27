import { ipcMain } from 'electron';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, getSqlite, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { createChunkingService } from '../../ai/services/chunking';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createIngestionPipeline } from '../../ai/services/ingestion';
import { getEmbeddingConfig } from '../../ai/providers/config';
import type {
  CreateResearchSpaceInput,
  UpdateResearchSpaceInput,
  AddResearchSourceInput,
} from '../../shared/types';

/**
 * 异步触发 RAG 索引。
 * 如果 embedding 未配置或文章无内容，graceful 降级（保持 pending）。
 */
async function triggerRAGIndexing(
  db: ReturnType<typeof getDatabase>,
  recordId: string,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) {
    console.warn('triggerRAGIndexing: SQLite not initialized, skipping');
    return;
  }

  const embeddingConfig = getEmbeddingConfig(sqlite);
  if (!embeddingConfig) {
    console.warn('triggerRAGIndexing: Embedding not configured, skipping');
    return;
  }

  const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
  ragDb.initTables();

  // 检查是否已被 RAG 索引
  const status = ragDb.getSourceIndexStatus(sourceType as 'article', sourceId);
  if (status.totalChunks > 0 && status.doneChunks === status.totalChunks) {
    // 已完全索引，直接标记 ready
    await db.update(schema.researchSpaceSources)
      .set({ processingStatus: 'ready' })
      .where(eq(schema.researchSpaceSources.id, recordId));
    return;
  }

  // 需要索引 — 先设为 processing
  await db.update(schema.researchSpaceSources)
    .set({ processingStatus: 'processing' })
    .where(eq(schema.researchSpaceSources.id, recordId));

  try {
    // 获取文章内容
    if (sourceType !== 'article') {
      console.warn(`triggerRAGIndexing: unsupported sourceType "${sourceType}", skipping`);
      await db.update(schema.researchSpaceSources)
        .set({ processingStatus: 'pending' })
        .where(eq(schema.researchSpaceSources.id, recordId));
      return;
    }

    const [article] = await db.select({
      contentText: schema.articles.contentText,
      content: schema.articles.content,
    }).from(schema.articles).where(eq(schema.articles.id, sourceId));

    const text = article?.contentText || article?.content || '';
    if (!text) {
      console.warn('triggerRAGIndexing: article has no content, skipping');
      await db.update(schema.researchSpaceSources)
        .set({ processingStatus: 'pending' })
        .where(eq(schema.researchSpaceSources.id, recordId));
      return;
    }

    const embeddingService = createEmbeddingService(embeddingConfig);
    const chunkingService = createChunkingService();
    const pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

    await pipeline.ingest({ type: 'article', id: sourceId, text });

    // 成功 → ready
    await db.update(schema.researchSpaceSources)
      .set({ processingStatus: 'ready' })
      .where(eq(schema.researchSpaceSources.id, recordId));
  } catch (err) {
    console.error('triggerRAGIndexing: indexing failed:', err);
    // 失败 → error
    await db.update(schema.researchSpaceSources)
      .set({ processingStatus: 'error' })
      .where(eq(schema.researchSpaceSources.id, recordId));
  }
}

export function registerResearchHandlers() {
  const {
    RESEARCH_SPACE_CREATE,
    RESEARCH_SPACE_LIST,
    RESEARCH_SPACE_GET,
    RESEARCH_SPACE_UPDATE,
    RESEARCH_SPACE_DELETE,
    RESEARCH_SOURCE_ADD,
    RESEARCH_SOURCE_REMOVE,
    RESEARCH_SOURCE_TOGGLE,
    RESEARCH_SOURCE_LIST,
    RESEARCH_SOURCE_REINDEX,
    RESEARCH_CONVERSATION_LIST,
    RESEARCH_CONVERSATION_DELETE,
    RESEARCH_ARTIFACT_LIST,
    RESEARCH_ARTIFACT_GET,
    RESEARCH_ARTIFACT_DELETE,
    RESEARCH_ARTIFACT_EXPORT,
  } = IPC_CHANNELS;

  // ==================== 研究空间 CRUD ====================

  ipcMain.handle(RESEARCH_SPACE_CREATE, async (_event, input: CreateResearchSpaceInput) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const id = randomUUID();

      await db.insert(schema.researchSpaces).values({
        id,
        title: input.title,
        description: input.description ?? null,
        icon: input.icon ?? 'FlaskConical',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedFlg: 0,
      });

      const [created] = await db.select().from(schema.researchSpaces).where(eq(schema.researchSpaces.id, id));
      return created;
    } catch (err) {
      console.error('RESEARCH_SPACE_CREATE failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SPACE_LIST, async () => {
    try {
      const db = getDatabase();
      return db
        .select()
        .from(schema.researchSpaces)
        .where(eq(schema.researchSpaces.deletedFlg, 0))
        .orderBy(desc(schema.researchSpaces.updatedAt));
    } catch (err) {
      console.error('RESEARCH_SPACE_LIST failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SPACE_GET, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const [result] = await db
        .select()
        .from(schema.researchSpaces)
        .where(and(eq(schema.researchSpaces.id, id), eq(schema.researchSpaces.deletedFlg, 0)));
      return result ?? null;
    } catch (err) {
      console.error('RESEARCH_SPACE_GET failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SPACE_UPDATE, async (_event, input: UpdateResearchSpaceInput) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updatedAt: now };

      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.status !== undefined) updates.status = input.status;

      await db.update(schema.researchSpaces).set(updates).where(eq(schema.researchSpaces.id, input.id));
      const [updated] = await db.select().from(schema.researchSpaces).where(eq(schema.researchSpaces.id, input.id));
      return updated;
    } catch (err) {
      console.error('RESEARCH_SPACE_UPDATE failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SPACE_DELETE, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      await db.update(schema.researchSpaces).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.researchSpaces.id, id));
    } catch (err) {
      console.error('RESEARCH_SPACE_DELETE failed:', err);
      throw err;
    }
  });

  // ==================== 资源管理 ====================

  ipcMain.handle(RESEARCH_SOURCE_ADD, async (_event, input: AddResearchSourceInput) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();

      // 检查是否已添加（spaceId + sourceId 不重复）
      const [existing] = await db
        .select()
        .from(schema.researchSpaceSources)
        .where(
          and(
            eq(schema.researchSpaceSources.spaceId, input.spaceId),
            eq(schema.researchSpaceSources.sourceId, input.sourceId),
          ),
        );

      if (existing) {
        return existing;
      }

      const id = randomUUID();
      await db.insert(schema.researchSpaceSources).values({
        id,
        spaceId: input.spaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        enabled: 1,
        processingStatus: 'pending',
        addedAt: now,
      });

      const [created] = await db.select().from(schema.researchSpaceSources).where(eq(schema.researchSpaceSources.id, id));

      // 异步触发 RAG 索引（不阻塞返回）
      triggerRAGIndexing(db, id, input.sourceType, input.sourceId).catch(err => {
        console.error('RAG indexing trigger failed (non-blocking):', err);
      });

      return created;
    } catch (err) {
      console.error('RESEARCH_SOURCE_ADD failed:', err);
      throw err;
    }
  });

  // ==================== 重新索引 ====================

  ipcMain.handle(RESEARCH_SOURCE_REINDEX, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const [source] = await db.select().from(schema.researchSpaceSources)
        .where(eq(schema.researchSpaceSources.id, id));
      if (!source) throw new Error(`Source not found: ${id}`);

      const sqlite = getSqlite();
      if (!sqlite) {
        console.warn('RESEARCH_SOURCE_REINDEX: SQLite not initialized, skipping');
        return;
      }
      const embeddingConfig = getEmbeddingConfig(sqlite);
      if (!embeddingConfig) {
        console.warn('RESEARCH_SOURCE_REINDEX: Embedding not configured, skipping');
        return;
      }

      // 删除旧 chunks
      const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
      ragDb.initTables();
      ragDb.deleteChunksBySource(source.sourceType as 'article', source.sourceId);

      // 重新索引
      await triggerRAGIndexing(db, id, source.sourceType, source.sourceId);
    } catch (err) {
      console.error('RESEARCH_SOURCE_REINDEX failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SOURCE_REMOVE, async (_event, id: string) => {
    try {
      const db = getDatabase();
      await db.delete(schema.researchSpaceSources).where(eq(schema.researchSpaceSources.id, id));
    } catch (err) {
      console.error('RESEARCH_SOURCE_REMOVE failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SOURCE_TOGGLE, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const [source] = await db.select().from(schema.researchSpaceSources).where(eq(schema.researchSpaceSources.id, id));
      if (!source) throw new Error(`Source not found: ${id}`);

      const newEnabled = source.enabled === 1 ? 0 : 1;
      await db.update(schema.researchSpaceSources).set({ enabled: newEnabled }).where(eq(schema.researchSpaceSources.id, id));

      const [updated] = await db.select().from(schema.researchSpaceSources).where(eq(schema.researchSpaceSources.id, id));
      return updated;
    } catch (err) {
      console.error('RESEARCH_SOURCE_TOGGLE failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_SOURCE_LIST, async (_event, spaceId: string) => {
    try {
      const db = getDatabase();
      const rows = await db
        .select({
          source: schema.researchSpaceSources,
          articleTitle: schema.articles.title,
        })
        .from(schema.researchSpaceSources)
        .leftJoin(schema.articles, eq(schema.researchSpaceSources.sourceId, schema.articles.id))
        .where(eq(schema.researchSpaceSources.spaceId, spaceId));

      return rows.map(r => ({
        ...r.source,
        sourceTitle: r.articleTitle ?? undefined,
      }));
    } catch (err) {
      console.error('RESEARCH_SOURCE_LIST failed:', err);
      throw err;
    }
  });

  // ==================== 对话管理 ====================

  ipcMain.handle(RESEARCH_CONVERSATION_LIST, async (_event, spaceId: string) => {
    try {
      const db = getDatabase();
      return db
        .select()
        .from(schema.researchConversations)
        .where(eq(schema.researchConversations.spaceId, spaceId))
        .orderBy(desc(schema.researchConversations.updatedAt));
    } catch (err) {
      console.error('RESEARCH_CONVERSATION_LIST failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_CONVERSATION_DELETE, async (_event, id: string) => {
    try {
      const db = getDatabase();
      await db.delete(schema.researchConversations).where(eq(schema.researchConversations.id, id));
    } catch (err) {
      console.error('RESEARCH_CONVERSATION_DELETE failed:', err);
      throw err;
    }
  });

  // ==================== 产物管理 ====================

  ipcMain.handle(RESEARCH_ARTIFACT_LIST, async (_event, spaceId: string) => {
    try {
      const db = getDatabase();
      return db
        .select()
        .from(schema.researchArtifacts)
        .where(
          and(
            eq(schema.researchArtifacts.spaceId, spaceId),
            eq(schema.researchArtifacts.deletedFlg, 0),
          ),
        )
        .orderBy(desc(schema.researchArtifacts.pinned), desc(schema.researchArtifacts.updatedAt));
    } catch (err) {
      console.error('RESEARCH_ARTIFACT_LIST failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_ARTIFACT_GET, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const [result] = await db
        .select()
        .from(schema.researchArtifacts)
        .where(and(eq(schema.researchArtifacts.id, id), eq(schema.researchArtifacts.deletedFlg, 0)));
      return result ?? null;
    } catch (err) {
      console.error('RESEARCH_ARTIFACT_GET failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_ARTIFACT_DELETE, async (_event, id: string) => {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      await db.update(schema.researchArtifacts).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.researchArtifacts.id, id));
    } catch (err) {
      console.error('RESEARCH_ARTIFACT_DELETE failed:', err);
      throw err;
    }
  });

  ipcMain.handle(RESEARCH_ARTIFACT_EXPORT, async (_event, id: string, format: 'markdown' | 'json') => {
    try {
      const db = getDatabase();
      const [artifact] = await db
        .select()
        .from(schema.researchArtifacts)
        .where(and(eq(schema.researchArtifacts.id, id), eq(schema.researchArtifacts.deletedFlg, 0)));

      if (!artifact) throw new Error(`Artifact not found: ${id}`);

      if (format === 'json') {
        return JSON.stringify({
          id: artifact.id,
          type: artifact.type,
          title: artifact.title,
          content: artifact.content,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        }, null, 2);
      }

      // markdown 格式
      const lines: string[] = [];
      lines.push(`# ${artifact.title}`);
      lines.push('');
      if (artifact.content) {
        lines.push(artifact.content);
      }
      return lines.join('\n');
    } catch (err) {
      console.error('RESEARCH_ARTIFACT_EXPORT failed:', err);
      throw err;
    }
  });
}
