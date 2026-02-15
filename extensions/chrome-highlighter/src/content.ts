import { highlightSelection, removeHighlight, restoreHighlight } from './highlighter';
import { showToolbar, hideToolbar } from './toolbar';
import { createHighlight, deleteHighlight, getHighlightsByUrl, saveArticle, updateHighlight } from './api';
import { showNoteEditor } from './note-editor';
import { showHighlightMenu } from './highlight-menu';
import { toast } from './toast';
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

  if (!(await ensureArticleSaved())) {
    toast.error('保存文章失败，无法创建高亮');
    return;
  }

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
    toast.success('高亮已创建');
  } catch (error) {
    console.error('[Z-Reader] 创建高亮失败:', error);
    toast.error('创建高亮失败');
  }
}

async function handleSaveArticle() {
  const saved = await ensureArticleSaved();
  if (saved) {
    toast.success('文章已保存到 Z-Reader');
  } else {
    toast.error('保存文章失败');
  }
}

async function handleHighlightWithNote() {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || '';

  showNoteEditor({
    selectedText,
    onSave: async (note) => {
      const result = highlightSelection('yellow');
      if (!result) return;

      if (!(await ensureArticleSaved())) {
        toast.error('保存文章失败，无法创建高亮');
        return;
      }

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
        toast.success('笔记高亮已创建');
      } catch (error) {
        console.error('[Z-Reader] 创建带笔记高亮失败:', error);
        toast.error('创建笔记高亮失败');
      }
    },
    onCancel: () => {
      // 用户取消，不做任何操作
    },
  });
}

document.addEventListener('zr-highlight-click', (e) => {
  const detail = (e as CustomEvent).detail;
  if (!detail?.id) return;

  // 获取点击位置
  const target = e.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = rect.left + window.scrollX;
  const y = rect.bottom + window.scrollY + 5;

  // 显示高亮菜单
  showHighlightMenu({
    x,
    y,
    highlightId: detail.id,
    note: detail.note,
    onDelete: () => {
      removeHighlight(detail.id);
      deleteHighlight(detail.id)
        .then(() => {
          toast.success('高亮已删除');
        })
        .catch((error) => {
          console.error('[Z-Reader] 删除高亮失败:', error);
          toast.error('删除高亮失败');
        });
    },
    onEditNote: () => {
      showNoteEditor({
        initialNote: detail.note,
        selectedText: detail.text,
        onSave: async (note) => {
          try {
            await updateHighlight(detail.id, { note });
            toast.success('笔记已更新');
          } catch (error) {
            console.error('[Z-Reader] 更新笔记失败:', error);
            toast.error('更新笔记失败');
          }
        },
        onCancel: () => {
          // 用户取消
        },
      });
    },
    onChangeColor: async (color) => {
      try {
        await updateHighlight(detail.id, { color });
        // 更新页面上的高亮颜色
        const highlightEl = document.querySelector(`[data-highlight-id="${detail.id}"]`) as HTMLElement;
        if (highlightEl) {
          highlightEl.style.backgroundColor = getColorValue(color);
        }
        toast.success('颜色已更改');
      } catch (error) {
        console.error('[Z-Reader] 更改颜色失败:', error);
        toast.error('更改颜色失败');
      }
    },
    onCopy: () => {
      navigator.clipboard.writeText(detail.text).then(() => {
        toast.success('已复制到剪贴板');
      }).catch(() => {
        toast.error('复制失败');
      });
    },
  });
});

// 辅助函数：获取颜色值
function getColorValue(color: string): string {
  const colors: Record<string, string> = {
    yellow: '#fef3c7',
    blue: '#dbeafe',
    green: '#d1fae5',
    red: '#fee2e2',
  };
  return colors[color] || colors.yellow;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ARTICLE_SAVED') {
    currentArticleId = message.payload.id;
  }
});

init();
