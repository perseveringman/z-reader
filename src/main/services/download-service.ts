import { app } from 'electron';
import { createWriteStream, existsSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { loadSettings } from './settings-service';
import type { DownloadRecord } from '../../shared/types';

// Active download abort controllers
const activeDownloads = new Map<string, AbortController>();

/** Get the configured download directory, falling back to userData/podcasts. */
function getDownloadDir(): string {
  const settings = loadSettings();
  const dir = settings.downloadDirectory || path.join(app.getPath('userData'), 'podcasts');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Convert a DB row to a DownloadRecord. */
function toRecord(row: typeof schema.downloads.$inferSelect): DownloadRecord {
  return {
    id: row.id,
    articleId: row.articleId ?? '',
    filePath: row.filePath ?? null,
    bytes: row.bytes ?? null,
    status: (row.status as DownloadRecord['status']) ?? 'queued',
    addedAt: row.addedAt,
    lastAccessedAt: row.lastAccessedAt ?? null,
  };
}

/** Start downloading an episode's audio file. */
export async function startDownload(articleId: string): Promise<DownloadRecord> {
  const db = getDatabase();

  // Check if already downloaded or in progress
  const [existing] = await db.select()
    .from(schema.downloads)
    .where(eq(schema.downloads.articleId, articleId))
    .limit(1);

  if (existing && (existing.status === 'ready' || existing.status === 'downloading')) {
    return toRecord(existing);
  }

  // Get the article to find audioUrl
  const [article] = await db.select()
    .from(schema.articles)
    .where(eq(schema.articles.id, articleId));

  if (!article?.audioUrl) {
    throw new Error('Article has no audio URL');
  }

  const now = new Date().toISOString();
  const downloadId = existing?.id ?? randomUUID();

  // Determine file path
  const ext = guessExtension(article.audioMime ?? '', article.audioUrl);
  const safeTitle = (article.title ?? 'episode').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 80);
  const fileName = `${safeTitle}_${downloadId.slice(0, 8)}${ext}`;
  const filePath = path.join(getDownloadDir(), fileName);

  if (existing) {
    // Reset existing failed download
    await db.update(schema.downloads).set({
      status: 'downloading',
      filePath,
      lastAccessedAt: now,
    }).where(eq(schema.downloads.id, downloadId));
  } else {
    await db.insert(schema.downloads).values({
      id: downloadId,
      articleId,
      filePath,
      bytes: 0,
      status: 'downloading',
      addedAt: now,
      lastAccessedAt: now,
    });
  }

  // Start async download
  downloadFile(downloadId, article.audioUrl, filePath).catch(console.error);

  const [record] = await db.select()
    .from(schema.downloads)
    .where(eq(schema.downloads.id, downloadId));
  return toRecord(record);
}

/** Perform the actual file download. */
async function downloadFile(downloadId: string, audioUrl: string, filePath: string): Promise<void> {
  const db = getDatabase();
  const controller = new AbortController();
  activeDownloads.set(downloadId, controller);

  try {
    const response = await fetch(audioUrl, {
      headers: { 'User-Agent': 'Z-Reader/1.0' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const fileStream = createWriteStream(filePath);
    const reader = response.body.getReader();
    let totalBytes = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      totalBytes += value.length;
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    const now = new Date().toISOString();
    await db.update(schema.downloads).set({
      status: 'ready',
      bytes: totalBytes,
      lastAccessedAt: now,
    }).where(eq(schema.downloads.id, downloadId));

    // Enforce capacity limit
    await enforceCapacityLimit();
  } catch (err) {
    if (controller.signal.aborted) return; // Cancelled, not an error

    const now = new Date().toISOString();
    await db.update(schema.downloads).set({
      status: 'failed',
      lastAccessedAt: now,
    }).where(eq(schema.downloads.id, downloadId));

    // Clean up partial file
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }

    console.error(`Download ${downloadId} failed:`, err);
  } finally {
    activeDownloads.delete(downloadId);
  }
}

/** Cancel an active download. */
export async function cancelDownload(downloadId: string): Promise<void> {
  const controller = activeDownloads.get(downloadId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(downloadId);
  }

  const db = getDatabase();
  const [dl] = await db.select()
    .from(schema.downloads)
    .where(eq(schema.downloads.id, downloadId));

  if (dl) {
    // Clean up file
    if (dl.filePath) {
      try { if (existsSync(dl.filePath)) unlinkSync(dl.filePath); } catch { /* ignore */ }
    }
    await db.update(schema.downloads).set({ status: 'failed' })
      .where(eq(schema.downloads.id, downloadId));
  }
}

/** List all download records. */
export async function listDownloads(): Promise<DownloadRecord[]> {
  const db = getDatabase();
  const rows = await db.select().from(schema.downloads);
  return rows.map(toRecord);
}

/** Get a single download status. */
export async function getDownloadStatus(downloadId: string): Promise<DownloadRecord | null> {
  const db = getDatabase();
  const [row] = await db.select()
    .from(schema.downloads)
    .where(eq(schema.downloads.id, downloadId));
  return row ? toRecord(row) : null;
}

/** Enforce the download capacity limit by removing the oldest downloads. */
async function enforceCapacityLimit(): Promise<void> {
  const settings = loadSettings();
  const limitBytes = (settings.downloadCapacityMb ?? 5120) * 1024 * 1024;

  const db = getDatabase();
  const allReady = await db.select()
    .from(schema.downloads)
    .where(eq(schema.downloads.status, 'ready'))
    .orderBy(asc(schema.downloads.lastAccessedAt));

  let totalBytes = 0;
  for (const dl of allReady) {
    totalBytes += dl.bytes ?? 0;
  }

  // Remove oldest until under limit
  for (const dl of allReady) {
    if (totalBytes <= limitBytes) break;

    if (dl.filePath) {
      try { if (existsSync(dl.filePath)) unlinkSync(dl.filePath); } catch { /* ignore */ }
    }

    await db.update(schema.downloads).set({ status: 'failed' })
      .where(eq(schema.downloads.id, dl.id));
    totalBytes -= dl.bytes ?? 0;
  }
}

/** Guess file extension from MIME type or URL. */
function guessExtension(mime: string, url: string): string {
  if (mime.includes('mp3') || mime.includes('mpeg')) return '.mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('opus')) return '.opus';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('aac')) return '.aac';

  // Fallback: extract from URL
  try {
    const pathname = new URL(url).pathname;
    const urlExt = path.extname(pathname);
    if (urlExt) return urlExt;
  } catch { /* ignore */ }

  return '.mp3';
}
