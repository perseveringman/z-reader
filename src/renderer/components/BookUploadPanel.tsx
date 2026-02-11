import { useState, useCallback } from 'react';
import { BookOpen, Upload } from 'lucide-react';

interface BookUploadPanelProps {
  onImported: () => void;
  collapsed?: boolean;
}

export function BookUploadPanel({ onImported, collapsed }: BookUploadPanelProps) {
  const [dragging, setDragging] = useState(false);

  const handleImport = useCallback(async () => {
    try {
      const books = await window.electronAPI.bookImport();
      if (books.length > 0) onImported();
    } catch (err) {
      console.error('Failed to import book:', err);
    }
  }, [onImported]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleImport();
  }, [handleImport]);

  return (
    <div className={`
      flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
      transition-[width] duration-200 overflow-hidden
      ${collapsed ? 'w-0 border-l-0' : 'w-[360px]'}
    `}>
      <div className="min-w-[360px] flex flex-col h-full">
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/5">
          <h3 className="text-[13px] font-semibold text-white">Upload Books</h3>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              w-full rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-4 transition-colors
              ${dragging
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-white/10 hover:border-white/20'
              }
            `}
          >
            <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center">
              <Upload size={24} className="text-gray-500" />
            </div>

            <div className="text-center">
              <p className="text-[14px] text-gray-300">Drag and drop EPUB/PDF files here</p>
              <p className="mt-1 text-[12px] text-gray-600">Max file size: 500 MB</p>
            </div>

            <button
              onClick={handleImport}
              className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              Select a book file
            </button>
          </div>
        </div>

        <div className="shrink-0 px-6 pb-6 flex items-center gap-2 text-[12px] text-gray-600">
          <BookOpen size={14} />
          <span>Supported: EPUB, PDF</span>
        </div>
      </div>
    </div>
  );
}
