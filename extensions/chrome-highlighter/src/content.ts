import { highlightSelection, removeHighlight, restoreHighlight } from './highlighter';
import { showToolbar, hideToolbar } from './toolbar';
import { createHighlight, deleteHighlight, getHighlightsByUrl, saveArticle } from './api';
import type { HighlightColor } from './types';

let currentArticleId: string | null = null;

async function init() {
  try {
    const result = await getHighlightsByUrl(window.location.href);
    if (result.articleId) {
      currentArticleId = result.articleId;
      for (const h of result.highlights) {
        restoreHighlight(h.id, h.text ?? '', (h.color as HighlightColor) ?? 'yellow');
      }
    }
  } catch {
    // Z-Reader 未启动，静默忽略
  }
}

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return;
  }

  requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + window.scrollX;
    const y = rect.top + window.scrollY;

    showToolbar(x, y, async (action) => {
      if (action.type === 'highlight') {
        await handleHighlight(action.color);
      } else if (action.type === 'save') {
        await handleSaveArticle();
      } else if (action.type === 'note') {
        await handleHighlightWithNote();
      }
    });
  });
});

async function ensureArticleSaved(): Promise<boolean> {
  if (currentArticleId) return true;
  try {
    const article = await saveArticle({
      url: window.location.href,
      title: document.title,
    });
    currentArticleId = article.id;
    return true;
  } catch (error) {
    console.error('[Z-Reader] 保存文章失败:', error);
    return false;
  }
}

async function handleHighlight(color: HighlightColor) {
  const result = highlightSelection(color);
  if (!result) return;

  if (!(await ensureArticleSaved())) return;

  try {
    const highlight = await createHighlight({
      articleId: currentArticleId!,
      text: result.text,
      color,
      startOffset: result.startOffset,
      endOffset: result.endOffset,
      paragraphIndex: result.paragraphIndex,
    });
    result.updateId(highlight.id);
  } catch (error) {
    console.error('[Z-Reader] 创建高亮失败:', error);
  }
}

async function handleSaveArticle() {
  await ensureArticleSaved();
}

async function handleHighlightWithNote() {
  const note = prompt('输入笔记:');
  if (note === null) return;

  const result = highlightSelection('yellow');
  if (!result) return;

  if (!(await ensureArticleSaved())) return;

  try {
    const highlight = await createHighlight({
      articleId: currentArticleId!,
      text: result.text,
      note,
      color: 'yellow',
      startOffset: result.startOffset,
      endOffset: result.endOffset,
      paragraphIndex: result.paragraphIndex,
    });
    result.updateId(highlight.id);
  } catch (error) {
    console.error('[Z-Reader] 创建带笔记高亮失败:', error);
  }
}

document.addEventListener('zr-highlight-click', (e) => {
  const detail = (e as CustomEvent).detail;
  if (!detail?.id) return;

  if (confirm('是否删除此高亮？')) {
    removeHighlight(detail.id);
    deleteHighlight(detail.id).catch((error) => {
      console.error('[Z-Reader] 删除高亮失败:', error);
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ARTICLE_SAVED') {
    currentArticleId = message.payload.id;
  }
});

init();
