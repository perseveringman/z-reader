import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Link } from 'lucide-react';
import { useToast } from './Toast';

interface AddUrlDialogProps {
  open: boolean;
  onClose: () => void;
  onArticleSaved?: () => void;
}

export function AddUrlDialog({ open, onClose, onArticleSaved }: AddUrlDialogProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setUrl('');
      setTitle('');
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
      await window.electronAPI.articleSaveUrl({
        url: url.trim(),
        title: title.trim() || undefined,
      });
      showToast('Saved to Library');
      onClose();
      onArticleSaved?.();
    } catch (error) {
      console.error('Failed to save URL:', error);
      showToast('Failed to save URL. Please check the URL and try again.');
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
          <h2 className="text-lg font-semibold text-white">Save URL to Library</h2>
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
            <label htmlFor="save-url" className="block text-sm font-medium text-gray-300 mb-1.5">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              id="save-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="save-title" className="block text-sm font-medium text-gray-300 mb-1.5">
              Title (optional)
            </label>
            <input
              id="save-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected from page"
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
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Link size={16} />
                  <span>Save to Library</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* 提示信息 */}
        <div className="px-6 pb-6 pt-0">
          <p className="text-xs text-gray-500">
            The article content will be automatically parsed from the URL.
            You can also use <kbd className="px-1 py-0.5 bg-white/10 rounded text-gray-400">Cmd+Shift+S</kbd> to open this dialog.
          </p>
        </div>
      </div>
    </div>
  );
}
