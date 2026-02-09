import { ipcMain, clipboard, dialog } from 'electron';
import { writeFile } from 'fs/promises';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function generateMarkdown(article: typeof schema.articles.$inferSelect, highlights: (typeof schema.highlights.$inferSelect)[]): string {
  const lines: string[] = [];

  lines.push(`# ${article.title || 'Untitled'}`);
  lines.push('');

  if (article.domain) lines.push(`**来源:** ${article.domain}`);
  if (article.author) lines.push(`**作者:** ${article.author}`);
  if (article.publishedAt) lines.push(`**日期:** ${formatDate(article.publishedAt)}`);
  if (article.url) lines.push(`**链接:** ${article.url}`);

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Highlights');
  lines.push('');

  for (const hl of highlights) {
    if (hl.text) {
      lines.push(`> ${hl.text}`);
      lines.push('');
    }
    if (hl.note) {
      lines.push(hl.note);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function registerExportHandlers() {
  const { HIGHLIGHT_EXPORT } = IPC_CHANNELS;

  ipcMain.handle(HIGHLIGHT_EXPORT, async (_event, articleId: string, mode: 'clipboard' | 'file') => {
    const db = getDatabase();

    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId));
    if (!article) return '';

    const highlights = await db
      .select()
      .from(schema.highlights)
      .where(eq(schema.highlights.articleId, articleId));

    const markdown = generateMarkdown(article, highlights);

    if (mode === 'clipboard') {
      clipboard.writeText(markdown);
      return 'clipboard';
    }

    // mode === 'file'
    const sanitizedTitle = (article.title || 'export')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .substring(0, 100);

    const result = await dialog.showSaveDialog({
      title: '导出高亮笔记',
      defaultPath: `${sanitizedTitle}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });

    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, markdown, 'utf-8');
      return result.filePath;
    }

    return '';
  });
}
