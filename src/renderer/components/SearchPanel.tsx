import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Clock } from 'lucide-react';
import type { Article } from '../../shared/types';

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectArticle: (articleId: string) => void;
}

export function SearchPanel({ open, onClose, onSelectArticle }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Article[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // 搜索函数（带 300ms 防抖）
  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const articles = await window.electronAPI.articleSearch({
        query: trimmed,
        limit: 20,
      });
      setResults(articles);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 防抖搜索
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, performSearch]);

  // 打开时重置状态并聚焦输入框
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 选中并跳转到文章
  const selectArticle = useCallback(
    (articleId: string) => {
      onClose();
      onSelectArticle(articleId);
    },
    [onClose, onSelectArticle]
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            selectArticle(results[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, selectArticle, onClose]
  );

  // 高亮匹配词（简单实现：将匹配词加粗）
  const highlightMatch = (text: string | null, searchTerm: string): React.ReactNode => {
    if (!text || !searchTerm) return text || '';

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-yellow-500/30 text-yellow-200 font-medium">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // 获取摘要片段，定位到搜索词所在位置
  const getSummarySnippet = (article: Article, searchTerm: string): string => {
    const text = article.contentText || article.summary || '';
    const maxLength = 120;
    if (text.length <= maxLength) return text;

    const lowerText = text.toLowerCase();
    const idx = lowerText.indexOf(searchTerm.toLowerCase());
    if (idx === -1) return text.substring(0, maxLength) + '...';

    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, start + maxLength);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return prefix + text.substring(start, end) + suffix;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[15%]"
      onClick={onClose}
    >
      <div
        className="w-[680px] bg-[#1a1a1a] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
          <Search size={18} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文章标题、正文、作者..."
            className="flex-1 bg-transparent text-white text-[14px] placeholder:text-gray-500 outline-none"
          />
        </div>

        {/* 搜索结果列表 */}
        <div className="max-h-[420px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              搜索中...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              没有找到匹配的文章
            </div>
          )}

          {!loading && !query && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              输入关键词开始搜索
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-1">
              {results.map((article, i) => (
                <button
                  key={article.id}
                  onClick={() => selectArticle(article.id)}
                  className={`w-full px-4 py-3 flex flex-col gap-1.5 cursor-pointer transition-colors text-left ${
                    i === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/5'
                  }`}
                >
                  {/* 标题 */}
                  <div className="text-[14px] text-gray-100 font-medium line-clamp-1">
                    {highlightMatch(article.title, query)}
                  </div>

                  {/* 元数据行：作者、域名、发布时间 */}
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {article.author && (
                      <>
                        <span>{highlightMatch(article.author, query)}</span>
                        <span>•</span>
                      </>
                    )}
                    {article.domain && (
                      <>
                        <span>{article.domain}</span>
                        <span>•</span>
                      </>
                    )}
                    {article.publishedAt && (
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        <span>{new Date(article.publishedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    )}
                  </div>

                  {/* 摘要片段 */}
                  {article.contentText && (
                    <div className="text-[12px] text-gray-500 line-clamp-2">
                      {highlightMatch(getSummarySnippet(article, query), query)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 提示 */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-600">
          <div className="flex items-center gap-3">
            <span>↑↓ 导航</span>
            <span>Enter 选择</span>
            <span>Esc 关闭</span>
          </div>
          {results.length > 0 && (
            <span>{results.length} 个结果</span>
          )}
        </div>
      </div>
    </div>
  );
}
