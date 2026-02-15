import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, List, LayoutGrid, Archive, Clock, Trash2, X, Star, BookOpen, ExternalLink, Inbox, BookmarkPlus } from 'lucide-react';
import type { Article, ArticleListQuery, ArticleSource, ReadStatus as ReadStatusType, MediaType } from '../../shared/types';
import { ArticleCard } from './ArticleCard';
import { useToast } from './Toast';
import { useUndoStack } from '../hooks/useUndoStack';
import { ContextMenu, type ContextMenuEntry } from './ContextMenu';

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

type TabKey = 'inbox' | 'later' | 'archive' | 'unseen' | 'seen' | 'all' | 'shortRead' | 'longRead';

const PAGE_SIZE = 100;

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'saved_at', label: 'Date saved' },
  { key: 'published_at', label: 'Date published' },
];

export function ContentList({ selectedArticleId, onSelectArticle, onOpenReader, refreshTrigger, feedId, isShortlisted, activeView, tagId, expanded, source, initialTab, mediaType }: ContentListProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (initialTab) return initialTab as TabKey;
    const storageKey = source === 'feed' ? 'z-reader-tab-feed' : 'z-reader-tab-library';
    return (localStorage.getItem(storageKey) as TabKey) || 'inbox';
  });
  const [sortBy, setSortBy] = useState<SortBy>('saved_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('z-reader-view-mode') as ViewMode) || 'default';
  });
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ articleId: string; x: number; y: number } | null>(null);
  const [readingThreshold, setReadingThreshold] = useState(10);
  const { showToast } = useToast();
  const undoStack = useUndoStack();

  const isTrash = activeView === 'trash';
  const isFeedView = source === 'feed';
  const isLibraryView = source === 'library';

  // 加载阅读时长阈值设置
  useEffect(() => {
    window.electronAPI.settingsGet().then((s) => {
      if (s.readingThreshold && s.readingThreshold > 0) setReadingThreshold(s.readingThreshold);
    }).catch(() => {});
  }, []);

  // Determine which tabs to show
  const libraryTabs: { key: TabKey; label: string }[] = [
    { key: 'inbox', label: t('contentList.inbox').toUpperCase() },
    { key: 'later', label: t('contentList.later').toUpperCase() },
    { key: 'archive', label: t('contentList.archive').toUpperCase() },
  ];
  const feedTabs: { key: TabKey; label: string }[] = [
    { key: 'unseen', label: t('contentList.unseen').toUpperCase() },
    { key: 'seen', label: t('contentList.seen').toUpperCase() },
    { key: 'shortRead', label: t('contentList.shortRead').toUpperCase() },
    { key: 'longRead', label: t('contentList.longRead').toUpperCase() },
    { key: 'all', label: t('contentList.all').toUpperCase() },
  ];
  const tabs = isFeedView ? feedTabs
    : isLibraryView ? libraryTabs
    : libraryTabs; // fallback
  const showTabs = !isShortlisted && !isTrash && !tagId && (isFeedView || isLibraryView);

  // Sync activeTab when initialTab or source changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as TabKey);
      return;
    }
    // source 切换时从 localStorage 恢复
    const storageKey = isFeedView ? 'z-reader-tab-feed' : 'z-reader-tab-library';
    const saved = localStorage.getItem(storageKey) as TabKey | null;
    const fallback = isFeedView ? 'unseen' : 'inbox';
    setActiveTab(saved || fallback);
  }, [initialTab, isFeedView]);

  // 持久化 tab 选择
  useEffect(() => {
    const storageKey = isFeedView ? 'z-reader-tab-feed' : 'z-reader-tab-library';
    localStorage.setItem(storageKey, activeTab);
  }, [activeTab, isFeedView]);

  const buildQuery = useCallback((offset = 0): ArticleListQuery => {
    const query: ArticleListQuery = {
      sortBy,
      sortOrder,
      limit: PAGE_SIZE,
      offset,
    };

    if (source && !isShortlisted) query.source = source;
    if (mediaType) query.mediaType = mediaType;

    if (!isShortlisted) {
      if (activeTab !== 'all' && activeTab !== 'shortRead' && activeTab !== 'longRead') {
        if (isFeedView || isLibraryView) {
          query.readStatus = activeTab as ReadStatusType;
        }
      }
    }

    if (feedId) {
      query.feedId = feedId;
      query.source = 'feed';
    }

    if (isShortlisted) query.isShortlisted = true;

    return query;
  }, [sortBy, sortOrder, source, isShortlisted, mediaType, activeTab, isFeedView, isLibraryView, feedId]);

  const applyReadingFilter = useCallback((list: Article[]) => {
    if (activeTab === 'shortRead') return list.filter((a) => a.readingTime != null && a.readingTime <= readingThreshold);
    if (activeTab === 'longRead') return list.filter((a) => a.readingTime != null && a.readingTime > readingThreshold);
    return list;
  }, [activeTab, readingThreshold]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setHasMore(true);
    try {
      if (isTrash) {
        const result = await window.electronAPI.articleListDeleted();
        setArticles(result);
        setHasMore(false);
      } else if (activeView === 'tags') {
        if (tagId) {
          const result = await window.electronAPI.articleListByTag(tagId);
          setArticles(result);
        } else {
          setArticles([]);
        }
        setHasMore(false);
      } else {
        const result = await window.electronAPI.articleList(buildQuery(0));
        setArticles(applyReadingFilter(result));
        setHasMore(result.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoading(false);
    }
  }, [isTrash, activeView, tagId, buildQuery, applyReadingFilter]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore || isTrash || activeView === 'tags') return;
    setLoadingMore(true);
    try {
      const result = await window.electronAPI.articleList(buildQuery(articles.length));
      const filtered = applyReadingFilter(result);
      setArticles((prev) => [...prev, ...filtered]);
      setHasMore(result.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more articles:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, isTrash, activeView, buildQuery, applyReadingFilter, articles.length]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles, refreshTrigger]);

  const STATUS_TOAST: Record<string, string> = {
    archive: t('contentList.archiveArticle'),
    later: t('contentList.addToShortlist'),
    inbox: t('contentList.markAsRead'),
    seen: t('detailPanel.seen') || 'Marked as seen',
    unseen: t('detailPanel.unseen') || 'Marked as unseen',
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
      // 删除前计算下一篇选中目标
      const currentIndex = articles.findIndex(a => a.id === id);
      const remaining = articles.filter(a => a.id !== id);
      const nextId = remaining.length > 0
        ? remaining[Math.min(currentIndex, remaining.length - 1)].id
        : null;

      await window.electronAPI.articleDelete(id);
      await fetchArticles();
      if (nextId) onSelectArticle(nextId);
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
      const browserUrl = article.url;
      items.push({ separator: true });
      items.push({
        label: 'Open in browser',
        icon: ExternalLink,
        onClick: () => void window.electronAPI.externalOpenUrl(browserUrl),
      });
    }

    return items;
  };

  const cycleSortBy = () => {
    setSortBy((prev) => (prev === 'saved_at' ? 'published_at' : 'saved_at'));
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? '';
  const listRef = useRef<HTMLDivElement>(null);

  // 滚动到底部时加载更多
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        fetchMore();
      }
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [fetchMore]);

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
    if (isTrash) return t('contentList.emptyTrash');
    if (isShortlisted) return t('contentList.emptyShortlist');
    if (isFeedView) return activeTab === 'unseen' ? t('contentList.noArticles') : t('contentList.noArticles');
    if (activeView === 'tags' && !tagId) return t('contentList.emptyTag');
    if (activeView === 'tags' && tagId) return t('contentList.emptyTag');
    if (isLibraryView) return t('contentList.emptyLibrary');
    return t('contentList.noArticles');
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
        case 'b': {
          e.preventDefault();
          if (selectedArticleId && isFeedView) handleSaveToLibrary(selectedArticleId);
          break;
        }
        case 'B': {
          if (e.shiftKey && selectedArticleId && selectedIds.size === 0) {
            e.preventDefault();
            setSelectedIds(new Set([selectedArticleId]));
          } else if (!e.shiftKey) {
            e.preventDefault();
            if (selectedArticleId && isFeedView) handleSaveToLibrary(selectedArticleId);
          }
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
        case 'f': {
          if (!e.shiftKey) {
            e.preventDefault();
            if (selectedArticleId) handleToggleShortlist(selectedArticleId);
          }
          break;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          if (selectedArticleId) {
            const article = articles.find(a => a.id === selectedArticleId);
            if (article?.url) void window.electronAPI.externalOpenUrl(article.url);
          }
          break;
        }
        case 'C': {
          if (e.shiftKey && selectedArticleId) {
            e.preventDefault();
            const article = articles.find(a => a.id === selectedArticleId);
            if (article?.url) {
              navigator.clipboard.writeText(article.url);
              showToast(t('detailPanel.copyUrl'), 'success');
            }
          }
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
        {loadingMore && (
          <div className="flex items-center justify-center py-3">
            <span className="text-[12px] text-[#555]">加载更多...</span>
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
