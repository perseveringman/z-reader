/**
 * 任务看板侧边抽屉
 *
 * 显示所有后台任务（ASR 标准版、下载等），可筛选、取消、重试。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Mic, Download, RefreshCw, ListTodo, ExternalLink,
} from 'lucide-react';
import type { AppTask } from '../../shared/types';

interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigateToArticle?: (articleId: string, mediaType?: string) => void;
}

type FilterTab = 'all' | 'running' | 'completed';

const taskTypeIcons: Record<string, React.ReactNode> = {
  'asr-standard': <Mic size={14} />,
  'asr-realtime': <Mic size={14} />,
  'download': <Download size={14} />,
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Loader2 size={14} className="animate-spin" />, label: '等待中', color: 'text-gray-400' },
  running: { icon: <Loader2 size={14} className="animate-spin" />, label: '进行中', color: 'text-teal-400' },
  completed: { icon: <CheckCircle2 size={14} />, label: '已完成', color: 'text-green-400' },
  failed: { icon: <XCircle size={14} />, label: '失败', color: 'text-red-400' },
  cancelled: { icon: <AlertTriangle size={14} />, label: '已取消', color: 'text-yellow-400' },
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

export function TaskDrawer({ open, onClose, onNavigateToArticle }: TaskDrawerProps) {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');

  const handleNavigate = async (task: AppTask) => {
    if (!task.articleId || !onNavigateToArticle) return;
    try {
      const article = await window.electronAPI.articleGet(task.articleId);
      const mediaType = article?.mediaType || 'article';
      onClose();
      // 延迟一帧让抽屉关闭动画生效后再导航
      requestAnimationFrame(() => onNavigateToArticle(task.articleId!, mediaType));
    } catch {
      onClose();
      requestAnimationFrame(() => onNavigateToArticle(task.articleId!, 'article'));
    }
  };

  const loadTasks = useCallback(async () => {
    try {
      const list = await window.electronAPI.appTaskList();
      setTasks(list);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  // Load on open
  useEffect(() => {
    if (open) loadTasks();
  }, [open, loadTasks]);

  // Listen for real-time updates
  useEffect(() => {
    if (!open) return;
    const unsub = window.electronAPI.appTaskOnUpdated((updatedTask) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTask.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedTask;
          return next;
        }
        return [updatedTask, ...prev];
      });
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

  const handleCancel = async (taskId: string) => {
    try {
      await window.electronAPI.appTaskCancel(taskId);
      loadTasks();
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };

  const handleRetry = async (task: AppTask) => {
    try {
      await window.electronAPI.appTaskCreate({
        type: task.type,
        articleId: task.articleId,
        title: task.title,
        meta: task.meta,
      });
      loadTasks();
    } catch (err) {
      console.error('Failed to retry task:', err);
    }
  };

  if (!open) return null;

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'running') return t.status === 'pending' || t.status === 'running';
    if (filter === 'completed') return t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
    return true;
  });

  const runningCount = tasks.filter((t) => t.status === 'pending' || t.status === 'running').length;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-[380px] bg-[#1a1a1a] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <ListTodo size={18} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">任务面板</h2>
            {runningCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-teal-500/20 text-teal-400 rounded-full">
                {runningCount} 进行中
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-white/5 px-4 shrink-0">
          {([
            { key: 'all' as const, label: '全部' },
            { key: 'running' as const, label: '进行中' },
            { key: 'completed' as const, label: '已完成' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                filter === tab.key
                  ? 'border-teal-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <ListTodo size={32} className="mb-3 opacity-40" />
              <p className="text-sm">暂无任务</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredTasks.map((task) => {
                const status = statusConfig[task.status] || statusConfig.pending;
                const typeIcon = taskTypeIcons[task.type] || <ListTodo size={14} />;
                return (
                  <div
                    key={task.id}
                    className={`px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                      task.articleId && onNavigateToArticle ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => handleNavigate(task)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Type icon */}
                      <span className="shrink-0 mt-0.5 text-gray-500">{typeIcon}</span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`flex items-center gap-1 text-[11px] ${status.color}`}>
                            {status.icon}
                            {status.label}
                          </span>
                          <span className="text-[11px] text-gray-600">
                            {formatRelativeTime(task.updatedAt)}
                          </span>
                        </div>

                        {/* Progress bar */}
                        {(task.status === 'running' || task.status === 'pending') && task.progress > 0 && (
                          <div className="mt-2 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round(task.progress * 100)}%` }}
                            />
                          </div>
                        )}

                        {/* Detail text */}
                        {task.detail && (
                          <p className="text-[11px] text-gray-500 mt-1 truncate">{task.detail}</p>
                        )}

                        {/* Error */}
                        {task.error && task.status === 'failed' && (
                          <p className="text-[11px] text-red-400/80 mt-1 truncate">{task.error}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex items-center gap-1">
                        {(task.status === 'pending' || task.status === 'running') && (
                          <button
                            onClick={() => handleCancel(task.id)}
                            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="取消"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                        {task.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(task)}
                            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-teal-400 transition-colors cursor-pointer"
                            title="重试"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        {task.articleId && onNavigateToArticle && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigate(task);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-teal-400 transition-colors cursor-pointer"
                            title="查看"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
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
