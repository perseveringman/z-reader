/**
 * 高亮统计面板
 * 显示当前页面的高亮统计信息和快速跳转
 */

import type { HighlightColor } from './types';
import { exportHighlights, copyHighlightsAsRichText } from './export';

const PANEL_ID = 'zr-stats-panel';
const TOGGLE_BUTTON_ID = 'zr-stats-toggle';

interface HighlightStats {
  total: number;
  byColor: Record<HighlightColor, number>;
  withNotes: number;
}

let isPanelVisible = false;
let highlightElements: HTMLElement[] = [];

/**
 * 初始化统计面板
 */
export function initStatsPanel(): void {
  createToggleButton();
  updateHighlightList();
}

/**
 * 创建切换按钮
 */
function createToggleButton(): void {
  if (document.getElementById(TOGGLE_BUTTON_ID)) return;

  const button = document.createElement('button');
  button.id = TOGGLE_BUTTON_ID;
  button.className = 'zr-stats-toggle';
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span class="zr-stats-badge" id="zr-stats-badge">0</span>
  `;
  button.title = '高亮统计 (点击查看)';
  button.addEventListener('click', toggleStatsPanel);

  document.body.appendChild(button);
}

/**
 * 切换统计面板
 */
export function toggleStatsPanel(): void {
  if (isPanelVisible) {
    hideStatsPanel();
  } else {
    showStatsPanel();
  }
}

/**
 * 显示统计面板
 */
function showStatsPanel(): void {
  if (isPanelVisible) return;

  updateHighlightList();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'zr-stats-panel';

  // 头部
  const header = document.createElement('div');
  header.className = 'zr-stats-header';

  const title = document.createElement('h3');
  title.textContent = '📊 高亮统计';
  header.appendChild(title);

  // 导出按钮
  const exportBtn = document.createElement('button');
  exportBtn.className = 'zr-stats-export';
  exportBtn.innerHTML = '📥';
  exportBtn.title = '导出高亮';
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showExportMenu(exportBtn);
  });
  header.appendChild(exportBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-stats-close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', hideStatsPanel);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // 统计卡片
  const stats = calculateStats();
  const statsCards = createStatsCards(stats);
  panel.appendChild(statsCards);

  // 高亮列表
  const list = createHighlightList();
  panel.appendChild(list);

  document.body.appendChild(panel);

  // 动画
  requestAnimationFrame(() => {
    panel.classList.add('zr-stats-panel-show');
  });

  isPanelVisible = true;
}

/**
 * 隐藏统计面板
 */
function hideStatsPanel(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  panel.classList.remove('zr-stats-panel-show');

  setTimeout(() => {
    panel.remove();
    isPanelVisible = false;
  }, 300);
}

/**
 * 更新高亮元素列表
 */
export function updateHighlightList(): void {
  highlightElements = Array.from(
    document.querySelectorAll('[data-highlight-id]')
  ) as HTMLElement[];

  // 更新徽章数字
  const badge = document.getElementById('zr-stats-badge');
  if (badge) {
    badge.textContent = highlightElements.length.toString();
    badge.style.display = highlightElements.length > 0 ? 'flex' : 'none';
  }

  // 如果面板已打开，刷新内容
  if (isPanelVisible) {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      // 更新统计卡片
      const oldCards = panel.querySelector('.zr-stats-cards');
      const stats = calculateStats();
      const newCards = createStatsCards(stats);
      if (oldCards) {
        oldCards.replaceWith(newCards);
      }

      // 更新列表
      const oldList = panel.querySelector('.zr-stats-list-container');
      const newList = createHighlightList();
      if (oldList) {
        oldList.replaceWith(newList);
      }
    }
  }
}

/**
 * 计算统计数据
 */
function calculateStats(): HighlightStats {
  const stats: HighlightStats = {
    total: highlightElements.length,
    byColor: {
      yellow: 0,
      blue: 0,
      green: 0,
      red: 0,
    },
    withNotes: 0,
  };

  highlightElements.forEach((el) => {
    const color = el.style.backgroundColor;
    if (color.includes('254, 243, 199')) stats.byColor.yellow++;
    else if (color.includes('219, 234, 254')) stats.byColor.blue++;
    else if (color.includes('209, 250, 229')) stats.byColor.green++;
    else if (color.includes('254, 226, 226')) stats.byColor.red++;

    if (el.dataset.note) {
      stats.withNotes++;
    }
  });

  return stats;
}

/**
 * 创建统计卡片
 */
function createStatsCards(stats: HighlightStats): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zr-stats-cards';

  const cards = [
    { label: '总计', value: stats.total, color: '#3b82f6' },
    { label: '黄色', value: stats.byColor.yellow, color: '#fbbf24' },
    { label: '蓝色', value: stats.byColor.blue, color: '#60a5fa' },
    { label: '绿色', value: stats.byColor.green, color: '#34d399' },
    { label: '红色', value: stats.byColor.red, color: '#f87171' },
    { label: '含笔记', value: stats.withNotes, color: '#8b5cf6' },
  ];

  cards.forEach((cardData) => {
    const card = document.createElement('div');
    card.className = 'zr-stats-card';

    const value = document.createElement('div');
    value.className = 'zr-stats-value';
    value.textContent = cardData.value.toString();
    value.style.color = cardData.color;
    card.appendChild(value);

    const label = document.createElement('div');
    label.className = 'zr-stats-label';
    label.textContent = cardData.label;
    card.appendChild(label);

    container.appendChild(card);
  });

  return container;
}

/**
 * 创建高亮列表
 */
function createHighlightList(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zr-stats-list-container';

  const header = document.createElement('div');
  header.className = 'zr-stats-list-header';
  header.textContent = '高亮列表';
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'zr-stats-list';

  if (highlightElements.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zr-stats-empty';
    empty.textContent = '当前页面没有高亮';
    list.appendChild(empty);
  } else {
    highlightElements.forEach((el, index) => {
      const item = createHighlightItem(el, index);
      list.appendChild(item);
    });
  }

  container.appendChild(list);

  return container;
}

/**
 * 创建高亮列表项
 */
function createHighlightItem(el: HTMLElement, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'zr-stats-item';

  // 颜色指示器
  const indicator = document.createElement('div');
  indicator.className = 'zr-stats-indicator';
  indicator.style.backgroundColor = el.style.backgroundColor;
  item.appendChild(indicator);

  // 内容
  const content = document.createElement('div');
  content.className = 'zr-stats-item-content';

  const text = document.createElement('div');
  text.className = 'zr-stats-item-text';
  const fullText = el.textContent || '';
  text.textContent = fullText.length > 80 ? fullText.slice(0, 80) + '...' : fullText;
  content.appendChild(text);

  if (el.dataset.note) {
    const note = document.createElement('div');
    note.className = 'zr-stats-item-note';
    note.innerHTML = `📝 ${el.dataset.note}`;
    content.appendChild(note);
  }

  item.appendChild(content);

  // 跳转按钮
  const jumpBtn = document.createElement('button');
  jumpBtn.className = 'zr-stats-jump';
  jumpBtn.innerHTML = '↗';
  jumpBtn.title = '跳转到此高亮';
  jumpBtn.addEventListener('click', () => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 高亮闪烁效果
    el.classList.add('zr-highlight-flash');
    setTimeout(() => {
      el.classList.remove('zr-highlight-flash');
    }, 2000);
    
    hideStatsPanel();
  });
  item.appendChild(jumpBtn);

  return item;
}

/**
 * 显示导出菜单
 */
function showExportMenu(button: HTMLElement): void {
  const menu = document.createElement('div');
  menu.className = 'zr-export-menu';

  const options = [
    { icon: '📝', text: 'Markdown', action: () => exportHighlights({ format: 'markdown', includeNotes: true, groupByColor: true }) },
    { icon: '📄', text: '纯文本', action: () => exportHighlights({ format: 'text', includeNotes: true, groupByColor: true }) },
    { icon: '🌐', text: 'HTML', action: () => exportHighlights({ format: 'html', includeNotes: true, groupByColor: true }) },
    { icon: '💾', text: 'JSON', action: () => exportHighlights({ format: 'json', includeNotes: true }) },
    { type: 'divider' },
    { icon: '📋', text: '复制富文本', action: copyHighlightsAsRichText },
  ];

  options.forEach((option) => {
    if (option.type === 'divider') {
      const divider = document.createElement('div');
      divider.className = 'zr-export-divider';
      menu.appendChild(divider);
    } else {
      const item = document.createElement('div');
      item.className = 'zr-export-item';
      item.innerHTML = `${option.icon} ${option.text}`;
      item.addEventListener('click', () => {
        option.action!();
        menu.remove();
      });
      menu.appendChild(item);
    }
  });

  // 定位菜单
  const rect = button.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  document.body.appendChild(menu);

  // 点击外部关闭
  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== button) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

/**
 * 销毁统计面板
 */
export function destroyStatsPanel(): void {
  hideStatsPanel();
  const button = document.getElementById(TOGGLE_BUTTON_ID);
  if (button) {
    button.remove();
  }
}