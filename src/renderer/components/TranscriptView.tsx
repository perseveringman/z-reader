import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Highlighter, X, MessageSquareText, Tag as TagIcon, Pencil } from 'lucide-react';
import type { TranscriptSegment, Highlight, Tag, TranslationParagraph } from '../../shared/types';

// ==================== 工具栏类型 ====================
type ToolbarMode = 'selection' | 'highlight';

interface ToolbarState {
  mode: ToolbarMode;
  highlightId?: string;
  x: number;
  y: number;
}

// ==================== 高亮渲染辅助 ====================

/** 解析 anchorPath "transcript:startIdx-endIdx" */
function parseTranscriptAnchor(anchorPath: string | null): { startSegIdx: number; endSegIdx: number } | null {
  if (!anchorPath?.startsWith('transcript:')) return null;
  const range = anchorPath.slice('transcript:'.length);
  const parts = range.split('-');
  if (parts.length !== 2) return null;
  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  if (isNaN(start) || isNaN(end)) return null;
  return { startSegIdx: start, endSegIdx: end };
}

/** 一个 segment 中需要渲染的片段 */
interface TextFragment {
  text: string;
  highlightId: string | null; // null = 普通文本
  color: string;
}

/** 计算某个 segment 在所有高亮叠加下的渲染片段 */
function computeFragments(
  segmentIndex: number,
  segmentText: string,
  highlights: Highlight[],
): TextFragment[] {
  // 收集覆盖当前 segment 的所有高亮区间
  const intervals: { start: number; end: number; highlightId: string; color: string }[] = [];

  for (const hl of highlights) {
    const parsed = parseTranscriptAnchor(hl.anchorPath);
    if (!parsed) continue;
    const { startSegIdx, endSegIdx } = parsed;

    if (segmentIndex < startSegIdx || segmentIndex > endSegIdx) continue;

    let start = 0;
    let end = segmentText.length;

    if (segmentIndex === startSegIdx) {
      start = hl.startOffset ?? 0;
    }
    if (segmentIndex === endSegIdx) {
      end = hl.endOffset ?? segmentText.length;
    }

    // 边界保护
    start = Math.max(0, Math.min(start, segmentText.length));
    end = Math.max(start, Math.min(end, segmentText.length));

    if (start < end) {
      intervals.push({ start, end, highlightId: hl.id, color: hl.color });
    }
  }

  if (intervals.length === 0) {
    return [{ text: segmentText, highlightId: null, color: '' }];
  }

  // 按起始位置排序
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);

  const fragments: TextFragment[] = [];
  let cursor = 0;

  for (const iv of intervals) {
    // 普通文本片段
    if (cursor < iv.start) {
      fragments.push({ text: segmentText.slice(cursor, iv.start), highlightId: null, color: '' });
    }
    // 高亮片段
    const hlStart = Math.max(cursor, iv.start);
    if (hlStart < iv.end) {
      fragments.push({ text: segmentText.slice(hlStart, iv.end), highlightId: iv.highlightId, color: iv.color });
    }
    cursor = Math.max(cursor, iv.end);
  }

  // 尾部普通文本
  if (cursor < segmentText.length) {
    fragments.push({ text: segmentText.slice(cursor), highlightId: null, color: '' });
  }

  return fragments;
}

// ==================== Props ====================

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSegmentClick: (startTime: number) => void;
  loading?: boolean;
  highlights?: Highlight[];
  onCreateHighlight?: (data: {
    text: string;
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    anchorPath: string;
  }) => void;
  onDeleteHighlight?: (id: string) => void;
  onUpdateHighlight?: (id: string, note: string) => void;
  highlightTagsMap?: Record<string, Tag[]>;
  /** 外部触发滚动到某个 segment（由 highlightId 触发） */
  scrollToSegment?: number | null;
  /** 说话人 ID 到自定义名称的映射 */
  speakerMap?: Record<string, string>;
  /** 修改说话人名称的回调 */
  onSpeakerRename?: (speakerId: number, name: string) => void;
  /** 翻译段落数据 */
  translationParagraphs?: TranslationParagraph[];
  /** 是否显示翻译 */
  translationVisible?: boolean;
  /** 翻译显示设置 */
  translationDisplaySettings?: { fontSize: number; color: string; opacity: number };
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const HIGHLIGHT_BG = 'rgba(251,191,36,0.25)';
const HIGHLIGHT_BG_HOVER = 'rgba(251,191,36,0.40)';

export function TranscriptView({
  segments,
  currentTime,
  onSegmentClick,
  loading,
  highlights = [],
  onCreateHighlight,
  onDeleteHighlight,
  onUpdateHighlight,
  highlightTagsMap = {},
  scrollToSegment,
  speakerMap = {},
  onSpeakerRename,
  translationParagraphs,
  translationVisible = false,
  translationDisplaySettings,
}: TranscriptViewProps) {
  const [syncMode, setSyncMode] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 工具栏状态
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  // 笔记编辑状态
  const [editingNote, setEditingNote] = useState<{ highlightId: string; text: string } | null>(null);
  // 标签选择器
  const [editingTagHighlightId, setEditingTagHighlightId] = useState<string | null>(null);
  // 说话人名称编辑状态
  const [editingSpeaker, setEditingSpeaker] = useState<{ speakerId: number; name: string } | null>(null);

  // 只保留字幕高亮（transcript: 前缀）
  const transcriptHighlights = useMemo(
    () => highlights.filter((hl) => hl.anchorPath?.startsWith('transcript:')),
    [highlights],
  );

  // 当前播放的 segment index
  const activeIndex = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return i;
    }
    return -1;
  }, [segments, currentTime]);

  // 同步模式：自动滚动到当前 segment
  useEffect(() => {
    if (!syncMode || activeIndex < 0) return;
    const el = segmentRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [syncMode, activeIndex]);

  // 外部触发滚动到指定 segment
  useEffect(() => {
    if (scrollToSegment == null || scrollToSegment < 0) return;
    const el = segmentRefs.current.get(scrollToSegment);
    if (el) {
      // 暂停同步模式
      setSyncMode(false);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 闪烁效果
      el.classList.add('highlight-flash');
      setTimeout(() => el.classList.remove('highlight-flash'), 1500);
    }
  }, [scrollToSegment]);

  // 监听用户滚动，切换到自由浏览模式
  const handleWheel = useCallback(() => {
    if (syncMode) {
      setSyncMode(false);
      userScrollingRef.current = true;
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 150);
  }, [syncMode]);

  // 回到同步模式
  const handleBackToSync = useCallback(() => {
    setSyncMode(true);
  }, []);

  // 点击 segment 跳转
  const handleSegmentClick = useCallback((startTime: number) => {
    onSegmentClick(startTime);
  }, [onSegmentClick]);

  // 设置 ref 回调
  const setSegmentRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      segmentRefs.current.set(index, el);
    } else {
      segmentRefs.current.delete(index);
    }
  }, []);

  // ==================== 文本选中检测 ====================

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // 延迟一帧确保 selection 稳定
    setTimeout(() => {
      const selection = window.getSelection();
      if (!containerRef.current) return;

      // 有选中文字 → selection 模式工具栏
      if (selection && !selection.isCollapsed) {
        const text = selection.toString().trim();
        if (!text) return;

        // 确保选中范围在字幕容器内
        if (!containerRef.current.contains(selection.anchorNode) ||
            !containerRef.current.contains(selection.focusNode)) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setToolbar({
          mode: 'selection',
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
        return;
      }

      // 点击已有高亮 → highlight 模式工具栏
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

      setToolbar(null);
    }, 10);
  }, []);

  // ==================== 创建高亮 ====================

  const handleCreateHighlight = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current || !onCreateHighlight) return;

    const text = selection.toString().trim();
    if (!text) return;

    // 找到 anchorNode 和 focusNode 对应的 segment index
    const findSegIndex = (node: Node): number => {
      let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement;
      while (el && el !== containerRef.current) {
        if (el.dataset?.segIdx != null) {
          return parseInt(el.dataset.segIdx, 10);
        }
        el = el.parentElement;
      }
      return -1;
    };

    const anchorSegIdx = findSegIndex(selection.anchorNode!);
    const focusSegIdx = findSegIndex(selection.focusNode!);

    if (anchorSegIdx < 0 || focusSegIdx < 0) return;

    // 确保 start <= end
    let startSegIdx = Math.min(anchorSegIdx, focusSegIdx);
    let endSegIdx = Math.max(anchorSegIdx, focusSegIdx);

    // 计算 offset
    const range = selection.getRangeAt(0);

    // 找到 range 的 start 在 startSeg 中的文字偏移
    const startSegEl = containerRef.current.querySelector(`[data-seg-idx="${startSegIdx}"]`);
    const endSegEl = containerRef.current.querySelector(`[data-seg-idx="${endSegIdx}"]`);

    if (!startSegEl || !endSegEl) return;

    const computeOffset = (segEl: Element, container: Node, offset: number): number => {
      // 创建一个 range，从 segEl 开始到 container/offset
      const r = document.createRange();
      r.setStart(segEl, 0);
      r.setEnd(container, offset);
      return r.toString().length;
    };

    let startOffset: number;
    let endOffset: number;

    if (startSegIdx === endSegIdx) {
      // 同一个 segment
      startOffset = computeOffset(startSegEl, range.startContainer, range.startOffset);
      endOffset = computeOffset(endSegEl, range.endContainer, range.endOffset);
    } else {
      // 跨 segment
      startOffset = computeOffset(startSegEl, range.startContainer, range.startOffset);
      endOffset = computeOffset(endSegEl, range.endContainer, range.endOffset);
    }

    // 去重检查
    const anchorPath = `transcript:${startSegIdx}-${endSegIdx}`;
    const isDuplicate = transcriptHighlights.some((hl) => {
      if (hl.anchorPath === anchorPath && hl.startOffset === startOffset && hl.endOffset === endOffset) {
        return true;
      }
      return false;
    });
    if (isDuplicate) return;

    onCreateHighlight({
      text,
      paragraphIndex: startSegIdx,
      startOffset,
      endOffset,
      anchorPath,
    });

    // 清除选中
    selection.removeAllRanges();
    setToolbar(null);
  }, [onCreateHighlight, transcriptHighlights]);

  // ==================== 删除高亮 ====================

  const handleDeleteHighlight = useCallback((id: string) => {
    onDeleteHighlight?.(id);
    setToolbar(null);
  }, [onDeleteHighlight]);

  // ==================== 点击外部关闭工具栏 ====================

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      // 如果点击的是 mark 高亮，不关闭（handleMouseUp 会处理）
      const target = e.target as HTMLElement;
      if (target.closest('mark[data-highlight-id]')) return;
      // 如果点击的是笔记编辑器或标签选择器，不关闭
      if (target.closest('.transcript-note-editor, .transcript-tag-picker, .transcript-speaker-editor')) return;

      setToolbar(null);
      setEditingNote(null);
      setEditingTagHighlightId(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-500" />
        <span className="ml-2 text-sm text-gray-500">加载字幕中...</span>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-gray-500">暂无字幕</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full" ref={containerRef}>
      {/* 字幕列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        onWheel={handleWheel}
        onMouseUp={handleMouseUp}
      >
        {segments.map((segment, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const fragments = computeFragments(index, segment.text, transcriptHighlights);
          const prevSpeaker = index > 0 ? segments[index - 1].speakerId : undefined;
          const showSpeakerLabel =
            segment.speakerId != null && segment.speakerId !== prevSpeaker;

          return (
            <div
              key={index}
              ref={(el) => setSegmentRef(index, el)}
              className={`
                flex gap-3 py-2 px-3 rounded-md cursor-pointer transition-colors duration-200
                hover:bg-white/5
                ${isActive ? 'bg-blue-500/10' : ''}
                ${showSpeakerLabel ? 'mt-3' : ''}
              `}
            >
              {/* 左侧进度指示条 */}
              <div className="flex flex-col items-center shrink-0 w-1 mt-1.5">
                <div
                  className={`
                    w-[2px] h-full rounded-full transition-colors duration-200
                    ${isActive ? 'bg-blue-500 animate-pulse' : isPast ? 'bg-blue-500/40' : 'bg-white/10'}
                  `}
                />
              </div>

              {/* 时间戳 */}
              <span
                className={`
                  text-[11px] font-mono shrink-0 w-10 pt-1 tabular-nums
                  ${isActive ? 'text-blue-400' : 'text-gray-600'}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSegmentClick(segment.start);
                }}
              >
                {formatTimestamp(segment.start)}
              </span>

              {/* 文本（带说话人标签 + 高亮渲染） */}
              <span
                data-seg-idx={index}
                className={`
                  text-[13px] leading-relaxed flex-1 select-text
                  ${isActive ? 'text-white font-medium' : isPast ? 'text-gray-500' : 'text-gray-300'}
                `}
                onClick={(e) => {
                  // 仅在非选中状态下触发跳转
                  const sel = window.getSelection();
                  if (sel && !sel.isCollapsed) return;
                  // 如果点击了高亮 mark，不跳转
                  if ((e.target as HTMLElement).closest('mark[data-highlight-id]')) return;
                  handleSegmentClick(segment.start);
                }}
              >
                {showSpeakerLabel && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400/80 bg-blue-400/10 rounded px-1.5 py-0.5 mr-2 align-middle select-none cursor-pointer hover:bg-blue-400/20 transition-colors group uppercase tracking-tight"
                    onClick={(e) => {
                      e.stopPropagation();
                      const sid = segment.speakerId ?? 0;
                      setEditingSpeaker({
                        speakerId: sid,
                        name: speakerMap[String(sid)] || '',
                      });
                    }}
                    title="点击修改说话人名称"
                  >
                    {speakerMap[String(segment.speakerId ?? 0)] || `Speaker ${(segment.speakerId ?? 0) + 1}`}
                    <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                  </span>
                )}
                {fragments.map((frag, fi) =>
                  frag.highlightId ? (
                    <mark
                      key={fi}
                      data-highlight-id={frag.highlightId}
                      className="rounded-sm cursor-pointer transition-colors"
                      style={{
                        backgroundColor: HIGHLIGHT_BG,
                        color: 'inherit',
                        padding: '1px 0',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = HIGHLIGHT_BG_HOVER;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = HIGHLIGHT_BG;
                      }}
                    >
                      {frag.text}
                    </mark>
                  ) : (
                    <span key={fi}>{frag.text}</span>
                  ),
                )}
                {/* 段落翻译渲染 */}
                {translationVisible && translationParagraphs?.[index] && (
                  <div
                    data-translation="true"
                    data-seg-index={index}
                    className="z-translation"
                    style={{
                      fontSize: `${translationDisplaySettings?.fontSize ?? 14}px`,
                      color: translationDisplaySettings?.color ?? '#9ca3af',
                      opacity: translationDisplaySettings?.opacity ?? 0.85,
                    }}
                  >
                    {translationParagraphs[index].translated}
                  </div>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* 自由浏览模式浮动提示 */}
      {!syncMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={handleBackToSync}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-full shadow-lg text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            自由浏览模式 · 点击回到字幕同步
          </button>
        </div>
      )}

      {/* 高亮工具栏 */}
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
            /* 选中模式：高亮按钮 */
            <button
              onClick={handleCreateHighlight}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-500/20 hover:bg-amber-500/30 transition-colors cursor-pointer"
              title="高亮"
            >
              <Highlighter className="w-3.5 h-3.5 text-amber-400" />
            </button>
          ) : (
            /* 高亮模式：删除/笔记/标签 */
            <>
              <button
                onClick={() => toolbar.highlightId && handleDeleteHighlight(toolbar.highlightId)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#4a3a1a] hover:bg-[#5a4520] transition-colors cursor-pointer"
                title="删除高亮"
              >
                <X className="w-3.5 h-3.5 text-amber-400" />
              </button>
              <button
                onClick={() => {
                  if (toolbar.highlightId) {
                    const hl = transcriptHighlights.find((h) => h.id === toolbar.highlightId);
                    setEditingNote({ highlightId: toolbar.highlightId, text: hl?.note || '' });
                    setToolbar(null);
                  }
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title="添加笔记"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (toolbar.highlightId) {
                    setEditingTagHighlightId(toolbar.highlightId);
                    setToolbar(null);
                  }
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
                title="添加标签"
              >
                <TagIcon className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 笔记编辑浮层 */}
      {editingNote && (
        <div className="transcript-note-editor absolute z-[9999] bg-[#2a2a2a] rounded-lg shadow-xl border border-white/10 p-3 w-[280px]"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <textarea
            autoFocus
            value={editingNote.text}
            onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onUpdateHighlight?.(editingNote.highlightId, editingNote.text);
                setEditingNote(null);
              }
              if (e.key === 'Escape') {
                setEditingNote(null);
              }
            }}
            className="w-full text-[13px] text-gray-300 bg-white/5 border border-white/10 rounded px-2 py-1.5 resize-none outline-none focus:border-blue-500/50"
            rows={3}
            placeholder="添加笔记…"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setEditingNote(null)}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => {
                onUpdateHighlight?.(editingNote.highlightId, editingNote.text);
                setEditingNote(null);
              }}
              className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 标签选择器浮层 */}
      {editingTagHighlightId && (
        <div className="transcript-tag-picker absolute z-[9999] bg-[#2a2a2a] rounded-lg shadow-xl border border-white/10 p-3 w-[280px]"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400">高亮标签</span>
            <button
              onClick={() => setEditingTagHighlightId(null)}
              className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <HighlightTagEditor
            highlightId={editingTagHighlightId}
            currentTags={highlightTagsMap[editingTagHighlightId] || []}
            onClose={() => setEditingTagHighlightId(null)}
          />
        </div>
      )}

      {/* 说话人名称编辑浮层 */}
      {editingSpeaker && (
        <div className="transcript-speaker-editor absolute z-[9999] bg-[#2a2a2a] rounded-lg shadow-xl border border-white/10 p-3 w-[260px]"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400">
              修改说话人 {editingSpeaker.speakerId + 1} 的名称
            </span>
            <button
              onClick={() => setEditingSpeaker(null)}
              className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            autoFocus
            type="text"
            value={editingSpeaker.name}
            onChange={(e) => setEditingSpeaker({ ...editingSpeaker, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSpeakerRename?.(editingSpeaker.speakerId, editingSpeaker.name);
                setEditingSpeaker(null);
              }
              if (e.key === 'Escape') {
                setEditingSpeaker(null);
              }
            }}
            className="w-full text-[13px] text-gray-300 bg-white/5 border border-white/10 rounded px-2 py-1.5 outline-none focus:border-teal-500/50"
            placeholder={`说话人 ${editingSpeaker.speakerId + 1}`}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setEditingSpeaker(null)}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => {
                onSpeakerRename?.(editingSpeaker.speakerId, editingSpeaker.name);
                setEditingSpeaker(null);
              }}
              className="px-2 py-1 text-xs text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 闪烁效果样式 */}
      <style>{`
        .highlight-flash {
          animation: transcript-flash 1.5s ease;
        }
        @keyframes transcript-flash {
          0%, 100% { background-color: transparent; }
          25% { background-color: rgba(59,130,246,0.2); }
          50% { background-color: transparent; }
          75% { background-color: rgba(59,130,246,0.15); }
        }
      `}</style>
    </div>
  );
}

// ==================== 高亮标签编辑器 ====================

function HighlightTagEditor({
  highlightId,
  currentTags,
  onClose,
}: {
  highlightId: string;
  currentTags: Tag[];
  onClose: () => void;
}) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set(currentTags.map((t) => t.id)),
  );

  useEffect(() => {
    window.electronAPI.tagList().then(setAllTags);
  }, []);

  const handleToggleTag = async (tagId: string) => {
    if (selectedTagIds.has(tagId)) {
      await window.electronAPI.highlightTagRemove(highlightId, tagId);
      setSelectedTagIds((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    } else {
      await window.electronAPI.highlightTagAdd(highlightId, tagId);
      setSelectedTagIds((prev) => new Set(prev).add(tagId));
    }
  };

  return (
    <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
      {allTags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => handleToggleTag(tag.id)}
          className={`
            text-left px-2 py-1 rounded text-xs transition-colors cursor-pointer
            ${selectedTagIds.has(tag.id)
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
            }
          `}
        >
          {tag.name}
        </button>
      ))}
      {allTags.length === 0 && (
        <span className="text-[11px] text-gray-600 px-2 py-1">暂无标签</span>
      )}
    </div>
  );
}
