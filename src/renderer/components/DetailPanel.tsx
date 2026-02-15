import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Globe, User, Calendar, FileText, MessageSquare, Trash2, Highlighter, Tag, Download, Copy, Sparkles, Languages, Tags, Hash, Loader2 } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';
import { TagPicker } from './TagPicker';
import { ChatPanel } from './ChatPanel';
import { useResizablePanel } from '../hooks/useResizablePanel';

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
  const { width: panelWidth, handleMouseDown: handleResizeMouseDown } = useResizablePanel({
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 600,
    storageKey: 'detailPanelWidth',
  });
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'info', label: t('feedDetail.info') },
    { key: 'notebook', label: t('detailPanel.highlights') },
    { key: 'chat', label: t('chat.title') },
  ];
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [internalHighlights, setInternalHighlights] = useState<Highlight[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // AI 操作状态
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryResult, setAiSummaryResult] = useState<string | null>(null);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  const [aiTranslateLoading, setAiTranslateLoading] = useState(false);
  const [aiTranslateResult, setAiTranslateResult] = useState<{ title: string; content: string } | null>(null);
  const [aiTranslateError, setAiTranslateError] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const [aiTagLoading, setAiTagLoading] = useState(false);
  const [aiTagResult, setAiTagResult] = useState<string[] | null>(null);
  const [aiTagError, setAiTagError] = useState<string | null>(null);

  // AI 主题提取状态
  const [aiTopicsLoading, setAiTopicsLoading] = useState(false);
  const [aiTopicsResult, setAiTopicsResult] = useState<{ topics: string[] } | null>(null);
  const [aiTopicsError, setAiTopicsError] = useState<string | null>(null);

  // 使用外部高亮或内部高亮
  const useExternal = externalHighlights != null;
  const highlights = useExternal ? externalHighlights : internalHighlights;

  useEffect(() => {
    // 每次 articleId 变化时重置 AI 操作状态
    setAiSummaryResult(null);
    setAiSummaryError(null);
    setAiSummaryLoading(false);
    setAiTranslateResult(null);
    setAiTranslateError(null);
    setAiTranslateLoading(false);
    setShowLangPicker(false);
    setAiTagResult(null);
    setAiTagError(null);
    setAiTagLoading(false);
    setAiTopicsResult(null);
    setAiTopicsError(null);
    setAiTopicsLoading(false);

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

  // AI 操作：检查 API Key 是否配置
  const checkAiConfigured = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await window.electronAPI.aiSettingsGet();
      return !!(settings.apiKey && settings.apiKey.trim().length > 0);
    } catch {
      return false;
    }
  }, []);

  // AI 摘要
  const handleAiSummarize = useCallback(async () => {
    if (!articleId) return;
    const configured = await checkAiConfigured();
    if (!configured) {
      setAiSummaryError(t('ai.configureApiKey'));
      return;
    }
    setAiSummaryLoading(true);
    setAiSummaryResult(null);
    setAiSummaryError(null);
    try {
      const result = await window.electronAPI.aiSummarize({ articleId });
      setAiSummaryResult(result.summary);
    } catch {
      setAiSummaryError(t('ai.errorOccurred'));
    } finally {
      setAiSummaryLoading(false);
    }
  }, [articleId, checkAiConfigured, t]);

  // AI 翻译
  const handleAiTranslate = useCallback(async (targetLanguage: string) => {
    if (!articleId) return;
    const configured = await checkAiConfigured();
    if (!configured) {
      setAiTranslateError(t('ai.configureApiKey'));
      return;
    }
    setAiTranslateLoading(true);
    setAiTranslateResult(null);
    setAiTranslateError(null);
    setShowLangPicker(false);
    try {
      const result = await window.electronAPI.aiTranslate({ articleId, targetLanguage });
      setAiTranslateResult({ title: result.translatedTitle, content: result.translatedContent });
    } catch {
      setAiTranslateError(t('ai.errorOccurred'));
    } finally {
      setAiTranslateLoading(false);
    }
  }, [articleId, checkAiConfigured, t]);

  // AI 自动标签
  const handleAiAutoTag = useCallback(async () => {
    if (!articleId) return;
    const configured = await checkAiConfigured();
    if (!configured) {
      setAiTagError(t('ai.configureApiKey'));
      return;
    }
    setAiTagLoading(true);
    setAiTagResult(null);
    setAiTagError(null);
    try {
      const result = await window.electronAPI.aiAutoTag({ articleId });
      setAiTagResult(result.tags);
    } catch {
      setAiTagError(t('ai.errorOccurred'));
    } finally {
      setAiTagLoading(false);
    }
  }, [articleId, checkAiConfigured, t]);

  // AI 主题提取
  const handleAiExtractTopics = useCallback(async () => {
    if (!articleId) return;
    const configured = await checkAiConfigured();
    if (!configured) {
      setAiTopicsError(t('ai.configureApiKey'));
      return;
    }
    setAiTopicsLoading(true);
    setAiTopicsResult(null);
    setAiTopicsError(null);
    try {
      const result = await window.electronAPI.aiExtractTopics({ articleId });
      setAiTopicsResult(result);
    } catch {
      setAiTopicsError(t('ai.errorOccurred'));
    } finally {
      setAiTopicsLoading(false);
    }
  }, [articleId, checkAiConfigured, t]);

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
    <div
      className={`
        flex flex-col bg-[#0f0f0f] border-l border-[#262626] shrink-0
        overflow-hidden relative
        ${collapsed ? 'w-0 border-l-0' : ''}
      `}
      style={collapsed ? undefined : { width: panelWidth }}
    >
      {/* 拖拽手柄 */}
      {!collapsed && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 z-10 transition-colors"
        />
      )}
      <div className="flex flex-col h-full" style={{ minWidth: panelWidth }}>
      {/* Tab 切换 */}
      <div className="shrink-0 flex gap-1.5 px-3 pt-3 pb-1 border-b border-[#262626]">
        {TABS.map((tab) => (
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
            {tab.key === 'notebook' && (
              <span className="ml-1 min-w-[1em] text-center text-[11px] text-gray-500 tabular-nums inline-block">{highlights.length}</span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'chat' ? '' : 'overflow-y-auto p-4'}`}>
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
              <div className="flex-1 flex flex-col gap-5">
                <div className="flex-1">
                  {/* SUMMARY */}
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Summary
                  </h3>
                  <p className="text-[13px] leading-[1.6] text-gray-400">
                    {article.summary || t('detailPanel.noHighlights')}
                  </p>

                  {/* Metadata */}
                  <div className="mt-6">
                    {metaRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center py-2.5 border-b border-white/5 last:border-b-0"
                      >
                        <span className="flex items-center gap-2 text-[11px] text-gray-500 w-[110px] shrink-0 font-medium">
                          <span className="text-gray-600">{row.icon}</span>
                          {row.label}
                        </span>
                        <span className="text-[13px] text-gray-300 truncate">
                          {row.value || '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Tags */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Tags</span>
                    </div>
                    <TagPicker articleId={article.id} />
                  </div>

                  {/* AI 操作区域 */}
                  <div className="mt-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Sparkles className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t('ai.aiActions')}</span>
                    </div>
                    <div className="flex flex-col gap-2">

                      {/* AI 摘要 */}
                      <div className="rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                        <button
                          onClick={handleAiSummarize}
                          disabled={aiSummaryLoading}
                          className="flex items-center gap-2 text-[13px] text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
                        >
                          {aiSummaryLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-blue-400" />
                          )}
                          <span>{aiSummaryLoading ? t('ai.generating') : t('ai.summarize')}</span>
                        </button>
                        {aiSummaryResult && (
                          <p className="mt-2 text-[13px] text-gray-300 leading-[1.6] border-t border-white/5 pt-2">
                            {aiSummaryResult}
                          </p>
                        )}
                        {aiSummaryError && (
                          <p className="mt-2 text-[12px] text-red-400 border-t border-white/5 pt-2">
                            {aiSummaryError}
                          </p>
                        )}
                      </div>

                      {/* AI 翻译 */}
                      <div className="rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                        <button
                          onClick={() => {
                            if (!aiTranslateLoading) setShowLangPicker(!showLangPicker);
                          }}
                          disabled={aiTranslateLoading}
                          className="flex items-center gap-2 text-[13px] text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
                        >
                          {aiTranslateLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-green-400" />
                          ) : (
                            <Languages className="w-4 h-4 text-green-400" />
                          )}
                          <span>{aiTranslateLoading ? t('ai.generating') : t('ai.translate')}</span>
                        </button>
                        {showLangPicker && (
                          <div className="mt-2 flex gap-2 border-t border-white/5 pt-2">
                            {[
                              { key: 'zh', label: t('ai.chinese') },
                              { key: 'en', label: t('ai.english') },
                              { key: 'ja', label: t('ai.japanese') },
                            ].map((lang) => (
                              <button
                                key={lang.key}
                                onClick={() => handleAiTranslate(lang.key)}
                                className="px-2.5 py-1 text-[12px] rounded-md bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                              >
                                {lang.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {aiTranslateResult && (
                          <div className="mt-2 border-t border-white/5 pt-2">
                            <p className="text-[13px] text-white font-medium">{aiTranslateResult.title}</p>
                            <p className="mt-1 text-[13px] text-gray-300 leading-[1.6] line-clamp-6">{aiTranslateResult.content}</p>
                          </div>
                        )}
                        {aiTranslateError && (
                          <p className="mt-2 text-[12px] text-red-400 border-t border-white/5 pt-2">
                            {aiTranslateError}
                          </p>
                        )}
                      </div>

                      {/* AI 标签 */}
                      <div className="rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                        <button
                          onClick={handleAiAutoTag}
                          disabled={aiTagLoading}
                          className="flex items-center gap-2 text-[13px] text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
                        >
                          {aiTagLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          ) : (
                            <Tags className="w-4 h-4 text-purple-400" />
                          )}
                          <span>{aiTagLoading ? t('ai.generating') : t('ai.autoTag')}</span>
                        </button>
                        {aiTagResult && (
                          <div className="mt-2 border-t border-white/5 pt-2">
                            <p className="text-[11px] text-gray-500 mb-1.5">{t('ai.suggestedTags')}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {aiTagResult.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiTagError && (
                          <p className="mt-2 text-[12px] text-red-400 border-t border-white/5 pt-2">
                            {aiTagError}
                          </p>
                        )}
                      </div>

                      {/* AI 主题提取 */}
                      <div className="rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                        <button
                          onClick={handleAiExtractTopics}
                          disabled={aiTopicsLoading}
                          className="flex items-center gap-2 text-[13px] text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
                        >
                          {aiTopicsLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          ) : (
                            <Hash className="w-4 h-4 text-emerald-400" />
                          )}
                          <span>{aiTopicsLoading ? t('ai.generating') : t('ai.extractTopics')}</span>
                        </button>
                        {aiTopicsResult && (
                          <div className="mt-2 border-t border-white/5 pt-2">
                            <p className="text-[11px] text-gray-500 mb-1.5">{t('ai.topics')}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {aiTopicsResult.topics.map((topic, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiTopicsError && (
                          <p className="mt-2 text-[12px] text-red-400 border-t border-white/5 pt-2">
                            {aiTopicsError}
                          </p>
                        )}
                      </div>

                    </div>
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
              <div className="flex-1 flex flex-col min-h-0">
                <ChatPanel articleId={articleId} />
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
