import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Archive, Clock, Trash2, User, Building2, Globe } from 'lucide-react';
import type { Book, BookReadStatus } from '../../shared/types';
import { useResizablePanel } from '../hooks/useResizablePanel';

interface BookDetailPanelProps {
  bookId: string | null;
  collapsed?: boolean;
  onOpenReader: (id: string) => void;
  onRefresh: () => void;
}

export function BookDetailPanel({ bookId, collapsed, onOpenReader, onRefresh }: BookDetailPanelProps) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const { width: panelWidth, handleMouseDown: handleResizeMouseDown } = useResizablePanel({
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 600,
    storageKey: 'bookDetailPanelWidth',
  });

  useEffect(() => {
    if (!bookId) {
      setBook(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    window.electronAPI.bookGet(bookId).then((data) => {
      if (!cancelled) {
        setBook(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setBook(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [bookId]);

  const handleStatusChange = useCallback(async (status: BookReadStatus) => {
    if (!bookId) return;
    try {
      const updated = await window.electronAPI.bookUpdate({ id: bookId, readStatus: status });
      setBook(updated);
      onRefresh();
    } catch (err) {
      console.error('Failed to update book status:', err);
    }
  }, [bookId, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!bookId) return;
    try {
      await window.electronAPI.bookDelete(bookId);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  }, [bookId, onRefresh]);

  const progress = book ? Math.round(book.readProgress * 100) : 0;

  const statusLabel: Record<string, string> = {
    inbox: '收件箱',
    later: '稍后阅读',
    archive: '已归档',
  };

  interface MetaRow {
    label: string;
    value: string | null | undefined;
    icon: React.ReactNode;
  }

  const metaRows: MetaRow[] = book
    ? [
        { label: 'Author', value: book.author, icon: <User className="w-3.5 h-3.5" /> },
        { label: 'Publisher', value: book.publisher, icon: <Building2 className="w-3.5 h-3.5" /> },
        { label: 'Language', value: book.language, icon: <Globe className="w-3.5 h-3.5" /> },
      ]
    : [];

  return (
    <div
      className={`
        flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
        overflow-hidden relative
        ${collapsed ? 'w-0 border-l-0' : ''}
      `}
      style={collapsed ? undefined : { width: panelWidth }}
    >
      {!collapsed && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 z-10 transition-colors"
        />
      )}
      <div className="flex flex-col h-full" style={{ minWidth: panelWidth }}>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {!bookId ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              选择一本书查看详情
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              加载中…
            </div>
          ) : !book ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              书籍不存在
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex justify-center py-4">
                {book.cover ? (
                  <img
                    src={book.cover}
                    alt=""
                    className="w-32 h-48 rounded-lg object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-32 h-48 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <BookOpen size={32} className="text-gray-500" />
                  </div>
                )}
              </div>

              <h2 className="text-[16px] font-semibold text-white text-center leading-snug">
                {book.title || 'Untitled'}
              </h2>
              {book.author && (
                <p className="mt-1 text-[13px] text-gray-500 text-center">{book.author}</p>
              )}

              <div className="mt-6 rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">状态</span>
                  <span className="text-white font-medium">
                    {statusLabel[book.readStatus] ?? book.readStatus}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-gray-500">阅读进度</span>
                    <span className="text-white font-medium">{progress}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/10">
                    <div
                      className="h-1 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {metaRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center py-2.5 border-b border-white/5 last:border-b-0"
                  >
                    <span className="flex items-center gap-1.5 text-[12px] text-gray-500 w-[120px] shrink-0">
                      {row.icon}
                      {row.label}
                    </span>
                    <span className="text-[13px] text-white truncate">
                      {row.value || '—'}
                    </span>
                  </div>
                ))}
              </div>

              {book.description && (
                <div className="mt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Description
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.6] text-gray-400 line-clamp-6">
                    {book.description}
                  </p>
                </div>
              )}

              <div className="mt-auto pt-6 flex flex-col gap-2">
                <button
                  onClick={() => onOpenReader(book.id)}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <BookOpen size={14} />
                  打开阅读
                </button>
                <div className="flex gap-2">
                  {book.readStatus !== 'later' && (
                    <button
                      onClick={() => handleStatusChange('later')}
                      className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[12px] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Clock size={13} />
                      稍后
                    </button>
                  )}
                  {book.readStatus !== 'archive' && (
                    <button
                      onClick={() => handleStatusChange('archive')}
                      className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[12px] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Archive size={13} />
                      归档
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-400 text-[12px] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
