import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Article, TranscriptSegment } from '../../shared/types';
import { VideoPlayer, type VideoPlayerRef } from './VideoPlayer';
import { TranscriptView } from './TranscriptView';
import { DetailPanel } from './DetailPanel';

interface VideoReaderViewProps {
  articleId: string;
  onClose: () => void;
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
    // 如果数据库中没有 duration，更新一下
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
            />
          </div>
        </div>

        {/* 右侧：详情面板 */}
        <DetailPanel
          articleId={articleId}
          collapsed={detailCollapsed}
        />
      </div>
    </div>
  );
}
