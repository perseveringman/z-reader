import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ReaderSlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ReaderSlidePanel({ open, onClose, title, children }: ReaderSlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        className="absolute top-0 right-0 h-full z-50 bg-[#141414] border-l border-white/10 shadow-2xl flex flex-col"
        style={{
          width: 'min(360px, 80%)',
          animation: 'slideInRight 150ms ease-out',
        }}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between px-3 h-10 border-b border-white/10">
            <span className="text-xs font-medium text-gray-300">{title}</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
