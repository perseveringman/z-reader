import { ipcMain } from 'electron';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, getSqlite, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { parseArticleContent } from '../services/parser-service';
import type { ArticleListQuery, UpdateArticleInput, ArticleSearchQuery, SaveUrlInput } from '../../shared/types';

export function registerArticleHandlers() {
  const { ARTICLE_LIST, ARTICLE_GET, ARTICLE_UPDATE, ARTICLE_DELETE, ARTICLE_PARSE_CONTENT, ARTICLE_SEARCH, ARTICLE_RESTORE, ARTICLE_PERMANENT_DELETE, ARTICLE_LIST_DELETED, ARTICLE_BATCH_UPDATE, ARTICLE_BATCH_DELETE, ARTICLE_SAVE_URL, ARTICLE_SAVE_TO_LIBRARY } = IPC_CHANNELS;

  ipcMain.handle(ARTICLE_LIST, async (_event, query: ArticleListQuery) => {
    const db = getDatabase();
    const conditions = [eq(schema.articles.deletedFlg, 0)];

    if (query.readStatus) {
      conditions.push(eq(schema.articles.readStatus, query.readStatus));
    }
    if (query.feedId) {
      conditions.push(eq(schema.articles.feedId, query.feedId));
    }
    if (query.isShortlisted) {
      conditions.push(eq(schema.articles.isShortlisted, 1));
    }
    if (query.source) {
      conditions.push(eq(schema.articles.source, query.source));
    }

    const sortField = query.sortBy === 'published_at' ? schema.articles.publishedAt : schema.articles.savedAt;
    const sortFn = query.sortOrder === 'asc' ? asc : desc;

    return db
      .select()
      .from(schema.articles)
      .where(and(...conditions))
      .orderBy(sortFn(sortField))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
  });

  ipcMain.handle(ARTICLE_GET, async (_event, id: string) => {
    const db = getDatabase();
    const result = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result[0] ?? null;
  });

  ipcMain.handle(ARTICLE_UPDATE, async (_event, input: UpdateArticleInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.readStatus !== undefined) updates.readStatus = input.readStatus;
    if (input.readProgress !== undefined) updates.readProgress = input.readProgress;
    if (input.isShortlisted !== undefined) updates.isShortlisted = input.isShortlisted ? 1 : 0;
    if (input.source !== undefined) updates.source = input.source;

    await db.update(schema.articles).set(updates).where(eq(schema.articles.id, input.id));
    const result = await db.select().from(schema.articles).where(eq(schema.articles.id, input.id));
    return result[0];
  });

  ipcMain.handle(ARTICLE_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.articles.id, id));
  });

  ipcMain.handle(ARTICLE_PARSE_CONTENT, async (_event, id: string) => {
    const db = getDatabase();
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    if (!article?.url) return null;

    const parsed = await parseArticleContent(article.url);
    if (!parsed) return null;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      content: parsed.content,
      contentText: parsed.contentText,
      wordCount: parsed.wordCount,
      readingTime: parsed.readingTime,
      updatedAt: now,
    };
    if (!article.thumbnail && parsed.leadImageUrl) {
      updates.thumbnail = parsed.leadImageUrl;
    }

    await db.update(schema.articles).set(updates).where(eq(schema.articles.id, id));
    const [updated] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return updated ?? null;
  });

  // 全文搜索 handler
  ipcMain.handle(ARTICLE_SEARCH, async (_event, query: ArticleSearchQuery) => {
    const sqlite = getSqlite();
    if (!sqlite) return [];

    const searchTerm = query.query.trim();
    if (!searchTerm) return [];

    // 使用 FTS5 进行全文搜索
    const stmt = sqlite.prepare(`
      SELECT a.* FROM articles a
      INNER JOIN articles_fts fts ON a.rowid = fts.rowid
      WHERE articles_fts MATCH ? AND a.deleted_flg = 0
      ORDER BY rank
      LIMIT ?
    `);

    return stmt.all(searchTerm + '*', query.limit ?? 20);
  });

  // 恢复已删除文章
  ipcMain.handle(ARTICLE_RESTORE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 0, updatedAt: now }).where(eq(schema.articles.id, id));
    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result;
  });

  // 永久删除文章
  ipcMain.handle(ARTICLE_PERMANENT_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    await db.delete(schema.articles).where(eq(schema.articles.id, id));
  });

  // 查询已删除文章
  ipcMain.handle(ARTICLE_LIST_DELETED, async () => {
    const db = getDatabase();
    return db.select().from(schema.articles)
      .where(eq(schema.articles.deletedFlg, 1))
      .orderBy(desc(schema.articles.updatedAt));
  });

  // 批量更新文章
  ipcMain.handle(ARTICLE_BATCH_UPDATE, async (_event, ids: string[], input: Record<string, unknown>) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.readStatus !== undefined) updates.readStatus = input.readStatus;
    if (input.readProgress !== undefined) updates.readProgress = input.readProgress;
    if (input.isShortlisted !== undefined) updates.isShortlisted = input.isShortlisted ? 1 : 0;
    await db.update(schema.articles).set(updates).where(inArray(schema.articles.id, ids));
  });

  // 批量删除文章（软删除）
  ipcMain.handle(ARTICLE_BATCH_DELETE, async (_event, ids: string[]) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 1, updatedAt: now }).where(inArray(schema.articles.id, ids));
  });

  // 手动保存 URL 到 Library
  ipcMain.handle(ARTICLE_SAVE_URL, async (_event, input: SaveUrlInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    // 使用 parser-service 解析文章内容
    const parsed = await parseArticleContent(input.url);

    let domain: string | null = null;
    try {
      domain = new URL(input.url).hostname;
    } catch {
      // invalid URL
    }

    await db.insert(schema.articles).values({
      id,
      feedId: null,
      guid: null,
      url: input.url,
      title: input.title || parsed?.title || null,
      author: parsed?.author || null,
      summary: parsed?.excerpt || null,
      content: parsed?.content || null,
      contentText: parsed?.contentText || null,
      thumbnail: parsed?.leadImageUrl || null,
      wordCount: parsed?.wordCount || 0,
      readingTime: parsed?.readingTime || 0,
      publishedAt: null,
      savedAt: now,
      readStatus: 'inbox',
      source: 'library',
      domain,
      createdAt: now,
      updatedAt: now,
    });

    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result;
  });

  // 将 Feed 文章保存到 Library
  ipcMain.handle(ARTICLE_SAVE_TO_LIBRARY, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({
      source: 'library',
      readStatus: 'inbox',
      updatedAt: now,
    }).where(eq(schema.articles.id, id));
    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result;
  });
}
