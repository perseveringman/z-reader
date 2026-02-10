import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, Settings2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X, MessageSquareText, Tag, MoreHorizontal, Highlighter } from 'lucide-react';
import type { Article, Highlight } from '../../shared/types';
import { ReaderDetailPanel } from './ReaderDetailPanel';
import { ReaderSettings, loadReaderSettings, FONT_FAMILY_MAP } from './ReaderSettings';
import {
  BLOCK_SELECTOR,
  COLOR_BG_MAP,
  HIGHLIGHT_BORDER_COLOR,
  offsetsToRange,
  wrapRangeWithMark,
  unwrapHighlight,
  getBlockAncestor,
  computeAnchorPath,
  resolveAnchorPath,
  textSearchInElement,
  rangeToBlockOffsets,
} from '../highlight-engine';
import type { ReaderSettingsValues } from './ReaderSettings';

interface ReaderViewProps {
  articleId: string;
  onClose: () => void;
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

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// ==================== 工具栏类型 ====================

type ToolbarMode = 'selection' | 'highlight';

interface ToolbarState {
  mode: ToolbarMode;
  highlightId?: string;
  x: number;
  y: number;
}

export function ReaderView({ articleId, onClose }: ReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [feedName, setFeedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [focusedParagraphIndex, setFocusedParagraphIndex] = useState(-1);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettingsValues>(loadReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocCollapsed, setTocCollapsed] = useState(() => localStorage.getItem('reader-toc-collapsed') === 'true');
  const [detailCollapsed, setDetailCollapsed] = useState(() => localStorage.getItem('reader-detail-collapsed') === 'true');
  const [readProgress, setReadProgress] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef<Highlight[]>([]);
  const selectionRangeRef = useRef<Range | null>(null);
  const readProgressRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  highlightsRef.current = highlights;

  // ==================== 加载文章 ====================

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await window.electronAPI.articleGet(articleId);
        if (cancelled) return;
        setArticle(data);
        if (data) {
          setReadProgress(data.readProgress ?? 0);
          readProgressRef.current = data.readProgress ?? 0;
        }
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

  // ==================== 加载高亮 ====================

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.highlightList(articleId).then((list) => {
      if (!cancelled) setHighlights(list);
    });
    return () => { cancelled = true; };
  }, [articleId]);

  // ==================== 阅读进度追踪 ====================

  const flushProgress = useCallback(() => {
    if (readProgressRef.current > 0) {
      window.electronAPI.articleUpdate({ id: articleId, readProgress: readProgressRef.current });
    }
  }, [articleId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;
      const progress = Math.min(scrollTop / maxScroll, 1);
      // 只允许进度前进
      const next = Math.max(progress, readProgressRef.current);
      readProgressRef.current = next;
      setReadProgress(next);

      // debounce 写入数据库
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        flushProgress();
      }, 1000);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      // 卸载时 flush
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      flushProgress();
    };
  }, [flushProgress]);

  // ==================== 提取 TOC ====================

  useEffect(() => {
    if (loading || !article?.content || !contentRef.current) return;
    const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const items: TocItem[] = Array.from(headings).map((h, i) => {
      const id = `heading-${i}`;
      h.id = id;
      return { id, text: h.textContent?.trim() ?? '', level: parseInt(h.tagName.charAt(1)) };
    });
    setTocItems(items);
  }, [loading, article?.content]);

  // ==================== 高亮渲染引擎（首次全量） ====================

  const applyHighlights = useCallback(() => {
    if (!contentRef.current) return;

    for (const hl of highlightsRef.current) {
      if (!contentRef.current) break;

      let range: Range | null = null;

      // 策略 1：anchorPath + 段内 offset
      if (hl.anchorPath && hl.startOffset != null && hl.endOffset != null) {
        const blockEl = resolveAnchorPath(contentRef.current, hl.anchorPath);
        if (blockEl) {
          range = offsetsToRange(blockEl, hl.startOffset, hl.endOffset);
          if (range && hl.text && range.toString() !== hl.text) {
            range = null;
          }
          // anchorPath 内 text fallback
          if (!range && hl.text) {
            const fb = textSearchInElement(blockEl, hl.text);
            if (fb) range = offsetsToRange(blockEl, fb.startOffset, fb.endOffset);
          }
        }
      }

      // 策略 2：旧数据 — 全文 offset
      if (!range && !hl.anchorPath && hl.startOffset != null && hl.endOffset != null) {
        range = offsetsToRange(contentRef.current, hl.startOffset, hl.endOffset);
        if (range && hl.text && range.toString() !== hl.text) {
          range = null;
        }
      }

      // 策略 3：全文 text fallback
      if (!range && hl.text) {
        const fb = textSearchInElement(contentRef.current, hl.text);
        if (fb) range = offsetsToRange(contentRef.current, fb.startOffset, fb.endOffset);
      }

      if (range) {
        wrapRangeWithMark(contentRef.current, range, hl.id, hl.color);
      }
    }
  }, []);

  // 每次 React 渲染后重新应用高亮到 DOM
  // （因为 dangerouslySetInnerHTML 会在重渲染时重置 DOM，丢失手动添加的 <mark> 标签）
  useEffect(() => {
    if (loading || !article?.content) return;
    if (highlightsRef.current.length === 0) return;
    requestAnimationFrame(applyHighlights);
  }, [loading, article?.content, highlights, applyHighlights, toolbar, focusedParagraphIndex]);

  // ==================== 段落焦点 ====================

  useEffect(() => {
    if (!contentRef.current) return;
    const blocks = contentRef.current.querySelectorAll(BLOCK_SELECTOR);
    blocks.forEach((el, i) => {
      el.setAttribute('data-focused', String(i === focusedParagraphIndex));
    });
    if (focusedParagraphIndex >= 0 && blocks[focusedParagraphIndex]) {
      blocks[focusedParagraphIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusedParagraphIndex]);

  // ==================== 鼠标交互：单击选段 / 拖拽划线 / 点击高亮 ====================

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!contentRef.current) return;

      // 有选中文字 → 划线模式，弹出 selection 工具栏
      if (selection && !selection.isCollapsed) {
        const text = selection.toString().trim();
        if (!text) return;
        if (!contentRef.current.contains(selection.anchorNode)) return;

        const range = selection.getRangeAt(0);
        selectionRangeRef.current = range.cloneRange();

        const rect = range.getBoundingClientRect();
        setToolbar({
          mode: 'selection',
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
        return;
      }

      // 点击已有高亮 → 弹出 highlight 工具栏
      const target = e.target as HTMLElement;
      const markEl = target.closest('mark[data-highlight-id]') as HTMLElement | null;
      if (markEl) {
        const hlId = markEl.dataset.highlightId;
        if (hlId) {
          const rect = markEl.getBoundingClientRect();
          setToolbar({
            mode: 'highlight',
            highlightId: hlId,
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          });
        }
        return;
      }

      // 单击段落 → 选中/取消段落
      const blockEl = getBlockAncestor(target, contentRef.current);
      if (blockEl) {
        const blocks = contentRef.current.querySelectorAll(BLOCK_SELECTOR);
        const idx = Array.from(blocks).indexOf(blockEl);
        if (idx !== -1) {
          setFocusedParagraphIndex((prev) => prev === idx ? -1 : idx);
        }
      }
      setToolbar(null);
    }, 10);
  }, []);

  // ==================== 创建高亮（通用，划线和整段共用） ====================

  const createHighlightFromRange = useCallback(async (range: Range) => {
    if (!article || !contentRef.current) return;

    const text = range.toString().trim();
    if (!text) return;

    // 计算 anchorPath 和段内 offset
    const blockEl = getBlockAncestor(range.startContainer, contentRef.current);
    let anchorPath: string | undefined;
    let startOffset: number | undefined;
    let endOffset: number | undefined;

    if (blockEl) {
      anchorPath = computeAnchorPath(blockEl, contentRef.current);
      const offsets = rangeToBlockOffsets(blockEl, range);
      if (offsets) {
        startOffset = offsets.startOffset;
        endOffset = offsets.endOffset;
      }
    }

    // 先在当前 DOM 上 wrap（在 range 失效之前）
    const tempId = `pending-${Date.now()}`;
    wrapRangeWithMark(contentRef.current, range, tempId, 'yellow');

    const hl = await window.electronAPI.highlightCreate({
      articleId: article.id,
      text,
      color: 'yellow',
      anchorPath,
      startOffset,
      endOffset,
    });
    setHighlights((prev) => [...prev, hl]);

    // 替换临时 id 为真实 id
    contentRef.current.querySelectorAll(`mark[data-highlight-id="${tempId}"]`).forEach((el) => {
      (el as HTMLElement).dataset.highlightId = hl.id;
    });

    // 显示高亮工具栏
    const marks = contentRef.current.querySelectorAll(`mark[data-highlight-id="${hl.id}"]`);
    if (marks.length > 0) {
      const rect = marks[0].getBoundingClientRect();
      setToolbar({
        mode: 'highlight',
        highlightId: hl.id,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    }
  }, [article]);

  const handleCreateHighlight = useCallback(async () => {
    const range = selectionRangeRef.current;
    if (!range) return;

    selectionRangeRef.current = null;
    setToolbar(null);

    // 先创建高亮（内部会立即 wrap DOM），再清除 selection
    await createHighlightFromRange(range);
    window.getSelection()?.removeAllRanges();
  }, [createHighlightFromRange]);

  // ==================== 删除高亮（增量） ====================

  const handleDeleteHighlight = useCallback(async (highlightId: string) => {
    await window.electronAPI.highlightDelete(highlightId);
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    setToolbar(null);
    // 增量移除 DOM
    if (contentRef.current) {
      unwrapHighlight(contentRef.current, highlightId);
    }
  }, []);

  // ==================== 关闭工具栏逻辑 ====================

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest('mark[data-highlight-id]')) return;

      setToolbar(null);
      selectionRangeRef.current = null;
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (toolbar) {
          setToolbar(null);
          selectionRangeRef.current = null;
          window.getSelection()?.removeAllRanges();
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
      const blocks = contentRef.current.querySelectorAll(BLOCK_SELECTOR);
      const total = blocks.length;
      if (total === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedParagraphIndex((prev) => Math.min(prev + 1, total - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedParagraphIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();

        // 优先：有文字选中 → 高亮选中文字
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && contentRef.current.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0).cloneRange();
          selection.removeAllRanges();
          setToolbar(null);
          createHighlightFromRange(range);
          return;
        }

        // 否则：高亮聚焦段落
        if (focusedParagraphIndex >= 0) {
          const block = blocks[focusedParagraphIndex] as HTMLElement;
          if (block) {
            const range = document.createRange();
            range.selectNodeContents(block);
            createHighlightFromRange(range);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, toolbar, focusedParagraphIndex, article, createHighlightFromRange]);

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
      <div className="relative flex-1 flex flex-col overflow-hidden">
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

        {/* 阅读进度条 */}
        <div className="shrink-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${Math.round(readProgress * 100)}%` }}
          />
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
        </div>
      </div>

      {/* 悬浮工具栏 (fixed 定位，不受滚动影响) */}
      {toolbar && (
        <div
          ref={toolbarRef}
          className="fixed z-[9999] flex items-center gap-0.5 px-1.5 py-1 bg-[#2a2a2a] rounded-full shadow-xl border border-white/10"
          style={{
            left: toolbar.x,
            top: toolbar.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {toolbar.mode === 'selection' ? (
            <button
              onClick={handleCreateHighlight}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-500/20 hover:bg-amber-500/30 transition-colors cursor-pointer"
              title="高亮"
            >
              <Highlighter className="w-3.5 h-3.5 text-amber-400" />
            </button>
          ) : (
            <>
              <button
                onClick={() => toolbar.highlightId && handleDeleteHighlight(toolbar.highlightId)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#4a3a1a] hover:bg-[#5a4520] transition-colors cursor-pointer"
                title="删除高亮"
              >
                <X className="w-3.5 h-3.5 text-amber-400" />
              </button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title="添加笔记"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title="添加标签"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title="更多"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Right Sidebar - Info/Notebook/Chat */}
      <div className={`shrink-0 transition-all duration-200 overflow-hidden ${detailCollapsed ? 'w-0' : 'w-[280px]'}`}>
        <ReaderDetailPanel articleId={articleId} />
      </div>
    </div>
  );
}
