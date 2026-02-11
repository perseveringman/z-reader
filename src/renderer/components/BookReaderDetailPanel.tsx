import { useState, useCallback, useRef, useEffect } from 'react';
import { Clock, User, Building2, Globe, FileText, MessageSquare, Trash2, Highlighter } from 'lucide-react';
import type { Book, Highlight } from '../../shared/types';

export type DetailTab = 'info' | 'notebook' | 'chat';

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  yellow: '#fbbf24',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

interface BookReaderDetailPanelProps {
  book: Book | null;
  readProgress?: number;
  highlights: Highlight[];
  activeTab?: DetailTab;
  onTabChange?: (tab: DetailTab) => void;
  focusedHighlightId?: string | null;
  focusSignal?: number;
  onHighlightsChange: (highlights: Highlight[]) => void;
  onDeleteHighlight: (id: string) => void;
  onHighlightClick?: (highlightId: string) => void;
}

export function BookReaderDetailPanel({
  book,
  readProgress,
  highlights,
  activeTab: controlledActiveTab,
  onTabChange,
  focusedHighlightId,
  focusSignal,
  onHighlightsChange,
  onDeleteHighlight,
  onHighlightClick,
}: BookReaderDetailPanelProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<DetailTab>('info');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [focusedPulseId, setFocusedPulseId] = useState<string | null>(null);
  const highlightRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;

  const handleTabChange = useCallback((tab: DetailTab) => {
    if (controlledActiveTab === undefined) {
      setUncontrolledActiveTab(tab);
    }
    onTabChange?.(tab);
  }, [controlledActiveTab, onTabChange]);

  useEffect(() => {
    if (!focusedHighlightId) return;
    if (activeTab !== 'notebook') return;

    const target = highlightRefsRef.current.get(focusedHighlightId);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedPulseId(focusedHighlightId);

    const timer = window.setTimeout(() => {
      setFocusedPulseId((curr) => (curr === focusedHighlightId ? null : curr));
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [focusedHighlightId, focusSignal, activeTab]);

  const handleSaveNote = useCallback(async (hlId: string, note: string) => {
    const updated = await window.electronAPI.highlightUpdate({ id: hlId, note });
    onHighlightsChange(highlights.map((h) => h.id === hlId ? updated : h));
    setEditingNoteId(null);
  }, [highlights, onHighlightsChange]);

  const sortedHighlights = [...highlights].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="w-[280px] shrink-0 flex flex-col h-full min-h-0 border-l border-[#262626] bg-[#141414]">
      <div className="shrink-0 flex gap-2 px-4 pt-3 pb-2 border-b border-[#262626]">
        {[
          { key: 'info' as DetailTab, label: 'Info' },
          { key: 'notebook' as DetailTab, label: 'Notebook', count: highlights.length },
          { key: 'chat' as DetailTab, label: 'Chat' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`
              px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1
              ${activeTab === tab.key
                ? 'text-white bg-white/10'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }
            `}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="text-[10px] text-gray-500">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'info' && book && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Details
              </h3>
              {[
                { label: 'Type', value: book.fileType?.toUpperCase() || 'EPUB', icon: <FileText className="w-3.5 h-3.5" /> },
                { label: 'Author', value: book.author, icon: <User className="w-3.5 h-3.5" /> },
                { label: 'Publisher', value: book.publisher, icon: <Building2 className="w-3.5 h-3.5" /> },
                { label: 'Language', value: book.language, icon: <Globe className="w-3.5 h-3.5" /> },
                { label: 'Progress', value: `${Math.round((readProgress ?? book.readProgress ?? 0) * 100)}%`, icon: <Clock className="w-3.5 h-3.5" /> },
              ].map((row) => (
                <div key={row.label} className="flex items-center py-2 border-b border-white/5 last:border-b-0">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-500 w-[90px] shrink-0">
                    {row.icon}
                    {row.label}
                  </span>
                  <span className="text-[12px] text-white truncate">{row.value || '—'}</span>
                </div>
              ))}
            </div>
            {book.description && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Description</h3>
                <p className="text-[12px] leading-[1.6] text-gray-400 line-clamp-6">{book.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notebook' && (
          <div className="flex flex-col">
            {sortedHighlights.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <div className="text-center text-gray-500">
                  <Highlighter className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">0 highlights</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {sortedHighlights.length} {sortedHighlights.length === 1 ? 'highlight' : 'highlights'}
                </span>
                {sortedHighlights.map((hl) => (
                  <div
                    key={hl.id}
                    ref={(el) => {
                      if (el) {
                        highlightRefsRef.current.set(hl.id, el);
                      } else {
                        highlightRefsRef.current.delete(hl.id);
                      }
                    }}
                    className="group relative flex rounded-lg bg-[#1a1a1a] border border-white/5 overflow-hidden cursor-pointer hover:border-white/15 transition-colors"
                    style={{
                      boxShadow: focusedPulseId === hl.id ? '0 0 0 2px rgba(59,130,246,0.55) inset' : undefined,
                    }}
                    onClick={() => onHighlightClick?.(hl.id)}
                  >
                    <div className="w-[3px] shrink-0" style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow }} />
                    <div className="flex-1 p-2.5 min-w-0">
                      <p className="text-[12px] leading-[1.5] text-gray-300 italic">
                        &ldquo;{hl.text}&rdquo;
                      </p>
                      {editingNoteId === hl.id ? (
                        <textarea
                          autoFocus
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          onBlur={() => handleSaveNote(hl.id, editingNoteText)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveNote(hl.id, editingNoteText); }
                            if (e.key === 'Escape') setEditingNoteId(null);
                          }}
                          className="mt-1 w-full text-[11px] text-gray-300 bg-white/5 border border-white/10 rounded px-2 py-1 resize-none outline-none focus:border-blue-500/50"
                          rows={2}
                          placeholder="添加笔记…"
                        />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingNoteId(hl.id); setEditingNoteText(hl.note || ''); }}
                          className="mt-1 block text-left text-[11px] text-gray-400 hover:text-gray-300 transition-colors w-full"
                        >
                          {hl.note || '添加笔记…'}
                        </button>
                      )}
                      <span className="mt-1.5 block text-[10px] text-gray-600">{formatRelativeTime(hl.createdAt)}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteHighlight(hl.id); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center text-gray-600">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">AI 对话（二期功能）</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
