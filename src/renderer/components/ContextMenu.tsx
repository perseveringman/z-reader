import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl py-1 backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-white/10" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`
              w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors cursor-pointer
              ${item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }
            `}
          >
            {Icon && <Icon size={14} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
