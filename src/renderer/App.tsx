import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentList } from './components/ContentList';
import { DetailPanel } from './components/DetailPanel';
import { ReaderView } from './components/ReaderView';
import { ToastProvider } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { AddFeedDialog } from './components/AddFeedDialog';
import { SearchPanel } from './components/SearchPanel';

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('articles');
  const [readerArticleId, setReaderArticleId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [addFeedDialogOpen, setAddFeedDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  return (
    <ToastProvider>
      <div className="flex h-screen bg-[#0f0f0f] text-gray-200 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeView={activeView}
          onViewChange={setActiveView}
          onAddFeed={() => setAddFeedDialogOpen(true)}
          onSearch={() => setSearchOpen(true)}
        />

        {!readerMode ? (
          <>
            <ContentList
              selectedArticleId={selectedArticleId}
              onSelectArticle={setSelectedArticleId}
              onOpenReader={handleOpenReader}
              refreshTrigger={refreshTrigger}
            />
            <DetailPanel articleId={selectedArticleId} />
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
      </div>
    </ToastProvider>
  );
}
