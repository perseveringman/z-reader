import { ipcMain } from 'electron';
import { eq, and } from 'drizzle-orm';
import { getDatabase, getSqlite, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getGlobalTracker } from './sync-handlers';

export function registerHighlightTagHandlers() {
  const {
    HIGHLIGHT_TAG_ADD,
    HIGHLIGHT_TAG_REMOVE,
    HIGHLIGHT_TAGS_FOR_HIGHLIGHT,
    HIGHLIGHT_TAGS_BATCH,
  } = IPC_CHANNELS;

  // 高亮添加标签
  ipcMain.handle(HIGHLIGHT_TAG_ADD, async (_event, highlightId: string, tagId: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();

    const existing = await db.select().from(schema.highlightTags)
      .where(and(
        eq(schema.highlightTags.highlightId, highlightId),
        eq(schema.highlightTags.tagId, tagId),
      ));

    if (existing.length === 0) {
      await db.insert(schema.highlightTags).values({
        highlightId,
        tagId,
        createdAt: now,
      });
      getGlobalTracker()?.trackChange({ table: 'highlight_tags', recordId: `${highlightId}:${tagId}`, operation: 'insert', changedFields: { highlightId, tagId, createdAt: now } });
    }
  });

  // 高亮移除标签
  ipcMain.handle(HIGHLIGHT_TAG_REMOVE, async (_event, highlightId: string, tagId: string) => {
    const db = getDatabase();
    await db.delete(schema.highlightTags)
      .where(and(
        eq(schema.highlightTags.highlightId, highlightId),
        eq(schema.highlightTags.tagId, tagId),
      ));
    getGlobalTracker()?.trackChange({ table: 'highlight_tags', recordId: `${highlightId}:${tagId}`, operation: 'delete', changedFields: {} });
  });

  // 获取单个高亮的标签
  ipcMain.handle(HIGHLIGHT_TAGS_FOR_HIGHLIGHT, async (_event, highlightId: string) => {
    const sqlite = getSqlite();
    if (!sqlite) return [];

    const stmt = sqlite.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN highlight_tags ht ON ht.tag_id = t.id
      WHERE ht.highlight_id = ? AND t.deleted_flg = 0
      ORDER BY t.name
    `);
    return stmt.all(highlightId);
  });

  // 批量获取多个高亮的标签（一次查询）
  ipcMain.handle(HIGHLIGHT_TAGS_BATCH, async (_event, highlightIds: string[]) => {
    const sqlite = getSqlite();
    if (!sqlite || highlightIds.length === 0) return {};

    const placeholders = highlightIds.map(() => '?').join(',');
    const stmt = sqlite.prepare(`
      SELECT ht.highlight_id, t.* FROM tags t
      INNER JOIN highlight_tags ht ON ht.tag_id = t.id
      WHERE ht.highlight_id IN (${placeholders}) AND t.deleted_flg = 0
      ORDER BY t.name
    `);
    const rows = stmt.all(...highlightIds) as Array<{ highlight_id: string; id: string; name: string; parent_id: string | null; created_at: string; updated_at: string }>;

    const result: Record<string, Array<{ id: string; name: string; parentId: string | null; createdAt: string; updatedAt: string }>> = {};
    for (const row of rows) {
      if (!result[row.highlight_id]) result[row.highlight_id] = [];
      result[row.highlight_id].push({
        id: row.id,
        name: row.name,
        parentId: row.parent_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    return result;
  });
}
