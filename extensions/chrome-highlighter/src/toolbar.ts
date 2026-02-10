import { HIGHLIGHT_COLORS, type HighlightColor } from './types';

const TOOLBAR_ID = 'zr-highlight-toolbar';

type ToolbarAction = {
  type: 'highlight';
  color: HighlightColor;
} | {
  type: 'note';
} | {
  type: 'save';
};

type ToolbarCallback = (action: ToolbarAction) => void;

let currentCallback: ToolbarCallback | null = null;

// 显示浮动工具栏
export function showToolbar(x: number, y: number, callback: ToolbarCallback): void {
  hideToolbar();
  currentCallback = callback;

  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;

  // 颜色按钮
  const colors: HighlightColor[] = ['yellow', 'blue', 'green', 'red'];
  colors.forEach((color) => {
    const btn = document.createElement('button');
    btn.className = 'zr-toolbar-btn zr-color-btn';
    btn.style.backgroundColor = HIGHLIGHT_COLORS[color];
    btn.title = `${color} 高亮`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCallback?.({ type: 'highlight', color });
      hideToolbar();
    });
    toolbar.appendChild(btn);
  });

  // 分隔线
  const divider = document.createElement('span');
  divider.className = 'zr-toolbar-divider';
  toolbar.appendChild(divider);

  // 添加笔记按钮
  const noteBtn = document.createElement('button');
  noteBtn.className = 'zr-toolbar-btn zr-action-btn';
  noteBtn.textContent = '📝';
  noteBtn.title = '添加笔记';
  noteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentCallback?.({ type: 'note' });
    hideToolbar();
  });
  toolbar.appendChild(noteBtn);

  // 保存按钮
  const saveBtn = document.createElement('button');
  saveBtn.className = 'zr-toolbar-btn zr-action-btn';
  saveBtn.textContent = '💾';
  saveBtn.title = '保存到 Z-Reader';
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentCallback?.({ type: 'save' });
    hideToolbar();
  });
  toolbar.appendChild(saveBtn);

  // 定位工具栏
  toolbar.style.left = `${x}px`;
  toolbar.style.top = `${y - 50}px`;

  document.body.appendChild(toolbar);

  // 确保工具栏不超出视口
  requestAnimationFrame(() => {
    const rect = toolbar.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      toolbar.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.left < 0) {
      toolbar.style.left = '8px';
    }
    if (rect.top < 0) {
      toolbar.style.top = `${y + 20}px`;
    }
  });
}

// 隐藏工具栏
export function hideToolbar(): void {
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) {
    existing.remove();
  }
  currentCallback = null;
}

// 点击页面其他区域时隐藏工具栏
document.addEventListener('mousedown', (e) => {
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (toolbar && !toolbar.contains(e.target as Node)) {
    hideToolbar();
  }
});
