import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Plus, Rss, Check } from 'lucide-react';
import type { PodcastSearchResult, PodcastSearchType } from '../../shared/types';
import { useToast } from './Toast';

interface PodcastSearchPanelProps {
  onSubscribed?: () => void;
}

export function PodcastSearchPanel({ onSubscribed }: PodcastSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<PodcastSearchType>('show');
  const [results, setResults] = useState<PodcastSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribedFeeds, setSubscribedFeeds] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load already-subscribed feed URLs for marking duplicates
  useEffect(() => {
    window.electronAPI.feedList().then((feeds) => {
      const urls = new Set(feeds.map((f) => f.url));
      setSubscribedFeeds(urls);
    }).catch(() => {});
  }, []);

  // Detect if input looks like a URL
  const isUrlInput = /^https?:\/\//i.test(query.trim());

  // Search handler
  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // If it looks like a URL, resolve it instead of searching
    if (/^https?:\/\//i.test(trimmed)) {
      setResolving(true);
      setResults([]);
      try {
        const resolved = await window.electronAPI.podcastResolveUrl(trimmed);
        if (resolved?.feedUrl) {
          // Create a synthetic result for the resolved URL
          setResults([{
            title: resolved.title ?? 'Podcast',
            author: resolved.author ?? null,
            image: resolved.image ?? null,
            feedUrl: resolved.feedUrl,
            website: trimmed,
            source: 'itunes',
            id: resolved.feedUrl,
          }]);
        } else {
          showToast('无法解析该 URL，请尝试直接粘贴 RSS 地址');
        }
      } catch {
        showToast('URL 解析失败');
      } finally {
        setResolving(false);
      }
      return;
    }

    // Directory search
    setLoading(true);
    setResults([]);
    try {
      const data = await window.electronAPI.podcastSearch({
        query: trimmed,
        type: searchType,
        limit: 20,
      });
      setResults(data);
    } catch {
      showToast('搜索失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [query, searchType, showToast]);

  // Submit on Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // Subscribe to a podcast
  const handleSubscribe = useCallback(async (result: PodcastSearchResult) => {
    if (!result.feedUrl) {
      showToast('该播客无 RSS 地址');
      return;
    }
    if (subscribedFeeds.has(result.feedUrl)) {
      showToast('已订阅该播客');
      return;
    }

    setSubscribing(result.id);
    try {
      await window.electronAPI.feedAdd({
        url: result.feedUrl,
        title: result.title || undefined,
      });
      setSubscribedFeeds((prev) => new Set(prev).add(result.feedUrl!));
      showToast(`已订阅「${result.title}」`);
      onSubscribed?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '订阅失败';
      showToast(msg);
    } finally {
      setSubscribing(null);
    }
  }, [subscribedFeeds, showToast, onSubscribed]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索播客名称或粘贴 URL..."
            className="w-full pl-9 pr-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {!isUrlInput && (
          <div className="flex rounded-md overflow-hidden border border-white/10 shrink-0">
            <button
              onClick={() => setSearchType('show')}
              className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                searchType === 'show'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#111] text-gray-400 hover:text-white'
              }`}
            >
              节目
            </button>
            <button
              onClick={() => setSearchType('episode')}
              className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                searchType === 'episode'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#111] text-gray-400 hover:text-white'
              }`}
            >
              单集
            </button>
          </div>
        )}
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading || resolving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors cursor-pointer shrink-0"
        >
          {loading || resolving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            '搜索'
          )}
        </button>
      </div>

      {/* Results */}
      {(loading || resolving) && results.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-500" />
          <span className="ml-2 text-sm text-gray-500">
            {resolving ? '正在解析 URL...' : '搜索中...'}
          </span>
        </div>
      )}

      {!loading && !resolving && results.length === 0 && query.trim() && (
        <div className="text-center py-8 text-sm text-gray-500">
          未找到结果。试试其他关键词或粘贴 RSS 地址。
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
          {results.map((result) => {
            const isSubscribed = result.feedUrl ? subscribedFeeds.has(result.feedUrl) : false;
            const isLoading = subscribing === result.id;

            return (
              <div
                key={`${result.source}-${result.id}`}
                className="flex items-center gap-3 p-3 rounded-md hover:bg-white/5 transition-colors group"
              >
                {/* Artwork */}
                {result.image ? (
                  <img
                    src={result.image}
                    alt=""
                    className="w-12 h-12 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-gray-800 flex items-center justify-center shrink-0">
                    <Rss size={18} className="text-gray-600" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate">
                    {result.title}
                  </div>
                  {result.author && (
                    <div className="text-xs text-gray-500 truncate">{result.author}</div>
                  )}
                  {result.feedUrl && (
                    <div className="text-[10px] text-gray-600 truncate mt-0.5">
                      {result.feedUrl}
                    </div>
                  )}
                </div>

                {/* Subscribe button */}
                <button
                  onClick={() => handleSubscribe(result)}
                  disabled={isSubscribed || isLoading || !result.feedUrl}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isSubscribed
                      ? 'bg-green-900/30 text-green-400 cursor-default'
                      : !result.feedUrl
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isSubscribed ? (
                    <>
                      <Check size={14} />
                      <span>已订阅</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>订阅</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-600 px-1">
        支持搜索播客名称，或粘贴 Apple Podcasts / Spotify / 小宇宙 / RSS 链接
      </p>
    </div>
  );
}
