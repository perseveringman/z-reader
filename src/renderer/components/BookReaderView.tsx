import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings2, Loader2, BookOpen, FileText } from 'lucide-react';
import { useAgentContext } from '../hooks/useAgentContext';
import type { Book, Highlight } from '../../shared/types';
import { BookReaderToc, type TocItem } from './BookReaderToc';
import { BookReaderDetailPanel, type DetailTab } from './BookReaderDetailPanel';
import { BookReaderSettings, loadBookReaderSettings, type BookReaderSettingsValues } from './BookReaderSettings';
import { EpubReader, type BookReaderHandle } from './EpubReader';
import { PdfReader } from './PdfReader';
import { PdfTextView } from './PdfTextView';

interface BookReaderViewProps {
  bookId: string;
  onClose: () => void;
}

export function BookReaderView({ bookId, onClose }: BookReaderViewProps) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocCollapsed, setTocCollapsed] = useState(() => localStorage.getItem('book-reader-toc-collapsed') === 'true');
  const [detailCollapsed, setDetailCollapsed] = useState(() => localStorage.getItem('book-reader-detail-collapsed') === 'true');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfViewMode, setPdfViewMode] = useState<'pdf' | 'text'>(() =>
    (localStorage.getItem('z-reader-pdf-view-mode') as 'pdf' | 'text') || 'pdf',
  );
  const [settings, setSettings] = useState<BookReaderSettingsValues>(loadBookReaderSettings);
  const [readProgress, setReadProgress] = useState(0);
  const [detailActiveTab, setDetailActiveTab] = useState<DetailTab>('info');
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const readerRef = useRef<BookReaderHandle>(null);
  const { reportContext } = useAgentContext();

  useEffect(() => {
    reportContext({
      common: { currentPage: 'book-reader', readerMode: true, selectedText: null },
      pageState: {
        page: 'book-reader',
        bookId,
        readProgress,
      },
    });
  }, [bookId, readProgress, reportContext]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await window.electronAPI.bookGet(bookId);
        if (cancelled) return;
        setBook(data);
        if (data) {
          setReadProgress(data.readProgress ?? 0);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bookId]);

  const handleTocNavigate = useCallback((item: TocItem) => {
    readerRef.current?.navigateTo(item.href);
  }, []);

  const handleHighlightNavigate = useCallback((highlightId: string) => {
    const hl = highlights.find((h) => h.id === highlightId);
    if (hl?.anchorPath) {
      readerRef.current?.navigateToHighlight(hl.anchorPath);
    }

    if (detailCollapsed) {
      setDetailCollapsed(false);
      localStorage.setItem('book-reader-detail-collapsed', 'false');
    }
    setDetailActiveTab('notebook');
    setFocusedHighlightId(highlightId);
    setFocusSignal((n) => n + 1);
  }, [highlights, detailCollapsed]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.bookHighlightList(bookId).then((list) => {
      if (!cancelled) setHighlights(list);
    });
    return () => { cancelled = true; };
  }, [bookId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ bookId: string; highlightId: string }>;
      const detail = customEvent.detail;
      if (!detail || detail.bookId !== bookId) return;
      handleHighlightNavigate(detail.highlightId);
    };

    window.addEventListener('book-reader:highlight-click', handler as EventListener);
    return () => window.removeEventListener('book-reader:highlight-click', handler as EventListener);
  }, [bookId, handleHighlightNavigate]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleProgressChange = useCallback((progress: number) => {
    setReadProgress(progress);
    window.electronAPI.bookUpdate({ id: bookId, readProgress: progress });
  }, [bookId]);

  const handleLocationChange = useCallback((location: string) => {
    window.electronAPI.bookUpdate({ id: bookId, currentLocation: location });
  }, [bookId]);

  const themeClass = settings.theme === 'light' ? 'reader-theme-light' : settings.theme === 'sepia' ? 'reader-theme-sepia' : 'reader-theme-dark';

  return (
    <div className={`flex flex-1 h-full overflow-hidden ${themeClass}`}>
      {/* Left Sidebar - TOC */}
      <div className={`shrink-0 flex flex-col border-r border-[#262626] bg-[#141414] transition-all duration-200 overflow-hidden ${tocCollapsed ? 'w-0 border-r-0' : 'w-[220px]'}`}>
        <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[#262626]">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[13px] font-semibold text-white tracking-wide">Contents</h2>
          <div className="w-6" />
        </div>
        <BookReaderToc
          items={tocItems}
          onNavigate={handleTocNavigate}
          loading={loading}
        />
      </div>

      {/* Center - Book Content */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-6 h-12 border-b border-[#262626]">
          <div className="flex items-center gap-1.5 text-[12px] min-w-0 truncate">
            <button
              onClick={() => setTocCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('book-reader-toc-collapsed', String(next));
                return next;
              })}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white shrink-0"
              title={tocCollapsed ? '展开目录' : '收起目录'}
            >
              {tocCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <span className="text-gray-400 truncate">{book?.title ?? '加载中…'}</span>
          </div>
          <div className="flex items-center gap-1">
            {book?.fileType === 'pdf' && (
              <button
                onClick={() => {
                  const next = pdfViewMode === 'pdf' ? 'text' : 'pdf';
                  setPdfViewMode(next);
                  localStorage.setItem('z-reader-pdf-view-mode', next);
                }}
                className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title={pdfViewMode === 'pdf' ? '切换到文本视图' : '切换到 PDF 视图'}
              >
                {pdfViewMode === 'pdf' ? <FileText className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
              title="排版设置"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDetailCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('book-reader-detail-collapsed', String(next));
                return next;
              })}
              className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
              title={detailCollapsed ? '展开详情' : '收起详情'}
            >
              {detailCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <BookReaderSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSettingsChange={setSettings}
        />

        {/* 阅读进度条 */}
        <div className="shrink-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${Math.round(readProgress * 100)}%` }}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              <span className="text-sm text-gray-500">加载中…</span>
            </div>
          ) : !book ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              书籍不存在
            </div>
          ) : book.fileType === 'pdf' && pdfViewMode === 'text' ? (
            <PdfTextView
              ref={readerRef}
              bookId={bookId}
              filePath={book.filePath}
              highlights={highlights}
              onHighlightClick={handleHighlightNavigate}
              onHighlightsChange={setHighlights}
              onTocLoaded={setTocItems}
              onProgressChange={handleProgressChange}
              onLocationChange={handleLocationChange}
              settings={settings}
              initialLocation={book.currentLocation}
            />
          ) : book.fileType === 'pdf' ? (
            <PdfReader
              ref={readerRef}
              bookId={bookId}
              filePath={book.filePath}
              highlights={highlights}
              onHighlightClick={handleHighlightNavigate}
              onHighlightsChange={setHighlights}
              onTocLoaded={setTocItems}
              onProgressChange={handleProgressChange}
              onLocationChange={handleLocationChange}
              settings={settings}
              initialLocation={book.currentLocation}
            />
          ) : (
            <EpubReader
              ref={readerRef}
              bookId={bookId}
              filePath={book.filePath}
              highlights={highlights}
              onHighlightsChange={setHighlights}
              onTocLoaded={setTocItems}
              onProgressChange={handleProgressChange}
              onLocationChange={handleLocationChange}
              settings={settings}
              initialLocation={book.currentLocation}
            />
          )}
        </div>
      </div>

      {/* Right Sidebar - Detail */}
      <div className={`shrink-0 h-full overflow-hidden ${detailCollapsed ? 'w-0' : ''}`}>
        <BookReaderDetailPanel
          book={book}
          readProgress={readProgress}
          highlights={highlights}
          activeTab={detailActiveTab}
          onTabChange={setDetailActiveTab}
          focusedHighlightId={focusedHighlightId}
          focusSignal={focusSignal}
          onHighlightsChange={setHighlights}
          onDeleteHighlight={handleDeleteHighlight}
          onHighlightClick={handleHighlightNavigate}
        />
      </div>
    </div>
  );
}
