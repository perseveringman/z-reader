import { ipcMain } from 'electron';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { CreateHighlightInput, CreateBookHighlightInput, UpdateHighlightInput } from '../../shared/types';
import { getGlobalTracker } from './sync-handlers';
import { triggerIndexHighlight, triggerCleanupHighlight } from './incremental-index-hooks';

export function registerHighlightHandlers() {
  const { HIGHLIGHT_LIST, HIGHLIGHT_CREATE, HIGHLIGHT_DELETE, HIGHLIGHT_UPDATE } = IPC_CHANNELS;

  ipcMain.handle(HIGHLIGHT_LIST, async (_event, articleId: string) => {
    const db = getDatabase();
    return db
      .select()
      .from(schema.highlights)
      .where(
        and(
          eq(schema.highlights.articleId, articleId),
          eq(schema.highlights.deletedFlg, 0),
        ),
      );
  });

  ipcMain.handle(HIGHLIGHT_CREATE, async (_event, input: CreateHighlightInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(schema.highlights).values({
      id,
      articleId: input.articleId,
      text: input.text,
      note: input.note ?? null,
      color: input.color ?? 'yellow',
      startOffset: input.startOffset ?? null,
      endOffset: input.endOffset ?? null,
      anchorPath: input.anchorPath ?? null,
      paragraphIndex: input.paragraphIndex ?? null,
      createdAt: now,
      updatedAt: now,
      deletedFlg: 0,
    });
    getGlobalTracker()?.trackChange({ table: 'highlights', recordId: id, operation: 'insert', changedFields: { articleId: input.articleId, text: input.text, color: input.color ?? 'yellow' } });

    const [result] = await db
      .select()
      .from(schema.highlights)
      .where(eq(schema.highlights.id, id));

    // 异步索引高亮到 RAG
    if (result?.text && result.articleId) {
      triggerIndexHighlight({
        id: result.id,
        articleId: result.articleId,
        text: result.text,
      }).catch((err) => {
        console.error('Index highlight failed:', err);
      });
    }

    return result;
  });

  ipcMain.handle(HIGHLIGHT_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.highlights)
      .set({ deletedFlg: 1, updatedAt: now })
      .where(eq(schema.highlights.id, id));
    getGlobalTracker()?.trackChange({ table: 'highlights', recordId: id, operation: 'delete', changedFields: { deletedFlg: 1 } });
    // 异步清理 RAG 索引
    triggerCleanupHighlight(id).catch((err) => {
      console.error('Cleanup highlight failed:', err);
    });
  });

  // Book 高亮列表
  ipcMain.handle(IPC_CHANNELS.BOOK_HIGHLIGHT_LIST, async (_event, bookId: string) => {
    const db = getDatabase();
    return db
      .select()
      .from(schema.highlights)
      .where(
        and(
          eq(schema.highlights.bookId, bookId),
          eq(schema.highlights.deletedFlg, 0),
        ),
      );
  });

  // 与文档定义对齐：highlight:listByBook
  ipcMain.handle(IPC_CHANNELS.HIGHLIGHT_LIST_BY_BOOK, async (_event, bookId: string) => {
    const db = getDatabase();
    return db
      .select()
      .from(schema.highlights)
      .where(
        and(
          eq(schema.highlights.bookId, bookId),
          eq(schema.highlights.deletedFlg, 0),
        ),
      );
  });

  // Book 高亮创建
  ipcMain.handle(IPC_CHANNELS.BOOK_HIGHLIGHT_CREATE, async (_event, input: CreateBookHighlightInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(schema.highlights).values({
      id,
      articleId: null,
      bookId: input.bookId,
      text: input.text,
      note: input.note ?? null,
      color: input.color ?? 'yellow',
      startOffset: input.startOffset ?? null,
      endOffset: input.endOffset ?? null,
      anchorPath: input.anchorPath ?? null,
      paragraphIndex: input.paragraphIndex ?? null,
      createdAt: now,
      updatedAt: now,
      deletedFlg: 0,
    });
    getGlobalTracker()?.trackChange({ table: 'highlights', recordId: id, operation: 'insert', changedFields: { bookId: input.bookId, text: input.text, color: input.color ?? 'yellow' } });

    const [result] = await db
      .select()
      .from(schema.highlights)
      .where(eq(schema.highlights.id, id));

    return result;
  });

  // 与文档定义对齐：highlight:createForBook
  ipcMain.handle(IPC_CHANNELS.HIGHLIGHT_CREATE_FOR_BOOK, async (_event, input: CreateBookHighlightInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(schema.highlights).values({
      id,
      articleId: null,
      bookId: input.bookId,
      text: input.text,
      note: input.note ?? null,
      color: input.color ?? 'yellow',
      startOffset: input.startOffset ?? null,
      endOffset: input.endOffset ?? null,
      anchorPath: input.anchorPath ?? null,
      paragraphIndex: input.paragraphIndex ?? null,
      createdAt: now,
      updatedAt: now,
      deletedFlg: 0,
    });
    getGlobalTracker()?.trackChange({ table: 'highlights', recordId: id, operation: 'insert', changedFields: { bookId: input.bookId, text: input.text, color: input.color ?? 'yellow' } });

    const [result] = await db
      .select()
      .from(schema.highlights)
      .where(eq(schema.highlights.id, id));

    return result;
  });

  // 更新高亮（笔记/颜色）
  ipcMain.handle(HIGHLIGHT_UPDATE, async (_event, input: UpdateHighlightInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.note !== undefined) updates.note = input.note;
    if (input.color !== undefined) updates.color = input.color;
    await db.update(schema.highlights).set(updates).where(eq(schema.highlights.id, input.id));
    getGlobalTracker()?.trackChange({ table: 'highlights', recordId: input.id, operation: 'update', changedFields: updates });
    const [result] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, input.id));
    return result;
  });
}
