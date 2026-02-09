import { ipcMain } from 'electron';
import { eq, and, desc, asc } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { parseArticleContent } from '../services/parser-service';
import type { ArticleListQuery, UpdateArticleInput } from '../../shared/types';

export function registerArticleHandlers() {
  const { ARTICLE_LIST, ARTICLE_GET, ARTICLE_UPDATE, ARTICLE_DELETE, ARTICLE_PARSE_CONTENT } = IPC_CHANNELS;

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
}
