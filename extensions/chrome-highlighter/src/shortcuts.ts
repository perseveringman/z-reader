/**
 * 键盘快捷键管理系统
 * 提供全局快捷键绑定和帮助面板
 */

import { toast } from './toast';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  category: string;
}

const HELP_PANEL_ID = 'zr-shortcuts-help';
let shortcuts: Shortcut[] = [];
let isHelpVisible = false;

/**
 * 注册快捷键
 */
export function registerShortcut(shortcut: Shortcut): void {
  shortcuts.push(shortcut);
}

/**
 * 初始化快捷键系统
 */
export function initShortcuts(): void {
  document.addEventListener('keydown', handleKeydown);
  console.log('[Z-Reader] 快捷键系统已初始化');
}

/**
 * 销毁快捷键系统
 */
export function destroyShortcuts(): void {
  document.removeEventListener('keydown', handleKeydown);
  shortcuts = [];
}

/**
 * 处理按键事件
 */
function handleKeydown(e: KeyboardEvent): void {
  // 忽略在输入框中的按键
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.contentEditable === 'true'
  ) {
    // 但是允许在编辑器中使用 Esc 和特定快捷键
    if (e.key !== 'Escape' && !(e.altKey && e.key === '?')) {
      return;
    }
  }

  // 查找匹配的快捷键
  const matchedShortcut = shortcuts.find((shortcut) => {
    return (
      shortcut.key.toLowerCase() === e.key.toLowerCase() &&
      !!shortcut.ctrl === e.ctrlKey &&
      !!shortcut.alt === e.altKey &&
      !!shortcut.shift === e.shiftKey &&
      !!shortcut.meta === e.metaKey
    );
  });

  if (matchedShortcut) {
    e.preventDefault();
    e.stopPropagation();
    matchedShortcut.action();
  }
}

/**
 * 显示快捷键帮助面板
 */
export function showShortcutsHelp(): void {
  if (isHelpVisible) {
    hideShortcutsHelp();
    return;
  }

  // 创建背景遮罩
  const backdrop = document.createElement('div');
  backdrop.className = 'zr-shortcuts-backdrop';
  backdrop.addEventListener('click', hideShortcutsHelp);

  // 创建帮助面板
  const panel = document.createElement('div');
  panel.id = HELP_PANEL_ID;
  panel.className = 'zr-shortcuts-help';

  // 标题
  const header = document.createElement('div');
  header.className = 'zr-shortcuts-header';
  
  const title = document.createElement('h2');
  title.textContent = '⌨️ 键盘快捷键';
  header.appendChild(title);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-shortcuts-close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', hideShortcutsHelp);
  header.appendChild(closeBtn);
  
  panel.appendChild(header);

  // 按类别分组
  const categories = groupByCategory(shortcuts);
  
  const content = document.createElement('div');
  content.className = 'zr-shortcuts-content';

  Object.entries(categories).forEach(([category, items]) => {
    const section = document.createElement('div');
    section.className = 'zr-shortcuts-section';

    const categoryTitle = document.createElement('h3');
    categoryTitle.className = 'zr-shortcuts-category';
    categoryTitle.textContent = category;
    section.appendChild(categoryTitle);

    const list = document.createElement('div');
    list.className = 'zr-shortcuts-list';

    items.forEach((shortcut) => {
      const item = document.createElement('div');
      item.className = 'zr-shortcut-item';

      const desc = document.createElement('span');
      desc.className = 'zr-shortcut-desc';
      desc.textContent = shortcut.description;
      item.appendChild(desc);

      const keys = document.createElement('div');
      keys.className = 'zr-shortcut-keys';
      keys.innerHTML = formatShortcut(shortcut);
      item.appendChild(keys);

      list.appendChild(item);
    });

    section.appendChild(list);
    content.appendChild(section);
  });

  panel.appendChild(content);

  // 添加到页面
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  isHelpVisible = true;
}

/**
 * 隐藏快捷键帮助面板
 */
export function hideShortcutsHelp(): void {
  const panel = document.getElementById(HELP_PANEL_ID);
  const backdrop = document.querySelector('.zr-shortcuts-backdrop');

  if (panel) panel.remove();
  if (backdrop) backdrop.remove();

  isHelpVisible = false;
}

/**
 * 按类别分组快捷键
 */
function groupByCategory(shortcuts: Shortcut[]): Record<string, Shortcut[]> {
  const groups: Record<string, Shortcut[]> = {};
  
  shortcuts.forEach((shortcut) => {
    if (!groups[shortcut.category]) {
      groups[shortcut.category] = [];
    }
    groups[shortcut.category].push(shortcut);
  });

  return groups;
}

/**
 * 格式化快捷键显示
 */
function formatShortcut(shortcut: Shortcut): string {
  const keys: string[] = [];
  
  if (shortcut.ctrl) keys.push('<kbd>Ctrl</kbd>');
  if (shortcut.alt) keys.push('<kbd>Alt</kbd>');
  if (shortcut.shift) keys.push('<kbd>Shift</kbd>');
  if (shortcut.meta) keys.push('<kbd>⌘</kbd>');
  
  keys.push(`<kbd>${shortcut.key.toUpperCase()}</kbd>`);
  
  return keys.join(' + ');
}

/**
 * 获取快捷键文本（用于 Toast 提示）
 */
export function getShortcutText(shortcut: Shortcut): string {
  const keys: string[] = [];
  
  if (shortcut.ctrl) keys.push('Ctrl');
  if (shortcut.alt) keys.push('Alt');
  if (shortcut.shift) keys.push('Shift');
  if (shortcut.meta) keys.push('Cmd');
  
  keys.push(shortcut.key.toUpperCase());
  
  return keys.join('+');
}