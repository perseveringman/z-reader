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

const ICONS = {
  stats: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  export: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  jump: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`,
  note: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  toggle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
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
    
    // Inject styles
    const style = document.createElement('style');
    // We will read the CSS file and inject it, or just use a reference if we can't easily read it here.
    // Since I just wrote stats-panel.css, I'll assume it's bundled or I can inject its critical parts.
    // For robust Shadow DOM, I'll fetch/inject the CSS content.
    fetch(chrome.runtime.getURL('dist/styles.css'))
      .then(r => r.text())
      .then(css => {
        style.textContent = css;
      });
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

  // Stats Grid
  const stats = calculateStats();
  const grid = document.createElement('div');
  grid.className = 'zr-stats-cards';
  
  const cards = [
    { label: 'Total', value: stats.total, color: 'var(--zr-blue)' },
    { label: 'Notes', value: stats.withNotes, color: '#a78bfa' },
    { label: 'Yellow', value: stats.byColor.yellow, color: '#facc15' },
  ];
  
  cards.forEach(c => {
    const card = document.createElement('div');
    card.className = 'zr-stats-card';
    card.innerHTML = `
      <div class="zr-stats-value" style="color: ${c.color}">${c.value}</div>
      <div class="zr-stats-label">${c.label}</div>
    `;
    grid.appendChild(card);
  });
  panel.appendChild(grid);

  // List
  const listContainer = document.createElement('div');
  listContainer.className = 'zr-stats-list-container';
  listContainer.innerHTML = '<div class="zr-stats-list-header">高亮列表</div>';
  
  const list = document.createElement('div');
  list.className = 'zr-stats-list';
  
  if (highlightElements.length === 0) {
    list.innerHTML = '<div class="zr-stats-empty">当前页面没有高亮内容</div>';
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
        el.style.outline = '2px solid var(--zr-blue)';
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
