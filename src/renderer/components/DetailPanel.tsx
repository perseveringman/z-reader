import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Globe, User, Calendar, FileText, MessageSquare, Trash2, Highlighter, Tag, Download, Copy, Save } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';
import { TagPicker } from './TagPicker';

type DetailTab = 'info' | 'notebook' | 'chat';

interface DetailPanelProps {
  articleId: string | null;
  collapsed?: boolean;
  /** 外部传入的高亮列表（视频模式由 VideoReaderView 管理） */
  externalHighlights?: Highlight[];
  /** 外部删除高亮回调（视频模式） */
  onExternalDeleteHighlight?: (id: string) => void;
  /** 点击高亮条目回调（用于跳转到对应位置） */
  onHighlightClick?: (highlightId: string) => void;
}

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

function formatRelativeTime(dateStr: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('time.daysAgo', { n: days });
  return formatDate(dateStr) ?? dateStr;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function DetailPanel({ articleId, collapsed, externalHighlights, onExternalDeleteHighlight, onHighlightClick }: DetailPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'info', label: t('feedDetail.info') },
    { key: 'notebook', label: t('detailPanel.highlights') },
    { key: 'chat', label: 'Chat' },
  ];
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [internalHighlights, setInternalHighlights] = useState<Highlight[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // 使用外部高亮或内部高亮
  const useExternal = externalHighlights != null;
  const highlights = useExternal ? externalHighlights : internalHighlights;

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      setInternalHighlights([]);
      return;
    }

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

    // 仅在非外部管理模式下自行加载高亮
    if (!useExternal) {
      window.electronAPI.highlightList(articleId).then((list) => {
        if (!cancelled) setInternalHighlights(list);
      });
    }

    return () => { cancelled = true; };
  }, [articleId, useExternal]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    if (useExternal && onExternalDeleteHighlight) {
      onExternalDeleteHighlight(id);
    } else {
      await window.electronAPI.highlightDelete(id);
      setInternalHighlights((prev) => prev.filter((h) => h.id !== id));
    }
  }, [useExternal, onExternalDeleteHighlight]);

  const handleSaveNote = useCallback(async (hlId: string, note: string) => {
    const updated = await window.electronAPI.highlightUpdate({ id: hlId, note });
    if (!useExternal) {
      setInternalHighlights((prev) => prev.map((h) => h.id === hlId ? updated : h));
    }
    setEditingNoteId(null);
  }, [useExternal]);

  const handleExport = useCallback(async (mode: 'clipboard' | 'file') => {
    if (!articleId) return;
    const result = await window.electronAPI.highlightExport(articleId, mode);
    if (result === 'clipboard') {
      // Could show toast but DetailPanel doesn't have access to showToast
    }
  }, [articleId]);

  const isVideo = article?.mediaType === 'video';
  const metaRows: MetaRow[] = article
    ? [
        { label: 'Published', value: formatDate(article.publishedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        ...(!isVideo ? [{ label: 'Author', value: article.author, icon: <User className="w-3.5 h-3.5" /> }] : []),
        { label: 'Domain', value: article.domain, icon: <Globe className="w-3.5 h-3.5" /> },
        ...(isVideo && article.duration
          ? [{ label: 'Length', value: formatDuration(article.duration), icon: <Clock className="w-3.5 h-3.5" /> }]
          : []),
        ...(isVideo
          ? [{ label: 'Progress', value: `${Math.round(article.readProgress * 100)}%`, icon: <FileText className="w-3.5 h-3.5" /> }]
          : []),
        ...(!isVideo ? [{ label: 'Reading Time', value: article.readingTime ? `${article.readingTime} min` : null, icon: <Clock className="w-3.5 h-3.5" /> }] : []),
        ...(!isVideo ? [{ label: 'Word Count', value: article.wordCount?.toLocaleString() ?? null, icon: <FileText className="w-3.5 h-3.5" /> }] : []),
        { label: 'Saved', value: formatDate(article.savedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
      ]
    : [];

  const readStatusLabel: Record<string, string> = {
    inbox: t('contentList.inbox'),
    later: t('contentList.later'),
    archive: t('contentList.archive'),
  };

  return (
    <div className={`
      flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
      transition-[width] duration-200 overflow-hidden
      ${collapsed ? 'w-0 border-l-0' : 'w-[360px]'}
    `}>
      <div className="min-w-[360px]">
      {/* Tab 切换 */}
      <div className="shrink-0 flex gap-1 px-4 pt-3 border-b border-white/5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer
              ${activeTab === tab.key
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-300'
              }
            `}
          >
            {tab.label}
            {tab.key === 'notebook' && (
              <span className="ml-1 min-w-[1em] text-center text-[10px] text-gray-500 tabular-nums inline-block">{highlights.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {!articleId ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            {t('detailPanel.noSelection')}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            {t('common.loading')}
          </div>
        ) : !article ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            {t('errors.notFound')}
          </div>
        ) : (
          <>
            {activeTab === 'info' && (
              <div className="flex-1 flex flex-col">
                <div className="flex-1">
                  {/* SUMMARY */}
                  <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Summary
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.6] text-gray-400">
                    {article.summary || t('detailPanel.noHighlights')}
                  </p>

                  {/* Metadata */}
                  <div className="mt-6">
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

                  {/* Tags */}
                  <div className="mt-6">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Tag className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tags</span>
                    </div>
                    <TagPicker articleId={article.id} />
                  </div>
                </div>

                {/* 底部状态卡片 */}
                <div className="mt-6 rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-500">{t('books.readStatus')}</span>
                    <span className="text-white font-medium">
                      {readStatusLabel[article.readStatus] ?? article.readStatus}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-500">{t('books.progress')}</span>
                      <span className="text-white font-medium">
                        {Math.round(article.readProgress * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-white/10">
                      <div
                        className="h-1 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${Math.round(article.readProgress * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notebook' && (
              <div className="flex-1 flex flex-col">
                {highlights.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <Highlighter className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">{t('detailPanel.noHighlights')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        {highlights.length} {t('detailPanel.highlights').toLowerCase()}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExport('clipboard')}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title={t('common.copy')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleExport('file')}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title={t('common.export')}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {highlights.map((hl) => (
                      <div
                        key={hl.id}
                        className={`group relative flex rounded-lg bg-[#1a1a1a] border border-white/5 overflow-hidden ${onHighlightClick ? 'cursor-pointer hover:border-white/10' : ''}`}
                        onClick={() => onHighlightClick?.(hl.id)}
                      >
                        <div
                          className="w-[3px] shrink-0"
                          style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow }}
                        />
                        <div className="flex-1 p-3 min-w-0">
                          <p className="text-[13px] leading-[1.6] text-gray-300 italic">
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
                              className="mt-1.5 w-full text-[12px] text-gray-300 bg-white/5 border border-white/10 rounded px-2 py-1.5 resize-none outline-none focus:border-blue-500/50"
                              rows={2}
                              placeholder={t('detailPanel.addNote')}
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingNoteId(hl.id);
                                setEditingNoteText(hl.note || '');
                              }}
                              className="mt-1.5 block text-left text-[12px] text-gray-400 hover:text-gray-300 transition-colors w-full"
                            >
                              {hl.note || t('detailPanel.addNote')}
                            </button>
                          )}
                          <span className="mt-2 block text-[11px] text-gray-600">
                            {formatRelativeTime(hl.createdAt, t)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteHighlight(hl.id)}
                          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-600">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">AI {t('detailPanel.noHighlights')}（二期功能）</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
