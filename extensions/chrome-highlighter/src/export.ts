/**
 * 导出功能模块
 * 支持导出高亮为 Markdown、纯文本等格式
 */

import { toast } from './toast';
import { HIGHLIGHT_COLORS, type HighlightColor } from './types';

interface ExportOptions {
  format: 'markdown' | 'text' | 'html' | 'json';
  includeNotes?: boolean;
  groupByColor?: boolean;
}

interface HighlightData {
  id: string;
  text: string;
  note?: string;
  color: string;
  element: HTMLElement;
}

/**
 * 导出当前页面的高亮
 */
export async function exportHighlights(options: ExportOptions): Promise<void> {
  const highlights = collectHighlights();

  if (highlights.length === 0) {
    toast.warning('当前页面没有高亮可导出');
    return;
  }

  let content: string;
  let filename: string;
  let mimeType: string;

  switch (options.format) {
    case 'markdown':
      content = exportAsMarkdown(highlights, options);
      filename = `highlights-${getTimestamp()}.md`;
      mimeType = 'text/markdown';
      break;

    case 'text':
      content = exportAsText(highlights, options);
      filename = `highlights-${getTimestamp()}.txt`;
      mimeType = 'text/plain';
      break;

    case 'html':
      content = exportAsHTML(highlights, options);
      filename = `highlights-${getTimestamp()}.html`;
      mimeType = 'text/html';
      break;

    case 'json':
      content = exportAsJSON(highlights, options);
      filename = `highlights-${getTimestamp()}.json`;
      mimeType = 'application/json';
      break;

    default:
      toast.error('不支持的导出格式');
      return;
  }

  // 下载文件
  downloadFile(content, filename, mimeType);
  toast.success(`已导出 ${highlights.length} 条高亮为 ${options.format.toUpperCase()}`);
}

/**
 * 复制高亮为富文本到剪贴板
 */
export async function copyHighlightsAsRichText(): Promise<void> {
  const highlights = collectHighlights();

  if (highlights.length === 0) {
    toast.warning('当前页面没有高亮可复制');
    return;
  }

  const html = exportAsHTML(highlights, { format: 'html', includeNotes: true, groupByColor: true });
  const text = exportAsText(highlights, { format: 'text', includeNotes: true, groupByColor: true });

  try {
    // 使用 Clipboard API 复制富文本
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });

    await navigator.clipboard.write([clipboardItem]);
    toast.success(`已复制 ${highlights.length} 条高亮到剪贴板`);
  } catch (error) {
    // 降级方案：只复制纯文本
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${highlights.length} 条高亮到剪贴板（纯文本）`);
    } catch (e) {
      toast.error('复制失败');
    }
  }
}

/**
 * 收集页面上的所有高亮
 */
function collectHighlights(): HighlightData[] {
  const elements = Array.from(
    document.querySelectorAll('[data-zr-highlight-id]')
  ) as HTMLElement[];

  return elements.map((el) => ({
    id: el.dataset.zrHighlightId || '',
    text: el.textContent || '',
    note: el.dataset.note,
    color: getColorName(el.style.backgroundColor),
    element: el,
  }));
}

/**
 * 导出为 Markdown
 */
function exportAsMarkdown(highlights: HighlightData[], options: ExportOptions): string {
  let content = `# ${document.title}\n\n`;
  content += `**来源**: ${window.location.href}\n`;
  content += `**导出时间**: ${new Date().toLocaleString('zh-CN')}\n`;
  content += `**高亮数量**: ${highlights.length}\n\n`;
  content += '---\n\n';

  if (options.groupByColor) {
    const grouped = groupByColor(highlights);
    Object.entries(grouped).forEach(([color, items]) => {
      if (items.length === 0) return;
      content += `## ${getColorEmoji(color)} ${getColorLabel(color)} (${items.length})\n\n`;
      items.forEach((h, index) => {
        content += `### ${index + 1}. ${h.text.slice(0, 50)}...\n\n`;
        content += `> ${h.text}\n\n`;
        if (options.includeNotes && h.note) {
          content += `**📝 笔记**: ${h.note}\n\n`;
        }
        content += '---\n\n';
      });
    });
  } else {
    highlights.forEach((h, index) => {
      content += `## ${index + 1}. ${getColorEmoji(h.color)} ${h.text.slice(0, 50)}...\n\n`;
      content += `> ${h.text}\n\n`;
      if (options.includeNotes && h.note) {
        content += `**📝 笔记**: ${h.note}\n\n`;
      }
      content += '---\n\n';
    });
  }

  return content;
}

/**
 * 导出为纯文本
 */
function exportAsText(highlights: HighlightData[], options: ExportOptions): string {
  let content = `${document.title}\n`;
  content += `${'='.repeat(document.title.length)}\n\n`;
  content += `来源: ${window.location.href}\n`;
  content += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
  content += `高亮数量: ${highlights.length}\n\n`;
  content += `${'-'.repeat(80)}\n\n`;

  if (options.groupByColor) {
    const grouped = groupByColor(highlights);
    Object.entries(grouped).forEach(([color, items]) => {
      if (items.length === 0) return;
      content += `【${getColorLabel(color)}】(${items.length} 条)\n\n`;
      items.forEach((h, index) => {
        content += `${index + 1}. ${h.text}\n`;
        if (options.includeNotes && h.note) {
          content += `   📝 ${h.note}\n`;
        }
        content += '\n';
      });
      content += `${'-'.repeat(80)}\n\n`;
    });
  } else {
    highlights.forEach((h, index) => {
      content += `${index + 1}. [${getColorLabel(h.color)}] ${h.text}\n`;
      if (options.includeNotes && h.note) {
        content += `   📝 ${h.note}\n`;
      }
      content += '\n';
    });
  }

  return content;
}

/**
 * 导出为 HTML
 */
function exportAsHTML(highlights: HighlightData[], options: ExportOptions): string {
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title} - 高亮导出</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
    h1 { color: #111; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .highlight { margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .highlight-text { font-size: 16px; margin-bottom: 10px; }
    .highlight-note { background: #fff; padding: 12px; border-radius: 4px; margin-top: 10px; font-style: italic; color: #555; }
    .color-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-right: 8px; }
    .color-yellow { background: #fef3c7; color: #92400e; }
    .color-blue { background: #dbeafe; color: #1e40af; }
    .color-green { background: #d1fae5; color: #065f46; }
    .color-red { background: #fee2e2; color: #991b1b; }
    .section-title { font-size: 24px; margin-top: 40px; margin-bottom: 20px; color: #111; }
  </style>
</head>
<body>
  <h1>📖 ${document.title}</h1>
  <div class="meta">
    <p><strong>来源</strong>: <a href="${window.location.href}">${window.location.href}</a></p>
    <p><strong>导出时间</strong>: ${new Date().toLocaleString('zh-CN')}</p>
    <p><strong>高亮数量</strong>: ${highlights.length}</p>
  </div>
`;

  if (options.groupByColor) {
    const grouped = groupByColor(highlights);
    Object.entries(grouped).forEach(([color, items]) => {
      if (items.length === 0) return;
      html += `<h2 class="section-title">${getColorEmoji(color)} ${getColorLabel(color)} (${items.length})</h2>\n`;
      items.forEach((h) => {
        html += `<div class="highlight">
          <span class="color-badge color-${color}">${getColorLabel(color)}</span>
          <div class="highlight-text">${escapeHtml(h.text)}</div>`;
        if (options.includeNotes && h.note) {
          html += `<div class="highlight-note">📝 ${escapeHtml(h.note)}</div>`;
        }
        html += `</div>\n`;
      });
    });
  } else {
    highlights.forEach((h) => {
      html += `<div class="highlight">
        <span class="color-badge color-${h.color}">${getColorLabel(h.color)}</span>
        <div class="highlight-text">${escapeHtml(h.text)}</div>`;
      if (options.includeNotes && h.note) {
        html += `<div class="highlight-note">📝 ${escapeHtml(h.note)}</div>`;
      }
      html += `</div>\n`;
    });
  }

  html += `
</body>
</html>`;

  return html;
}

/**
 * 导出为 JSON
 */
function exportAsJSON(highlights: HighlightData[], options: ExportOptions): string {
  const data = {
    title: document.title,
    url: window.location.href,
    exportTime: new Date().toISOString(),
    count: highlights.length,
    highlights: highlights.map((h) => ({
      id: h.id,
      text: h.text,
      note: options.includeNotes ? h.note : undefined,
      color: h.color,
    })),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * 按颜色分组
 */
function groupByColor(highlights: HighlightData[]): Record<string, HighlightData[]> {
  const groups: Record<string, HighlightData[]> = {
    yellow: [],
    blue: [],
    green: [],
    red: [],
  };

  highlights.forEach((h) => {
    if (groups[h.color]) {
      groups[h.color].push(h);
    }
  });

  return groups;
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * HEX 颜色转 RGB 字符串
 */
function hexToRgbString(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * 获取颜色名称
 */
function getColorName(backgroundColor: string): string {
  for (const [name, hex] of Object.entries(HIGHLIGHT_COLORS)) {
    if (backgroundColor === hex || backgroundColor.includes(hexToRgbString(hex))) {
      return name;
    }
  }
  return 'yellow';
}

/**
 * 获取颜色标签
 */
function getColorLabel(color: string): string {
  const labels: Record<string, string> = {
    yellow: '黄色',
    blue: '蓝色',
    green: '绿色',
    red: '红色',
  };
  return labels[color] || '未知';
}

/**
 * 获取颜色 Emoji
 */
function getColorEmoji(color: string): string {
  const emojis: Record<string, string> = {
    yellow: '🟡',
    blue: '🔵',
    green: '🟢',
    red: '🔴',
  };
  return emojis[color] || '⚪';
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 获取时间戳
 */
function getTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}