/**
 * 微信文章离线保存服务
 * 
 * 使用 Electron BrowserWindow 替代 Python Playwright 实现网页离线保存。
 * 核心策略：打开隐藏窗口加载微信文章，滚动触发懒加载，拦截资源，
 * 强制 data-src → src，最后保存完整 HTML 和所有资源。
 */
import { BrowserWindow } from 'electron';
import { getDatabase, schema } from '../db';
import { eq } from 'drizzle-orm';
import { delayShortTime, isCancelled, clearCancel, getRandomUA } from './wechat-service';

/**
 * 使用 Electron BrowserWindow 保存微信文章为离线 HTML
 */
export async function saveArticleHtml(
  articleUrl: string,
  articleTitle: string,
  publishDate: string,
): Promise<{ htmlContent: string; textContent: string } | null> {
  return new Promise((resolve) => {
    // 创建隐藏的 BrowserWindow
    const win = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // 允许跨域加载资源
      },
    });

    const ua = getRandomUA();
    win.webContents.setUserAgent(ua);

    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try { win.destroy(); } catch { /* ignore */ }
    };

    // 超时保护
    timeoutId = setTimeout(() => {
      console.error(`[wechat-html-saver] Timeout for ${articleTitle}`);
      cleanup();
      resolve(null);
    }, 60000);

    win.webContents.once('did-finish-load', async () => {
      try {
        // 等待初始加载
        await new Promise(r => setTimeout(r, 1000));

        // 滚动页面触发懒加载
        await win.webContents.executeJavaScript(`
          (async () => {
            let previousHeight = document.body.scrollHeight;
            let stableCount = 0;
            for (let i = 0; i < 50; i++) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(r => setTimeout(r, 200));
              const newHeight = document.body.scrollHeight;
              if (newHeight === previousHeight) {
                stableCount++;
                if (stableCount >= 3) break;
              } else {
                stableCount = 0;
              }
              previousHeight = newHeight;
            }
            window.scrollTo(0, 0);
          })()
        `);

        // 等待网络空闲
        await new Promise(r => setTimeout(r, 1000));

        // 强制将 data-src 写入 src（处理懒加载图片）
        await win.webContents.executeJavaScript(`
          (() => {
            const images = document.querySelectorAll('img');
            const lazyAttrs = ['data-src', 'data-original', 'data-original-src', 'data-lazy-src', 'data-actualsrc', 'data-echo'];
            images.forEach(img => {
              for (const attr of lazyAttrs) {
                const value = img.getAttribute(attr);
                if (value && value.trim() && !value.startsWith('data:image')) {
                  const currentSrc = img.src || '';
                  if (!currentSrc || currentSrc.includes('blank') || currentSrc.startsWith('data:image')) {
                    img.src = value;
                    break;
                  }
                }
              }
            });
          })()
        `);

        await new Promise(r => setTimeout(r, 500));

        // 获取 HTML 内容
        const htmlContent = await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML'
        );

        // 提取纯文本内容
        const textContent = await win.webContents.executeJavaScript(`
          (() => {
            const texts = document.body.innerText.split('\\n').filter(t => t.trim());
            return texts.join('\\n');
          })()
        `);

        cleanup();
        resolve({ htmlContent, textContent });
      } catch (err) {
        console.error('[wechat-html-saver] Error:', err);
        cleanup();
        resolve(null);
      }
    });

    win.webContents.once('did-fail-load', () => {
      cleanup();
      resolve(null);
    });

    win.loadURL(articleUrl);
  });
}

/**
 * 批量下载文章内容并保存到数据库
 */
export async function downloadArticleContents(
  feedId: string,
  articleIds: string[] | undefined,
  onProgress: (current: number, total: number, title: string) => void,
): Promise<number> {
  const db = getDatabase();

  // 获取需要处理的文章列表
  let articles;
  if (articleIds && articleIds.length > 0) {
    articles = [];
    for (const id of articleIds) {
      const [a] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
      if (a) articles.push(a);
    }
  } else {
    // 获取所有未下载内容的文章
    articles = await db.select().from(schema.articles)
      .where(eq(schema.articles.feedId, feedId));
    articles = articles.filter(a => !a.content && a.url);
  }

  clearCancel(feedId);
  let saved = 0;

  for (let i = 0; i < articles.length; i++) {
    if (isCancelled(feedId)) break;

    const article = articles[i];
    onProgress(i + 1, articles.length, article.title || '未知标题');

    if (!article.url) continue;
    if (article.content) continue; // 跳过已有内容的

    await delayShortTime();

    const result = await saveArticleHtml(
      article.url,
      article.title || '未知标题',
      article.publishedAt || '',
    );

    if (result) {
      const now = new Date().toISOString();

      // 计算字数和阅读时间
      const wordCount = result.textContent.length;
      const readingTime = Math.ceil(wordCount / 400); // 约 400 字/分钟

      await db.update(schema.articles).set({
        content: result.htmlContent,
        contentText: result.textContent,
        wordCount,
        readingTime,
        updatedAt: now,
      }).where(eq(schema.articles.id, article.id));

      saved++;
    }
  }

  clearCancel(feedId);
  return saved;
}
