import { HIGHLIGHT_COLORS, type HighlightColor } from './types';
import { exportHighlights, copyHighlightsAsRichText } from './export';

const CONTAINER_ID = 'zr-stats-panel-container';

interface HighlightStats {
  total: number;
  byColor: Record<HighlightColor, number>;
  withNotes: number;
}

let isPanelVisible = false;
let highlightElements: HTMLElement[] = [];

const COLOR_META: { key: HighlightColor; label: string; color: string }[] = [
  { key: 'yellow', label: '黄色', color: '#fbbf24' },
  { key: 'blue', label: '蓝色', color: '#60a5fa' },
  { key: 'green', label: '绿色', color: '#34d399' },
  { key: 'red', label: '红色', color: '#f87171' },
];

const CSS_CONTENT = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
  }

  /* ── Toggle Button ── */
  .zr-stats-toggle {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 44px;
    height: 44px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    z-index: 2147483646;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .zr-stats-toggle:hover {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
  }
  .zr-stats-toggle:active { transform: scale(0.95); }

  .zr-stats-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 18px;
    height: 18px;
    background: #ef4444;
    border: 2px solid #141414;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    padding: 0 4px;
    color: white;
  }

  /* ── Main Panel ── */
  .zr-stats-panel {
    position: fixed;
    right: 24px;
    bottom: 80px;
    width: 340px;
    max-height: calc(100vh - 120px);
    background: #141414;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: zr-panel-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }

  @keyframes zr-panel-slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .zr-panel-fade-out {
    animation: zr-panel-fade-out 0.2s ease forwards !important;
  }
  @keyframes zr-panel-fade-out {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(8px); opacity: 0; }
  }

  /* ── Header ── */
  .zr-stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .zr-stats-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .zr-header-actions { display: flex; gap: 2px; }

  .zr-icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }
  .zr-icon-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }

  /* ── Stats Overview ── */
  .zr-stats-overview {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .zr-stats-summary { display: flex; align-items: baseline; gap: 20px; }
  .zr-stats-metric { display: flex; align-items: baseline; gap: 6px; }
  .zr-stats-metric-value {
    font-size: 26px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .zr-stats-metric-label { font-size: 12px; color: #6b7280; font-weight: 500; }
  .zr-stats-metric-divider { width: 1px; height: 20px; background: rgba(255,255,255,0.1); }

  /* ── Color Bar ── */
  .zr-stats-bar-wrap { display: flex; flex-direction: column; gap: 10px; }
  .zr-stats-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
    gap: 2px;
  }
  .zr-stats-bar-segment { border-radius: 3px; transition: flex 0.3s ease; min-width: 4px; }

  /* ── Color Legend ── */
  .zr-stats-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .zr-stats-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: #9ca3af;
  }
  .zr-stats-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .zr-stats-legend-label { flex: 1; }
  .zr-stats-legend-count { font-weight: 600; font-variant-numeric: tabular-nums; color: #fff; }

  /* ── List Section ── */
  .zr-stats-list-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .zr-stats-list-header {
    padding: 12px 16px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .zr-stats-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }

  .zr-stats-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 2px;
    transition: all 0.15s;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .zr-stats-item:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255,255,255,0.08);
  }
  .zr-stats-indicator {
    flex-shrink: 0;
    width: 3px;
    height: 100%;
    min-height: 16px;
    border-radius: 2px;
    margin-top: 2px;
  }
  .zr-stats-item-content { flex: 1; min-width: 0; }
  .zr-stats-item-text {
    font-size: 13px;
    color: #9ca3af;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .zr-stats-item:hover .zr-stats-item-text { color: #fff; }
  .zr-stats-item-note {
    font-size: 12px;
    color: #3b82f6;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.75;
  }
  .zr-stats-jump {
    opacity: 0;
    color: #6b7280;
    transition: all 0.15s;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .zr-stats-item:hover .zr-stats-jump { opacity: 1; }
  .zr-stats-jump:hover { color: #3b82f6; }

  /* ── Empty State ── */
  .zr-stats-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 20px;
    text-align: center;
  }
  .zr-stats-empty-icon { color: #6b7280; opacity: 0.4; }
  .zr-stats-empty-text { font-size: 13px; color: #6b7280; }
  .zr-stats-empty-hint { font-size: 12px; color: #6b7280; opacity: 0.6; }

  /* ── Export Menu ── */
  .zr-export-menu {
    position: fixed;
    min-width: 160px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    padding: 4px;
    z-index: 2147483647;
    animation: zr-fade-in 0.12s ease;
  }
  .zr-export-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #9ca3af;
    transition: all 0.12s;
  }
  .zr-export-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
  .zr-export-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 8px; }

  @keyframes zr-fade-in {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  /* ── Scrollbar ── */
  .zr-stats-list::-webkit-scrollbar { width: 5px; }
  .zr-stats-list::-webkit-scrollbar-track { background: transparent; }
  .zr-stats-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 3px; }
  .zr-stats-list::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }
`;

const ICONS = {
  stats: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  export: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  jump: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`,
  note: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  toggle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  empty: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
};

/**
 * 初始化统计面板
 */
export function initStatsPanel(): void {
  ensureContainer();
  updateHighlightList();
}

function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    const shadow = container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS_CONTENT;
    shadow.appendChild(style);

    document.body.appendChild(container);
  }
  return container;
}

/**
 * 创建切换按钮
 */
function renderToggleButton(count: number): void {
  const container = ensureContainer();
  const shadow = container.shadowRoot!;

  let button = shadow.querySelector('.zr-stats-toggle') as HTMLButtonElement;
  if (!button) {
    button = document.createElement('button');
    button.className = 'zr-stats-toggle';
    button.onclick = toggleStatsPanel;
    shadow.appendChild(button);
  }

  button.innerHTML = `
    ${ICONS.toggle}
    <span class="zr-stats-badge" style="display: ${count > 0 ? 'flex' : 'none'}">${count}</span>
  `;
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

  const container = ensureContainer();
  const shadow = container.shadowRoot!;

  const panel = document.createElement('div');
  panel.className = 'zr-stats-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'zr-stats-header';
  header.innerHTML = `<h3>${ICONS.stats} 高亮统计</h3>`;

  const actions = document.createElement('div');
  actions.className = 'zr-header-actions';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'zr-icon-btn';
  exportBtn.innerHTML = ICONS.export;
  exportBtn.title = '导出高亮';
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    showExportMenu(exportBtn);
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-icon-btn';
  closeBtn.innerHTML = ICONS.close;
  closeBtn.onclick = hideStatsPanel;

  actions.append(exportBtn, closeBtn);
  header.appendChild(actions);
  panel.appendChild(header);

  // Stats Overview
  const stats = calculateStats();
  const overview = document.createElement('div');
  overview.className = 'zr-stats-overview';

  // 概要数字: 42 条高亮 · 3 条笔记
  const summary = document.createElement('div');
  summary.className = 'zr-stats-summary';
  summary.innerHTML = `
    <div class="zr-stats-metric">
      <span class="zr-stats-metric-value">${stats.total}</span>
      <span class="zr-stats-metric-label">条高亮</span>
    </div>
    <div class="zr-stats-metric-divider"></div>
    <div class="zr-stats-metric">
      <span class="zr-stats-metric-value">${stats.withNotes}</span>
      <span class="zr-stats-metric-label">条笔记</span>
    </div>
  `;
  overview.appendChild(summary);

  // 颜色分布条 + 图例
  if (stats.total > 0) {
    const barWrap = document.createElement('div');
    barWrap.className = 'zr-stats-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'zr-stats-bar';

    COLOR_META.forEach(c => {
      const count = stats.byColor[c.key];
      if (count > 0) {
        const segment = document.createElement('div');
        segment.className = 'zr-stats-bar-segment';
        segment.style.backgroundColor = c.color;
        segment.style.flex = `${count}`;
        segment.title = `${c.label}: ${count}`;
        bar.appendChild(segment);
      }
    });

    barWrap.appendChild(bar);

    // 图例
    const legend = document.createElement('div');
    legend.className = 'zr-stats-legend';

    COLOR_META.forEach(c => {
      const count = stats.byColor[c.key];
      const item = document.createElement('div');
      item.className = 'zr-stats-legend-item';
      item.innerHTML = `
        <span class="zr-stats-legend-dot" style="background:${c.color}"></span>
        <span class="zr-stats-legend-label">${c.label}</span>
        <span class="zr-stats-legend-count">${count}</span>
      `;
      legend.appendChild(item);
    });

    barWrap.appendChild(legend);
    overview.appendChild(barWrap);
  }

  panel.appendChild(overview);

  // Highlight List
  const listContainer = document.createElement('div');
  listContainer.className = 'zr-stats-list-container';
  listContainer.innerHTML = '<div class="zr-stats-list-header">高亮列表</div>';

  const list = document.createElement('div');
  list.className = 'zr-stats-list';

  if (highlightElements.length === 0) {
    list.innerHTML = `
      <div class="zr-stats-empty">
        <div class="zr-stats-empty-icon">${ICONS.empty}</div>
        <div class="zr-stats-empty-text">当前页面没有高亮内容</div>
        <div class="zr-stats-empty-hint">选中文字即可创建高亮</div>
      </div>
    `;
  } else {
    highlightElements.forEach(el => {
      const item = document.createElement('div');
      item.className = 'zr-stats-item';

      const indicator = document.createElement('div');
      indicator.className = 'zr-stats-indicator';
      indicator.style.backgroundColor = el.style.backgroundColor;

      const content = document.createElement('div');
      content.className = 'zr-stats-item-content';
      content.innerHTML = `<div class="zr-stats-item-text">${el.textContent || ''}</div>`;

      if (el.dataset.note) {
        const note = document.createElement('div');
        note.className = 'zr-stats-item-note';
        note.innerHTML = `${ICONS.note} <span>${el.dataset.note}</span>`;
        content.appendChild(note);
      }

      const jump = document.createElement('div');
      jump.className = 'zr-stats-jump';
      jump.innerHTML = ICONS.jump;

      item.append(indicator, content, jump);
      item.onclick = () => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--zr-blue, #3b82f6)';
        el.style.outlineOffset = '2px';
        setTimeout(() => { el.style.outline = 'none'; }, 2000);
        hideStatsPanel();
      };

      list.appendChild(item);
    });
  }
  listContainer.appendChild(list);
  panel.appendChild(listContainer);

  shadow.appendChild(panel);
  isPanelVisible = true;
}

/**
 * 隐藏统计面板
 */
export function hideStatsPanel(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const panel = container.shadowRoot?.querySelector('.zr-stats-panel') as HTMLElement;
  if (panel) {
    panel.classList.add('zr-panel-fade-out');
    setTimeout(() => {
      panel.remove();
      isPanelVisible = false;
    }, 200);
  }
}

/**
 * 更新高亮元素列表
 */
export function updateHighlightList(): void {
  highlightElements = Array.from(
    document.querySelectorAll('[data-zr-highlight-id]')
  ) as HTMLElement[];

  renderToggleButton(highlightElements.length);

  if (isPanelVisible) {
    const container = document.getElementById(CONTAINER_ID);
    const panel = container?.shadowRoot?.querySelector('.zr-stats-panel');
    if (panel) {
      panel.remove();
      isPanelVisible = false;
      showStatsPanel();
    }
  }
}

function calculateStats(): HighlightStats {
  const stats: HighlightStats = {
    total: highlightElements.length,
    byColor: { yellow: 0, blue: 0, green: 0, red: 0 },
    withNotes: 0,
  };

  highlightElements.forEach((el) => {
    const color = el.getAttribute('data-zr-color') as HighlightColor || 'yellow';
    if (stats.byColor[color] !== undefined) stats.byColor[color]++;
    if (el.dataset.note) stats.withNotes++;
  });

  return stats;
}

/**
 * 显示导出菜单
 */
function showExportMenu(button: HTMLElement): void {
  const container = document.getElementById(CONTAINER_ID);
  const shadow = container?.shadowRoot;
  if (!shadow) return;

  const menu = document.createElement('div');
  menu.className = 'zr-export-menu';

  const options = [
    { icon: '📝', text: 'Markdown', action: () => exportHighlights({ format: 'markdown', includeNotes: true, groupByColor: true }) },
    { icon: '📄', text: '纯文本', action: () => exportHighlights({ format: 'text', includeNotes: true, groupByColor: true }) },
    { icon: '🌐', text: 'HTML', action: () => exportHighlights({ format: 'html', includeNotes: true, groupByColor: true }) },
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
      item.innerHTML = `<span>${option.icon}</span> <span>${option.text}</span>`;
      item.onclick = () => {
        option.action!();
        menu.remove();
      };
      menu.appendChild(item);
    }
  });

  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  shadow.appendChild(menu);

  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

export function destroyStatsPanel(): void {
  const container = document.getElementById(CONTAINER_ID);
  container?.remove();
}
