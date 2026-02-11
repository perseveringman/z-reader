import { ipcMain } from 'electron';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { fetchTranscript, getVideoStreamUrl } from '../services/youtube-service';
import { openLoginWindow, clearAuth, isLoggedIn } from '../services/youtube-auth';

export function registerTranscriptHandlers() {
  // 查询缓存字幕
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_GET, async (_event, articleId: string) => {
    const db = getDatabase();
    const [row] = await db.select().from(schema.transcripts)
      .where(eq(schema.transcripts.articleId, articleId));
    if (!row) return null;
    return {
      ...row,
      segments: JSON.parse(row.segments || '[]'),
    };
  });

  // 从 YouTube 获取字幕并缓存
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_FETCH, async (_event, articleId: string) => {
    const db = getDatabase();

    // 检查缓存
    const [existing] = await db.select().from(schema.transcripts)
      .where(eq(schema.transcripts.articleId, articleId));
    if (existing) {
      return { ...existing, segments: JSON.parse(existing.segments || '[]') };
    }

    // 获取 article 的 videoId
    const [article] = await db.select().from(schema.articles)
      .where(eq(schema.articles.id, articleId));
    if (!article?.videoId) return null;

    const result = await fetchTranscript(article.videoId);
    if (!result) return null;

    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(schema.transcripts).values({
      id,
      articleId,
      segments: JSON.stringify(result.segments),
      language: result.language,
      createdAt: now,
    });

    return {
      id,
      articleId,
      segments: result.segments,
      language: result.language,
      createdAt: now,
    };
  });

  // 获取 YouTube 视频流直链 URL
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_GET_STREAM_URL, async (_event, videoId: string) => {
    return getVideoStreamUrl(videoId);
  });

  // YouTube 认证：打开登录窗口
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_LOGIN, async () => {
    return openLoginWindow();
  });

  // YouTube 认证：清除 cookie
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_LOGOUT, async () => {
    return clearAuth();
  });

  // YouTube 认证：查询登录状态
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_AUTH_STATUS, async () => {
    return isLoggedIn();
  });
}
