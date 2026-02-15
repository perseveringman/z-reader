/**
 * Toast 通知系统
 * 提供非侵入式的消息提示功能
 */

const TOAST_CONTAINER_ID = 'zr-toast-container';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number; // 毫秒，0 表示不自动关闭
  action?: {
    text: string;
    onClick: () => void;
  };
}

/**
 * 显示 Toast 通知
 */
export function showToast(options: ToastOptions): void {
  const {
    message,
    type = 'info',
    duration = 3000,
    action,
  } = options;

  // 确保容器存在
  let container = document.getElementById(TOAST_CONTAINER_ID) as HTMLDivElement;
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'zr-toast-container';
    document.body.appendChild(container);
  }

  // 创建 Toast 元素
  const toast = document.createElement('div');
  toast.className = `zr-toast zr-toast-${type}`;

  // 图标
  const icon = document.createElement('span');
  icon.className = 'zr-toast-icon';
  icon.textContent = getIconForType(type);
  toast.appendChild(icon);

  // 消息
  const messageEl = document.createElement('span');
  messageEl.className = 'zr-toast-message';
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  // 操作按钮（可选）
  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'zr-toast-action';
    actionBtn.textContent = action.text;
    actionBtn.addEventListener('click', () => {
      action.onClick();
      hideToast(toast);
    });
    toast.appendChild(actionBtn);
  }

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'zr-toast-close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => {
    hideToast(toast);
  });
  toast.appendChild(closeBtn);

  // 添加到容器
  container.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => {
    toast.classList.add('zr-toast-show');
  });

  // 自动关闭
  if (duration > 0) {
    setTimeout(() => {
      hideToast(toast);
    }, duration);
  }
}

/**
 * 隐藏 Toast
 */
function hideToast(toast: HTMLElement): void {
  toast.classList.remove('zr-toast-show');
  toast.classList.add('zr-toast-hide');

  setTimeout(() => {
    toast.remove();

    // 如果容器没有 toast 了，移除容器
    const container = document.getElementById(TOAST_CONTAINER_ID);
    if (container && container.children.length === 0) {
      container.remove();
    }
  }, 300);
}

/**
 * 获取不同类型的图标
 */
function getIconForType(type: ToastType): string {
  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };
  return icons[type];
}

/**
 * 便捷方法
 */
export const toast = {
  success: (message: string, duration?: number) => {
    showToast({ message, type: 'success', duration });
  },
  error: (message: string, duration?: number) => {
    showToast({ message, type: 'error', duration });
  },
  info: (message: string, duration?: number) => {
    showToast({ message, type: 'info', duration });
  },
  warning: (message: string, duration?: number) => {
    showToast({ message, type: 'warning', duration });
  },
};