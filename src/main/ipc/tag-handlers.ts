import { ipcMain } from 'electron';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, getSqlite, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

export function registerTagHandlers() {
  const { TAG_LIST, TAG_CREATE, TAG_DELETE, ARTICLE_TAG_ADD, ARTICLE_TAG_REMOVE, ARTICLE_LIST_BY_TAG, ARTICLE_TAGS_FOR_ARTICLE } = IPC_CHANNELS;

  // 获取所有标签（附带文章数）
  ipcMain.handle(TAG_LIST, async () => {
    const sqlite = getSqlite();
    if (!sqlite) return [];

    const stmt = sqlite.prepare(`
      SELECT t.*, COUNT(at2.article_id) as article_count
      FROM tags t
      LEFT JOIN article_tags at2 ON at2.tag_id = t.id
      WHERE t.deleted_flg = 0
      GROUP BY t.id
      ORDER BY t.name
    `);
    return stmt.all();
  });

  // 创建标签
  ipcMain.handle(TAG_CREATE, async (_event, name: string, parentId?: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(schema.tags).values({
      id,
      name,
      parentId: parentId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedFlg: 0,
    });

    const [result] = await db.select().from(schema.tags).where(eq(schema.tags.id, id));
    return result;
  });

  // 删除标签（软删除）
  ipcMain.handle(TAG_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.tags).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.tags.id, id));
    // 同时删除关联
    await db.delete(schema.articleTags).where(eq(schema.articleTags.tagId, id));
  });

  // 文章添加标签
  ipcMain.handle(ARTICLE_TAG_ADD, async (_event, articleId: string, tagId: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();

    // 检查是否已存在
    const existing = await db.select().from(schema.articleTags)
      .where(and(
        eq(schema.articleTags.articleId, articleId),
        eq(schema.articleTags.tagId, tagId),
      ));

    if (existing.length === 0) {
      await db.insert(schema.articleTags).values({
        articleId,
        tagId,
        createdAt: now,
      });
    }
  });

  // 文章移除标签
  ipcMain.handle(ARTICLE_TAG_REMOVE, async (_event, articleId: string, tagId: string) => {
    const db = getDatabase();
    await db.delete(schema.articleTags)
      .where(and(
        eq(schema.articleTags.articleId, articleId),
        eq(schema.articleTags.tagId, tagId),
      ));
  });

  // 按标签获取文章列表
  ipcMain.handle(ARTICLE_LIST_BY_TAG, async (_event, tagId: string) => {
    const sqlite = getSqlite();
    if (!sqlite) return [];

    const stmt = sqlite.prepare(`
      SELECT a.* FROM articles a
      INNER JOIN article_tags at2 ON at2.article_id = a.id
      WHERE at2.tag_id = ? AND a.deleted_flg = 0
      ORDER BY a.saved_at DESC
    `);
    return stmt.all(tagId);
  });

  // 获取文章关联的标签
  ipcMain.handle(ARTICLE_TAGS_FOR_ARTICLE, async (_event, articleId: string) => {
    const sqlite = getSqlite();
    if (!sqlite) return [];

    const stmt = sqlite.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN article_tags at2 ON at2.tag_id = t.id
      WHERE at2.article_id = ? AND t.deleted_flg = 0
      ORDER BY t.name
    `);
    return stmt.all(articleId);
  });
}
