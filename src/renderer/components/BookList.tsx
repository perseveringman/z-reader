import { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, Upload, Loader2 } from 'lucide-react';
import type { Book, BookReadStatus, BookListQuery } from '../../shared/types';
import { useToast } from './Toast';
import { useUndoStack } from '../hooks/useUndoStack';

type TabKey = 'inbox' | 'later' | 'archive';

interface BookListProps {
  selectedBookId: string | null;
  onSelectBook: (id: string) => void;
  onOpenReader: (id: string) => void;
  refreshTrigger?: number;
  expanded?: boolean;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'later', label: 'LATER' },
  { key: 'archive', label: 'ARCHIVE' },
];

const EMPTY_MESSAGES: Record<TabKey, string> = {
  inbox: 'Newly saved books will appear in Inbox until triaged',
  later: 'Books saved for later will appear here',
  archive: 'Archived books will appear here',
};

export function BookList({ selectedBookId, onSelectBook, onOpenReader, refreshTrigger, expanded: _expanded }: BookListProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('inbox');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const { showToast } = useToast();
  const undoStack = useUndoStack();
  const listRef = useRef<HTMLDivElement>(null);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const query: BookListQuery = {
        readStatus: activeTab as BookReadStatus,
        limit: 100,
      };
      const result = await window.electronAPI.bookList(query);
      setBooks(result);
    } catch (err) {
      console.error('Failed to fetch books:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const handleImportBooks = useCallback(async () => {
    setImporting(true);
    try {
      const imported = await window.electronAPI.bookImport();
      if (imported.length === 0) return;

      setActiveTab('inbox');
      const result = await window.electronAPI.bookList({
        readStatus: 'inbox',
        limit: 100,
      });
      setBooks(result);
      onSelectBook(imported[0].id);
    } catch (err) {
      console.error('Failed to import books:', err);
    } finally {
      setImporting(false);
    }
  }, [onSelectBook]);

  const handleStatusChange = useCallback(async (id: string, status: BookReadStatus) => {
    try {
      const book = books.find((b) => b.id === id);
      const prevStatus = book?.readStatus ?? 'inbox';
      await window.electronAPI.bookUpdate({ id, readStatus: status });
      await fetchBooks();
      onSelectBook(id);
      showToast(status === 'archive' ? 'Archived' : status === 'later' ? 'Saved for later' : 'Moved to Inbox', 'success');
      undoStack.push({
        description: `Revert to ${prevStatus}`,
        undo: async () => {
          await window.electronAPI.bookUpdate({ id, readStatus: prevStatus });
          await fetchBooks();
          onSelectBook(id);
          showToast('Undone', 'info');
        },
      });
    } catch (err) {
      console.error('Failed to update book status:', err);
    }
  }, [books, fetchBooks, onSelectBook, showToast, undoStack]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electronAPI.bookDelete(id);
      await fetchBooks();
      showToast('Moved to Trash', 'success');
      undoStack.push({
        description: 'Undo delete',
        undo: async () => {
          await window.electronAPI.bookRestore(id);
          await fetchBooks();
          onSelectBook(id);
          showToast('Restored', 'info');
        },
      });
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  }, [fetchBooks, onSelectBook, showToast, undoStack]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks, refreshTrigger]);

  useEffect(() => {
    if (!selectedBookId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-book-id="${selectedBookId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedBookId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const idx = books.findIndex((b) => b.id === selectedBookId);
          const next = idx < books.length - 1 ? idx + 1 : idx;
          if (books[next]) onSelectBook(books[next].id);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const idx = books.findIndex((b) => b.id === selectedBookId);
          const prev = idx > 0 ? idx - 1 : 0;
          if (books[prev]) onSelectBook(books[prev].id);
          break;
        }
        case 'Enter': {
          if (selectedBookId) {
            e.preventDefault();
            onOpenReader(selectedBookId);
          }
          break;
        }
        case '1': {
          e.preventDefault();
          setActiveTab('inbox');
          break;
        }
        case '2': {
          e.preventDefault();
          setActiveTab('later');
          break;
        }
        case '3': {
          e.preventDefault();
          setActiveTab('archive');
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          if (selectedBookId) handleStatusChange(selectedBookId, 'archive');
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          if (selectedBookId) handleStatusChange(selectedBookId, 'later');
          break;
        }
        case 'd':
        case 'D': {
          e.preventDefault();
          if (selectedBookId) handleDelete(selectedBookId);
          break;
        }
        case 'z':
        case 'Z': {
          e.preventDefault();
          if (undoStack.canUndo) undoStack.undo();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [books, selectedBookId, onSelectBook, onOpenReader, handleStatusChange, handleDelete, undoStack]);

  return (
    <div className={`flex flex-col border-r border-[#262626] bg-[#141414] h-full flex-1 ${_expanded ? 'min-w-[360px]' : 'min-w-[300px]'}`}>
      <div className="shrink-0">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white tracking-wide">Books</h2>
          <button
            onClick={handleImportBooks}
            disabled={importing}
            className="h-8 px-2.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed text-xs text-gray-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
            title="导入书籍"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>导入</span>
          </button>
        </div>

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
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {loading && books.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[13px] text-[#555]">Loading...</span>
          </div>
        ) : books.length === 0 ? (
          <div className="flex items-center justify-center h-full px-8">
            <span className="text-[13px] text-[#555] text-center">{EMPTY_MESSAGES[activeTab]}</span>
          </div>
        ) : (
          <div>
            {books.map((book) => (
              <div
                key={book.id}
                data-book-id={book.id}
                className="border-b border-[#262626]"
              >
                <BookCard
                  book={book}
                  isSelected={book.id === selectedBookId}
                  onSelect={onSelectBook}
                  onOpen={onOpenReader}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-1.5 border-t border-[#262626] text-[11px] text-[#555]">
        {books.length} {books.length === 1 ? 'book' : 'books'}
      </div>
    </div>
  );
}

interface BookCardProps {
  book: Book;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function BookCard({ book, isSelected, onSelect, onOpen }: BookCardProps) {
  const [hovered, setHovered] = useState(false);
  const progress = Math.round(book.readProgress * 100);

  return (
    <div
      onClick={() => onSelect(book.id)}
      onDoubleClick={() => onOpen(book.id)}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative flex gap-3 px-4 py-3 cursor-pointer transition-colors
        ${isSelected
          ? 'border-l-2 border-blue-500 bg-white/[0.04]'
          : 'border-l-2 border-transparent hover:bg-white/[0.03]'
        }
      `}
    >
      <div className="shrink-0">
        {book.cover ? (
          <img
            src={book.cover}
            alt=""
            className="w-10 h-14 rounded object-cover"
          />
        ) : (
          <div className="w-10 h-14 rounded bg-white/[0.06] flex items-center justify-center">
            <BookOpen size={16} className="text-gray-500" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-medium text-gray-100 truncate leading-snug">
          {book.title || 'Untitled'}
        </h3>
        {book.author && (
          <p className="mt-0.5 text-[12px] text-gray-500 truncate">
            {book.author}
          </p>
        )}
        {progress > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/10">
              <div
                className="h-1 rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{progress}%</span>
          </div>
        )}
      </div>

      {hovered && (
        <div className="absolute right-3 top-3">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(book.id); }}
            className="p-1.5 rounded bg-[#1e1e1e] border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors shadow-lg"
            title="Open"
          >
            <BookOpen size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
