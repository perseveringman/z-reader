import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Plus, FileUp } from 'lucide-react';
import { useToast } from './Toast';

interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
  onFeedAdded?: () => void;
}

export function AddFeedDialog({ open, onClose, onFeedAdded }: AddFeedDialogProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      // 重置表单
      setUrl('');
      setTitle('');
      setCategory('');
      // 聚焦输入框
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      await window.electronAPI.feedAdd({
        url: url.trim(),
        title: title.trim() || undefined,
        category: category.trim() || undefined,
      });
      showToast('RSS 订阅已添加');
      onClose();
      onFeedAdded?.();
    } catch (error) {
      console.error('添加订阅失败:', error);
      showToast('添加订阅失败，请检查 URL 是否正确');
    } finally {
      setLoading(false);
    }
  };

  const handleImportOpml = async () => {
    setLoading(true);
    try {
      const feeds = await window.electronAPI.feedImportOpml();
      if (feeds.length > 0) {
        showToast(`成功导入 ${feeds.length} 个订阅源`);
        onClose();
        onFeedAdded?.();
      } else {
        showToast('未导入任何订阅源');
      }
    } catch (error) {
      console.error('导入 OPML 失败:', error);
      showToast('导入失败，请检查文件格式');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">添加 RSS 订阅</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="feed-url" className="block text-sm font-medium text-gray-300 mb-1.5">
              RSS URL <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              id="feed-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml 或 YouTube 频道 URL"
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="feed-title" className="block text-sm font-medium text-gray-300 mb-1.5">
              订阅名称 (可选)
            </label>
            <input
              id="feed-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="自动从 RSS 获取"
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="feed-category" className="block text-sm font-medium text-gray-300 mb-1.5">
              分类 (可选)
            </label>
            <input
              id="feed-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如: 技术、新闻、博客"
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>添加中...</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>添加订阅</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleImportOpml}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
              title="导入 OPML 文件"
            >
              <FileUp size={16} />
              <span>导入 OPML</span>
            </button>
          </div>
        </form>

        {/* 提示信息 */}
        <div className="px-6 pb-6 pt-0">
          <p className="text-xs text-gray-500">
            提示: 可以直接输入 RSS URL、网站首页或 YouTube 频道链接
          </p>
        </div>
      </div>
    </div>
  );
}
