import { useState, useEffect, useRef, useCallback } from 'react';
import { Inbox, Clock, Archive, Trash2, BookOpen, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  shortcut: string;
  icon: LucideIcon;
}

const COMMANDS: Command[] = [
  { id: 'inbox', label: 'Go to Inbox', shortcut: '1', icon: Inbox },
  { id: 'later', label: 'Go to Later', shortcut: '2', icon: Clock },
  { id: 'archive', label: 'Go to Archive', shortcut: '3', icon: Archive },
  { id: 'archive-article', label: 'Archive Article', shortcut: 'E', icon: Archive },
  { id: 'later-article', label: 'Read Later', shortcut: 'L', icon: Clock },
  { id: 'delete-article', label: 'Delete Article', shortcut: 'D', icon: Trash2 },
  { id: 'open-reader', label: 'Open in Reader', shortcut: 'Enter', icon: BookOpen },
  { id: 'search', label: 'Search', shortcut: '/', icon: Search },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecute: (commandId: string) => void;
}

export function CommandPalette({ open, onClose, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback(
    (commandId: string) => {
      onClose();
      onExecute(commandId);
    },
    [onClose, onExecute]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) execute(filtered[selectedIndex].id);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, execute, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20%]"
      onClick={onClose}
    >
      <div
        className="w-[520px] bg-[#1a1a1a] rounded-xl border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          className="w-full bg-transparent border-b border-white/5 px-4 py-3 text-white text-sm placeholder:text-gray-500 outline-none"
        />
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                onClick={() => execute(cmd.id)}
                className={`w-full px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                  i === selectedIndex ? 'bg-white/[0.06]' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-200">{cmd.label}</span>
                </div>
                <span className="text-[11px] text-gray-500 bg-white/5 rounded px-1.5 py-0.5">
                  {cmd.shortcut}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No matching commands
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
