# Z-Reader Chrome 插件迭代改进计划

> 生成日期：2026-02-15  
> 基于对现有 chrome-highlighter 插件的全面代码审查和项目规划分析

## 📋 目录

1. [当前状态概览](#当前状态概览)
2. [核心改进建议](#核心改进建议)
3. [Phase 1: 基础体验优化](#phase-1-基础体验优化)
4. [Phase 2: 功能增强](#phase-2-功能增强)
5. [Phase 3: 深度集成](#phase-3-深度集成)
6. [技术债务清理](#技术债务清理)

---

## 当前状态概览

### ✅ 已实现功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 文本高亮 | ✅ | 支持 4 色高亮（黄/蓝/绿/红） |
| 添加笔记 | ✅ | 使用 `prompt()` 简单实现 |
| 保存文章 | ✅ | 手动保存到 Z-Reader |
| 持久化渲染 | ✅ | 基于文本匹配恢复高亮 |
| 右键菜单 | ⚠️ | 代码中未找到实现 |
| Popup 连接状态 | ✅ | 显示与 Z-Reader 连接状态 |

### 🎯 架构设计

```
Chrome Extension (Content Script)
    ↓ HTTP REST API (127.0.0.1:21897)
Z-Reader Electron (api-server.ts)
    ↓ Drizzle ORM
SQLite Database
```

---

## 核心改进建议

### 🔴 高优先级（用户体验关键）

#### 1. 笔记输入体验改进

**现状问题：**
- 使用原生 `prompt()` 对话框
- 无法编辑已有笔记
- 不支持 Markdown 格式
- 体验与现代 Web 应用不符

**改进方案：**

```typescript
// 创建自定义笔记编辑器组件
// File: src/note-editor.ts

interface NoteEditorOptions {
  initialText?: string;
  highlightText: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function showNoteEditor(options: NoteEditorOptions): void {
  const overlay = document.createElement('div');
  overlay.id = 'zr-note-editor-overlay';
  overlay.innerHTML = `
    <div class="zr-note-editor-modal">
      <div class="zr-note-editor-header">
        <h3>添加笔记</h3>
        <button class="zr-close-btn">×</button>
      </div>
      <div class="zr-note-editor-content">
        <div class="zr-highlighted-text">${escapeHtml(options.highlightText)}</div>
        <textarea 
          class="zr-note-textarea" 
          placeholder="输入你的笔记（支持 Markdown）..."
          autofocus
        >${options.initialText || ''}</textarea>
        <div class="zr-note-editor-tips">
          支持 Markdown 格式 • Cmd+Enter 保存 • Esc 取消
        </div>
      </div>
      <div class="zr-note-editor-actions">
        <button class="zr-btn zr-btn-secondary" data-action="cancel">取消</button>
        <button class="zr-btn zr-btn-primary" data-action="save">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('.zr-note-textarea') as HTMLTextAreaElement;
  const saveBtn = overlay.querySelector('[data-action="save"]') as HTMLButtonElement;
  const cancelBtn = overlay.querySelector('[data-action="cancel"]') as HTMLButtonElement;
  const closeBtn = overlay.querySelector('.zr-close-btn') as HTMLButtonElement;
  
  const close = () => overlay.remove();
  
  saveBtn.addEventListener('click', () => {
    options.onSave(textarea.value.trim());
    close();
  });
  
  [cancelBtn, closeBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      options.onCancel();
      close();
    });
  });
  
  // 快捷键支持
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      options.onCancel();
      close();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      options.onSave(textarea.value.trim());
      close();
    }
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      options.onCancel();
      close();
    }
  });
}
```

**样式设计：**
```css
/* File: src/styles/note-editor.css */

#zr-note-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: zr-fade-in 0.2s ease;
}

.zr-note-editor-modal {
  background: #1e1e1e;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: zr-slide-up 0.3s ease;
  color: #e4e4e4;
}

.zr-note-editor-header {
  padding: 20px 24px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.zr-note-editor-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.zr-close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.zr-close-btn:hover {
  background: #333;
  color: #fff;
}

.zr-note-editor-content {
  padding: 24px;
}

.zr-highlighted-text {
  background: #2d2d2d;
  border-left: 3px solid #fef08a;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: #ccc;
}

.zr-note-textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 6px;
  color: #e4e4e4;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  transition: border-color 0.2s;
}

.zr-note-textarea:focus {
  outline: none;
  border-color: #fef08a;
}

.zr-note-editor-tips {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

.zr-note-editor-actions {
  padding: 16px 24px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.zr-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.zr-btn-secondary {
  background: #2d2d2d;
  color: #e4e4e4;
}

.zr-btn-secondary:hover {
  background: #3d3d3d;
}

.zr-btn-primary {
  background: #fef08a;
  color: #1e1e1e;
}

.zr-btn-primary:hover {
  background: #fde047;
}

@keyframes zr-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes zr-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Linear Issue:** 建议创建 `ZYB-155: Chrome 插件笔记编辑器重构`

---

#### 2. 高亮交互优化

**现状问题：**
- 点击高亮直接弹出删除确认，无其他操作选项
- 无法修改高亮颜色
- 无法查看/编辑笔记

**改进方案：**

创建高亮上下文菜单：

```typescript
// File: src/highlight-menu.ts

interface HighlightMenuOptions {
  highlightId: string;
  text: string;
  note?: string;
  color: HighlightColor;
  position: { x: number; y: number };
  onEditNote: () => void;
  onChangeColor: (color: HighlightColor) => void;
  onDelete: () => void;
  onCopy: () => void;
}

export function showHighlightMenu(options: HighlightMenuOptions): void {
  hideHighlightMenu();
  
  const menu = document.createElement('div');
  menu.id = 'zr-highlight-menu';
  menu.innerHTML = `
    <div class="zr-menu-section">
      ${options.note ? `
        <div class="zr-menu-note">${escapeHtml(options.note)}</div>
      ` : ''}
    </div>
    <div class="zr-menu-section zr-menu-actions">
      <button class="zr-menu-item" data-action="edit-note">
        <span class="zr-menu-icon">📝</span>
        ${options.note ? '编辑笔记' : '添加笔记'}
      </button>
      <button class="zr-menu-item" data-action="copy">
        <span class="zr-menu-icon">📋</span>
        复制文本
      </button>
    </div>
    <div class="zr-menu-section zr-menu-colors">
      <div class="zr-menu-label">更改颜色</div>
      <div class="zr-color-grid">
        ${['yellow', 'blue', 'green', 'red'].map(color => `
          <button 
            class="zr-color-option ${color === options.color ? 'active' : ''}"
            style="background: ${HIGHLIGHT_COLORS[color as HighlightColor]}"
            data-color="${color}"
          ></button>
        `).join('')}
      </div>
    </div>
    <div class="zr-menu-section">
      <button class="zr-menu-item zr-menu-delete" data-action="delete">
        <span class="zr-menu-icon">🗑️</span>
        删除高亮
      </button>
    </div>
  `;
  
  // 定位逻辑
  menu.style.left = `${options.position.x}px`;
  menu.style.top = `${options.position.y}px`;
  
  document.body.appendChild(menu);
  
  // 事件绑定
  menu.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      
      if (action === 'edit-note') options.onEditNote();
      else if (action === 'copy') options.onCopy();
      else if (action === 'delete') options.onDelete();
      
      hideHighlightMenu();
    });
  });
  
  menu.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = (btn as HTMLElement).dataset.color as HighlightColor;
      options.onChangeColor(color);
      hideHighlightMenu();
    });
  });
  
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', hideHighlightMenu, { once: true });
  }, 0);
  
  // 确保不超出视口
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${options.position.y - rect.height - 8}px`;
    }
  });
}

export function hideHighlightMenu(): void {
  document.getElementById('zr-highlight-menu')?.remove();
}
```

**更新 content.ts 中的点击处理：**

```typescript
document.addEventListener('zr-highlight-click', (e) => {
  const detail = (e as CustomEvent).detail;
  if (!detail?.id) return;
  
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  
  // 获取当前高亮信息
  getHighlightById(detail.id).then(highlight => {
    showHighlightMenu({
      highlightId: detail.id,
      text: detail.text,
      note: highlight.note,
      color: highlight.color as HighlightColor,
      position: { x: rect.left, y: rect.bottom + 8 },
      onEditNote: () => {
        showNoteEditor({
          initialText: highlight.note || '',
          highlightText: detail.text,
          onSave: (note) => {
            updateHighlight(detail.id, { note });
          },
          onCancel: () => {}
        });
      },
      onChangeColor: (color) => {
        changeHighlightColor(detail.id, color);
        updateHighlight(detail.id, { color });
      },
      onDelete: () => {
        if (confirm('确定删除此高亮？')) {
          removeHighlight(detail.id);
          deleteHighlight(detail.id);
        }
      },
      onCopy: () => {
        navigator.clipboard.writeText(detail.text);
        showToast('已复制到剪贴板');
      }
    });
  });
});
```

**Linear Issue:** `ZYB-156: Chrome 插件高亮上下文菜单`

---

#### 3. 右键菜单实现

**现状：** 文档中提到但代码未实现

**改进方案：**

```typescript
// File: src/background.ts

chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'zr-highlight-selection',
    title: '高亮选中文本',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'zr-save-page',
    title: '保存到 Z-Reader',
    contexts: ['page', 'selection']
  });
  
  chrome.contextMenus.create({
    id: 'zr-separator',
    type: 'separator',
    contexts: ['selection']
  });
  
  // 子菜单：不同颜色高亮
  ['yellow', 'blue', 'green', 'red'].forEach(color => {
    chrome.contextMenus.create({
      id: `zr-highlight-${color}`,
      parentId: 'zr-highlight-selection',
      title: `${colorNames[color]} 高亮`,
      contexts: ['selection']
    });
  });
  
  chrome.contextMenus.create({
    id: 'zr-highlight-with-note',
    parentId: 'zr-highlight-selection',
    title: '高亮并添加笔记',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  
  if (info.menuItemId === 'zr-save-page') {
    chrome.tabs.sendMessage(tab.id, { type: 'SAVE_PAGE' });
  } else if (info.menuItemId.toString().startsWith('zr-highlight-')) {
    const color = info.menuItemId.toString().replace('zr-highlight-', '');
    
    if (color === 'with-note') {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'HIGHLIGHT_WITH_NOTE',
        color: 'yellow'
      });
    } else {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'HIGHLIGHT',
        color 
      });
    }
  }
});

const colorNames: Record<string, string> = {
  yellow: '黄色',
  blue: '蓝色',
  green: '绿色',
  red: '红色'
};
```

**更新 content.ts 处理消息：**

```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SAVE_PAGE') {
    handleSaveArticle();
  } else if (message.type === 'HIGHLIGHT') {
    handleHighlight(message.color);
  } else if (message.type === 'HIGHLIGHT_WITH_NOTE') {
    handleHighlightWithNote();
  } else if (message.type === 'ARTICLE_SAVED') {
    currentArticleId = message.payload.id;
  }
});
```

**Linear Issue:** `ZYB-157: Chrome 插件右键菜单实现`

---

#### 4. 错误处理与用户反馈

**现状问题：**
- API 失败静默处理或仅 console.error
- 用户不知道操作是否成功
- 无网络状态指示

**改进方案：**

创建 Toast 通知系统：

```typescript
// File: src/toast.ts

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function showToast(options: string | ToastOptions): void {
  const config: ToastOptions = typeof options === 'string' 
    ? { message: options, type: 'info' }
    : options;
  
  const toast = document.createElement('div');
  toast.className = `zr-toast zr-toast-${config.type || 'info'}`;
  toast.innerHTML = `
    <div class="zr-toast-content">
      <span class="zr-toast-icon">${getIcon(config.type || 'info')}</span>
      <span class="zr-toast-message">${escapeHtml(config.message)}</span>
    </div>
    ${config.action ? `
      <button class="zr-toast-action">${config.action.label}</button>
    ` : ''}
  `;
  
  document.body.appendChild(toast);
  
  if (config.action) {
    toast.querySelector('.zr-toast-action')?.addEventListener('click', () => {
      config.action!.onClick();
      toast.remove();
    });
  }
  
  // 动画入场
  requestAnimationFrame(() => {
    toast.classList.add('zr-toast-show');
  });
  
  // 自动消失
  const duration = config.duration || 3000;
  setTimeout(() => {
    toast.classList.remove('zr-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getIcon(type: ToastType): string {
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };
  return icons[type];
}
```

**在关键操作中使用：**

```typescript
// 高亮成功
showToast({
  message: '已添加高亮',
  type: 'success',
  action: {
    label: '撤销',
    onClick: () => {
      removeHighlight(highlightId);
      deleteHighlight(highlightId);
    }
  }
});

// API 失败
showToast({
  message: 'Z-Reader 未连接，请检查应用是否运行',
  type: 'error',
  duration: 5000
});

// 保存成功
showToast({
  message: '文章已保存到 Z-Reader',
  type: 'success'
});
```

**Linear Issue:** `ZYB-158: Chrome 插件 Toast 通知系统`

---

### 🟡 中优先级（功能增强）

#### 5. 快捷键支持

**改进目标：** 对齐 Z-Reader 桌面应用的键盘优先理念

**实现方案：**

```typescript
// File: src/keyboard.ts

interface KeyboardShortcut {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  action: () => void;
  description: string;
}

const shortcuts: KeyboardShortcut[] = [
  {
    key: 'h',
    action: () => handleHighlight('yellow'),
    description: '快速黄色高亮'
  },
  {
    key: 'h',
    modifiers: { shift: true },
    action: () => showColorPicker(),
    description: '选择颜色高亮'
  },
  {
    key: 'n',
    action: () => handleHighlightWithNote(),
    description: '高亮并添加笔记'
  },
  {
    key: 's',
    modifiers: { meta: true, shift: true },
    action: () => handleSaveArticle(),
    description: '保存文章到 Z-Reader'
  }
];

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // 忽略输入框
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      return;
    }
    
    for (const shortcut of shortcuts) {
      if (matchesShortcut(e, shortcut)) {
        e.preventDefault();
        shortcut.action();
        break;
      }
    }
  });
}

function matchesShortcut(e: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  
  const mods = shortcut.modifiers || {};
  return (
    !!e.ctrlKey === !!mods.ctrl &&
    !!e.shiftKey === !!mods.shift &&
    !!e.altKey === !!mods.alt &&
    !!e.metaKey === !!mods.meta
  );
}

// 快捷键帮助面板
export function showShortcutHelp(): void {
  const panel = document.createElement('div');
  panel.id = 'zr-shortcut-help';
  panel.innerHTML = `
    <div class="zr-help-modal">
      <div class="zr-help-header">
        <h3>键盘快捷键</h3>
        <button class="zr-close-btn">×</button>
      </div>
      <div class="zr-help-content">
        ${shortcuts.map(s => `
          <div class="zr-help-item">
            <kbd>${formatShortcut(s)}</kbd>
            <span>${s.description}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  panel.querySelector('.zr-close-btn')?.addEventListener('click', () => {
    panel.remove();
  });
}

function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const mods = shortcut.modifiers || {};
  
  if (mods.meta) parts.push('⌘');
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.shift) parts.push('⇧');
  if (mods.alt) parts.push('⌥');
  parts.push(shortcut.key.toUpperCase());
  
  return parts.join(' + ');
}
```

**Linear Issue:** `ZYB-159: Chrome 插件键盘快捷键系统`

---

#### 6. 本地缓存与离线支持

**改进目标：** 即使 Z-Reader 未运行，高亮也能暂存

**实现方案：**

```typescript
// File: src/storage.ts

interface PendingHighlight {
  id: string;
  articleUrl: string;
  articleTitle: string;
  text: string;
  color: HighlightColor;
  note?: string;
  startOffset: number;
  endOffset: number;
  paragraphIndex: number;
  createdAt: string;
}

export async function savePendingHighlight(highlight: PendingHighlight): Promise<void> {
  const pending = await getPendingHighlights();
  pending.push(highlight);
  await chrome.storage.local.set({ pendingHighlights: pending });
}

export async function getPendingHighlights(): Promise<PendingHighlight[]> {
  const result = await chrome.storage.local.get('pendingHighlights');
  return result.pendingHighlights || [];
}

export async function syncPendingHighlights(): Promise<void> {
  const pending = await getPendingHighlights();
  if (pending.length === 0) return;
  
  const connected = await checkConnection();
  if (!connected) return;
  
  const synced: string[] = [];
  
  for (const highlight of pending) {
    try {
      // 确保文章已保存
      const article = await saveArticle({
        url: highlight.articleUrl,
        title: highlight.articleTitle
      });
      
      // 创建高亮
      await createHighlight({
        articleId: article.id,
        text: highlight.text,
        color: highlight.color,
        note: highlight.note,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
        paragraphIndex: highlight.paragraphIndex
      });
      
      synced.push(highlight.id);
    } catch (error) {
      console.error('同步高亮失败:', error);
    }
  }
  
  // 移除已同步的
  if (synced.length > 0) {
    const remaining = pending.filter(h => !synced.includes(h.id));
    await chrome.storage.local.set({ pendingHighlights: remaining });
    
    showToast({
      message: `已同步 ${synced.length} 条待处理高亮`,
      type: 'success'
    });
  }
}

// 定期检查并同步
setInterval(syncPendingHighlights, 30000); // 每 30 秒

// 页面加载时同步
document.addEventListener('DOMContentLoaded', syncPendingHighlights);
```

**更新高亮创建逻辑：**

```typescript
async function handleHighlight(color: HighlightColor) {
  const result = highlightSelection(color);
  if (!result) return;
  
  const connected = await checkConnection();
  
  if (!connected) {
    // 离线模式：保存到本地
    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    await savePendingHighlight({
      id: pendingId,
      articleUrl: window.location.href,
      articleTitle: document.title,
      text: result.text,
      color,
      startOffset: result.startOffset,
      endOffset: result.endOffset,
      paragraphIndex: result.paragraphIndex,
      createdAt: new Date().toISOString()
    });
    
    result.updateId(pendingId);
    
    showToast({
      message: 'Z-Reader 未连接，高亮已暂存',
      type: 'warning',
      duration: 5000
    });
    
    return;
  }
  
  // 在线模式：正常流程
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
    
    showToast({
      message: '已添加高亮',
      type: 'success'
    });
  } catch (error) {
    console.error('[Z-Reader] 创建高亮失败:', error);
    showToast({
      message: '创建高亮失败',
      type: 'error'
    });
  }
}
```

**Linear Issue:** `ZYB-160: Chrome 插件离线缓存支持`

---

#### 7. 高亮恢复算法优化

**现状问题：**
- 基于简单的文本匹配，容易失败
- 动态加载内容无法恢复
- 不支持跨页面导航恢复

**改进方案：**

实现更智能的锚点定位算法（参考 Hypothesis 的方案）：

```typescript
// File: src/anchor.ts

interface TextPosition {
  start: number;
  end: number;
}

interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix: string;
  suffix: string;
}

interface RangeSelector {
  type: 'RangeSelector';
  startContainer: string; // XPath
  startOffset: number;
  endContainer: string;
  endOffset: number;
}

interface Anchor {
  textQuote: TextQuoteSelector;
  range?: RangeSelector;
}

/**
 * 从 Range 创建锚点
 */
export function createAnchor(range: Range): Anchor {
  const exact = range.toString();
  const textContent = document.body.textContent || '';
  const startOffset = getTextOffset(range.startContainer, range.startOffset);
  
  // 提取前后文
  const prefixStart = Math.max(0, startOffset - 32);
  const suffixEnd = Math.min(textContent.length, startOffset + exact.length + 32);
  
  const prefix = textContent.substring(prefixStart, startOffset);
  const suffix = textContent.substring(startOffset + exact.length, suffixEnd);
  
  return {
    textQuote: {
      type: 'TextQuoteSelector',
      exact,
      prefix,
      suffix
    },
    range: {
      type: 'RangeSelector',
      startContainer: getXPath(range.startContainer),
      startOffset: range.startOffset,
      endContainer: getXPath(range.endContainer),
      endOffset: range.endOffset
    }
  };
}

/**
 * 从锚点恢复 Range
 */
export function restoreRange(anchor: Anchor): Range | null {
  // 优先尝试精确的 Range 恢复
  if (anchor.range) {
    try {
      const range = restoreRangeSelector(anchor.range);
      if (range && range.toString() === anchor.textQuote.exact) {
        return range;
      }
    } catch (e) {
      // DOM 结构变化，降级到文本搜索
    }
  }
  
  // 使用文本引用恢复
  return restoreTextQuote(anchor.textQuote);
}

function restoreRangeSelector(selector: RangeSelector): Range | null {
  try {
    const startNode = getNodeByXPath(selector.startContainer);
    const endNode = getNodeByXPath(selector.endContainer);
    
    if (!startNode || !endNode) return null;
    
    const range = document.createRange();
    range.setStart(startNode, selector.startOffset);
    range.setEnd(endNode, selector.endOffset);
    
    return range;
  } catch {
    return null;
  }
}

function restoreTextQuote(selector: TextQuoteSelector): Range | null {
  const textContent = document.body.textContent || '';
  
  // 查找精确文本 + 前后文匹配
  const searchText = selector.prefix + selector.exact + selector.suffix;
  let startIndex = textContent.indexOf(searchText);
  
  if (startIndex === -1) {
    // 降级：仅匹配精确文本
    startIndex = textContent.indexOf(selector.exact);
    if (startIndex === -1) return null;
  } else {
    startIndex += selector.prefix.length;
  }
  
  const endIndex = startIndex + selector.exact.length;
  
  // 将文本偏移转换为 DOM Range
  return createRangeFromTextPosition(startIndex, endIndex);
}

function getTextOffset(node: Node, offset: number): number {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT
  );
  
  let currentOffset = 0;
  let currentNode: Node | null;
  
  while ((currentNode = walker.nextNode())) {
    if (currentNode === node) {
      return currentOffset + offset;
    }
    currentOffset += currentNode.textContent?.length || 0;
  }
  
  return currentOffset;
}

function createRangeFromTextPosition(start: number, end: number): Range | null {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT
  );
  
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node: Node | null;
  
  while ((node = walker.nextNode())) {
    const textLength = node.textContent?.length || 0;
    
    if (!startNode && currentOffset + textLength >= start) {
      startNode = node;
      startOffset = start - currentOffset;
    }
    
    if (!endNode && currentOffset + textLength >= end) {
      endNode = node;
      endOffset = end - currentOffset;
      break;
    }
    
    currentOffset += textLength;
  }
  
  if (!startNode || !endNode) return null;
  
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  
  return range;
}

function getXPath(node: Node): string {
  const parts: string[] = [];
  let current: Node | null = node;
  
  while (current && current !== document.body) {
    let index = 0;
    let sibling = current.previousSibling;
    
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tagName = current.nodeName.toLowerCase();
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentNode;
  }
  
  return '//' + parts.join('/');
}

function getNodeByXPath(xpath: string): Node | null {
  const result = document.evaluate(
    xpath,
    document.body,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}
```

**更新高亮存储结构：**

```typescript
interface StoredHighlight {
  id: string;
  articleId: string;
  anchor: Anchor; // 替代简单的 text + offset
  color: HighlightColor;
  note?: string;
  createdAt: string;
}
```

**Linear Issue:** `ZYB-161: Chrome 插件高亮锚点算法优化`

---

### 🟢 低优先级（锦上添花）

#### 8. 高亮样式自定义

允许用户自定义高亮颜色和样式。

#### 9. 批量操作

支持选择多个高亮进行批量删除/修改。

#### 10. 导出功能

导出页面所有高亮为 Markdown/JSON 格式。

#### 11. 统计面板

在 Popup 中显示当前网站的高亮数量、最近高亮等信息。

#### 12. 与 Z-Reader 桌面应用的深度集成

- 从插件直接打开 Z-Reader 并跳转到对应文章
- 实时同步状态（通过 WebSocket）
- 通知中心集成

---

## Phase 1: 基础体验优化

**目标：** 修复核心体验问题，让插件达到生产可用状态

**时间估计：** 2-3 周

### 任务清单

- [ ] **ZYB-155:** 笔记编辑器重构
  - [ ] 创建模态框 UI
  - [ ] 实现 Markdown 支持
  - [ ] 快捷键集成
  - [ ] 样式优化

- [ ] **ZYB-156:** 高亮上下文菜单
  - [ ] 菜单 UI 组件
  - [ ] 颜色选择器
  - [ ] 编辑/复制/删除功能
  - [ ] 显示笔记预览

- [ ] **ZYB-157:** 右键菜单实现
  - [ ] background.ts 菜单注册
  - [ ] 消息通信
  - [ ] 子菜单支持

- [ ] **ZYB-158:** Toast 通知系统
  - [ ] Toast 组件
  - [ ] 多种类型支持
  - [ ] 操作按钮集成
  - [ ] 自动消失逻辑

### 验收标准

- ✅ 用户可以在美观的界面中编辑笔记
- ✅ 点击高亮显示功能丰富的上下文菜单
- ✅ 右键菜单完整可用
- ✅ 所有操作都有明确的反馈

---

## Phase 2: 功能增强

**目标：** 提升效率和可靠性

**时间估计：** 2-3 周

### 任务清单

- [ ] **ZYB-159:** 键盘快捷键系统
  - [ ] 快捷键监听
  - [ ] 快捷键帮助面板
  - [ ] 用户自定义支持

- [ ] **ZYB-160:** 离线缓存支持
  - [ ] 本地存储实现
  - [ ] 自动同步机制
  - [ ] 冲突处理

- [ ] **ZYB-161:** 高亮锚点算法优化
  - [ ] TextQuote + Range 双重锚点
  - [ ] 智能降级策略
  - [ ] 动态内容支持

### 验收标准

- ✅ 用户可以完全使用键盘操作插件
- ✅ Z-Reader 未运行时高亮可暂存
- ✅ 高亮在各种页面结构变化下都能正确恢复

---

## Phase 3: 深度集成

**目标：** 与 Z-Reader 桌面应用无缝集成

**时间估计：** 2-3 周

### 任务清单

- [ ] 深度链接支持（`z-reader://` 协议）
- [ ] WebSocket 实时同步
- [ ] 通知中心集成
- [ ] 阅读进度同步
- [ ] 标签同步

---

## 技术债务清理

### 代码质量

- [ ] 添加 ESLint 配置
- [ ] 添加 TypeScript strict 模式
- [ ] 单元测试覆盖核心功能
- [ ] E2E 测试（Playwright）

### 性能优化

- [ ] 减少 API 请求频率（批量操作）
- [ ] 优化高亮渲染性能
- [ ] 使用 Web Worker 处理文本搜索

### 文档

- [ ] 用户使用文档
- [ ] 开发者文档
- [ ] API 文档

### 构建优化

- [ ] 代码分割
- [ ] Tree shaking
- [ ] 压缩优化

---

## 总结

这份计划涵盖了 Z-Reader Chrome 插件从当前状态到生产就绪的完整路径。核心改进集中在：

1. **用户体验提升**：更好的笔记编辑、高亮交互、错误反馈
2. **功能完善**：实现文档中承诺但缺失的功能（右键菜单等）
3. **可靠性增强**：离线支持、智能锚点恢复
4. **效率提升**：键盘快捷键、批量操作
5. **深度集成**：与 Z-Reader 桌面应用无缝协作

建议按 Phase 1 → Phase 2 → Phase 3 的顺序迭代，每个 Phase 完成后发布一个版本，持续收集用户反馈并调整优先级。
