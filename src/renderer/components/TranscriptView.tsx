import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { TranscriptSegment } from '../../shared/types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSegmentClick: (startTime: number) => void;
  loading?: boolean;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TranscriptView({ segments, currentTime, onSegmentClick, loading }: TranscriptViewProps) {
  const [syncMode, setSyncMode] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 监听用户滚动，切换到自由浏览模式
  const handleWheel = useCallback(() => {
    if (syncMode) {
      setSyncMode(false);
      userScrollingRef.current = true;
    }

    // 防抖：用户停止滚动后标记
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
    <div className="relative flex flex-col h-full">
      {/* 字幕列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        onWheel={handleWheel}
      >
        {segments.map((segment, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;

          return (
            <div
              key={index}
              ref={(el) => setSegmentRef(index, el)}
              onClick={() => handleSegmentClick(segment.start)}
              className={`
                flex gap-3 py-2 px-3 rounded-md cursor-pointer transition-colors duration-200
                hover:bg-white/5
                ${isActive ? 'bg-blue-500/10' : ''}
              `}
            >
              {/* 左侧进度指示条 */}
              <div className="flex flex-col items-center shrink-0 w-1 mt-1">
                <div
                  className={`
                    w-[2px] h-full rounded-full transition-colors duration-200
                    ${isActive ? 'bg-blue-500 animate-pulse' : isPast ? 'bg-blue-500' : 'bg-gray-700'}
                  `}
                />
              </div>

              {/* 时间戳 */}
              <span className={`
                text-[11px] font-mono shrink-0 w-10 pt-0.5
                ${isActive ? 'text-blue-400' : 'text-gray-600'}
              `}>
                {formatTimestamp(segment.start)}
              </span>

              {/* 文本 */}
              <span className={`
                text-[14px] leading-relaxed flex-1
                ${isActive ? 'text-white font-medium' : isPast ? 'text-gray-400' : 'text-gray-300'}
              `}>
                {segment.text}
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
    </div>
  );
}
