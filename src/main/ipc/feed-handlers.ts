import { ipcMain, dialog } from 'electron';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { fetchFeed, fetchAllFeeds, importOpml } from '../services/rss-service';
import { isYouTubeUrl, resolveYouTubeChannelFeed } from '../services/youtube-service';
import { resolvePodcastUrl } from '../services/podcast-resolver';
import type { CreateFeedInput, UpdateFeedInput } from '../../shared/types';
import { getGlobalTracker } from './sync-handlers';

/** Check if a URL is from a known podcast platform. */
function isPodcastPlatformUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname.includes('podcasts.apple.com') ||
      hostname.includes('itunes.apple.com') ||
      hostname.includes('open.spotify.com') ||
      hostname.includes('spotify.com') ||
      hostname.includes('xiaoyuzhoufm.com') ||
      hostname.includes('xyzfm.link')
    );
  } catch {
    return false;
  }
}

export function registerFeedHandlers() {
  const {
    FEED_ADD, FEED_LIST, FEED_UPDATE, FEED_DELETE,
    FEED_FETCH, FEED_FETCH_ALL, FEED_IMPORT_OPML,
    FEED_TOGGLE_PIN, FEED_ARTICLE_COUNT,
  } = IPC_CHANNELS;

  ipcMain.handle(FEED_ADD, async (_event, input: CreateFeedInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    // YouTube URL 自动转换
    let feedUrl = input.url;
    let feedType = 'rss';
    let resolvedTitle = input.title ?? null;

    if (isYouTubeUrl(input.url)) {
      const resolved = await resolveYouTubeChannelFeed(input.url);
      if (!resolved) throw new Error('无法解析 YouTube 频道的 RSS 地址');
      feedUrl = resolved;
      feedType = 'youtube';
    } else if (isPodcastPlatformUrl(input.url)) {
      // Podcast platform URL (Apple Podcasts, Spotify, 小宇宙)
      const resolved = await resolvePodcastUrl(input.url);
      if (!resolved?.feedUrl) throw new Error('无法解析播客 RSS 地址，请直接输入 RSS URL');
      feedUrl = resolved.feedUrl;
      feedType = 'podcast';
      if (!resolvedTitle && resolved.title) resolvedTitle = resolved.title;
    }

    const values = {
      id,
      url: feedUrl,
      title: resolvedTitle,
      category: input.category ?? null,
      feedType,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.feeds).values(values);
    getGlobalTracker()?.trackChange({ table: 'feeds', recordId: id, operation: 'insert', changedFields: values });

    // 等待 fetchFeed 完成，确保 RSS 解析的 title 已写入数据库
    await fetchFeed(id).catch(console.error);

    const result = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));
    return result[0];
  });

  ipcMain.handle(FEED_LIST, async () => {
    const db = getDatabase();
    return db.select().from(schema.feeds).where(eq(schema.feeds.deletedFlg, 0));
  });

  ipcMain.handle(FEED_UPDATE, async (_event, input: UpdateFeedInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.title !== undefined) updates.title = input.title;
    if (input.category !== undefined) updates.category = input.category;
    if (input.fetchInterval !== undefined) updates.fetchInterval = input.fetchInterval;

    await db.update(schema.feeds).set(updates).where(eq(schema.feeds.id, input.id));
    getGlobalTracker()?.trackChange({ table: 'feeds', recordId: input.id, operation: 'update', changedFields: updates });
    const result = await db.select().from(schema.feeds).where(eq(schema.feeds.id, input.id));
    return result[0];
  });

  ipcMain.handle(FEED_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.feeds).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.feeds.id, id));
    getGlobalTracker()?.trackChange({ table: 'feeds', recordId: id, operation: 'delete', changedFields: { deletedFlg: 1 } });
  });

  ipcMain.handle(FEED_FETCH, async (_event, id: string) => {
    return fetchFeed(id);
  });

  ipcMain.handle(FEED_FETCH_ALL, async () => {
    return fetchAllFeeds();
  });

  ipcMain.handle(FEED_IMPORT_OPML, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入 OPML',
      filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return [];

    const opmlXml = await readFile(filePaths[0], 'utf-8');
    return importOpml(opmlXml);
  });

  ipcMain.handle(FEED_TOGGLE_PIN, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));
    if (!feed) throw new Error('Feed not found');
    const newPinned = feed.pinned ? 0 : 1;
    await db.update(schema.feeds).set({ pinned: newPinned, updatedAt: now }).where(eq(schema.feeds.id, id));
    getGlobalTracker()?.trackChange({ table: 'feeds', recordId: id, operation: 'update', changedFields: { pinned: newPinned } });
    const [updated] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));
    return updated;
  });

  ipcMain.handle(FEED_ARTICLE_COUNT, async () => {
    const db = getDatabase();
    const rows = await db.select({
      feedId: schema.articles.feedId,
      total: sql<number>`COUNT(*)`,
      unseen: sql<number>`SUM(CASE WHEN ${schema.articles.readStatus} = 'unseen' THEN 1 ELSE 0 END)`,
    })
      .from(schema.articles)
      .where(eq(schema.articles.deletedFlg, 0))
      .groupBy(schema.articles.feedId);
    return rows.map(r => ({
      feedId: r.feedId || '',
      total: Number(r.total),
      unseen: Number(r.unseen),
    }));
  });
}
