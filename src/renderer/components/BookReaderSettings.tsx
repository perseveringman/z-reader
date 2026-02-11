import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';

export interface BookReaderSettingsValues {
  font: 'system' | 'serif' | 'sans-serif' | 'monospace';
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'light' | 'sepia';
}

const STORAGE_KEY = 'z-reader-book-settings';

const FONTS: { key: BookReaderSettingsValues['font']; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'serif', label: 'Serif' },
  { key: 'sans-serif', label: 'Sans-serif' },
  { key: 'monospace', label: 'Monospace' },
];

const LINE_HEIGHTS = [1.5, 1.75, 2.0];

const THEMES: { key: BookReaderSettingsValues['theme']; label: string; preview: string }[] = [
  { key: 'dark', label: 'Dark', preview: 'bg-[#0f0f0f] border-gray-700' },
  { key: 'light', label: 'Light', preview: 'bg-white border-gray-300' },
  { key: 'sepia', label: 'Sepia', preview: 'bg-[#f4ecd8] border-amber-300' },
];

const DEFAULT_SETTINGS: BookReaderSettingsValues = {
  font: 'system',
  fontSize: 16,
  lineHeight: 1.75,
  theme: 'dark',
};

export function loadBookReaderSettings(): BookReaderSettingsValues {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function saveBookReaderSettings(settings: BookReaderSettingsValues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const BOOK_FONT_FAMILY_MAP: Record<BookReaderSettingsValues['font'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: '"Georgia", "Times New Roman", serif',
  'sans-serif': '"Helvetica Neue", "Arial", sans-serif',
  monospace: '"JetBrains Mono", "Fira Code", monospace',
};

interface BookReaderSettingsProps {
  open: boolean;
  onClose: () => void;
  settings: BookReaderSettingsValues;
  onSettingsChange: (settings: BookReaderSettingsValues) => void;
}

export function BookReaderSettings({ open, onClose, settings, onSettingsChange }: BookReaderSettingsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  const update = (patch: Partial<BookReaderSettingsValues>) => {
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    saveBookReaderSettings(next);
  };

  return (
    <div ref={ref} className="absolute top-12 right-4 z-50 w-[260px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-white">排版设置</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="text-[11px] text-gray-500 uppercase tracking-wider">Font</label>
        <div className="mt-1 flex gap-1">
          {FONTS.map((f) => (
            <button
              key={f.key}
              onClick={() => update({ font: f.key })}
              className={`flex-1 py-1 text-[11px] rounded transition-colors cursor-pointer ${settings.font === f.key ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-gray-500 uppercase tracking-wider">Size</label>
        <div className="mt-1 flex items-center gap-3">
          <button onClick={() => update({ fontSize: Math.max(12, settings.fontSize - 1) })} className="w-7 h-7 rounded bg-white/5 text-white text-sm hover:bg-white/10 cursor-pointer">−</button>
          <span className="text-[13px] text-white w-8 text-center">{settings.fontSize}</span>
          <button onClick={() => update({ fontSize: Math.min(28, settings.fontSize + 1) })} className="w-7 h-7 rounded bg-white/5 text-white text-sm hover:bg-white/10 cursor-pointer">+</button>
        </div>
      </div>

      <div>
        <label className="text-[11px] text-gray-500 uppercase tracking-wider">Line Height</label>
        <div className="mt-1 flex gap-1">
          {LINE_HEIGHTS.map((lh) => (
            <button
              key={lh}
              onClick={() => update({ lineHeight: lh })}
              className={`flex-1 py-1 text-[11px] rounded transition-colors cursor-pointer ${settings.lineHeight === lh ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5'}`}
            >
              {lh}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-gray-500 uppercase tracking-wider">Theme</label>
        <div className="mt-1 flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => update({ theme: t.key })}
              className={`flex-1 py-1.5 text-[11px] rounded border transition-colors cursor-pointer ${t.preview} ${settings.theme === t.key ? 'ring-2 ring-blue-500' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
