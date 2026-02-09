import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { Article, ArticleListQuery } from '../../shared/types';
import { ArticleCard } from './ArticleCard';
import { useToast } from './Toast';
import { useUndoStack } from '../hooks/useUndoStack';

type ReadStatus = 'inbox' | 'later' | 'archive';
type SortBy = 'saved_at' | 'published_at';
type SortOrder = 'asc' | 'desc';

interface ContentListProps {
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  onOpenReader: (id: string) => void;
  refreshTrigger?: number;
  feedId?: string | null;
  isShortlisted?: boolean;
  activeView?: string;
  tagId?: string | null;
}

const TABS: { key: ReadStatus; label: string }[] = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'later', label: 'LATER' },
  { key: 'archive', label: 'ARCHIVE' },
];

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'saved_at', label: 'Date saved' },
  { key: 'published_at', label: 'Date published' },
];

export function ContentList({ selectedArticleId, onSelectArticle, onOpenReader, refreshTrigger, feedId, isShortlisted, activeView, tagId }: ContentListProps) {
  const [activeTab, setActiveTab] = useState<ReadStatus>('inbox');
  const [sortBy, setSortBy] = useState<SortBy>('saved_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const undoStack = useUndoStack();

  const isTrash = activeView === 'trash';

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      if (isTrash) {
        const result = await window.electronAPI.articleListDeleted();
        setArticles(result);
      } else if (tagId) {
        const result = await window.electronAPI.articleListByTag(tagId);
        setArticles(result);
      } else {
        const query: ArticleListQuery = {
          readStatus: isShortlisted ? undefined : activeTab,
          sortBy,
          sortOrder,
          limit: 100,
        };
        // 如果有 feedId，添加到查询参数
        if (feedId) {
          query.feedId = feedId;
        }
        // Shortlist 模式
        if (isShortlisted) {
          query.isShortlisted = true;
        }
        const result = await window.electronAPI.articleList(query);
        setArticles(result);
      }
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, sortBy, sortOrder, feedId, isShortlisted, isTrash, tagId]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles, refreshTrigger]);

  const STATUS_TOAST: Record<ReadStatus, string> = {
    archive: '已归档',
    later: '已加入稍后阅读',
    inbox: '已移入收件箱',
  };

  const handleStatusChange = async (id: string, status: ReadStatus) => {
    try {
      const article = articles.find((a) => a.id === id);
      const prevStatus = article?.readStatus ?? 'inbox';
      await window.electronAPI.articleUpdate({ id, readStatus: status });
      await fetchArticles();
      showToast(STATUS_TOAST[status] ?? `已移至 ${status}`, 'success');
      undoStack.push({
        description: `Revert to ${prevStatus}`,
        undo: async () => {
          await window.electronAPI.articleUpdate({ id, readStatus: prevStatus });
          await fetchArticles();
          showToast('已撤销', 'info');
        },
      });
    } catch (err) {
      console.error('Failed to update article status:', err);
    }
  };

  const handleToggleShortlist = async (id: string) => {
    try {
      const article = articles.find((a) => a.id === id);
      const current = article?.isShortlisted === 1;
      await window.electronAPI.articleUpdate({ id, isShortlisted: !current });
      await fetchArticles();
      showToast(current ? '已取消收藏' : '已加入 Shortlist', 'success');
    } catch (err) {
      console.error('Failed to toggle shortlist:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.articleDelete(id);
      await fetchArticles();
      showToast('已移入回收站', 'success');
      undoStack.push({
        description: 'Undo delete',
        undo: async () => {
          await window.electronAPI.articleRestore(id);
          await fetchArticles();
          showToast('已恢复', 'info');
        },
      });
    } catch (err) {
      console.error('Failed to delete article:', err);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await window.electronAPI.articleRestore(id);
      await fetchArticles();
      showToast('已恢复', 'success');
    } catch (err) {
      console.error('Failed to restore article:', err);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await window.electronAPI.articlePermanentDelete(id);
      await fetchArticles();
      showToast('已永久删除', 'success');
    } catch (err) {
      console.error('Failed to permanently delete article:', err);
    }
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const cycleSortBy = () => {
    setSortBy((prev) => (prev === 'saved_at' ? 'published_at' : 'saved_at'));
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? '';
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const idx = articles.findIndex((a) => a.id === selectedArticleId);
          const next = idx < articles.length - 1 ? idx + 1 : idx;
          if (articles[next]) onSelectArticle(articles[next].id);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const idx = articles.findIndex((a) => a.id === selectedArticleId);
          const prev = idx > 0 ? idx - 1 : 0;
          if (articles[prev]) onSelectArticle(articles[prev].id);
          break;
        }
        case 'Enter': {
          if (selectedArticleId) onOpenReader(selectedArticleId);
          break;
        }
        case '1': { setActiveTab('inbox'); break; }
        case '2': { setActiveTab('later'); break; }
        case '3': { setActiveTab('archive'); break; }
        case 'e':
        case 'E': {
          if (selectedArticleId) handleStatusChange(selectedArticleId, 'archive');
          break;
        }
        case 'l':
        case 'L': {
          if (selectedArticleId) handleStatusChange(selectedArticleId, 'later');
          break;
        }
        case 'd':
        case 'D': {
          if (selectedArticleId) handleDelete(selectedArticleId);
          break;
        }
        case 'z':
        case 'Z': {
          if (undoStack.canUndo) undoStack.undo();
          break;
        }
        case 's':
        case 'S': {
          if (selectedArticleId) handleToggleShortlist(selectedArticleId);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, selectedArticleId, onSelectArticle, onOpenReader, fetchArticles, undoStack]);

  useEffect(() => {
    if (!selectedArticleId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-article-id="${selectedArticleId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedArticleId]);

  return (
    <div className="flex flex-col w-[380px] min-w-[300px] border-r border-[#262626] bg-[#141414] h-full">
      <div className="shrink-0">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white tracking-wide">
            {isTrash ? 'Trash' : isShortlisted ? 'Shortlist' : tagId ? 'Tag' : 'Articles'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={cycleSortBy}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[#666] hover:text-[#999] hover:bg-white/5 transition-colors cursor-pointer"
              title={`Sort by: ${currentSortLabel}`}
            >
              <span>{currentSortLabel}</span>
            </button>
            <button
              onClick={toggleSortOrder}
              className="p-1 rounded text-[#666] hover:text-[#999] hover:bg-white/5 transition-colors cursor-pointer"
              title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
            >
              {sortOrder === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
            </button>
          </div>
        </div>

        {!isShortlisted && !isTrash && !tagId && (
          <div className="flex px-4 gap-4 border-b border-[#262626]">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  pb-2 text-[11px] font-medium tracking-[0.08em] transition-colors cursor-pointer
                  ${activeTab === tab.key
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-[#555] hover:text-[#888] border-b-2 border-transparent'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {(isShortlisted || isTrash || tagId) && <div className="border-b border-[#262626]" />}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[13px] text-[#555]">Loading...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[13px] text-[#555]">暂无内容，请添加 RSS 订阅</span>
          </div>
        ) : (
          <div>
            {articles.map((article) => (
              <div key={article.id} data-article-id={article.id} className="border-b border-[#262626]">
                <ArticleCard
                  article={article}
                  isSelected={article.id === selectedArticleId}
                  onSelect={onSelectArticle}
                  onDoubleClick={onOpenReader}
                  onStatusChange={handleStatusChange}
                  onToggleShortlist={(id, current) => handleToggleShortlist(id)}
                  trashMode={isTrash}
                  onRestore={handleRestore}
                  onPermanentDelete={handlePermanentDelete}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-1.5 border-t border-[#262626] text-[11px] text-[#555]">
        {articles.length} {articles.length === 1 ? 'article' : 'articles'}
      </div>
    </div>
  );
}
