import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ReaderSettingsValues {
  font: 'system' | 'serif' | 'sans-serif' | 'monospace';
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'light' | 'sepia';
}

const STORAGE_KEY = 'z-reader-settings';

export const FONTS: { key: ReaderSettingsValues['font']; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'serif', label: 'Serif' },
  { key: 'sans-serif', label: 'Sans-serif' },
  { key: 'monospace', label: 'Monospace' },
];

export const LINE_HEIGHTS = [1.5, 1.75, 2.0];

const THEMES: { key: ReaderSettingsValues['theme']; label: string; preview: string }[] = [
  { key: 'dark', label: 'Dark', preview: 'bg-[#0f0f0f] border-gray-700' },
  { key: 'light', label: 'Light', preview: 'bg-white border-gray-300' },
  { key: 'sepia', label: 'Sepia', preview: 'bg-[#f4ecd8] border-amber-300' },
];

export const DEFAULT_SETTINGS: ReaderSettingsValues = {
  font: 'system',
  fontSize: 16,
  lineHeight: 1.75,
  theme: 'dark',
};

export function loadReaderSettings(): ReaderSettingsValues {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveReaderSettings(settings: ReaderSettingsValues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const FONT_FAMILY_MAP: Record<ReaderSettingsValues['font'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  'sans-serif': '"Helvetica Neue", Arial, sans-serif',
  monospace: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
};

interface ReaderSettingsProps {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettingsValues;
  onSettingsChange: (settings: ReaderSettingsValues) => void;
}

export function ReaderSettings({ open, onClose, settings, onSettingsChange }: ReaderSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const update = (partial: Partial<ReaderSettingsValues>) => {
    const next = { ...settings, ...partial };
    onSettingsChange(next);
    saveReaderSettings(next);
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-12 w-[280px] bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl z-50 p-4 space-y-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-white">Reading Settings</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Font */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">Font</label>
        <div className="grid grid-cols-2 gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f.key}
              onClick={() => update({ font: f.key })}
              className={`px-2 py-1.5 rounded text-[12px] transition-colors ${
                settings.font === f.key
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-gray-500">Font Size</label>
          <span className="text-[11px] text-gray-400">{settings.fontSize}px</span>
        </div>
        <input
          type="range"
          min={14}
          max={22}
          step={1}
          value={settings.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
          <span>14</span>
          <span>22</span>
        </div>
      </div>

      {/* Line Height */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">Line Height</label>
        <div className="flex gap-1.5">
          {LINE_HEIGHTS.map((lh) => (
            <button
              key={lh}
              onClick={() => update({ lineHeight: lh })}
              className={`flex-1 px-2 py-1.5 rounded text-[12px] transition-colors ${
                settings.lineHeight === lh
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              {lh}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">Theme</label>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => update({ theme: t.key })}
              className={`flex-1 flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                settings.theme === t.key ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <div className={`w-8 h-8 rounded border ${t.preview}`} />
              <span className="text-[10px] text-gray-400">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
