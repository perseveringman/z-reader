import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Plus,
  Info,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  ArrowUpDown,
  Rss,
} from 'lucide-react';
import type { Feed, FeedArticleCount } from '../../shared/types';

interface FeedManagerProps {
  onSelectFeed: (feedId: string | null) => void;
  selectedFeedId: string | null;
  onEditFeed: (feed: Feed) => void;
  onAddFeed: () => void;
  refreshTrigger?: number;
  onDeleteFeed: (feedId: string) => Promise<void>;
}

type SortKey = 'name' | 'documents' | 'lastUpdated';
type SortOrder = 'asc' | 'desc';

export function FeedManager({
  onSelectFeed,
  selectedFeedId,
  onEditFeed,
  onAddFeed,
  refreshTrigger,
  onDeleteFeed,
}: FeedManagerProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articleCounts, setArticleCounts] = useState<Record<string, FeedArticleCount>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastUpdated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [feedList, counts] = await Promise.all([
        window.electronAPI.feedList(),
        window.electronAPI.feedArticleCount(),
      ]);
      setFeeds(feedList);
      const countMap: Record<string, FeedArticleCount> = {};
      counts.forEach((c) => { countMap[c.feedId] = c; });
      setArticleCounts(countMap);
    } catch (err) {
      console.error('Failed to load feeds:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleTogglePin = useCallback(async (feedId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.feedTogglePin(feedId);
      await fetchData();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }, [fetchData]);

  const handleDelete = useCallback(async (feedId: string, feedTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定取消订阅「${feedTitle}」？关联文章不会被删除。`)) return;
    setDeletingId(feedId);
    try {
      await onDeleteFeed(feedId);
      if (selectedFeedId === feedId) onSelectFeed(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete feed:', err);
    } finally {
      setDeletingId(null);
    }
  }, [onDeleteFeed, selectedFeedId, onSelectFeed, fetchData]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = feeds;

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          (f.title || '').toLowerCase().includes(q) ||
          f.url.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.title || a.url).localeCompare(b.title || b.url);
      } else if (sortKey === 'documents') {
        cmp = (articleCounts[a.id]?.total || 0) - (articleCounts[b.id]?.total || 0);
      } else if (sortKey === 'lastUpdated') {
        cmp = (a.lastFetchedAt || '').localeCompare(b.lastFetchedAt || '');
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [feeds, searchQuery, sortKey, sortOrder, articleCounts]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-[#141414] min-w-[400px] flex-1">
      {/* Header */}
      <div className="shrink-0 border-b border-[#262626]">
        {/* Tabs + Search + Add */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-6">
            <span className="text-[14px] font-semibold text-white border-b-2 border-white pb-1">
              Subscribed
            </span>
            <span className="text-[14px] text-gray-500 pb-1 cursor-not-allowed">
              Suggested
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Find..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] pl-8 pr-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-md text-[12px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#555] transition-colors"
              />
            </div>
            <button
              onClick={onAddFeed}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-[12px] text-white font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} />
              Add feed
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Table Header */}
        <div className="sticky top-0 bg-[#141414] border-b border-[#262626] z-10">
          <div className="grid grid-cols-[1fr_1fr_100px_120px_130px] gap-2 px-5 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 text-left hover:text-gray-300 transition-colors cursor-pointer">
              Name
              {sortKey === 'name' && <ArrowUpDown size={10} />}
            </button>
            <span>Description</span>
            <button onClick={() => toggleSort('documents')} className="flex items-center gap-1 hover:text-gray-300 transition-colors cursor-pointer">
              Documents
              {sortKey === 'documents' && <ArrowUpDown size={10} />}
            </button>
            <span>Category</span>
            <button onClick={() => toggleSort('lastUpdated')} className="flex items-center gap-1 hover:text-gray-300 transition-colors cursor-pointer">
              Last Updated
              {sortKey === 'lastUpdated' && <ArrowUpDown size={10} />}
            </button>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500 text-[13px]">
            Loading...
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-[13px]">
            {searchQuery ? 'No feeds found' : 'No subscriptions yet'}
          </div>
        ) : (
          filteredAndSorted.map((feed) => (
            <div
              key={feed.id}
              onClick={() => onSelectFeed(feed.id)}
              className={`
                group grid grid-cols-[1fr_1fr_100px_120px_130px] gap-2 px-5 py-2.5 items-center
                border-b border-[#1e1e1e] cursor-pointer transition-colors
                ${selectedFeedId === feed.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}
              `}
            >
              {/* Name */}
              <div className="flex items-center gap-2.5 min-w-0">
                {feed.favicon ? (
                  <img src={feed.favicon} alt="" className="w-5 h-5 rounded shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded bg-[#333] flex items-center justify-center shrink-0">
                    <Rss size={10} className="text-gray-500" />
                  </div>
                )}
                <span className="text-[13px] text-gray-200 truncate">
                  {feed.title || feed.url}
                </span>
              </div>

              {/* Description */}
              <span className="text-[12px] text-gray-500 truncate">
                {feed.description || '-'}
              </span>

              {/* Documents */}
              <span className="text-[12px] text-gray-400 tabular-nums">
                {articleCounts[feed.id]?.total || 0}
              </span>

              {/* Category */}
              <span className="text-[12px] text-gray-500 truncate">
                {feed.category || '-'}
              </span>

              {/* Last Updated + Actions */}
              <div className="flex items-center justify-between min-w-0">
                <span className="text-[12px] text-gray-500 group-hover:hidden">
                  {formatDate(feed.lastFetchedAt)}
                </span>

                {/* Row Actions (visible on hover) */}
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectFeed(feed.id); }}
                    className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-200 transition-colors cursor-pointer"
                    title="View details"
                  >
                    <Info size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditFeed(feed); }}
                    className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-200 transition-colors cursor-pointer"
                    title="Edit feed"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => handleTogglePin(feed.id, e)}
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer ${feed.pinned ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-200'}`}
                    title={feed.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                  >
                    {feed.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    onClick={(e) => handleDelete(feed.id, feed.title || feed.url, e)}
                    disabled={deletingId === feed.id}
                    className="p-1.5 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                    title="Unsubscribe"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#262626] px-5 py-2 flex items-center justify-end">
        <span className="text-[11px] text-gray-500">
          Count: {filteredAndSorted.length}
        </span>
      </div>
    </div>
  );
}
