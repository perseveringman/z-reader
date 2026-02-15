/**
 * 高亮上下文菜单
 * 当用户点击已有的高亮时显示操作菜单
 */

import { toast } from './toast';

const MENU_ID = 'zr-highlight-menu';

export interface HighlightMenuOptions {
  x: number;
  y: number;
  highlightId: string;
  note?: string;
  onDelete: () => void;
  onEditNote: () => void;
  onChangeColor: (color: string) => void;
  onCopy: () => void;
}

/**
 * 显示高亮上下文菜单
 */
export function showHighlightMenu(options: HighlightMenuOptions): void {
  hideHighlightMenu();

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'zr-highlight-menu';

  // 创建菜单项
  const items = [
    {
      icon: '📝',
      text: options.note ? '编辑笔记' : '添加笔记',
      onClick: options.onEditNote,
    },
    {
      icon: '🎨',
      text: '更改颜色',
      submenu: [
        { color: 'yellow', label: '黄色' },
        { color: 'blue', label: '蓝色' },
        { color: 'green', label: '绿色' },
        { color: 'red', label: '红色' },
      ],
    },
    {
      icon: '📋',
      text: '复制文本',
      onClick: options.onCopy,
    },
    { type: 'divider' },
    {
      icon: '🗑️',
      text: '删除高亮',
      onClick: options.onDelete,
      danger: true,
    },
  ];

  items.forEach((item) => {
    if (item.type === 'divider') {
      const divider = document.createElement('div');
      divider.className = 'zr-menu-divider';
      menu.appendChild(divider);
    } else if (item.submenu) {
      const submenuItem = createSubmenuItem(item, options.onChangeColor);
      menu.appendChild(submenuItem);
    } else {
      const menuItem = createMenuItem(item);
      menu.appendChild(menuItem);
    }
  });

  // 定位菜单
  menu.style.left = `${options.x}px`;
  menu.style.top = `${options.y}px`;

  document.body.appendChild(menu);

  // 确保菜单在视口内
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    
    if (rect.right > window.innerWidth) {
      menu.style.left = `${options.x - rect.width}px`;
    }
    
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${options.y - rect.height}px`;
    }

    if (rect.left < 0) {
      menu.style.left = '8px';
    }

    if (rect.top < 0) {
      menu.style.top = '8px';
    }
  });

  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

/**
 * 创建普通菜单项
 */
function createMenuItem(item: any): HTMLElement {
  const menuItem = document.createElement('div');
  menuItem.className = `zr-menu-item ${item.danger ? 'zr-menu-item-danger' : ''}`;

  const icon = document.createElement('span');
  icon.className = 'zr-menu-icon';
  icon.textContent = item.icon;
  menuItem.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'zr-menu-text';
  text.textContent = item.text;
  menuItem.appendChild(text);

  menuItem.addEventListener('click', (e) => {
    e.stopPropagation();
    item.onClick();
    hideHighlightMenu();
  });

  return menuItem;
}

/**
 * 创建子菜单项
 */
function createSubmenuItem(item: any, onChangeColor: (color: string) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zr-menu-submenu-container';

  const menuItem = document.createElement('div');
  menuItem.className = 'zr-menu-item';

  const icon = document.createElement('span');
  icon.className = 'zr-menu-icon';
  icon.textContent = item.icon;
  menuItem.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'zr-menu-text';
  text.textContent = item.text;
  menuItem.appendChild(text);

  const arrow = document.createElement('span');
  arrow.className = 'zr-menu-arrow';
  arrow.textContent = '›';
  menuItem.appendChild(arrow);

  container.appendChild(menuItem);

  // 创建子菜单
  const submenu = document.createElement('div');
  submenu.className = 'zr-menu-submenu';

  item.submenu.forEach((subItem: any) => {
    const subMenuItem = document.createElement('div');
    subMenuItem.className = 'zr-menu-item';

    const colorDot = document.createElement('span');
    colorDot.className = 'zr-menu-color-dot';
    colorDot.style.backgroundColor = getColorHex(subItem.color);
    subMenuItem.appendChild(colorDot);

    const subText = document.createElement('span');
    subText.className = 'zr-menu-text';
    subText.textContent = subItem.label;
    subMenuItem.appendChild(subText);

    subMenuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      onChangeColor(subItem.color);
      hideHighlightMenu();
    });

    submenu.appendChild(subMenuItem);
  });

  container.appendChild(submenu);

  // 鼠标悬停显示子菜单
  let hideTimeout: number;
  container.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
    submenu.classList.add('zr-submenu-show');
  });

  container.addEventListener('mouseleave', () => {
    hideTimeout = window.setTimeout(() => {
      submenu.classList.remove('zr-submenu-show');
    }, 300);
  });

  return container;
}

/**
 * 获取颜色的十六进制值
 */
function getColorHex(color: string): string {
  const colors: Record<string, string> = {
    yellow: '#fbbf24',
    blue: '#60a5fa',
    green: '#34d399',
    red: '#f87171',
  };
  return colors[color] || '#fbbf24';
}

/**
 * 隐藏高亮菜单
 */
export function hideHighlightMenu(): void {
  const menu = document.getElementById(MENU_ID);
  if (menu) {
    menu.remove();
  }
  document.removeEventListener('click', handleOutsideClick);
}

/**
 * 处理外部点击
 */
function handleOutsideClick(e: MouseEvent): void {
  const menu = document.getElementById(MENU_ID);
  if (menu && !menu.contains(e.target as Node)) {
    hideHighlightMenu();
  }
}