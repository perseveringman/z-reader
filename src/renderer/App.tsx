import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentList } from './components/ContentList';
import { DetailPanel } from './components/DetailPanel';
import { ReaderView } from './components/ReaderView';
import { ToastProvider } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { AddFeedDialog } from './components/AddFeedDialog';
import { AddUrlDialog } from './components/AddUrlDialog';
import { SearchPanel } from './components/SearchPanel';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { FeedManageDialog } from './components/FeedManageDialog';
import { FeedManager } from './components/FeedManager';
import { FeedDetailPanel } from './components/FeedDetailPanel';
import { BookList } from './components/BookList';
import { BookDetailPanel } from './components/BookDetailPanel';
import { BookUploadPanel } from './components/BookUploadPanel';
import { BookReaderView } from './components/BookReaderView';
import { VideoReaderView } from './components/VideoReaderView';
import { PodcastReaderView } from './components/PodcastReaderView';
import { DownloadManager } from './components/DownloadManager';
import { PreferencesDialog } from './components/PreferencesDialog';
import { DiscoverPage } from './components/discover/DiscoverPage';
import type { Feed, ArticleSource, MediaType } from '../shared/types';
import { changeLanguage } from '../i18n';

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('library-articles');
  const [readerArticleId, setReaderArticleId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [addFeedDialogOpen, setAddFeedDialogOpen] = useState(false);
  const [addUrlDialogOpen, setAddUrlDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [downloadManagerOpen, setDownloadManagerOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [managingFeed, setManagingFeed] = useState<Feed | null>(null);
  const [manageFeedSelectedId, setManageFeedSelectedId] = useState<string | null>(null);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(() => localStorage.getItem('detail-panel-collapsed') === 'true');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [bookReaderMode, setBookReaderMode] = useState(false);
  const [bookReaderId, setBookReaderId] = useState<string | null>(null);
  const [readerMediaType, setReaderMediaType] = useState<string>('article');

  // Derive source and sub-view from activeView
  const contentSource: ArticleSource | undefined =
    activeView.startsWith('library-') ? 'library'
    : activeView.startsWith('feed-') || activeView === 'feeds' ? 'feed'
    : undefined;

  const initialTab =
    activeView === 'feed-unseen' ? 'unseen'
    : activeView === 'feed-seen' ? 'seen'
    : undefined;

  const contentMediaType: MediaType | undefined =
    activeView === 'library-videos' ? 'video'
    : activeView === 'library-podcasts' ? 'podcast'
    : activeView === 'library-articles' ? 'article'
    : undefined;

  // 加载语言设置
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const settings = await window.electronAPI.settingsGet();
        if (settings.language) {
          changeLanguage(settings.language as 'en' | 'zh');
        }
      } catch (err) {
        console.error('Failed to load language setting:', err);
      }
    };
    loadLanguage();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 不在输入框中才响应快捷键
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Cmd/Ctrl + K: 命令面板
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      // Cmd/Ctrl + Shift + S: Save URL to Library
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        setAddUrlDialogOpen(true);
        return;
      }

      if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setAddFeedDialogOpen(true);
        return;
      }

      if (e.shiftKey && (e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // / 键: 搜索
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }

      // ? 键: 快捷键帮助
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsHelpOpen((prev) => !prev);
      }

      // ] 键: 收折/展开右侧详情面板（列表视图）
      if (e.key === ']' && !readerMode) {
        e.preventDefault();
        setDetailPanelCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('detail-panel-collapsed', String(next));
          return next;
        });
      }

      // [ 键: 收折/展开左侧边栏（列表视图）
      if (e.key === '[' && !readerMode) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [readerMode]);

  const handleCommandExecute = useCallback(
    (commandId: string) => {
      const keyMap: Record<string, string> = {
        inbox: '1',
        later: '2',
        archive: '3',
        'archive-article': 'e',
        'later-article': 'l',
        'delete-article': 'd',
        'open-reader': 'Enter',
        search: '/',
      };

      const key = keyMap[commandId];
      if (key) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
    },
    []
  );

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleOpenReader = useCallback(async (articleId: string) => {
    const article = await window.electronAPI.articleGet(articleId);
    setReaderMediaType(article?.mediaType ?? 'article');
    setReaderArticleId(articleId);
    setReaderMode(true);
  }, []);

  const handleCloseReader = useCallback(() => {
    setReaderMode(false);
    setReaderArticleId(null);
  }, []);

  const handleSearchSelect = useCallback((articleId: string) => {
    setSelectedArticleId(articleId);
    setActiveView('library-articles');
    handleOpenReader(articleId);
  }, [handleOpenReader]);

  const handleSaveFeed = useCallback(async (feed: Feed) => {
    try {
      await window.electronAPI.feedUpdate({
        id: feed.id,
        title: feed.title ?? undefined,
        category: feed.category ?? undefined,
        fetchInterval: feed.fetchInterval,
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to update feed:', err);
    }
  }, []);

  const handleDeleteFeed = useCallback(async (feedId: string) => {
    try {
      await window.electronAPI.feedDelete(feedId);
      setRefreshTrigger((prev) => prev + 1);
      if (selectedFeedId === feedId) {
        setSelectedFeedId(null);
        setActiveView('feeds');
      }
    } catch (err) {
      console.error('Failed to delete feed:', err);
    }
  }, [selectedFeedId]);

  const handleFetchFeed = useCallback(async (feedId: string) => {
    try {
      await window.electronAPI.feedFetch(feedId);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
    }
  }, []);

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-[#0f0f0f] text-gray-200 overflow-hidden">
        {/* macOS title bar drag region */}
        <div className="h-[38px] shrink-0 drag-region flex items-center" />
        {!readerMode && !bookReaderMode ? (
          <div className="flex flex-1 min-h-0">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              activeView={activeView}
              onViewChange={(view) => {
                setActiveView(view);
                if (view === 'manage-feeds') setSelectedFeedId(null);
              }}
              onAddFeed={() => setAddFeedDialogOpen(true)}
              onAddUrl={() => setAddUrlDialogOpen(true)}
              onSearch={() => setSearchOpen(true)}
              onShortcutsHelp={() => setShortcutsHelpOpen(true)}
              onDownloads={() => setDownloadManagerOpen(true)}
              onPreferences={() => setPreferencesOpen(true)}
              selectedFeedId={selectedFeedId}
              onFeedSelect={(feedId) => {
                setSelectedFeedId(feedId);
                setActiveView('feeds');
              }}
              refreshTrigger={refreshTrigger}
              selectedTagId={selectedTagId}
              onTagSelect={(tagId) => {
                setSelectedTagId(tagId);
                if (tagId) setActiveView('tags');
              }}
            />
            {activeView === 'discover' ? (
              <DiscoverPage onFeedAdded={handleRefresh} />
            ) : activeView === 'manage-feeds' ? (
              <>
                <FeedManager
                  onSelectFeed={setManageFeedSelectedId}
                  selectedFeedId={manageFeedSelectedId}
                  onEditFeed={setManagingFeed}
                  onAddFeed={() => setAddFeedDialogOpen(true)}
                  refreshTrigger={refreshTrigger}
                  onDeleteFeed={handleDeleteFeed}
                />
                <FeedDetailPanel
                  feedId={manageFeedSelectedId}
                  onEditFeed={setManagingFeed}
                  onDeleteFeed={handleDeleteFeed}
                  onFetchFeed={handleFetchFeed}
                  onOpenArticle={(id) => {
                    setSelectedArticleId(id);
                    setSelectedFeedId(manageFeedSelectedId);
                    setActiveView('feeds');
                  }}
                  refreshTrigger={refreshTrigger}
                  collapsed={detailPanelCollapsed}
                />
              </>
            ) : activeView === 'books' ? (
              <>
                <BookList
                  selectedBookId={selectedBookId}
                  onSelectBook={setSelectedBookId}
                  onOpenReader={(id) => {
                    setBookReaderId(id);
                    setBookReaderMode(true);
                  }}
                  refreshTrigger={refreshTrigger}
                  expanded={detailPanelCollapsed}
                />
                {selectedBookId ? (
                  <BookDetailPanel
                    bookId={selectedBookId}
                    collapsed={detailPanelCollapsed}
                    onOpenReader={(id) => {
                      setBookReaderId(id);
                      setBookReaderMode(true);
                    }}
                    onRefresh={handleRefresh}
                  />
                ) : (
                  <BookUploadPanel
                    onImported={handleRefresh}
                    collapsed={detailPanelCollapsed}
                  />
                )}
              </>
            ) : (
              <>
                <ContentList
                  selectedArticleId={selectedArticleId}
                  onSelectArticle={setSelectedArticleId}
                  onOpenReader={handleOpenReader}
                  refreshTrigger={refreshTrigger}
                  feedId={activeView === 'feeds' ? selectedFeedId : undefined}
                  isShortlisted={activeView === 'shortlist'}
                  activeView={activeView}
                  tagId={activeView === 'tags' ? selectedTagId : undefined}
                  expanded={detailPanelCollapsed}
                  source={contentSource}
                  initialTab={initialTab}
                  mediaType={contentMediaType}
                />
                <DetailPanel articleId={selectedArticleId} collapsed={detailPanelCollapsed} />
              </>
            )}
          </div>
        ) : bookReaderMode && bookReaderId ? (
          <div className="flex-1 min-h-0">
            <BookReaderView
              bookId={bookReaderId}
              onClose={() => {
                setBookReaderMode(false);
                setBookReaderId(null);
              }}
            />
          </div>
        ) : readerMediaType === 'podcast' ? (
          <div className="flex-1 min-h-0">
            <PodcastReaderView
              articleId={readerArticleId!}
              onClose={handleCloseReader}
            />
          </div>
        ) : readerMediaType === 'video' ? (
          <div className="flex-1 min-h-0">
            <VideoReaderView
              articleId={readerArticleId!}
              onClose={handleCloseReader}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ReaderView
              articleId={readerArticleId!}
              onClose={handleCloseReader}
            />
          </div>
        )}

        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onExecute={handleCommandExecute}
        />

        <AddFeedDialog
          open={addFeedDialogOpen}
          onClose={() => setAddFeedDialogOpen(false)}
          onFeedAdded={handleRefresh}
        />

        <AddUrlDialog
          open={addUrlDialogOpen}
          onClose={() => setAddUrlDialogOpen(false)}
          onArticleSaved={handleRefresh}
        />

        <SearchPanel
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSelectArticle={handleSearchSelect}
        />

        <KeyboardShortcutsHelp
          open={shortcutsHelpOpen}
          onClose={() => setShortcutsHelpOpen(false)}
        />

        <DownloadManager
          open={downloadManagerOpen}
          onClose={() => setDownloadManagerOpen(false)}
        />

        <PreferencesDialog
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
        />

        {managingFeed && (
          <FeedManageDialog
            feed={managingFeed}
            onClose={() => setManagingFeed(null)}
            onSave={handleSaveFeed}
            onDelete={handleDeleteFeed}
            onFetch={handleFetchFeed}
          />
        )}
      </div>
    </ToastProvider>
  );
}
