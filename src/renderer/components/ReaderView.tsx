import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, Settings2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';
import { ReaderDetailPanel } from './ReaderDetailPanel';
import { ReaderSettings, loadReaderSettings, FONT_FAMILY_MAP } from './ReaderSettings';
import type { ReaderSettingsValues } from './ReaderSettings';

interface ReaderViewProps {
  articleId: string;
  onClose: () => void;
}

const HIGHLIGHT_COLORS = [
  { name: 'yellow', value: '#fbbf24' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'green', value: '#22c55e' },
  { name: 'red', value: '#ef4444' },
];

const COLOR_BG_MAP: Record<string, string> = {
  yellow: 'rgba(251, 191, 36, 0.25)',
  blue: 'rgba(59, 130, 246, 0.25)',
  green: 'rgba(34, 197, 94, 0.25)',
  red: 'rgba(239, 68, 68, 0.25)',
};

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

interface ToolbarPosition {
  x: number;
  y: number;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function ReaderView({ articleId, onClose }: ReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [feedName, setFeedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [focusedParagraphIndex, setFocusedParagraphIndex] = useState(-1);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPosition | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [readerSettings, setReaderSettings] = useState<ReaderSettingsValues>(loadReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocCollapsed, setTocCollapsed] = useState(() => localStorage.getItem('reader-toc-collapsed') === 'true');
  const [detailCollapsed, setDetailCollapsed] = useState(() => localStorage.getItem('reader-detail-collapsed') === 'true');
  const contentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await window.electronAPI.articleGet(articleId);
        if (cancelled) return;
        setArticle(data);

        if (data?.feedId) {
          const feeds = await window.electronAPI.feedList();
          const feed = feeds.find((f) => f.id === data.feedId);
          if (!cancelled && feed) setFeedName(feed.title);
        }

        if (data && !data.content && data.url) {
          setParsing(true);
          const parsed = await window.electronAPI.articleParseContent(articleId);
          if (!cancelled) {
            setArticle(parsed);
            setParsing(false);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [articleId]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.highlightList(articleId).then((list) => {
      if (!cancelled) setHighlights(list);
    });
    return () => { cancelled = true; };
  }, [articleId]);

  const applyHighlightsToContent = useCallback(() => {
    if (!contentRef.current || highlights.length === 0) return;

    contentRef.current.querySelectorAll('mark[data-highlight-id]').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
        parent.normalize();
      }
    });

    const treeWalker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = treeWalker.nextNode())) {
      textNodes.push(node as Text);
    }

    for (const hl of highlights) {
      if (!hl.text) continue;
      for (const textNode of textNodes) {
        const idx = (textNode.textContent ?? '').indexOf(hl.text);
        if (idx === -1) continue;

        const range = document.createRange();
        range.setStart(textNode, idx);
        range.setEnd(textNode, idx + hl.text.length);

        const mark = document.createElement('mark');
        mark.setAttribute('data-highlight-id', hl.id);
        mark.style.backgroundColor = COLOR_BG_MAP[hl.color] ?? COLOR_BG_MAP.yellow;
        mark.style.borderRadius = '2px';
        mark.style.padding = '1px 0';
        mark.style.color = 'inherit';

        range.surroundContents(mark);
        break;
      }
    }
  }, [highlights]);

  useEffect(() => {
    if (!loading && article?.content) {
      requestAnimationFrame(applyHighlightsToContent);

      // Extract TOC from headings
      if (contentRef.current) {
        const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const items: TocItem[] = Array.from(headings).map((h, i) => {
          const id = `heading-${i}`;
          h.id = id;
          return {
            id,
            text: h.textContent?.trim() ?? '',
            level: parseInt(h.tagName.charAt(1)),
          };
        });
        setTocItems(items);
      }
    }
  }, [loading, article?.content, applyHighlightsToContent]);

  useEffect(() => {
    if (!contentRef.current) return;
    const paragraphs = contentRef.current.querySelectorAll('p');
    paragraphs.forEach((p, i) => {
      p.setAttribute('data-focused', String(i === focusedParagraphIndex));
    });
    if (focusedParagraphIndex >= 0 && paragraphs[focusedParagraphIndex]) {
      paragraphs[focusedParagraphIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusedParagraphIndex, article]);

  const handleCreateHighlight = useCallback(async (color: string) => {
    if (!selectedText.trim() || !article) return;

    const hl = await window.electronAPI.highlightCreate({
      articleId: article.id,
      text: selectedText.trim(),
      color,
    });

    setHighlights((prev) => [...prev, hl]);
    setToolbarPos(null);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  }, [selectedText, article]);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !contentRef.current) {
        return;
      }

      const text = selection.toString().trim();
      if (!text) return;

      if (!contentRef.current.contains(selection.anchorNode)) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = scrollContainerRef.current?.getBoundingClientRect();

      if (containerRect) {
        setToolbarPos({
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top - containerRect.top - 8,
        });
      }
      setSelectedText(text);
    }, 10);
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setToolbarPos(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (toolbarPos) {
          setToolbarPos(null);
          return;
        }
        if (inInput) {
          (e.target as HTMLElement).blur();
          return;
        }
        onClose();
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setTocCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('reader-toc-collapsed', String(next));
          return next;
        });
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setDetailCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('reader-detail-collapsed', String(next));
          return next;
        });
        return;
      }

      if (inInput) return;

      if (!contentRef.current) return;
      const total = contentRef.current.querySelectorAll('p').length;
      if (total === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedParagraphIndex((prev) => Math.min(prev + 1, total - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedParagraphIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (focusedParagraphIndex >= 0 && article) {
          const paragraphs = contentRef.current.querySelectorAll('p');
          const pText = paragraphs[focusedParagraphIndex]?.textContent?.trim();
          if (pText) {
            window.electronAPI.highlightCreate({
              articleId: article.id,
              text: pText,
              color: 'yellow',
              paragraphIndex: focusedParagraphIndex,
            }).then((hl) => {
              setHighlights((prev) => [...prev, hl]);
            });
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, toolbarPos, focusedParagraphIndex, article]);

  const isLoading = loading || parsing;

  const themeClass = readerSettings.theme === 'light' ? 'reader-theme-light' : readerSettings.theme === 'sepia' ? 'reader-theme-sepia' : 'reader-theme-dark';

  return (
    <div className={`flex flex-1 h-full overflow-hidden ${themeClass}`}>
      {/* Left Sidebar - Contents */}
      <div className={`shrink-0 flex flex-col border-r border-[#262626] bg-[#141414] transition-all duration-200 overflow-hidden ${tocCollapsed ? 'w-0 border-r-0' : 'w-[220px]'}`}>
        <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[#262626]">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[13px] font-semibold text-white tracking-wide">Contents</h2>
          <div className="w-6" />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tocItems.length > 0 ? (
            <ul className="space-y-1">
              {tocItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-[12px] text-gray-400 hover:text-white text-left truncate w-full transition-colors"
                    style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-gray-500">
              {isLoading ? '加载中…' : '此文章没有章节标题'}
            </p>
          )}
        </div>
      </div>

      {/* Center - Article Content */}
      <div ref={scrollContainerRef} className="relative flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-6 h-12 border-b border-[#262626]">
          <div className="flex items-center gap-1.5 text-[12px] min-w-0 truncate">
            <button
              onClick={() => setTocCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('reader-toc-collapsed', String(next));
                return next;
              })}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white shrink-0"
              title={tocCollapsed ? '展开目录' : '收起目录'}
            >
              {tocCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            {feedName && (
              <>
                <span className="text-gray-500 truncate">{feedName}</span>
                <span className="text-gray-600">&gt;</span>
              </>
            )}
            <span className="text-gray-400 truncate">{article?.title ?? '加载中…'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
              title="排版设置"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDetailCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('reader-detail-collapsed', String(next));
                return next;
              })}
              className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
              title={detailCollapsed ? '展开详情' : '收起详情'}
            >
              {detailCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <ReaderSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={readerSettings}
          onSettingsChange={setReaderSettings}
        />

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              <span className="text-sm text-gray-500">
                {parsing ? '正在解析文章内容…' : '加载中…'}
              </span>
            </div>
          ) : !article ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              文章不存在
            </div>
          ) : (
            <div className="mx-auto max-w-[680px] px-8 py-10">
              <h1 className="text-[28px] font-bold leading-tight text-white">
                {article.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-500">
                {article.author && <span>{article.author}</span>}
                {article.domain && <span>{article.domain}</span>}
                {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
                {article.readingTime && <span>{article.readingTime} min read</span>}
              </div>

              {article.content ? (
                <div
                  ref={contentRef}
                  className="article-content mt-8"
                  style={{
                    fontFamily: FONT_FAMILY_MAP[readerSettings.font],
                    fontSize: `${readerSettings.fontSize}px`,
                    lineHeight: readerSettings.lineHeight,
                  }}
                  dangerouslySetInnerHTML={{ __html: article.content }}
                  onMouseUp={handleMouseUp}
                />
              ) : (
                <p className="mt-8 text-gray-500 text-sm">暂无正文内容</p>
              )}
            </div>
          )}

          {toolbarPos && (
            <div
              ref={toolbarRef}
              className="absolute z-50 flex items-center gap-1.5 px-2 py-1.5 bg-[#252525] rounded-lg shadow-xl border border-white/10"
              style={{
                left: toolbarPos.x,
                top: toolbarPos.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => handleCreateHighlight(c.name)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-125 cursor-pointer"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Info/Notebook/Chat */}
      <div className={`shrink-0 transition-all duration-200 overflow-hidden ${detailCollapsed ? 'w-0' : 'w-[280px]'}`}>
        <ReaderDetailPanel articleId={articleId} />
      </div>
    </div>
  );
}
