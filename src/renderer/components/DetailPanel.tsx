import { useState, useEffect, useCallback } from 'react';
import { Clock, Globe, User, Calendar, FileText, MessageSquare, Trash2, Highlighter } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';

type DetailTab = 'info' | 'notebook' | 'chat';

interface DetailPanelProps {
  articleId: string | null;
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

export function DetailPanel({ articleId }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      setHighlights([]);
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

    window.electronAPI.highlightList(articleId).then((list) => {
      if (!cancelled) setHighlights(list);
    });

    return () => { cancelled = true; };
  }, [articleId]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const metaRows: MetaRow[] = article
    ? [
        { label: 'Published', value: formatDate(article.publishedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
        { label: 'Author', value: article.author, icon: <User className="w-3.5 h-3.5" /> },
        { label: 'Domain', value: article.domain, icon: <Globe className="w-3.5 h-3.5" /> },
        { label: 'Reading Time', value: article.readingTime ? `${article.readingTime} min` : null, icon: <Clock className="w-3.5 h-3.5" /> },
        { label: 'Word Count', value: article.wordCount?.toLocaleString() ?? null, icon: <FileText className="w-3.5 h-3.5" /> },
        { label: 'Saved', value: formatDate(article.savedAt), icon: <Calendar className="w-3.5 h-3.5" /> },
      ]
    : [];

  const readStatusLabel: Record<string, string> = {
    inbox: '收件箱',
    later: '稍后阅读',
    archive: '已归档',
  };

  return (
    <div className="flex-1 flex flex-col min-w-[320px] bg-[#0f0f0f]">
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
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {!articleId ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            选择一篇文章查看详情
          </div>
        ) : loading ? (
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
              <div className="flex-1 flex flex-col">
                <div className="flex-1">
                  {/* SUMMARY */}
                  <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Summary
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.6] text-gray-400">
                    {article.summary || '暂无摘要'}
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
                </div>

                {/* 底部状态卡片 */}
                <div className="mt-6 rounded-lg bg-[#1a1a1a] border border-white/5 p-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-500">状态</span>
                    <span className="text-white font-medium">
                      {readStatusLabel[article.readStatus] ?? article.readStatus}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-gray-500">阅读进度</span>
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
                      <p className="text-sm">暂无高亮笔记</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      {highlights.length} 条高亮
                    </span>
                    {highlights.map((hl) => (
                      <div
                        key={hl.id}
                        className="group relative flex rounded-lg bg-[#1a1a1a] border border-white/5 overflow-hidden"
                      >
                        <div
                          className="w-[3px] shrink-0"
                          style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow }}
                        />
                        <div className="flex-1 p-3 min-w-0">
                          <p className="text-[13px] leading-[1.6] text-gray-300 italic">
                            &ldquo;{hl.text}&rdquo;
                          </p>
                          {hl.note && (
                            <p className="mt-1.5 text-[12px] text-gray-400">{hl.note}</p>
                          )}
                          <span className="mt-2 block text-[11px] text-gray-600">
                            {formatRelativeTime(hl.createdAt)}
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
