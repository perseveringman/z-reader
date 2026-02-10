import { useState, useEffect, useCallback } from 'react';
import {
  Rss,
  ExternalLink,
  RefreshCw,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Activity,
  Calendar,
  FileText,
} from 'lucide-react';
import type { Feed, FeedArticleCount, Article } from '../../shared/types';

interface FeedDetailPanelProps {
  feedId: string | null;
  onEditFeed: (feed: Feed) => void;
  onDeleteFeed: (feedId: string) => Promise<void>;
  onFetchFeed: (feedId: string) => Promise<void>;
  onOpenArticle?: (articleId: string) => void;
  refreshTrigger?: number;
  collapsed?: boolean;
}

export function FeedDetailPanel({
  feedId,
  onEditFeed,
  onDeleteFeed,
  onFetchFeed,
  onOpenArticle,
  refreshTrigger,
  collapsed,
}: FeedDetailPanelProps) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [articleCount, setArticleCount] = useState<FeedArticleCount | null>(null);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [fetching, setFetching] = useState(false);

  const loadFeedData = useCallback(async () => {
    if (!feedId) return;
    try {
      const [feedList, counts, articles] = await Promise.all([
        window.electronAPI.feedList(),
        window.electronAPI.feedArticleCount(),
        window.electronAPI.articleList({
          feedId,
          sortBy: 'saved_at',
          sortOrder: 'desc',
          limit: 5,
        }),
      ]);
      const found = feedList.find((f) => f.id === feedId);
      setFeed(found || null);
      setArticleCount(counts.find((c) => c.feedId === feedId) || null);
      setRecentArticles(articles);
    } catch (err) {
      console.error('Failed to load feed details:', err);
    }
  }, [feedId]);

  useEffect(() => {
    loadFeedData();
  }, [loadFeedData, refreshTrigger]);

  const handleFetch = useCallback(async () => {
    if (!feedId) return;
    setFetching(true);
    try {
      await onFetchFeed(feedId);
      await loadFeedData();
    } finally {
      setFetching(false);
    }
  }, [feedId, onFetchFeed, loadFeedData]);

  const handleDelete = useCallback(async () => {
    if (!feed) return;
    if (!confirm(`确定取消订阅「${feed.title || feed.url}」？关联文章不会被删除。`)) return;
    await onDeleteFeed(feed.id);
  }, [feed, onDeleteFeed]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!feedId) {
    return (
      <div className={`
        flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
        transition-[width] duration-200 overflow-hidden
        ${collapsed ? 'w-0 border-l-0' : 'w-[360px]'}
      `}>
        <div className="min-w-[360px] flex items-center justify-center h-full text-gray-600 text-[13px]">
          选择一个订阅源查看详情
        </div>
      </div>
    );
  }

  if (!feed) {
    return (
      <div className={`
        flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
        transition-[width] duration-200 overflow-hidden
        ${collapsed ? 'w-0 border-l-0' : 'w-[360px]'}
      `}>
        <div className="min-w-[360px] flex items-center justify-center h-full text-gray-500 text-[13px]">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={`
      flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
      transition-[width] duration-200 overflow-hidden
      ${collapsed ? 'w-0 border-l-0' : 'w-[360px]'}
    `}>
      <div className="min-w-[360px] flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1e1e1e]">
        <div className="flex items-start gap-3">
          {feed.favicon ? (
            <img src={feed.favicon} alt="" className="w-10 h-10 rounded-lg shrink-0 mt-0.5" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center shrink-0 mt-0.5">
              <Rss size={18} className="text-gray-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-white leading-tight truncate">
              {feed.title || feed.url}
            </h2>
            <a
              href={feed.url}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-400 mt-1 truncate transition-colors"
              title={feed.url}
            >
              <ExternalLink size={10} className="shrink-0" />
              <span className="truncate">{feed.url}</span>
            </a>
          </div>
        </div>

        {/* Description */}
        {feed.description && (
          <p className="mt-3 text-[12px] text-gray-400 leading-relaxed">
            {feed.description}
          </p>
        )}
      </div>

      {/* Meta Info */}
      <div className="px-5 py-4 space-y-3 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2.5 text-[12px]">
          <FolderOpen size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Category</span>
          <span className="ml-auto text-gray-300">{feed.category || 'Uncategorized'}</span>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]">
          <Clock size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Fetch Interval</span>
          <span className="ml-auto text-gray-300">{feed.fetchInterval} min</span>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]">
          <FileText size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Articles</span>
          <span className="ml-auto text-gray-300">
            {articleCount?.total || 0} total / {articleCount?.unseen || 0} unseen
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]">
          <Activity size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Health</span>
          <span className="ml-auto flex items-center gap-1">
            {feed.errorCount === 0 ? (
              <>
                <CheckCircle2 size={12} className="text-green-500" />
                <span className="text-green-400">Healthy</span>
              </>
            ) : (
              <>
                <AlertCircle size={12} className="text-red-500" />
                <span className="text-red-400">{feed.errorCount} errors</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]">
          <RefreshCw size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Last Fetched</span>
          <span className="ml-auto text-gray-300">{formatDate(feed.lastFetchedAt)}</span>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]">
          <Calendar size={13} className="text-gray-500 shrink-0" />
          <span className="text-gray-500">Created</span>
          <span className="ml-auto text-gray-300">{formatDate(feed.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-[#1e1e1e]">
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
          {fetching ? 'Fetching...' : 'Fetch now'}
        </button>
        <button
          onClick={() => onEditFeed(feed)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors cursor-pointer"
        >
          <Pencil size={12} />
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/10 transition-colors cursor-pointer"
        >
          <Trash2 size={12} />
          Unsubscribe
        </button>
      </div>

      {/* Recent Articles */}
      <div className="px-5 py-4">
        <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-3">
          Recent Articles
        </h3>
        {recentArticles.length === 0 ? (
          <p className="text-[12px] text-gray-600">No articles yet</p>
        ) : (
          <div className="space-y-2">
            {recentArticles.map((article) => (
              <button
                key={article.id}
                onClick={() => onOpenArticle?.(article.id)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
              >
                <p className="text-[12px] text-gray-300 truncate">
                  {article.title || 'Untitled'}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {formatDate(article.savedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
