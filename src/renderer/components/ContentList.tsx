import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, List, LayoutGrid, Archive, Clock, Trash2, X, Star, BookOpen, ExternalLink, Inbox, BookmarkPlus } from 'lucide-react';
import type { Article, ArticleListQuery, ArticleSource, ReadStatus as ReadStatusType, MediaType } from '../../shared/types';
import { ArticleCard } from './ArticleCard';
import { useToast } from './Toast';
import { useUndoStack } from '../hooks/useUndoStack';
import { ContextMenu, type ContextMenuEntry } from './ContextMenu';

type TabKey = 'inbox' | 'later' | 'archive' | 'unseen' | 'seen' | 'all';
type SortBy = 'saved_at' | 'published_at';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'default' | 'compact';

interface ContentListProps {
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  onOpenReader: (id: string) => void;
  refreshTrigger?: number;
  feedId?: string | null;
  isShortlisted?: boolean;
  activeView?: string;
  tagId?: string | null;
  expanded?: boolean;
  source?: ArticleSource;
  initialTab?: string;
  mediaType?: MediaType;
}

const LIBRARY_TABS: { key: TabKey; label: string }[] = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'later', label: 'LATER' },
  { key: 'archive', label: 'ARCHIVE' },
];

const FEED_TABS: { key: TabKey; label: string }[] = [
  { key: 'unseen', label: 'UNSEEN' },
  { key: 'seen', label: 'SEEN' },
  { key: 'all', label: 'ALL' },
];

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'saved_at', label: 'Date saved' },
  { key: 'published_at', label: 'Date published' },
];

export function ContentList({ selectedArticleId, onSelectArticle, onOpenReader, refreshTrigger, feedId, isShortlisted, activeView, tagId, expanded, source, initialTab, mediaType }: ContentListProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab as TabKey || 'inbox');
  const [sortBy, setSortBy] = useState<SortBy>('saved_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('z-reader-view-mode') as ViewMode) || 'default';
  });
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ articleId: string; x: number; y: number } | null>(null);
  const { showToast } = useToast();
  const undoStack = useUndoStack();

  const isTrash = activeView === 'trash';
  const isFeedView = source === 'feed';
  const isLibraryView = source === 'library';

  // Determine which tabs to show
  const tabs = isFeedView ? FEED_TABS
    : isLibraryView ? LIBRARY_TABS
    : LIBRARY_TABS; // fallback
  const showTabs = !isShortlisted && !isTrash && !tagId && (isFeedView || isLibraryView);

  // Sync activeTab when initialTab changes (sidebar navigation)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as TabKey);
    }
  }, [initialTab]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      if (isTrash) {
        const result = await window.electronAPI.articleListDeleted();
        setArticles(result);
      } else if (activeView === 'tags') {
        if (tagId) {
          const result = await window.electronAPI.articleListByTag(tagId);
          setArticles(result);
        } else {
          setArticles([]);
        }
      } else {
        const query: ArticleListQuery = {
          sortBy,
          sortOrder,
          limit: 100,
        };

        // Source filter
        if (source && !isShortlisted) {
          query.source = source;
        }

        // MediaType filter
        if (mediaType) {
          query.mediaType = mediaType;
        }

        // Tab-based readStatus filter
        if (!isShortlisted) {
          if (activeTab !== 'all') {
            if (isFeedView) {
              query.readStatus = activeTab as ReadStatusType;
            } else if (isLibraryView) {
              query.readStatus = activeTab as ReadStatusType;
            }
          }
        }

        // Feed filter
        if (feedId) {
          query.feedId = feedId;
          query.source = 'feed'; // Per-feed view is always feed source
        }

        // Shortlist mode (shared across sources)
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
  }, [activeTab, sortBy, sortOrder, feedId, isShortlisted, isTrash, tagId, source, isFeedView, isLibraryView, activeView, mediaType]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles, refreshTrigger]);

  const STATUS_TOAST: Record<string, string> = {
    archive: 'Archived',
    later: 'Saved for later',
    inbox: 'Moved to Inbox',
    seen: 'Marked as seen',
    unseen: 'Marked as unseen',
  };

  const handleStatusChange = async (id: string, status: ReadStatusType) => {
    try {
      const article = articles.find((a) => a.id === id);
      const prevStatus = article?.readStatus ?? 'inbox';
      await window.electronAPI.articleUpdate({ id, readStatus: status });
      await fetchArticles();
      showToast(STATUS_TOAST[status] ?? `Moved to ${status}`, 'success');
      undoStack.push({
        description: `Revert to ${prevStatus}`,
        undo: async () => {
          await window.electronAPI.articleUpdate({ id, readStatus: prevStatus });
          await fetchArticles();
          showToast('Undone', 'info');
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
      showToast(current ? 'Removed from Shortlist' : 'Added to Shortlist', 'success');
    } catch (err) {
      console.error('Failed to toggle shortlist:', err);
    }
  };

  const handleSaveToLibrary = async (id: string) => {
    try {
      await window.electronAPI.articleSaveToLibrary(id);
      await fetchArticles(); // Article disappears from feed view
      showToast('Saved to Library', 'success');
    } catch (err) {
      console.error('Failed to save to library:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.articleDelete(id);
      await fetchArticles();
      showToast('Moved to Trash', 'success');
      undoStack.push({
        description: 'Undo delete',
        undo: async () => {
          await window.electronAPI.articleRestore(id);
          await fetchArticles();
          showToast('Restored', 'info');
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
      showToast('Restored', 'success');
    } catch (err) {
      console.error('Failed to restore article:', err);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await window.electronAPI.articlePermanentDelete(id);
      await fetchArticles();
      showToast('Permanently deleted', 'success');
    } catch (err) {
      console.error('Failed to permanently delete article:', err);
    }
  };

  const handleArticleHover = useCallback((id: string) => {
    onSelectArticle(id);
  }, [onSelectArticle]);

  // 点击进入文章时自动标记 feed 文章为 seen
  const markAsSeen = useCallback(async (id: string) => {
    if (!isFeedView) return;
    const article = articles.find(a => a.id === id);
    if (article && article.readStatus === 'unseen') {
      setArticles(prev => prev.map(a =>
        a.id === id ? { ...a, readStatus: 'seen' as const } : a
      ));
      try {
        await window.electronAPI.articleUpdate({ id, readStatus: 'seen' });
      } catch (err) {
        console.error('Failed to mark as seen:', err);
      }
    }
  }, [isFeedView, articles]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'default' ? 'compact' : 'default';
      localStorage.setItem('z-reader-view-mode', next);
      return next;
    });
  };

  const multiSelect = selectedIds.size > 0;

  const handleToggleCheck = (id: string, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedId) {
        const ids = articles.map((a) => a.id);
        const from = ids.indexOf(lastClickedId);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          for (let i = start; i <= end; i++) {
            next.add(ids[i]);
          }
        }
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastClickedId(id);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(articles.map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBatchArchive = async () => {
    if (selectedIds.size === 0) return;
    try {
      await window.electronAPI.articleBatchUpdate(Array.from(selectedIds), { readStatus: 'archive' });
      setSelectedIds(new Set());
      await fetchArticles();
      showToast(`Archived ${selectedIds.size} articles`, 'success');
    } catch (err) {
      console.error('Batch archive failed:', err);
    }
  };

  const handleBatchLater = async () => {
    if (selectedIds.size === 0) return;
    try {
      await window.electronAPI.articleBatchUpdate(Array.from(selectedIds), { readStatus: 'later' });
      setSelectedIds(new Set());
      await fetchArticles();
      showToast(`Saved ${selectedIds.size} for later`, 'success');
    } catch (err) {
      console.error('Batch later failed:', err);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      await window.electronAPI.articleBatchDelete(ids);
      setSelectedIds(new Set());
      await fetchArticles();
      showToast(`Deleted ${ids.length} articles`, 'success');
      undoStack.push({
        description: `Undo batch delete ${ids.length}`,
        undo: async () => {
          for (const id of ids) {
            await window.electronAPI.articleRestore(id);
          }
          await fetchArticles();
          showToast('Restored', 'info');
        },
      });
    } catch (err) {
      console.error('Batch delete failed:', err);
    }
  };

  const handleOpenReader = useCallback((id: string) => {
    markAsSeen(id);
    onOpenReader(id);
  }, [markAsSeen, onOpenReader]);

  const handleArticleContextMenu = (articleId: string, x: number, y: number) => {
    onSelectArticle(articleId);
    setCtxMenu({ articleId, x, y });
  };

  const getContextMenuItems = (): ContextMenuEntry[] => {
    if (!ctxMenu) return [];
    const article = articles.find((a) => a.id === ctxMenu.articleId);
    if (!article) return [];

    if (isTrash) {
      return [
        { label: 'Restore', icon: Inbox, onClick: () => handleRestore(article.id) },
        { separator: true },
        { label: 'Delete permanently', icon: Trash2, onClick: () => handlePermanentDelete(article.id), danger: true },
      ];
    }

    const items: ContextMenuEntry[] = [
      { label: 'Open in Reader', icon: BookOpen, onClick: () => onOpenReader(article.id) },
      { separator: true },
    ];

    // "Save to Library" for feed articles
    if (isFeedView || article.source === 'feed') {
      items.push({
        label: 'Save to Library',
        icon: BookmarkPlus,
        onClick: () => handleSaveToLibrary(article.id),
      });
      items.push({ separator: true });
    }

    // Library status actions
    if (isLibraryView || article.source === 'library') {
      if (article.readStatus !== 'inbox') {
        items.push({ label: 'Move to Inbox', icon: Inbox, onClick: () => handleStatusChange(article.id, 'inbox') });
      }
      if (article.readStatus !== 'later') {
        items.push({ label: 'Read later', icon: Clock, onClick: () => handleStatusChange(article.id, 'later') });
      }
      if (article.readStatus !== 'archive') {
        items.push({ label: 'Archive', icon: Archive, onClick: () => handleStatusChange(article.id, 'archive') });
      }
    }

    const isShortlistedNow = article.isShortlisted === 1;
    items.push({
      label: isShortlistedNow ? 'Remove from Shortlist' : 'Add to Shortlist',
      icon: Star,
      onClick: () => handleToggleShortlist(article.id),
    });

    items.push({ separator: true });
    items.push({ label: 'Delete', icon: Trash2, onClick: () => handleDelete(article.id), danger: true });

    if (article.url) {
      items.push({ separator: true });
      items.push({
        label: 'Open in browser',
        icon: ExternalLink,
        onClick: () => window.open(article.url!, '_blank'),
      });
    }

    return items;
  };

  const cycleSortBy = () => {
    setSortBy((prev) => (prev === 'saved_at' ? 'published_at' : 'saved_at'));
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? '';
  const listRef = useRef<HTMLDivElement>(null);

  // Title
  const getTitle = () => {
    if (isTrash) return 'Trash';
    if (isShortlisted) return 'Shortlist';
    if (tagId) return 'Tag';
    if (isLibraryView) return 'Library';
    if (isFeedView) return 'Feed';
    return 'Articles';
  };

  // Empty state message
  const getEmptyMessage = () => {
    if (isTrash) return 'Trash is empty';
    if (isShortlisted) return 'No shortlisted articles';
    if (isFeedView) return activeTab === 'unseen' ? 'No unseen articles' : 'No seen articles';
    if (activeView === 'tags' && !tagId) return '请从左侧选择一个标签查看文章';
    if (activeView === 'tags' && tagId) return '该标签下暂无文章';
    if (isLibraryView) return 'No articles — save a URL or promote from Feed';
    return 'No articles found';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case 'Escape': {
          if (selectedIds.size > 0) {
            e.preventDefault();
            setSelectedIds(new Set());
            break;
          }
          break;
        }
        case 'r':
        case 'R': {
          if (e.shiftKey && selectedArticleId) {
            e.preventDefault();
            const article = articles.find((a) => a.id === selectedArticleId);
            if (article && article.readProgress && article.readProgress > 0) {
              window.electronAPI.articleUpdate({ id: selectedArticleId, readProgress: 0 });
              // 实时更新本地状态
              setArticles((prev) => prev.map((a) => a.id === selectedArticleId ? { ...a, readProgress: 0 } : a));
            }
          }
          break;
        }
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
          if (selectedArticleId) {
            e.preventDefault();
            markAsSeen(selectedArticleId);
            onOpenReader(selectedArticleId);
          }
          break;
        }
        case '1': {
          e.preventDefault();
          if (isFeedView) setActiveTab('unseen');
          else setActiveTab('inbox');
          break;
        }
        case '2': {
          e.preventDefault();
          if (isFeedView) setActiveTab('seen');
          else setActiveTab('later');
          break;
        }
        case '3': {
          e.preventDefault();
          if (!isFeedView) setActiveTab('archive');
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          if (selectedArticleId && isLibraryView) handleStatusChange(selectedArticleId, 'archive');
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          if (selectedArticleId && isLibraryView) handleStatusChange(selectedArticleId, 'later');
          break;
        }
        case 'b':
        case 'B': {
          // Save to Library (feed view only)
          e.preventDefault();
          if (selectedArticleId && isFeedView) handleSaveToLibrary(selectedArticleId);
          break;
        }
        case 'd':
        case 'D': {
          e.preventDefault();
          if (selectedArticleId) handleDelete(selectedArticleId);
          break;
        }
        case 'z':
        case 'Z': {
          e.preventDefault();
          if (undoStack.canUndo) undoStack.undo();
          break;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          if (selectedArticleId) handleToggleShortlist(selectedArticleId);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, selectedArticleId, onOpenReader, fetchArticles, undoStack, selectedIds, isFeedView, isLibraryView, markAsSeen]);

  useEffect(() => {
    if (!selectedArticleId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-article-id="${selectedArticleId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedArticleId]);

  return (
    <div className={`flex flex-col min-w-[300px] border-r border-[#262626] bg-[#141414] h-full flex-1`}>
      <div className="shrink-0">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white tracking-wide">
            {getTitle()}
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
            <button
              onClick={toggleViewMode}
              className="p-1 rounded text-[#666] hover:text-[#999] hover:bg-white/5 transition-colors cursor-pointer"
              title={viewMode === 'default' ? 'Compact view' : 'Default view'}
            >
              {viewMode === 'default' ? <List size={12} /> : <LayoutGrid size={12} />}
            </button>
          </div>
        </div>

        {showTabs && (
          <div className="flex px-4 gap-4 border-b border-[#262626]">
            {tabs.map((tab) => (
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
        {!showTabs && <div className="border-b border-[#262626]" />}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {/* 批量操作栏 */}
        {multiSelect && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-blue-400 font-medium">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleSelectAll}
                className="text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors cursor-pointer"
              >
                Select all
              </button>
            </div>
            <div className="flex items-center gap-1">
              {isLibraryView && (
                <>
                  <button
                    onClick={handleBatchArchive}
                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    title="Archive"
                  >
                    <Archive size={14} />
                  </button>
                  <button
                    onClick={handleBatchLater}
                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    title="Read later"
                  >
                    <Clock size={14} />
                  </button>
                </>
              )}
              <button
                onClick={handleBatchDelete}
                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={handleClearSelection}
                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[13px] text-[#555]">Loading...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[13px] text-[#555]">{getEmptyMessage()}</span>
          </div>
        ) : (
          <div>
            {articles.map((article) => (
              <div key={article.id} data-article-id={article.id} className="border-b border-[#262626]">
                <ArticleCard
                  article={article}
                  isSelected={article.id === selectedArticleId}
                  onHover={handleArticleHover}
                  onClick={handleOpenReader}
                  onStatusChange={handleStatusChange}
                  onToggleShortlist={(id) => handleToggleShortlist(id)}
                  trashMode={isTrash}
                  onRestore={handleRestore}
                  onPermanentDelete={handlePermanentDelete}
                  compact={viewMode === 'compact'}
                  multiSelect={multiSelect}
                  isChecked={selectedIds.has(article.id)}
                  onToggleCheck={handleToggleCheck}
                  onContextMenu={handleArticleContextMenu}
                  source={source}
                  onSaveToLibrary={isFeedView ? handleSaveToLibrary : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-1.5 border-t border-[#262626] text-[11px] text-[#555]">
        {articles.length} {articles.length === 1
          ? (mediaType === 'video' ? 'video' : mediaType === 'podcast' ? 'podcast' : 'article')
          : (mediaType === 'video' ? 'videos' : mediaType === 'podcast' ? 'podcasts' : 'articles')}
      </div>

      {/* 右键上下文菜单 */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getContextMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
