import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentList } from './components/ContentList';
import { DetailPanel } from './components/DetailPanel';
import { ReaderView } from './components/ReaderView';
import { ToastProvider } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { AddFeedDialog } from './components/AddFeedDialog';
import { SearchPanel } from './components/SearchPanel';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { FeedManageDialog } from './components/FeedManageDialog';
import type { Feed } from '../shared/types';

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('articles');
  const [readerArticleId, setReaderArticleId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [addFeedDialogOpen, setAddFeedDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [managingFeed, setManagingFeed] = useState<Feed | null>(null);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(() => localStorage.getItem('detail-panel-collapsed') === 'true');

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

  const handleFeedAdded = useCallback(() => {
    // 刷新文章列表
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleOpenReader = useCallback((articleId: string) => {
    setReaderArticleId(articleId);
    setReaderMode(true);
  }, []);

  const handleCloseReader = useCallback(() => {
    setReaderMode(false);
    setReaderArticleId(null);
  }, []);

  const handleSearchSelect = useCallback((articleId: string) => {
    setSelectedArticleId(articleId);
    setActiveView('articles');
  }, []);

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
        setActiveView('articles');
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
      <div className="flex h-screen bg-[#0f0f0f] text-gray-200 overflow-hidden">
        {!readerMode ? (
          <>
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              activeView={activeView}
              onViewChange={setActiveView}
              onAddFeed={() => setAddFeedDialogOpen(true)}
              onSearch={() => setSearchOpen(true)}
              selectedFeedId={selectedFeedId}
              onFeedSelect={(feedId) => {
                setSelectedFeedId(feedId);
                setActiveView('feeds');
              }}
              onManageFeed={setManagingFeed}
              selectedTagId={selectedTagId}
              onTagSelect={(tagId) => {
                setSelectedTagId(tagId);
                if (tagId) setActiveView('tags');
              }}
            />
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
            />
            {!detailPanelCollapsed && (
              <DetailPanel articleId={selectedArticleId} />
            )}
          </>
        ) : (
          <ReaderView
            articleId={readerArticleId!}
            onClose={handleCloseReader}
          />
        )}

        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onExecute={handleCommandExecute}
        />

        <AddFeedDialog
          open={addFeedDialogOpen}
          onClose={() => setAddFeedDialogOpen(false)}
          onFeedAdded={handleFeedAdded}
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
