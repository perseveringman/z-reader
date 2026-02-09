import { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import type { Feed } from '../../shared/types';

interface FeedManageDialogProps {
  feed: Feed;
  onClose: () => void;
  onSave: (feed: Feed) => void;
  onDelete: (feedId: string) => void;
  onFetch: (feedId: string) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '从未';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FeedManageDialog({ feed, onClose, onSave, onDelete, onFetch }: FeedManageDialogProps) {
  const [title, setTitle] = useState(feed.title || '');
  const [category, setCategory] = useState(feed.category || '');
  const [fetchInterval, setFetchInterval] = useState(feed.fetchInterval);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    onSave({
      ...feed,
      title: title || null,
      category: category || null,
      fetchInterval,
    });
    onClose();
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      await onFetch(feed.id);
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = () => {
    if (confirm('确定取消订阅此 Feed？所有关联文章不会被删除。')) {
      onDelete(feed.id);
      onClose();
    }
  };

  const isHealthy = feed.errorCount === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[440px] bg-[#1a1a1a] rounded-xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-[15px] font-semibold text-white">Feed 管理</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-[13px] text-white placeholder-gray-500 outline-none focus:border-blue-500/50 transition-colors"
              placeholder="Feed 标题"
            />
          </div>

          {/* URL (readonly) */}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">URL</label>
            <div className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-[13px] text-gray-400 truncate">
              {feed.url}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">分类</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-[13px] text-white placeholder-gray-500 outline-none focus:border-blue-500/50 transition-colors"
              placeholder="未分类"
            />
          </div>

          {/* Fetch Interval */}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">抓取间隔（分钟）</label>
            <input
              type="number"
              value={fetchInterval}
              onChange={(e) => setFetchInterval(Math.max(1, parseInt(e.target.value) || 30))}
              min={1}
              className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-[13px] text-white placeholder-gray-500 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Health Status */}
          <div className="px-3 py-2.5 rounded-md bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <CheckCircle size={14} className="text-green-400" />
              ) : (
                <AlertCircle size={14} className="text-yellow-400" />
              )}
              <span className={`text-[12px] font-medium ${isHealthy ? 'text-green-400' : 'text-yellow-400'}`}>
                {isHealthy ? '运行正常' : `连续错误 ${feed.errorCount} 次`}
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              上次抓取: {formatDate(feed.lastFetchedAt)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
              {fetching ? '抓取中...' : '手动抓取'}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/10 transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
              取消订阅
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[12px] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
