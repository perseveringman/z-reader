import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentList } from './components/ContentList';
import { DetailPanel } from './components/DetailPanel';
import { ReaderView } from './components/ReaderView';
import { ToastProvider } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('articles');
  const [readerArticleId, setReaderArticleId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
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

  return (
    <ToastProvider>
      <div className="flex h-screen bg-[#0f0f0f] text-gray-200 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        <ContentList
          selectedArticleId={selectedArticleId}
          onSelectArticle={setSelectedArticleId}
          onOpenReader={setReaderArticleId}
        />

        <DetailPanel articleId={selectedArticleId} />

        {readerArticleId && (
          <ReaderView
            articleId={readerArticleId}
            onClose={() => setReaderArticleId(null)}
          />
        )}

        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onExecute={handleCommandExecute}
        />
      </div>
    </ToastProvider>
  );
}
