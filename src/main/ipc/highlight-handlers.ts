import { ipcMain } from 'electron';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { CreateHighlightInput, UpdateHighlightInput } from '../../shared/types';

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
      paragraphIndex: input.paragraphIndex ?? null,
      createdAt: now,
      updatedAt: now,
      deletedFlg: 0,
    });

    const [result] = await db
      .select()
      .from(schema.highlights)
      .where(eq(schema.highlights.id, id));

    return result;
  });

  ipcMain.handle(HIGHLIGHT_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.highlights)
      .set({ deletedFlg: 1, updatedAt: now })
      .where(eq(schema.highlights.id, id));
  });

  // 更新高亮（笔记/颜色）
  ipcMain.handle(HIGHLIGHT_UPDATE, async (_event, input: UpdateHighlightInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.note !== undefined) updates.note = input.note;
    if (input.color !== undefined) updates.color = input.color;
    await db.update(schema.highlights).set(updates).where(eq(schema.highlights.id, input.id));
    const [result] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, input.id));
    return result;
  });
}
