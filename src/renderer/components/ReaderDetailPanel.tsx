import { useState, useEffect, useCallback } from 'react';
import { Clock, Globe, User, Calendar, FileText, MessageSquare, Trash2, Highlighter, Download, Copy } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';

type DetailTab = 'info' | 'notebook' | 'chat';

interface ReaderDetailPanelProps {
  articleId: string;
}

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'notebook', label: 'Notebook' },
  { key: 'chat', label: 'Chat' },
];

interface MetaRow {
  label: string;
  value: string | null | undefined;
  icon: React.ReactNode;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

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
  return formatDate(dateStr) ?? dateStr;
}

export function ReaderDetailPanel({ articleId }: ReaderDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    window.electronAPI.articleGet(articleId).then((data) => {
      if (!cancelled) {
        setArticle(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setArticle(null);
        setLoading(false);
      }
    });

    window.electronAPI.highlightList(articleId).then((list) => {
      if (!cancelled) setHighlights(list);
    });

    return () => { cancelled = true; };
  }, [articleId]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleSaveNote = useCallback(async (hlId: string, note: string) => {
    const updated = await window.electronAPI.highlightUpdate({ id: hlId, note });
    setHighlights((prev) => prev.map((h) => h.id === hlId ? updated : h));
    setEditingNoteId(null);
  }, []);

  const handleExport = useCallback(async (mode: 'clipboard' | 'file') => {
    const result = await window.electronAPI.highlightExport(articleId, mode);
    if (result === 'clipboard') {
      // Could show toast but this panel doesn't have access to showToast
    }
  }, [articleId]);

  const metaRows: MetaRow[] = article
    ? [
        { label: 'Type', value: 'Article', icon: <FileText className="w-3.5 h-3.5" /> },
        { label: 'Domain', value: article.domain, icon: <Globe className="w-3.5 h-3.5" /> },
        { label: 'Published', value: formatDate(article.publishedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        { label: 'Length', value: article.readingTime ? `${article.readingTime} min` : null, icon: <Clock className="w-3.5 h-3.5" /> },
        { label: 'Progress', value: `${Math.round(article.readProgress * 100)}%`, icon: <FileText className="w-3.5 h-3.5" /> },
        { label: 'Saved', value: formatDate(article.savedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        { label: 'Author', value: article.author, icon: <User className="w-3.5 h-3.5" /> },
      ]
    : [];

  return (
    <div className="w-[280px] shrink-0 flex flex-col border-l border-[#262626] bg-[#141414]">
      {/* Tab 切换 */}
      <div className="shrink-0 flex gap-2 px-4 pt-3 pb-2 border-b border-[#262626]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer
              ${activeTab === tab.key
                ? 'text-white bg-white/10'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            加载中…
          </div>
        ) : !article ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            文章不存在
          </div>
        ) : (
          <>
            {activeTab === 'info' && (
              <div className="flex flex-col gap-4">
                {/* SUMMARY */}
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Summary
                  </h3>
                  <p className="text-[12px] leading-[1.6] text-gray-400">
                    {article.summary || '暂无摘要'}
                  </p>
                </div>

                {/* Metadata */}
                <div>
                  {metaRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center py-2 border-b border-white/5 last:border-b-0"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] text-gray-500 w-[90px] shrink-0">
                        {row.icon}
                        {row.label}
                      </span>
                      <span className="text-[12px] text-white truncate">
                        {row.value || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'notebook' && (
              <div className="flex flex-col">
                {highlights.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="text-center text-gray-500">
                      <Highlighter className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">
                        {highlights.length} highlights
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        {highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExport('clipboard')}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title="复制到剪贴板"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleExport('file')}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title="保存为文件"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {highlights.map((hl) => (
                      <div
                        key={hl.id}
                        className="group relative flex rounded-lg bg-[#1a1a1a] border border-white/5 overflow-hidden"
                      >
                        <div
                          className="w-[3px] shrink-0"
                          style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow }}
                        />
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
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveNote(hl.id, editingNoteText);
                                }
                                if (e.key === 'Escape') setEditingNoteId(null);
                              }}
                              className="mt-1 w-full text-[11px] text-gray-300 bg-white/5 border border-white/10 rounded px-2 py-1 resize-none outline-none focus:border-blue-500/50"
                              rows={2}
                              placeholder="添加笔记…"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingNoteId(hl.id);
                                setEditingNoteText(hl.note || '');
                              }}
                              className="mt-1 block text-left text-[11px] text-gray-400 hover:text-gray-300 transition-colors w-full"
                            >
                              {hl.note || '添加笔记…'}
                            </button>
                          )}
                          <span className="mt-1.5 block text-[10px] text-gray-600">
                            {formatRelativeTime(hl.createdAt)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteHighlight(hl.id)}
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
          </>
        )}
      </div>
    </div>
  );
}
