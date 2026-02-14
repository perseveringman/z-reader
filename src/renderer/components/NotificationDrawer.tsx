/**
 * 通知中心侧边抽屉
 *
 * 显示所有应用内通知，支持已读/未读管理、清空、点击跳转。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Bell, CheckCircle2, XCircle, Info, Check, Trash2,
} from 'lucide-react';
import type { AppNotification } from '../../shared/types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigateToArticle?: (articleId: string, mediaType?: string) => void;
}

const typeIcons: Record<string, { icon: React.ReactNode; color: string }> = {
  success: { icon: <CheckCircle2 size={14} />, color: 'text-green-400' },
  error: { icon: <XCircle size={14} />, color: 'text-red-400' },
  info: { icon: <Info size={14} />, color: 'text-blue-400' },
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function NotificationDrawer({ open, onClose, onNavigateToArticle }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const list = await window.electronAPI.notificationList();
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, []);

  // Load on open
  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

  // Listen for new notifications
  useEffect(() => {
    if (!open) return;
    const unsub = window.electronAPI.notificationOnNew((notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });
    return unsub;
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleMarkRead = async (id: string) => {
    try {
      await window.electronAPI.notificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await window.electronAPI.notificationReadAll();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleClear = async () => {
    try {
      await window.electronAPI.notificationClear();
      setNotifications([]);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const handleClick = (notification: AppNotification) => {
    if (!notification.read) handleMarkRead(notification.id);
    if (notification.articleId && onNavigateToArticle) {
      onNavigateToArticle(notification.articleId, 'podcast');
      onClose();
    }
  };

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-[380px] bg-[#1a1a1a] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">通知</h2>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded-full">
                {unreadCount} 未读
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="全部已读"
              >
                <Check size={16} />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClear}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                title="清空"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Bell size={32} className="mb-3 opacity-40" />
              <p className="text-sm">暂无通知</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((notification) => {
                const typeInfo = typeIcons[notification.type] || typeIcons.info;
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={`px-4 py-3 transition-colors cursor-pointer ${
                      notification.read
                        ? 'hover:bg-white/[0.03]'
                        : 'bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <span className={`shrink-0 mt-0.5 ${typeInfo.color}`}>
                        {typeInfo.icon}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${notification.read ? 'text-gray-400' : 'text-gray-200'}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-600 mt-1">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
