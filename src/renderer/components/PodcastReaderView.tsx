import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, PanelRightClose, PanelRightOpen, Download } from 'lucide-react';
import type { Article, Highlight, HighlightTagsMap } from '../../shared/types';
import { AudioPlayer, type AudioPlayerRef } from './AudioPlayer';
import { DetailPanel } from './DetailPanel';

interface PodcastReaderViewProps {
  articleId: string;
  onClose: () => void;
}

export function PodcastReaderView({ articleId, onClose }: PodcastReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedTitle, setFeedTitle] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(() =>
    localStorage.getItem('podcast-reader-detail-collapsed') === 'true'
  );
  const [downloaded, setDownloaded] = useState(false);

  // Highlights
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightTagsMap, setHighlightTagsMap] = useState<HighlightTagsMap>({});

  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number>(0);

  // Load article data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    window.electronAPI.articleGet(articleId).then(async (data) => {
      if (cancelled || !data) {
        if (!cancelled) setLoading(false);
        return;
      }
      setArticle(data);
      if (data.audioDuration) durationRef.current = data.audioDuration;
      else if (data.duration) durationRef.current = data.duration;
      setLoading(false);

      // Fetch feed title for show name display
      if (data.feedId) {
        try {
          const feeds = await window.electronAPI.feedList();
          const feed = feeds.find((f) => f.id === data.feedId);
          if (feed?.title && !cancelled) setFeedTitle(feed.title);
        } catch { /* ignore */ }
      }

      // Check download status
      try {
        const downloads = await window.electronAPI.downloadList();
        const dl = downloads.find((d) => d.articleId === articleId && d.status === 'ready');
        if (dl && !cancelled) setDownloaded(true);
      } catch { /* ignore */ }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [articleId]);

  // Load highlights
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.highlightList(articleId).then((list) => {
      if (cancelled) return;
      setHighlights(list);
      if (list.length > 0) {
        const ids = list.map((h) => h.id);
        window.electronAPI.highlightTagsBatch(ids).then((map) => {
          if (!cancelled) setHighlightTagsMap(map);
        });
      }
    });
    return () => { cancelled = true; };
  }, [articleId]);

  // Time update callback — throttled progress save every 10s
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);

    if (progressSaveRef.current) return;
    progressSaveRef.current = setTimeout(() => {
      progressSaveRef.current = null;
      const duration = durationRef.current;
      if (duration > 0) {
        const progress = Math.min(time / duration, 1);
        const updates: { id: string; readProgress: number; readStatus?: 'seen' } = {
          id: articleId,
          readProgress: progress,
        };
        // Auto-mark seen at 90%
        if (progress >= 0.9) {
          updates.readStatus = 'seen';
        }
        window.electronAPI.articleUpdate(updates).catch(console.error);
      }
    }, 10000);
  }, [articleId]);

  // Duration callback
  const handleDuration = useCallback((duration: number) => {
    durationRef.current = duration;
    if (article && !article.audioDuration && !article.duration) {
      setArticle((prev) => prev ? { ...prev, audioDuration: duration, duration } : prev);
    }
  }, [article]);

  // Ended callback — mark seen
  const handleEnded = useCallback(() => {
    window.electronAPI.articleUpdate({
      id: articleId,
      readProgress: 1,
      readStatus: 'seen',
    }).catch(console.error);
  }, [articleId]);

  // Download episode
  const handleDownload = useCallback(async () => {
    try {
      await window.electronAPI.downloadStart(articleId);
      setDownloaded(true);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [articleId]);

  // Close — save final progress
  const handleClose = useCallback(() => {
    const duration = durationRef.current;
    if (duration > 0 && currentTime > 0) {
      const progress = Math.min(currentTime / duration, 1);
      const updates: { id: string; readProgress: number; readStatus?: 'seen' } = {
        id: articleId,
        readProgress: progress,
      };
      if (progress >= 0.9) updates.readStatus = 'seen';
      window.electronAPI.articleUpdate(updates).catch(console.error);
    }
    if (progressSaveRef.current) {
      clearTimeout(progressSaveRef.current);
    }
    onClose();
  }, [articleId, currentTime, onClose]);

  // Detail panel toggle
  const toggleDetail = useCallback(() => {
    setDetailCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('podcast-reader-detail-collapsed', String(next));
      return next;
    });
  }, []);

  // Highlight delete
  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setHighlightTagsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ESC to close
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

  const audioUrl = article.audioUrl;
  if (!audioUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0f0f0f] gap-3">
        <div className="text-gray-500 text-sm">该集无可用音频</div>
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm text-gray-300 bg-white/10 hover:bg-white/15 rounded-md transition-colors cursor-pointer"
        >
          返回
        </button>
      </div>
    );
  }

  // Resume position: convert readProgress to seconds
  const initialTime = article.readProgress > 0 && durationRef.current > 0
    ? article.readProgress * durationRef.current
    : (article.readProgress > 0 && article.audioDuration
      ? article.readProgress * article.audioDuration
      : 0);

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* Top toolbar */}
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

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: player + show notes */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Audio player */}
          <div className="shrink-0 px-6 pt-4">
            <AudioPlayer
              ref={audioPlayerRef}
              audioUrl={audioUrl}
              title={article.title ?? undefined}
              showName={feedTitle ?? undefined}
              artworkUrl={article.thumbnail ?? undefined}
              initialTime={initialTime}
              onTimeUpdate={handleTimeUpdate}
              onDuration={handleDuration}
              onEnded={handleEnded}
              onDownload={handleDownload}
              downloaded={downloaded}
            />
          </div>

          {/* Show notes / content */}
          <div className="flex-1 min-h-0 mt-4 overflow-y-auto px-6 pb-8">
            {/* Episode metadata */}
            <div className="flex items-center gap-3 mb-4">
              {feedTitle && (
                <span className="text-xs text-gray-500">{feedTitle}</span>
              )}
              {article.publishedAt && (
                <>
                  {feedTitle && <span className="text-xs text-gray-600">·</span>}
                  <span className="text-xs text-gray-500">
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                </>
              )}
              {article.episodeNumber != null && (
                <>
                  <span className="text-xs text-gray-600">·</span>
                  <span className="text-xs text-gray-500">
                    {article.seasonNumber != null ? `S${article.seasonNumber} ` : ''}
                    E{article.episodeNumber}
                  </span>
                </>
              )}
              {article.audioDuration != null && (
                <>
                  <span className="text-xs text-gray-600">·</span>
                  <span className="text-xs text-gray-500">
                    {formatDuration(article.audioDuration)}
                  </span>
                </>
              )}
            </div>

            {/* Summary */}
            {article.summary && (
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                {article.summary}
              </p>
            )}

            {/* Full content (show notes) */}
            {article.content && (
              <div
                className="prose prose-invert prose-sm max-w-none text-gray-300
                  prose-headings:text-gray-200 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-gray-200 prose-code:text-gray-300 prose-code:bg-white/5 prose-code:rounded prose-code:px-1"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            )}

            {/* Fallback: plaintext content */}
            {!article.content && article.contentText && (
              <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">
                {article.contentText}
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        <DetailPanel
          articleId={articleId}
          collapsed={detailCollapsed}
          externalHighlights={highlights}
          onExternalDeleteHighlight={handleDeleteHighlight}
        />
      </div>
    </div>
  );
}

/** Format seconds to human-readable duration like "1h 23m" or "45m". */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
