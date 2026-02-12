import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Check, Rss, ExternalLink } from 'lucide-react';
import type { DiscoverPreviewResult } from '../../../shared/types';
import { useToast } from '../Toast';

interface FeedPreviewProps {
  feedUrl: string;
  suggestedTitle?: string;
  onClose: () => void;
  onSubscribed: () => void;
}

export function FeedPreview({ feedUrl, suggestedTitle, onClose, onSubscribed }: FeedPreviewProps) {
  const [preview, setPreview] = useState<DiscoverPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    setError(null);

    window.electronAPI.discoverPreview(feedUrl).then((result) => {
      setPreview(result);
      setCustomTitle(result.title || suggestedTitle || '');
    }).catch((err) => {
      setError(err instanceof Error ? err.message : '预览失败');
    }).finally(() => {
      setLoading(false);
    });
  }, [feedUrl, suggestedTitle]);

  const handleSubscribe = useCallback(async () => {
    if (!preview) return;
    setSubscribing(true);
    try {
      await window.electronAPI.feedAdd({
        url: preview.feedUrl,
        title: customTitle.trim() || undefined,
        category: customCategory.trim() || undefined,
      });
      showToast(`已订阅「${customTitle || preview.title || 'Feed'}」`);
      onSubscribed();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '订阅失败';
      showToast(msg);
    } finally {
      setSubscribing(false);
    }
  }, [preview, customTitle, customCategory, showToast, onSubscribed]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 bg-[#111] border border-white/10 rounded-lg shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">订阅预览</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-500" />
              <span className="ml-2 text-sm text-gray-500">加载预览...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-400 mb-2">预览失败</p>
              <p className="text-xs text-gray-600">{error}</p>
            </div>
          )}

          {preview && !loading && (
            <>
              {/* Feed 信息 */}
              <div className="flex items-start gap-3 mb-4">
                {preview.favicon ? (
                  <img src={preview.favicon} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center shrink-0">
                    <Rss size={18} className="text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200">{preview.title || '未知名称'}</div>
                  {preview.description && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{preview.description}</div>
                  )}
                  <div className="text-[10px] text-gray-700 mt-1 font-mono truncate">{preview.feedUrl}</div>
                </div>
              </div>

              {/* 已订阅提示 */}
              {preview.alreadySubscribed && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-800/30 rounded-md mb-4">
                  <Check size={14} className="text-green-400" />
                  <span className="text-xs text-green-400">已订阅此源</span>
                </div>
              )}

              {/* 最近文章 */}
              {preview.articles.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">最近文章</div>
                  <div className="flex flex-col gap-1">
                    {preview.articles.map((article, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300 truncate">{article.title || '无标题'}</div>
                          {article.publishedAt && (
                            <div className="text-[10px] text-gray-600">
                              {new Date(article.publishedAt).toLocaleDateString('zh-CN')}
                            </div>
                          )}
                        </div>
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gray-700 hover:text-gray-400 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 自定义字段 */}
              {!preview.alreadySubscribed && (
                <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">订阅名称</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="使用默认名称"
                      className="w-full px-3 py-1.5 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">分类</label>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="可选"
                      className="w-full px-3 py-1.5 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作 */}
        {preview && !loading && !preview.alreadySubscribed && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-md transition-colors cursor-pointer"
            >
              {subscribing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                '确认订阅'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
