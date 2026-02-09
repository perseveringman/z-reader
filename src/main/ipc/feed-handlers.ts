import { ipcMain, dialog } from 'electron';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { fetchFeed, fetchAllFeeds, importOpml } from '../services/rss-service';
import type { CreateFeedInput, UpdateFeedInput } from '../../shared/types';

export function registerFeedHandlers() {
  const {
    FEED_ADD, FEED_LIST, FEED_UPDATE, FEED_DELETE,
    FEED_FETCH, FEED_FETCH_ALL, FEED_IMPORT_OPML,
  } = IPC_CHANNELS;

  ipcMain.handle(FEED_ADD, async (_event, input: CreateFeedInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();
    const values = {
      id,
      url: input.url,
      title: input.title ?? null,
      category: input.category ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.feeds).values(values);
    const result = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));

    fetchFeed(id).catch(console.error);

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
    const result = await db.select().from(schema.feeds).where(eq(schema.feeds.id, input.id));
    return result[0];
  });

  ipcMain.handle(FEED_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.feeds).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.feeds.id, id));
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
}
