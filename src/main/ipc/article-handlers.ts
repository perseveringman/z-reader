import { ipcMain, dialog, app } from 'electron';
import { eq, and, desc, asc, inArray, or, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { parseArticleContent } from '../services/parser-service';
import { extractPdfMetadata } from '../services/epub-metadata';
import { isYouTubeUrl, extractYouTubeVideoId, fetchYouTubeVideoMeta } from '../services/youtube-service';
import { isPodcastEpisodeUrl, fetchPodcastEpisodeMeta } from '../services/podcast-resolver';
import {
  buildImportedMediaArticle,
  detectLocalMediaTypeFromExtension,
  detectMediaDurationInSeconds,
  inferMediaMimeFromPath,
  inferTitleFromFilePath,
} from '../services/local-media-import';
import type { ArticleListQuery, UpdateArticleInput, ArticleSearchQuery, SaveUrlInput } from '../../shared/types';
import { getGlobalTracker } from './sync-handlers';
import { triggerRAGIndexForArticle } from './rag-index-hook';
import { triggerKGExtractForArticle } from './kg-index-hook';
import { triggerCleanupArticle } from './incremental-index-hooks';

function isArxivPdfUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname === 'arxiv.org' && parsed.pathname.startsWith('/pdf/');
  } catch {
    return false;
  }
}

function isRemotePdfUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname.toLowerCase().endsWith('.pdf') || isArxivPdfUrl(rawUrl);
  } catch {
    return false;
  }
}

function inferPdfTitleFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (!pathname) return null;
    const tail = pathname.split('/').pop();
    if (!tail) return null;
    const decoded = decodeURIComponent(tail).replace(/\.pdf$/i, '');
    if (!decoded) return null;
    if (isArxivPdfUrl(rawUrl)) {
      return `arXiv: ${decoded}`;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function registerArticleHandlers() {
  const {
    ARTICLE_LIST,
    ARTICLE_GET,
    ARTICLE_UPDATE,
    ARTICLE_DELETE,
    ARTICLE_PARSE_CONTENT,
    ARTICLE_SEARCH,
    ARTICLE_RESTORE,
    ARTICLE_PERMANENT_DELETE,
    ARTICLE_LIST_DELETED,
    ARTICLE_BATCH_UPDATE,
    ARTICLE_BATCH_DELETE,
    ARTICLE_SAVE_URL,
    ARTICLE_IMPORT_LOCAL_MEDIA,
    ARTICLE_READ_LOCAL_MEDIA,
    ARTICLE_SAVE_TO_LIBRARY,
  } = IPC_CHANNELS;

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
    if (query.mediaType) {
      conditions.push(eq(schema.articles.mediaType, query.mediaType));
    }
    if (query.feedType) {
      conditions.push(eq(schema.feeds.feedType, query.feedType));
    }

    const sortField = query.sortBy === 'published_at' ? schema.articles.publishedAt : schema.articles.savedAt;
    const sortFn = query.sortOrder === 'asc' ? asc : desc;

    const rows = await db
      .select({
        article: schema.articles,
        feedTitle: schema.feeds.title,
      })
      .from(schema.articles)
      .leftJoin(schema.feeds, eq(schema.articles.feedId, schema.feeds.id))
      .where(and(...conditions))
      .orderBy(sortFn(sortField))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);

    return rows.map(r => ({ ...r.article, feedTitle: r.feedTitle }));
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
    getGlobalTracker()?.trackChange({ table: 'articles', recordId: input.id, operation: 'update', changedFields: updates });
    const result = await db.select().from(schema.articles).where(eq(schema.articles.id, input.id));
    return result[0];
  });

  ipcMain.handle(ARTICLE_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.articles.id, id));
    getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'delete', changedFields: { deletedFlg: 1 } });
    // 异步清理 RAG/KG 索引
    triggerCleanupArticle(id).catch((err) => {
      console.error('Cleanup failed for deleted article', id, err);
    });
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
    const db = getDatabase();
    const searchTerm = query.query.trim();
    if (!searchTerm) return [];

    const limit = query.limit ?? 20;
    const pattern = `%${searchTerm}%`;

    return db
      .select()
      .from(schema.articles)
      .where(and(
        eq(schema.articles.deletedFlg, 0),
        or(
          like(schema.articles.title, pattern),
          like(schema.articles.contentText, pattern),
          like(schema.articles.author, pattern),
        ),
      ))
      .limit(limit);
  });

  // 恢复已删除文章
  ipcMain.handle(ARTICLE_RESTORE, async (_event, id: string) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 0, updatedAt: now }).where(eq(schema.articles.id, id));
    getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'update', changedFields: { deletedFlg: 0 } });
    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result;
  });

  // 永久删除文章
  ipcMain.handle(ARTICLE_PERMANENT_DELETE, async (_event, id: string) => {
    const db = getDatabase();
    // 先清理索引再删除记录
    triggerCleanupArticle(id).catch((err) => {
      console.error('Cleanup failed for permanent delete', id, err);
    });
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
    for (const id of ids) {
      getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'update', changedFields: updates });
    }
  });

  // 批量删除文章（软删除）
  ipcMain.handle(ARTICLE_BATCH_DELETE, async (_event, ids: string[]) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.update(schema.articles).set({ deletedFlg: 1, updatedAt: now }).where(inArray(schema.articles.id, ids));
    for (const id of ids) {
      getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'delete', changedFields: { deletedFlg: 1 } });
    }
  });

  // 手动保存 URL 到 Library
  ipcMain.handle(ARTICLE_SAVE_URL, async (_event, input: SaveUrlInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = randomUUID();

    let domain: string | null = null;
    try {
      domain = new URL(input.url).hostname;
    } catch {
      // invalid URL
    }

    if (isRemotePdfUrl(input.url)) {
      const booksDir = join(app.getPath('userData'), 'books');
      await mkdir(booksDir, { recursive: true });

      const response = await fetch(input.url);
      if (!response.ok) {
        throw new Error(`PDF download failed: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('pdf') && !isArxivPdfUrl(input.url)) {
        throw new Error('URL does not point to a PDF file');
      }

      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      if (pdfBuffer.byteLength === 0) {
        throw new Error('Downloaded PDF is empty');
      }

      const bookId = randomUUID();
      const filePath = join(booksDir, `${bookId}.pdf`);
      await writeFile(filePath, pdfBuffer);

      const fileStat = await stat(filePath);
      const pdfMeta = await extractPdfMetadata(filePath);
      const title = input.title?.trim() || pdfMeta.title || inferPdfTitleFromUrl(input.url);

      await db.insert(schema.books).values({
        id: bookId,
        title: title || null,
        author: pdfMeta.author || null,
        cover: null,
        filePath,
        fileType: 'pdf',
        fileSize: fileStat.size,
        language: pdfMeta.language || null,
        publisher: pdfMeta.publisher || null,
        description: pdfMeta.description || null,
        readStatus: 'inbox',
        readProgress: 0,
        totalLocations: null,
        currentLocation: null,
        isShortlisted: 0,
        createdAt: now,
        updatedAt: now,
        deletedFlg: 0,
      });

      getGlobalTracker()?.trackChange({
        table: 'books',
        recordId: bookId,
        operation: 'insert',
        changedFields: {
          title: title || null,
          author: pdfMeta.author || null,
          fileType: 'pdf',
        },
      });

      const [savedBook] = await db.select().from(schema.books).where(eq(schema.books.id, bookId));
      return savedBook;
    }

    // YouTube 视频特殊处理：提取 videoId，通过 oEmbed 获取元数据
    const videoId = isYouTubeUrl(input.url) ? extractYouTubeVideoId(input.url) : null;

    if (videoId) {
      const meta = await fetchYouTubeVideoMeta(videoId);

      await db.insert(schema.articles).values({
        id,
        feedId: null,
        guid: null,
        url: input.url,
        title: input.title || meta?.title || null,
        author: meta?.author || null,
        summary: null,
        content: null,
        contentText: null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        wordCount: 0,
        readingTime: 0,
        publishedAt: null,
        savedAt: now,
        readStatus: 'inbox',
        source: 'library',
        domain: 'youtube.com',
        mediaType: 'video',
        videoId,
        duration: meta?.duration ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } else if (isPodcastEpisodeUrl(input.url)) {
      // 播客单集特殊处理：从页面 HTML 提取播客元数据 + 解析正文
      const [meta, parsed] = await Promise.all([
        fetchPodcastEpisodeMeta(input.url),
        parseArticleContent(input.url),
      ]);

      // 优先使用 meta.content（JSON-LD 完整描述，含时间轴等），Postlight 可能丢失 JS 渲染内容
      const hasMetaContent = !!meta?.content;
      const contentHtml = hasMetaContent
        ? meta.content!.split('\n').map(line => `<p>${line}</p>`).join('')
        : parsed?.content || null;
      const contentText = hasMetaContent
        ? meta.content!
        : parsed?.contentText || null;

      await db.insert(schema.articles).values({
        id,
        feedId: null,
        guid: null,
        url: input.url,
        title: input.title || meta?.title || parsed?.title || null,
        author: meta?.author || meta?.showName || parsed?.author || null,
        summary: meta?.summary || parsed?.excerpt || null,
        content: contentHtml,
        contentText,
        thumbnail: meta?.thumbnail || parsed?.leadImageUrl || null,
        wordCount: parsed?.wordCount || 0,
        readingTime: 0,
        publishedAt: meta?.publishedAt || null,
        savedAt: now,
        readStatus: 'inbox',
        source: 'library',
        domain,
        mediaType: 'podcast',
        audioUrl: meta?.audioUrl || null,
        audioDuration: meta?.duration || null,
        duration: meta?.duration || null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // 非 YouTube URL：使用 parser-service 解析文章内容
      const parsed = await parseArticleContent(input.url);

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
    }

    getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'insert', changedFields: { url: input.url, title: input.title || null, source: 'library' } });

    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result;
  });

  // 导入本地音频/视频到 Library
  ipcMain.handle(ARTICLE_IMPORT_LOCAL_MEDIA, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择音频或视频文件',
      filters: [
        { name: 'Media', extensions: ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'webm', 'mkv'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    if (canceled || filePaths.length === 0) return [];

    const db = getDatabase();
    const now = new Date().toISOString();
    const imported = [];

    for (const srcPath of filePaths) {
      const ext = extname(srcPath).toLowerCase();
      const mediaType = detectLocalMediaTypeFromExtension(ext);
      if (!mediaType) continue;

      const id = randomUUID();
      const mediaDir = join(app.getPath('userData'), 'media', mediaType === 'podcast' ? 'podcasts' : 'videos');
      await mkdir(mediaDir, { recursive: true });
      const destPath = join(mediaDir, `${id}${ext}`);
      await copyFile(srcPath, destPath);

      const st = await stat(destPath);
      const duration = await detectMediaDurationInSeconds(destPath);
      const title = inferTitleFromFilePath(srcPath);

      const row = buildImportedMediaArticle({
        id,
        title,
        filePath: destPath,
        mediaType,
        fileSize: st.size,
        duration,
        now,
      });

      await db.insert(schema.articles).values(row);
      getGlobalTracker()?.trackChange({
        table: 'articles',
        recordId: id,
        operation: 'insert',
        changedFields: {
          title,
          source: 'library',
          mediaType,
          url: row.url,
          audioUrl: row.audioUrl,
        },
      });

      const [saved] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
      if (saved) imported.push(saved);
    }

    return imported;
  });

  ipcMain.handle(ARTICLE_READ_LOCAL_MEDIA, async (_event, articleId: string) => {
    const db = getDatabase();
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId));
    if (!article) return null;

    const rawUrl = article.mediaType === 'podcast' ? article.audioUrl : article.url;
    if (!rawUrl || !rawUrl.startsWith('file://')) return null;

    let filePath: string;
    try {
      filePath = fileURLToPath(rawUrl);
    } catch {
      return null;
    }

    try {
      const buffer = await readFile(filePath);
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        mime: inferMediaMimeFromPath(filePath),
      };
    } catch {
      return null;
    }
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
    getGlobalTracker()?.trackChange({ table: 'articles', recordId: id, operation: 'update', changedFields: { source: 'library', readStatus: 'inbox' } });
    const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));

    // 异步触发 RAG 索引 → KG 实体抽取（不阻塞返回）
    // KG 抽取依赖 RAG 的 chunks 数据，需串联在 RAG 之后
    triggerRAGIndexForArticle(result)
      .then(() => triggerKGExtractForArticle(result))
      .catch((err) => {
        console.error('RAG/KG index failed for article', id, err);
      });

    return result;
  });
}
