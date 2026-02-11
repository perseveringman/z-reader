import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Article, TranscriptSegment, Highlight, HighlightTagsMap } from '../../shared/types';
import { VideoPlayer, type VideoPlayerRef } from './VideoPlayer';
import { TranscriptView } from './TranscriptView';
import { DetailPanel } from './DetailPanel';

interface VideoReaderViewProps {
  articleId: string;
  onClose: () => void;
}

/** 解析 anchorPath "transcript:startIdx-endIdx" 获取起始 segment */
function parseScrollTarget(anchorPath: string | null): number | null {
  if (!anchorPath?.startsWith('transcript:')) return null;
  const parts = anchorPath.slice('transcript:'.length).split('-');
  const idx = parseInt(parts[0], 10);
  return isNaN(idx) ? null : idx;
}

export function VideoReaderView({ articleId, onClose }: VideoReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(() =>
    localStorage.getItem('video-reader-detail-collapsed') === 'true'
  );

  // 高亮状态
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightTagsMap, setHighlightTagsMap] = useState<HighlightTagsMap>({});
  // 外部触发 TranscriptView 滚动到某个 segment（使用自增计数器触发更新）
  const [scrollToSegment, setScrollToSegment] = useState<number | null>(null);
  const scrollTriggerRef = useRef(0);

  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number>(0);

  // 加载文章数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    window.electronAPI.articleGet(articleId).then((data) => {
      if (!cancelled && data) {
        setArticle(data);
        if (data.duration) durationRef.current = data.duration;
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [articleId]);

  // 加载字幕
  useEffect(() => {
    if (!article?.videoId) return;
    let cancelled = false;
    setTranscriptLoading(true);

    window.electronAPI.transcriptFetch(articleId).then((data) => {
      if (!cancelled && data) {
        setSegments(data.segments);
      }
    }).catch((err) => {
      console.error('加载字幕失败:', err);
    }).finally(() => {
      if (!cancelled) setTranscriptLoading(false);
    });

    return () => { cancelled = true; };
  }, [articleId, article?.videoId]);

  // 加载高亮数据
  useEffect(() => {
    let cancelled = false;

    window.electronAPI.highlightList(articleId).then((list) => {
      if (!cancelled) {
        setHighlights(list);
        // 批量加载高亮标签
        if (list.length > 0) {
          const ids = list.map((h) => h.id);
          window.electronAPI.highlightTagsBatch(ids).then((map) => {
            if (!cancelled) setHighlightTagsMap(map);
          });
        }
      }
    });

    return () => { cancelled = true; };
  }, [articleId]);

  // 创建高亮
  const handleCreateHighlight = useCallback(async (data: {
    text: string;
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    anchorPath: string;
  }) => {
    const hl = await window.electronAPI.highlightCreate({
      articleId,
      text: data.text,
      color: 'yellow',
      paragraphIndex: data.paragraphIndex,
      startOffset: data.startOffset,
      endOffset: data.endOffset,
      anchorPath: data.anchorPath,
    });
    setHighlights((prev) => [...prev, hl]);
  }, [articleId]);

  // 删除高亮
  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setHighlightTagsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // 更新高亮笔记
  const handleUpdateHighlight = useCallback(async (id: string, note: string) => {
    const updated = await window.electronAPI.highlightUpdate({ id, note });
    setHighlights((prev) => prev.map((h) => h.id === id ? updated : h));
  }, []);

  // 点击高亮跳转到对应字幕 segment
  const handleHighlightClick = useCallback((highlightId: string) => {
    const hl = highlights.find((h) => h.id === highlightId);
    if (!hl) return;
    const segIdx = parseScrollTarget(hl.anchorPath);
    if (segIdx != null) {
      // 使用自增计数器确保即使是同一个 segment 也能触发滚动
      scrollTriggerRef.current += 1;
      setScrollToSegment(segIdx + scrollTriggerRef.current * 0.001);
    }
  }, [highlights]);

  // 播放进度回调
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);

    // 节流保存进度: 每 10 秒
    if (progressSaveRef.current) return;
    progressSaveRef.current = setTimeout(() => {
      progressSaveRef.current = null;
      const duration = durationRef.current;
      if (duration > 0) {
        const progress = Math.min(time / duration, 1);
        window.electronAPI.articleUpdate({
          id: articleId,
          readProgress: progress,
        }).catch(console.error);
      }
    }, 10000);
  }, [articleId]);

  // 视频时长回调
  const handleDuration = useCallback((duration: number) => {
    durationRef.current = duration;
    if (article && !article.duration) {
      setArticle(prev => prev ? { ...prev, duration } : prev);
    }
  }, [article]);

  // 字幕 segment 点击
  const handleSegmentClick = useCallback((startTime: number) => {
    videoPlayerRef.current?.seekTo(startTime);
  }, []);

  // 关闭时保存最终进度
  const handleClose = useCallback(() => {
    const duration = durationRef.current;
    if (duration > 0 && currentTime > 0) {
      const progress = Math.min(currentTime / duration, 1);
      window.electronAPI.articleUpdate({
        id: articleId,
        readProgress: progress,
      }).catch(console.error);
    }
    if (progressSaveRef.current) {
      clearTimeout(progressSaveRef.current);
    }
    onClose();
  }, [articleId, currentTime, onClose]);

  // 切换详情面板
  const toggleDetail = useCallback(() => {
    setDetailCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('video-reader-detail-collapsed', String(next));
      return next;
    });
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  if (loading || !article) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0f0f0f]">
        <Loader2 size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  // scrollToSegment 转为整数给 TranscriptView
  const scrollToSegmentInt = scrollToSegment != null ? Math.floor(scrollToSegment) : null;

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#262626] shrink-0">
        <button
          onClick={handleClose}
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="返回"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-medium text-gray-200 truncate flex-1">
          {article.title}
        </h1>
        <button
          onClick={toggleDetail}
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title={detailCollapsed ? '显示详情面板' : '隐藏详情面板'}
        >
          {detailCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧：播放器 + 字幕 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 视频播放器 */}
          <div className="shrink-0 px-6 pt-4">
            <VideoPlayer
              ref={videoPlayerRef}
              videoId={article.videoId!}
              onTimeUpdate={handleTimeUpdate}
              onDuration={handleDuration}
            />
          </div>

          {/* 字幕区域 */}
          <div className="flex-1 min-h-0 mt-2">
            <TranscriptView
              segments={segments}
              currentTime={currentTime}
              onSegmentClick={handleSegmentClick}
              loading={transcriptLoading}
              highlights={highlights}
              onCreateHighlight={handleCreateHighlight}
              onDeleteHighlight={handleDeleteHighlight}
              onUpdateHighlight={handleUpdateHighlight}
              highlightTagsMap={highlightTagsMap}
              scrollToSegment={scrollToSegmentInt}
            />
          </div>
        </div>

        {/* 右侧：详情面板 */}
        <DetailPanel
          articleId={articleId}
          collapsed={detailCollapsed}
          externalHighlights={highlights}
          onExternalDeleteHighlight={handleDeleteHighlight}
          onHighlightClick={handleHighlightClick}
        />
      </div>
    </div>
  );
}
