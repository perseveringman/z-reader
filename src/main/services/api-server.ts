import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { BrowserWindow, app } from 'electron';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { parseArticleContent } from './parser-service';

let server: http.Server | null = null;

const API_PORT = 21897;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, CORS_HEADERS);
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status);
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('无效的 JSON 请求体'));
      }
    });
    req.on('error', reject);
  });
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${API_PORT}`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && pathname === '/api/status') {
      return json(res, { status: 'ok', version: '1.0.0' });
    }

    if (method === 'GET' && (pathname === '/' || pathname === '/api/open')) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
      } else {
        app.emit('activate');
      }
      app.focus({ steal: true });

      // 根路径返回自动关闭的 HTML 页面，避免浏览器留下空白标签
      if (pathname === '/') {
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><title>Z-Reader</title></head><body><script>window.close()</script><p style="font-family:system-ui;color:#888;text-align:center;margin-top:40px">Z-Reader 已激活，可以关闭此页面。</p></body></html>`);
        return;
      }
      return json(res, { success: true });
    }

    if (method === 'POST' && pathname === '/api/articles') {
      return await handleCreateArticle(req, res);
    }

    if (method === 'GET' && pathname === '/api/highlights') {
      return await handleGetHighlightsByUrl(url, res);
    }

    if (method === 'POST' && pathname === '/api/highlights') {
      return await handleCreateHighlight(req, res);
    }

    if (method === 'GET' && pathname === '/api/tags') {
      return await handleGetTags(res);
    }

    if (method === 'POST' && pathname === '/api/tags') {
      return await handleCreateTag(req, res);
    }

    const highlightMatch = pathname.match(/^\/api\/highlights\/(.+)$/);
    if (highlightMatch) {
      const id = highlightMatch[1];
      
      const tagMatch = pathname.match(/^\/api\/highlights\/(.+)\/tags$/);
      if (tagMatch) {
        if (method === 'GET') return await handleGetHighlightTags(tagMatch[1], res);
        if (method === 'POST') return await handleAddTagToHighlight(tagMatch[1], req, res);
      }

      const specificTagMatch = pathname.match(/^\/api\/highlights\/(.+)\/tags\/(.+)$/);
      if (specificTagMatch && method === 'DELETE') {
        return await handleRemoveTagFromHighlight(specificTagMatch[1], specificTagMatch[2], res);
      }

      if (method === 'DELETE') return await handleDeleteHighlight(id, res);
      if (method === 'PUT') return await handleUpdateHighlight(id, req, res);
    }

    error(res, '未找到对应的 API 路由', 404);
  } catch (err) {
    console.error('API Server 错误:', err);
    error(res, '服务器内部错误', 500);
  }
}

async function handleCreateArticle(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const articleUrl = body.url as string | undefined;

  if (!articleUrl) {
    return error(res, 'url 为必填字段');
  }

  const db = getDatabase();

  const existing = await db
    .select()
    .from(schema.articles)
    .where(and(eq(schema.articles.url, articleUrl), eq(schema.articles.deletedFlg, 0)));

  if (existing.length > 0) {
    return json(res, existing[0]);
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const domain = extractDomain(articleUrl);

  await db.insert(schema.articles).values({
    id,
    feedId: null,
    guid: null,
    url: articleUrl,
    title: (body.title as string) || null,
    author: (body.author as string) || null,
    summary: (body.summary as string) || null,
    content: (body.content as string) || null,
    contentText: (body.contentText as string) || null,
    thumbnail: (body.thumbnail as string) || null,
    wordCount: 0,
    readingTime: 0,
    publishedAt: null,
    savedAt: now,
    readStatus: 'inbox',
    source: 'library',
    domain,
    createdAt: now,
    updatedAt: now,
  });

  parseArticleContent(articleUrl).then(async (parsed) => {
    if (!parsed) return;
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (parsed.content) updates.content = parsed.content;
    if (parsed.contentText) updates.contentText = parsed.contentText;
    if (parsed.wordCount) updates.wordCount = parsed.wordCount;
    if (parsed.readingTime) updates.readingTime = parsed.readingTime;
    if (parsed.leadImageUrl) updates.thumbnail = parsed.leadImageUrl;
    if (parsed.author) updates.author = parsed.author;
    if (parsed.title) updates.title = parsed.title;
    if (parsed.excerpt) updates.summary = parsed.excerpt;
    await db.update(schema.articles).set(updates).where(eq(schema.articles.id, id));
  }).catch((err) => {
    console.error('后台解析文章内容失败:', err);
  });

  const [result] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
  json(res, result, 201);
}

async function handleCreateHighlight(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const articleId = body.articleId as string | undefined;
  const text = body.text as string | undefined;

  if (!articleId || !text) {
    return error(res, 'articleId 和 text 为必填字段');
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(schema.highlights).values({
    id,
    articleId,
    text,
    note: (body.note as string) ?? null,
    color: (body.color as string) ?? 'yellow',
    startOffset: (body.startOffset as number) ?? null,
    endOffset: (body.endOffset as number) ?? null,
    paragraphIndex: (body.paragraphIndex as number) ?? null,
    createdAt: now,
    updatedAt: now,
    deletedFlg: 0,
  });

  const [result] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, id));
  json(res, result, 201);
}

async function handleGetHighlightsByUrl(url: URL, res: http.ServerResponse) {
  const articleUrl = url.searchParams.get('url');
  if (!articleUrl) {
    return error(res, 'url 查询参数为必填');
  }

  const db = getDatabase();

  const [article] = await db
    .select()
    .from(schema.articles)
    .where(and(eq(schema.articles.url, articleUrl), eq(schema.articles.deletedFlg, 0)));

  if (!article) {
    return json(res, { articleId: null, highlights: [] });
  }

  const highlights = await db
    .select()
    .from(schema.highlights)
    .where(and(eq(schema.highlights.articleId, article.id), eq(schema.highlights.deletedFlg, 0)));

  json(res, { articleId: article.id, highlights });
}

async function handleDeleteHighlight(id: string, res: http.ServerResponse) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.update(schema.highlights).set({ deletedFlg: 1, updatedAt: now }).where(eq(schema.highlights.id, id));
  json(res, { success: true });
}

async function handleUpdateHighlight(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const db = getDatabase();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.note !== undefined) updates.note = body.note;
  if (body.color !== undefined) updates.color = body.color;

  await db.update(schema.highlights).set(updates).where(eq(schema.highlights.id, id));
  const [result] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, id));

  if (!result) {
    return error(res, '高亮不存在', 404);
  }

  json(res, result);
}

async function handleGetTags(res: http.ServerResponse) {
  const db = getDatabase();
  const tags = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.deletedFlg, 0))
    .orderBy(schema.tags.name);
  json(res, tags);
}

async function handleCreateTag(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const name = body.name as string | undefined;

  if (!name) {
    return error(res, 'name 为必填字段');
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(schema.tags).values({
    id,
    name,
    parentId: (body.parentId as string) || null,
    createdAt: now,
    updatedAt: now,
    deletedFlg: 0,
  });

  const [result] = await db.select().from(schema.tags).where(eq(schema.tags.id, id));
  json(res, result, 201);
}

async function handleGetHighlightTags(highlightId: string, res: http.ServerResponse) {
  const sqlite = getDatabase(); // Actually I need to use getSqlite() for complex joins if possible, but let's try with drizzle
  // Wait, api-server.ts already has getDatabase. Let's use it.
  
  // Or use the same logic as highlight-tag-handlers.ts
  const db = getDatabase();
  // Drizzle join:
  const result = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      parentId: schema.tags.parentId,
      createdAt: schema.tags.createdAt,
      updatedAt: schema.tags.updatedAt,
    })
    .from(schema.tags)
    .innerJoin(schema.highlightTags, eq(schema.highlightTags.tagId, schema.tags.id))
    .where(and(eq(schema.highlightTags.highlightId, highlightId), eq(schema.tags.deletedFlg, 0)));

  json(res, result);
}

async function handleAddTagToHighlight(highlightId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseBody(req);
  const tagId = body.tagId as string | undefined;

  if (!tagId) {
    return error(res, 'tagId 为必填字段');
  }

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
  }

  json(res, { success: true });
}

async function handleRemoveTagFromHighlight(highlightId: string, tagId: string, res: http.ServerResponse) {
  const db = getDatabase();
  await db.delete(schema.highlightTags)
    .where(and(
      eq(schema.highlightTags.highlightId, highlightId),
      eq(schema.highlightTags.tagId, tagId),
    ));
  json(res, { success: true });
}

export function startApiServer() {
  if (server) return;

  server = http.createServer(handleRequest);
  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`API Server 已启动: http://127.0.0.1:${API_PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${API_PORT} 已被占用，API Server 启动失败`);
    } else {
      console.error('API Server 启动失败:', err);
    }
  });
}

export function stopApiServer() {
  if (!server) return;
  server.close(() => {
    console.log('API Server 已停止');
  });
  server = null;
}
