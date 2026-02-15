import { useState, useEffect, useCallback } from 'react';
import { Clock, Globe, User, Calendar, FileText, Trash2, Highlighter, Download, Copy, Share2, Image as ImageIcon } from 'lucide-react';
import type { Article, Highlight, CardType } from '../../shared/types';
import ShareCardModal from './share-card/ShareCardModal';
import { ChatPanel } from './ChatPanel';
import { useResizablePanel } from '../hooks/useResizablePanel';

type DetailTab = 'info' | 'notebook' | 'chat';

interface ReaderDetailPanelProps {
  articleId: string;
  highlights: Highlight[];
  onHighlightsChange: (highlights: Highlight[]) => void;
  onDeleteHighlight: (id: string) => void;
  onHighlightClick?: (highlightId: string) => void;
  /** 外部指定切换到的 tab，变化时触发切换 */
  forceTab?: { tab: DetailTab; ts: number };
  /** 外部传入的阅读进度，实时更新 */
  readProgress?: number;
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

export function ReaderDetailPanel({ articleId, highlights, onHighlightsChange, onDeleteHighlight, onHighlightClick, forceTab, readProgress = 0 }: ReaderDetailPanelProps) {
  const { width: panelWidth, handleMouseDown: handleResizeMouseDown } = useResizablePanel({
    defaultWidth: 500,
    minWidth: 240,
    maxWidth: 500,
    storageKey: 'readerDetailPanelWidth',
  });
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // 外部触发 tab 切换
  useEffect(() => {
    if (forceTab) setActiveTab(forceTab.tab);
  }, [forceTab]);

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

    return () => { cancelled = true; };
  }, [articleId]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    onDeleteHighlight(id);
  }, [onDeleteHighlight]);

  const handleSaveNote = useCallback(async (hlId: string, note: string) => {
    const updated = await window.electronAPI.highlightUpdate({ id: hlId, note });
    onHighlightsChange(highlights.map((h) => h.id === hlId ? updated : h));
    setEditingNoteId(null);
  }, [highlights, onHighlightsChange]);

  const handleExport = useCallback(async (mode: 'clipboard' | 'file') => {
    await window.electronAPI.highlightExport(articleId, mode);
  }, [articleId]);

  // 分享卡片相关 state
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareCardHighlights, setShareCardHighlights] = useState<Highlight[]>([]);
  const [shareCardInitialType, setShareCardInitialType] = useState<CardType | undefined>();

  const openShareCard = useCallback((hls: Highlight[], type?: CardType) => {
    setShareCardHighlights(hls);
    setShareCardInitialType(type);
    setShareCardOpen(true);
  }, []);

  const metaRows: MetaRow[] = article
    ? [
        { label: 'Type', value: 'Article', icon: <FileText className="w-3.5 h-3.5" /> },
        { label: 'Domain', value: article.domain, icon: <Globe className="w-3.5 h-3.5" /> },
        { label: 'Published', value: formatDate(article.publishedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        { label: 'Length', value: article.readingTime ? `${article.readingTime} min` : null, icon: <Clock className="w-3.5 h-3.5" /> },
        { label: 'Progress', value: `${Math.round(readProgress * 100)}%`, icon: <FileText className="w-3.5 h-3.5" /> },
        { label: 'Saved', value: formatDate(article.savedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        { label: 'Author', value: article.author, icon: <User className="w-3.5 h-3.5" /> },
      ]
    : [];

  return (
    <div className="shrink-0 flex flex-col h-full min-h-0 border-l border-[#262626] bg-[#141414] relative" style={{ width: panelWidth }}>
      {/* 拖拽手柄 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 z-10 transition-colors"
      />
      {/* Tab 切换 */}
      <div className="shrink-0 flex gap-1.5 px-3 pt-3 pb-1 border-b border-[#262626]">
        {[
          { key: 'info' as DetailTab, label: 'Info' },
          { key: 'notebook' as DetailTab, label: 'Notebook', count: highlights.length },
          { key: 'chat' as DetailTab, label: 'Chat' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-3 py-1.5 text-[13px] font-medium rounded-t-md transition-colors cursor-pointer flex items-center gap-1.5 relative
              ${activeTab === tab.key
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300'
              }
            `}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="text-[11px] text-gray-500">{tab.count}</span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'chat' ? '' : 'overflow-y-auto p-4'}`}>
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
              <div className="flex flex-col gap-5">
                {/* SUMMARY */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Summary
                  </h3>
                  <p className="text-[13px] leading-[1.6] text-gray-400">
                    {article.summary || '暂无摘要'}
                  </p>
                </div>

                {/* Metadata */}
                <div>
                  {metaRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center py-2.5 border-b border-white/5 last:border-b-0"
                    >
                      <span className="flex items-center gap-2 text-[11px] text-gray-500 w-[100px] shrink-0 font-medium">
                        <span className="text-gray-600">{row.icon}</span>
                        {row.label}
                      </span>
                      <span className="text-[13px] text-gray-300 truncate">
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
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        {highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExport('clipboard')}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title="复制到剪贴板"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleExport('file')}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title="保存为文件"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openShareCard(highlights)}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
                          title="生成分享卡片"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {[...highlights].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((hl) => (
                      <div
                        key={hl.id}
                        className="group relative flex rounded-lg bg-[#1a1a1a] border border-white/5 overflow-hidden cursor-pointer hover:border-white/15 transition-colors"
                        onClick={() => onHighlightClick?.(hl.id)}
                      >
                        <div
                          className="w-[3px] shrink-0"
                          style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow }}
                        />
                        <div className="flex-1 p-3 min-w-0">
                          <p className="text-[13px] leading-[1.5] text-gray-300 italic">
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
                              className="mt-2 w-full text-[12px] text-gray-300 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 resize-none outline-none focus:border-blue-500/50"
                              rows={2}
                              placeholder="添加笔记…"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingNoteId(hl.id);
                                setEditingNoteText(hl.note || '');
                              }}
                              className="mt-1.5 block text-left text-[12px] text-gray-500 hover:text-gray-400 transition-colors w-full"
                            >
                              {hl.note || '添加笔记…'}
                            </button>
                          )}
                          <span className="mt-2 block text-[10px] text-gray-600">
                            {formatRelativeTime(hl.createdAt)}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => { e.stopPropagation(); openShareCard([hl], 'single'); }}
                            className="p-1.5 rounded hover:bg-white/10 cursor-pointer text-gray-500 hover:text-blue-400"
                            title="生成分享卡片"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteHighlight(hl.id); }}
                            className="p-1.5 rounded hover:bg-white/10 cursor-pointer text-gray-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                <ChatPanel articleId={articleId} />
              </div>
            )}
          </>
        )}
      </div>

      {/* 分享卡片弹窗 */}
      {article && (
        <ShareCardModal
          open={shareCardOpen}
          onClose={() => setShareCardOpen(false)}
          highlights={shareCardHighlights}
          article={article}
          initialCardType={shareCardInitialType}
        />
      )}
    </div>
  );
}
