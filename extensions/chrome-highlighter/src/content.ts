import { highlightSelection, removeHighlight, restoreHighlight } from './highlighter';
import { showToolbar, hideToolbar } from './toolbar';
import { createHighlight, deleteHighlight, getHighlightsByUrl, saveArticle, updateHighlight } from './api';
import { showNoteEditor } from './note-editor';
import { showHighlightMenu } from './highlight-menu';
import { toast } from './toast';
import { initShortcuts, registerShortcut, showShortcutsHelp } from './shortcuts';
import { initStatsPanel, updateHighlightList, toggleStatsPanel } from './stats-panel';
import { initSettings, showSettingsPanel, getPreferences } from './settings-panel';
import { initOfflineSupport, saveHighlightOffline, addPendingOperation } from './offline';
import type { HighlightColor } from './types';

let currentArticleId: string | null = null;

async function init() {
  // 初始化设置系统（必须首先初始化）
  initSettings();
  
  // 初始化离线支持
  initOfflineSupport();
  
  // 初始化快捷键系统
  initShortcuts();
  registerAllShortcuts();

  // 初始化统计面板
  initStatsPanel();

  try {
    const result = await getHighlightsByUrl(window.location.href);
    if (result.articleId) {
      currentArticleId = result.articleId;
      for (const h of result.highlights) {
        restoreHighlight(h.id, h.text ?? '', (h.color as HighlightColor) ?? 'yellow');
      }
      // 恢复高亮后更新统计
      updateHighlightList();
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
    updateHighlightList(); // 更新统计
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
        updateHighlightList(); // 更新统计
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
          updateHighlightList(); // 更新统计
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

  // 处理右键菜单触发的高亮
  if (message.type === 'HIGHLIGHT_SELECTION') {
    const color = (message.payload.color || 'yellow') as HighlightColor;
    handleHighlight(color);
  }

  // 处理右键菜单触发的笔记高亮
  if (message.type === 'HIGHLIGHT_WITH_NOTE') {
    handleHighlightWithNote();
  }

  // 显示 Toast 通知
  if (message.type === 'SHOW_TOAST') {
    const { message: msg, type } = message.payload;
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else if (type === 'warning') {
      toast.warning(msg);
    } else {
      toast.info(msg);
    }
  }

  // 在 Z-Reader 中搜索
  if (message.type === 'SEARCH_IN_ZREADER') {
    const searchText = message.payload.text;
    // TODO: 实现在 Z-Reader 中搜索的功能
    toast.info(`搜索功能开发中: "${searchText}"`);
  }
});

/**
 * 注册所有快捷键
 */
function registerAllShortcuts(): void {
  // 快速高亮快捷键
  registerShortcut({
    key: '1',
    alt: true,
    description: '黄色高亮',
    category: '高亮操作',
    action: () => handleHighlight('yellow'),
  });

  registerShortcut({
    key: '2',
    alt: true,
    description: '蓝色高亮',
    category: '高亮操作',
    action: () => handleHighlight('blue'),
  });

  registerShortcut({
    key: '3',
    alt: true,
    description: '绿色高亮',
    category: '高亮操作',
    action: () => handleHighlight('green'),
  });

  registerShortcut({
    key: '4',
    alt: true,
    description: '红色高亮',
    category: '高亮操作',
    action: () => handleHighlight('red'),
  });

  // 添加笔记快捷键
  registerShortcut({
    key: 'n',
    alt: true,
    description: '添加笔记高亮',
    category: '高亮操作',
    action: handleHighlightWithNote,
  });

  // 保存文章快捷键
  registerShortcut({
    key: 's',
    alt: true,
    description: '保存文章到 Z-Reader',
    category: '文章操作',
    action: handleSaveArticle,
  });

  // 切换统计面板
  registerShortcut({
    key: 'h',
    alt: true,
    description: '切换高亮统计面板',
    category: '面板操作',
    action: toggleStatsPanel,
  });

  // 打开设置面板
  registerShortcut({
    key: ',',
    alt: true,
    description: '打开设置面板',
    category: '面板操作',
    action: showSettingsPanel,
  });

  // 显示帮助快捷键
  registerShortcut({
    key: '?',
    alt: true,
    description: '显示快捷键帮助',
    category: '帮助',
    action: showShortcutsHelp,
  });

  console.log('[Z-Reader] 已注册 9 个快捷键');
}

init();
