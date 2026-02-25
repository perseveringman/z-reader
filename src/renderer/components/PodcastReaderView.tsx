import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowLeft, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  FileText, Sparkles, Mic, Settings, Download, RefreshCw, XCircle, Cloud,
} from 'lucide-react';
import type { Article, Highlight, HighlightTagsMap, TranscriptSegment, AppSettings, AppTask } from '../../shared/types';
import { useAgentContext } from '../hooks/useAgentContext';
import { AudioPlayer, type AudioPlayerRef } from './AudioPlayer';
import { TranscriptView } from './TranscriptView';
import { DetailPanel } from './DetailPanel';
import {
  annotatePodcastTimestampLines,
  extractPodcastTimestampOutlineFromAnnotatedHtml,
  parsePodcastContentTextLines,
  type PodcastTimestampOutlineItem,
} from '../utils/podcast-timestamps';

interface PodcastReaderViewProps {
  articleId: string;
  onClose: () => void;
}

/** 转写 tab 状态 */
type TranscriptState =
  | 'loading'            // 正在加载已有转写
  | 'not-configured'     // 未配置 ASR 凭据
  | 'not-downloaded'     // 音频未下载
  | 'downloading'        // 音频下载中
  | 'ready'              // 就绪，可以开始转写
  | 'transcribing'       // 实时转写中
  | 'background-running' // 后台转写中
  | 'complete';          // 转写完成（或从 DB 加载的）

/** 解析 anchorPath "transcript:startIdx-endIdx" 获取起始 segment */
function parseScrollTarget(anchorPath: string | null): number | null {
  if (!anchorPath?.startsWith('transcript:')) return null;
  const parts = anchorPath.slice('transcript:'.length).split('-');
  const idx = parseInt(parts[0], 10);
  return isNaN(idx) ? null : idx;
}

export function PodcastReaderView({ articleId, onClose }: PodcastReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [localMediaLoading, setLocalMediaLoading] = useState(false);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState<string | null>(null);
  const [feedTitle, setFeedTitle] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(() =>
    localStorage.getItem('podcast-reader-detail-collapsed') === 'true'
  );
  const [outlineCollapsed, setOutlineCollapsed] = useState(() =>
    localStorage.getItem('podcast-reader-outline-collapsed') === 'true'
  );
  const [downloaded, setDownloaded] = useState(false);
  const [contentTab, setContentTab] = useState<'about' | 'summary' | 'transcript'>('about');

  // Highlights
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightTagsMap, setHighlightTagsMap] = useState<HighlightTagsMap>({});

  // Transcript / ASR 状态
  const [transcriptState, setTranscriptState] = useState<TranscriptState>('loading');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [asrProgress, setAsrProgress] = useState({ chunkIndex: 0, totalChunks: 1, overallProgress: 0 });
  const [asrError, setAsrError] = useState<string | null>(null);
  const [backgroundTask, setBackgroundTask] = useState<AppTask | null>(null);

  // AI 摘要
  const [summarizing, setSummarizing] = useState(false);

  // 外部触发 TranscriptView 滚动到某个 segment
  const [scrollToSegment, setScrollToSegment] = useState<number | null>(null);
  const scrollTriggerRef = useRef(0);

  const { reportContext } = useAgentContext();

  useEffect(() => {
    reportContext({
      common: { currentPage: 'podcast-reader', readerMode: true, selectedText: null },
      pageState: {
        page: 'podcast-reader',
        articleId,
        currentTime: currentTime ?? 0,
        contentTab: contentTab ?? 'summary',
      },
    });
  }, [articleId, currentTime, contentTab, reportContext]);

  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const aboutContentRef = useRef<HTMLDivElement>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number>(0);
  const segmentsLengthRef = useRef(0);
  segmentsLengthRef.current = segments.length;

  // ==================== 加载文章数据 ====================
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

      // Fetch feed title
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

  // ==================== 解析本地音频可播放 URL ====================
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    const resolveAudioUrl = async () => {
      if (!article?.audioUrl) {
        setPlaybackAudioUrl(null);
        setLocalMediaLoading(false);
        return;
      }

      if (!article.audioUrl.startsWith('file://')) {
        setPlaybackAudioUrl(article.audioUrl);
        setLocalMediaLoading(false);
        return;
      }

      setLocalMediaLoading(true);
      try {
        const media = await window.electronAPI.articleReadLocalMedia(articleId);
        if (!media) {
          if (!cancelled) setPlaybackAudioUrl(null);
          return;
        }

        blobUrl = URL.createObjectURL(new Blob(
          [media.data],
          { type: media.mime || 'audio/mpeg' },
        ));
        if (!cancelled) setPlaybackAudioUrl(blobUrl);
      } catch (err) {
        console.error('读取本地音频失败:', err);
        if (!cancelled) setPlaybackAudioUrl(null);
      } finally {
        if (!cancelled) setLocalMediaLoading(false);
      }
    };

    void resolveAudioUrl();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [articleId, article?.audioUrl]);

  // ==================== 加载高亮 ====================
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

  // ==================== 加载已有转写 + 检查 ASR 配置 ====================
  useEffect(() => {
    let cancelled = false;

    async function initTranscriptState() {
      // 1. 检查是否已有转写
      try {
        const existing = await window.electronAPI.transcriptGet(articleId);
        if (existing && existing.segments.length > 0 && !cancelled) {
          setSegments(existing.segments);
          if (existing.speakerMap) setSpeakerMap(existing.speakerMap);
          setTranscriptState('complete');
          return;
        }
      } catch { /* ignore */ }

      if (cancelled) return;

      // 2. 检查是否有正在运行的后台转写任务
      try {
        const tasks = await window.electronAPI.appTaskList();
        const runningTask = tasks.find(
          (t) => t.articleId === articleId && t.type === 'asr-standard' && (t.status === 'pending' || t.status === 'running'),
        );
        if (runningTask && !cancelled) {
          setBackgroundTask(runningTask);
          setTranscriptState('background-running');
          return;
        }
      } catch { /* ignore */ }

      if (cancelled) return;

      // 3. 检查 ASR 凭据（根据当前 Provider 判断）
      let settings: AppSettings;
      try {
        settings = await window.electronAPI.settingsGet();
      } catch {
        if (!cancelled) setTranscriptState('not-configured');
        return;
      }

      const provider = settings.asrProvider || 'volcengine';
      const hasCredentials =
        provider === 'volcengine'
          ? !!(settings.volcAsrAppKey && settings.volcAsrAccessKey)
          : provider === 'tencent'
            ? !!(settings.tencentAsrAppId && settings.tencentAsrSecretId && settings.tencentAsrSecretKey)
            : false;

      if (!hasCredentials) {
        if (!cancelled) setTranscriptState('not-configured');
        return;
      }

      // 4. 检查音频是否已下载（影响实时转写可用性）
      try {
        const downloads = await window.electronAPI.downloadList();
        const dl = downloads.find((d) => d.articleId === articleId && d.status === 'ready');
        if (dl && !cancelled) setDownloaded(true);
      } catch { /* ignore */ }

      // 进入 ready 状态 — 后台转写始终可用，实时转写需要已下载
      if (!cancelled) setTranscriptState('ready');
    }

    initTranscriptState();
    return () => { cancelled = true; };
  }, [articleId]);

  // ==================== ASR 事件监听 ====================
  useEffect(() => {
    const unsubProgress = window.electronAPI.asrOnProgress((event) => {
      if (event.articleId !== articleId) return;
      setAsrProgress({
        chunkIndex: event.chunkIndex,
        totalChunks: event.totalChunks,
        overallProgress: event.overallProgress,
      });
    });

    const unsubSegment = window.electronAPI.asrOnSegment((event) => {
      if (event.articleId !== articleId) return;
      setSegments(event.segments);
    });

    const unsubComplete = window.electronAPI.asrOnComplete((event) => {
      if (event.articleId !== articleId) return;
      setSegments(event.segments);
      setTranscriptState('complete');
    });

    const unsubError = window.electronAPI.asrOnError((event) => {
      if (event.articleId !== articleId) return;
      setAsrError(event.error);
      // 如果有部分结果保留，否则回到 ready
      if (segmentsLengthRef.current > 0) {
        setTranscriptState('complete');
      } else {
        setTranscriptState('ready');
      }
    });

    return () => {
      unsubProgress();
      unsubSegment();
      unsubComplete();
      unsubError();
    };
  }, [articleId]);

  // ==================== 后台任务状态监听 ====================
  useEffect(() => {
    const unsub = window.electronAPI.appTaskOnUpdated((task) => {
      if (task.articleId !== articleId || task.type !== 'asr-standard') return;
      setBackgroundTask(task);
      if (task.status === 'completed') {
        // 后台转写完成，重新加载 transcript
        window.electronAPI.transcriptGet(articleId).then((existing) => {
          if (existing && existing.segments.length > 0) {
            setSegments(existing.segments);
          }
          setTranscriptState('complete');
        }).catch(() => setTranscriptState('complete'));
      } else if (task.status === 'failed' || task.status === 'cancelled') {
        setTranscriptState('ready');
        if (task.error) setAsrError(task.error);
      }
    });
    return unsub;
  }, [articleId]);

  // ==================== ASR 操作 ====================

  /** 实时转写 (WebSocket 流式) */
  const handleStartTranscribe = useCallback(async () => {
    setAsrError(null);
    setSegments([]);
    setTranscriptState('transcribing');
    setAsrProgress({ chunkIndex: 0, totalChunks: 1, overallProgress: 0 });
    try {
      await window.electronAPI.asrStart(articleId);
    } catch (err) {
      console.error('ASR start failed:', err);
      setAsrError(err instanceof Error ? err.message : String(err));
      setTranscriptState('ready');
    }
  }, [articleId]);

  /** 后台转写 (标准版 HTTP API) */
  const handleStartBackgroundTranscribe = useCallback(async () => {
    setAsrError(null);
    try {
      const task = await window.electronAPI.appTaskCreate({
        type: 'asr-standard',
        articleId,
        title: `转写: ${article?.title || '播客'}`,
      });
      setBackgroundTask(task);
      setTranscriptState('background-running');
    } catch (err) {
      console.error('Background ASR start failed:', err);
      setAsrError(err instanceof Error ? err.message : String(err));
    }
  }, [articleId, article?.title]);

  const handleCancelTranscribe = useCallback(async () => {
    try {
      await window.electronAPI.asrCancel(articleId);
    } catch { /* ignore */ }
    if (segments.length > 0) {
      setTranscriptState('complete');
    } else {
      setTranscriptState('ready');
    }
  }, [articleId, segments.length]);

  const handleRetranscribe = useCallback(() => {
    if (confirm('重新转写将覆盖当前的转写结果，是否继续？')) {
      handleStartTranscribe();
    }
  }, [handleStartTranscribe]);

  // ==================== 播放回调 ====================

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
        if (progress >= 0.9) updates.readStatus = 'seen';
        window.electronAPI.articleUpdate(updates).catch(console.error);
      }
    }, 10000);
  }, [articleId]);

  const handleDuration = useCallback((duration: number) => {
    durationRef.current = duration;
    if (article && !article.audioDuration && !article.duration) {
      setArticle((prev) => prev ? { ...prev, audioDuration: duration, duration } : prev);
    }
  }, [article]);

  const handleEnded = useCallback(() => {
    window.electronAPI.articleUpdate({
      id: articleId,
      readProgress: 1,
      readStatus: 'seen',
    }).catch(console.error);
  }, [articleId]);

  // ==================== 下载 ====================

  const handleDownload = useCallback(async () => {
    try {
      await window.electronAPI.downloadStart(articleId);
      // 进入 downloading 状态轮询等待完成
      setTranscriptState('downloading');
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [articleId]);

  // ==================== 下载进度轮询 ====================
  useEffect(() => {
    if (transcriptState !== 'downloading') return;

    let cancelled = false;
    const poll = async () => {
      try {
        const downloads = await window.electronAPI.downloadList();
        const dl = downloads.find((d) => d.articleId === articleId);
        if (cancelled) return;
        if (dl?.status === 'ready') {
          setDownloaded(true);
          setTranscriptState('ready');
        } else if (dl?.status === 'failed') {
          setTranscriptState('not-downloaded');
        }
        // 'downloading' or 'queued' — keep polling
      } catch { /* ignore */ }
    };

    // Poll immediately then every 2 seconds
    poll();
    const timer = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [transcriptState, articleId]);

  // ==================== Transcript 交互 ====================

  const handleSegmentClick = useCallback((startTime: number) => {
    audioPlayerRef.current?.seekTo(startTime);
  }, []);

  const handleAboutTimestampClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Respect native link interactions in show notes.
    if (target.closest('a')) return;

    const clickable = target.closest<HTMLElement>('[data-podcast-ts]');
    if (!clickable) return;

    const seconds = Number(clickable.getAttribute('data-podcast-ts'));
    if (!Number.isFinite(seconds)) return;
    audioPlayerRef.current?.seekTo(seconds);
  }, []);

  const scrollAboutTimestampIntoView = useCallback((targetId: string): boolean => {
    const container = aboutContentRef.current;
    if (!container) return false;
    const target = container.querySelector<HTMLElement>(`[data-podcast-ts-id="${targetId}"]`);
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('podcast-timestamp-focus-flash');
    window.setTimeout(() => target.classList.remove('podcast-timestamp-focus-flash'), 1200);
    return true;
  }, []);

  const handleAboutOutlineClick = useCallback((item: PodcastTimestampOutlineItem) => {
    audioPlayerRef.current?.seekTo(item.seconds);
    if (contentTab !== 'about') return;
    scrollAboutTimestampIntoView(item.id);
  }, [contentTab, scrollAboutTimestampIntoView]);

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

  const handleDeleteHighlight = useCallback(async (id: string) => {
    await window.electronAPI.highlightDelete(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setHighlightTagsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

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
      scrollTriggerRef.current += 1;
      setScrollToSegment(segIdx + scrollTriggerRef.current * 0.001);
      // 同时跳转到对应时间
      if (segments[segIdx]) {
        audioPlayerRef.current?.seekTo(segments[segIdx].start);
      }
    }
  }, [highlights, segments]);

  // ==================== AI 摘要 ====================

  const handleGenerateSummary = useCallback(async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const result = await window.electronAPI.aiSummarize({ articleId });
      setArticle((prev) => prev ? { ...prev, summary: result.summary } : prev);
    } catch (err) {
      console.error('[PodcastReader] AI 摘要生成失败:', err);
    } finally {
      setSummarizing(false);
    }
  }, [articleId, summarizing]);

  // ==================== 关闭 ====================

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

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setOutlineCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('podcast-reader-outline-collapsed', String(next));
          return next;
        });
      }

      if (e.key === ']') {
        e.preventDefault();
        toggleDetail();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, toggleDetail]);

  const annotatedAboutContent = useMemo(
    () => article?.content ? annotatePodcastTimestampLines(article.content) : null,
    [article?.content],
  );
  const aboutTextLines = useMemo(
    () => parsePodcastContentTextLines(article?.contentText),
    [article?.contentText],
  );
  const aboutOutlineItems = useMemo(() => {
    if (annotatedAboutContent) {
      return extractPodcastTimestampOutlineFromAnnotatedHtml(annotatedAboutContent);
    }

    const items: PodcastTimestampOutlineItem[] = [];
    aboutTextLines.forEach((line, index) => {
      if (line.seconds == null) return;
      items.push({
        id: `podcast-text-ts-${index}`,
        seconds: line.seconds,
        label: line.timestampLabel ?? '',
        title: line.content || line.text || line.timestampLabel || `片段 ${items.length + 1}`,
      });
    });
    return items;
  }, [annotatedAboutContent, aboutTextLines]);
  const activeOutlineIndex = useMemo(() => {
    for (let i = aboutOutlineItems.length - 1; i >= 0; i--) {
      if (currentTime >= aboutOutlineItems[i].seconds) return i;
    }
    return -1;
  }, [aboutOutlineItems, currentTime]);

  const timelineSidebar = (
    <div className={`shrink-0 flex flex-col border-r border-[#262626] bg-[#141414] transition-all duration-200 overflow-hidden ${outlineCollapsed || aboutOutlineItems.length === 0 ? 'w-0 border-r-0' : 'w-[220px]'}`}>
      <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[#262626]">
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
          title="返回列表"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-[13px] font-semibold text-white tracking-wide">时间轴</h2>
        <div className="w-6" />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {aboutOutlineItems.length > 0 ? (
          <ul className="space-y-0.5">
            {aboutOutlineItems.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleAboutOutlineClick(item)}
                  className={`w-full flex items-start gap-2 text-left rounded-md px-3 py-2 transition-colors cursor-pointer ${
                    index === activeOutlineIndex
                      ? 'bg-blue-500/15 border border-blue-500/35'
                      : 'border border-transparent hover:bg-white/5'
                  }`}
                >
                  <span className="text-[11px] font-mono text-blue-300 tabular-nums shrink-0 mt-0.5 min-w-[42px]">{item.label}</span>
                  <span className="text-[13px] leading-5 text-gray-300 line-clamp-2">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-4 text-[13px] text-gray-500">暂无时间戳</div>
        )}
      </div>
    </div>
  );

  if (loading || !article || localMediaLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0f0f0f]">
        <Loader2 size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  const audioUrl = playbackAudioUrl
    ?? (article.audioUrl?.startsWith('file://') ? null : article.audioUrl);
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

  // Resume position
  const initialTime = article.readProgress > 0 && durationRef.current > 0
    ? article.readProgress * durationRef.current
    : (article.readProgress > 0 && article.audioDuration
      ? article.readProgress * article.audioDuration
      : 0);

  const scrollToSegmentInt = scrollToSegment != null ? Math.floor(scrollToSegment) : null;

  return (
    <div className="flex h-full bg-[#0f0f0f]">
      {/* Left: Timeline sidebar */}
      {timelineSidebar}

      {/* Center: toolbar + player + content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top toolbar */}
        <div className="shrink-0 flex items-center justify-between px-6 h-12 border-b border-[#262626]">
          <div className="flex items-center gap-1.5 text-[12px] min-w-0 truncate">
            {(outlineCollapsed || aboutOutlineItems.length === 0) && (
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white shrink-0"
                title="返回列表"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setOutlineCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('podcast-reader-outline-collapsed', String(next));
                return next;
              })}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white shrink-0"
              title={outlineCollapsed ? '展开时间轴（[）' : '收起时间轴（[）'}
            >
              {outlineCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            {feedTitle && (
              <>
                <span className="text-gray-500 truncate">{feedTitle}</span>
                <span className="text-gray-600">&gt;</span>
              </>
            )}
            <span className="text-gray-400 truncate">{article.title ?? '加载中…'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleDetail}
              className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer text-gray-400 hover:text-white"
              title={detailCollapsed ? '展开详情（]）' : '收起详情（]）'}
            >
              {detailCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

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

        <div className="flex-1 min-h-0 flex flex-col mt-3">
          {/* Content tabs */}
          <div className="shrink-0 flex items-center border-b border-white/5 px-6">
            <div className="flex">
              {[
                { key: 'about' as const, label: '简介', icon: <FileText size={14} /> },
                { key: 'summary' as const, label: '摘要', icon: <Sparkles size={14} /> },
                { key: 'transcript' as const, label: '转写', icon: <Mic size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setContentTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                    contentTab === tab.key
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

              {/* Tab content */}
              {contentTab === 'about' && (
                <div ref={aboutContentRef} className="flex-1 min-h-0 overflow-y-auto px-6 pb-8 pt-4">
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

                  {/* Full content (show notes) */}
                  {article.content && (
                    <div
                      className="podcast-show-notes prose prose-invert prose-sm max-w-none text-gray-300
                        prose-headings:text-gray-200 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                        prose-strong:text-gray-200 prose-code:text-gray-300 prose-code:bg-white/5 prose-code:rounded prose-code:px-1"
                      onClick={handleAboutTimestampClick}
                      dangerouslySetInnerHTML={{ __html: annotatedAboutContent ?? '' }}
                    />
                  )}

                  {/* Fallback: plaintext content */}
                  {!article.content && aboutTextLines.length > 0 && (
                    <div className="text-sm text-gray-400 leading-relaxed">
                      {aboutTextLines.map((line, index) => (
                        line.seconds == null ? (
                          <div
                            key={`${index}-${line.text.slice(0, 24)}`}
                            className="whitespace-pre-wrap"
                          >
                            {line.text || '\u00A0'}
                          </div>
                        ) : (
                          <button
                            key={`${index}-${line.text.slice(0, 24)}`}
                            type="button"
                            data-podcast-ts-id={`podcast-text-ts-${index}`}
                            onClick={() => {
                              if (line.seconds != null) audioPlayerRef.current?.seekTo(line.seconds);
                            }}
                            className="podcast-text-timestamp-line w-full text-left"
                          >
                            <span className="podcast-text-timestamp-badge">{line.timestampLabel ?? ''}</span>
                            <span className="podcast-text-timestamp-content whitespace-pre-wrap">
                              {line.content || line.text}
                            </span>
                          </button>
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {contentTab === 'summary' && (
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8 pt-4">
                  {summarizing ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                      <Loader2 size={32} className="mb-3 animate-spin text-teal-400" />
                      <p className="text-sm">正在生成摘要...</p>
                      <p className="text-xs mt-1 text-gray-600">基于转写全文分析中</p>
                    </div>
                  ) : article.summary ? (
                    <div>
                      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {article.summary}
                      </div>
                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={handleGenerateSummary}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                        >
                          <RefreshCw size={12} />
                          重新生成
                        </button>
                      </div>
                    </div>
                  ) : segments.length > 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                      <Sparkles size={32} className="mb-3 opacity-40" />
                      <p className="text-sm mb-4">已有转写内容，可生成 AI 摘要</p>
                      <button
                        onClick={handleGenerateSummary}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors cursor-pointer"
                      >
                        <Sparkles size={14} />
                        基于转写内容生成摘要
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                      <Mic size={32} className="mb-3 opacity-40" />
                      <p className="text-sm">请先完成转写后再生成摘要</p>
                      <p className="text-xs mt-1 text-gray-600">切换到"转写"标签开始转写</p>
                    </div>
                  )}
                </div>
              )}

              {contentTab === 'transcript' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* 转写进行中的进度条 + 控制栏 */}
                  {transcriptState === 'transcribing' && (
                    <div className="shrink-0 px-6 pt-3 pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin text-teal-400" />
                          <span className="text-xs text-gray-400">
                            {asrProgress.totalChunks > 1
                              ? `分块 ${asrProgress.chunkIndex + 1}/${asrProgress.totalChunks} · `
                              : ''}
                            {Math.round(asrProgress.overallProgress * 100)}% 完成
                          </span>
                        </div>
                        <button
                          onClick={handleCancelTranscribe}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <XCircle size={12} />
                          取消
                        </button>
                      </div>
                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all duration-300"
                          style={{ width: `${asrProgress.overallProgress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 已完成的重新转写按钮 */}
                  {transcriptState === 'complete' && (
                    <div className="shrink-0 px-6 pt-3 pb-1 flex justify-end">
                      <button
                        onClick={handleRetranscribe}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                      >
                        <RefreshCw size={11} />
                        重新转写
                      </button>
                    </div>
                  )}

                  {/* 错误提示 */}
                  {asrError && (
                    <div className="shrink-0 mx-6 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md">
                      <p className="text-xs text-red-400">{asrError}</p>
                    </div>
                  )}

                  {/* 转写内容区 */}
                  {(transcriptState === 'complete' || (transcriptState === 'transcribing' && segments.length > 0)) ? (
                    <div className="flex-1 min-h-0">
                      <TranscriptView
                        segments={segments}
                        currentTime={currentTime}
                        onSegmentClick={handleSegmentClick}
                        highlights={highlights}
                        onCreateHighlight={handleCreateHighlight}
                        onDeleteHighlight={handleDeleteHighlight}
                        onUpdateHighlight={handleUpdateHighlight}
                        highlightTagsMap={highlightTagsMap}
                        scrollToSegment={scrollToSegmentInt}
                        speakerMap={speakerMap}
                        onSpeakerRename={async (speakerId, name) => {
                          await window.electronAPI.transcriptUpdateSpeaker(articleId, speakerId, name);
                          setSpeakerMap((prev) => {
                            const next = { ...prev };
                            if (name.trim()) {
                              next[String(speakerId)] = name.trim();
                            } else {
                              delete next[String(speakerId)];
                            }
                            return next;
                          });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                      {transcriptState === 'loading' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                          <Loader2 size={24} className="animate-spin" />
                          <p className="text-sm">加载中...</p>
                        </div>
                      )}

                      {transcriptState === 'not-configured' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500 max-w-xs text-center">
                          <Settings size={32} className="opacity-40" />
                          <p className="text-sm">需要配置语音识别服务</p>
                          <p className="text-xs text-gray-600">
                            请在设置中选择语音识别服务（火山引擎或腾讯云）并配置凭据
                          </p>
                        </div>
                      )}

                      {transcriptState === 'not-downloaded' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500 max-w-xs text-center">
                          <Download size={32} className="opacity-40" />
                          <p className="text-sm">请先下载音频</p>
                          <p className="text-xs text-gray-600 mb-2">
                            后台转写将自动下载音频并在后台完成
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleStartBackgroundTranscribe}
                              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors cursor-pointer"
                            >
                              <Cloud size={14} />
                              后台转写
                            </button>
                            <button
                              onClick={handleDownload}
                              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-gray-300 text-sm rounded-md transition-colors cursor-pointer"
                            >
                              <Download size={14} />
                              下载音频
                            </button>
                          </div>
                        </div>
                      )}

                      {transcriptState === 'downloading' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500 max-w-xs text-center">
                          <Loader2 size={32} className="animate-spin text-teal-400" />
                          <p className="text-sm">正在下载音频...</p>
                          <p className="text-xs text-gray-600">
                            下载完成后可使用实时转写
                          </p>
                        </div>
                      )}

                      {transcriptState === 'ready' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500 max-w-xs text-center">
                          <Mic size={32} className="opacity-40" />
                          <p className="text-sm">音频转写为文字</p>
                          {article.audioDuration != null && (
                            <p className="text-xs text-gray-600">
                              音频时长 {formatDuration(article.audioDuration)}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={handleStartBackgroundTranscribe}
                              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors cursor-pointer"
                            >
                              <Cloud size={14} />
                              后台转写
                            </button>
                            {downloaded && (
                              <button
                                onClick={handleStartTranscribe}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-gray-300 text-sm rounded-md transition-colors cursor-pointer"
                              >
                                <Mic size={14} />
                                实时转写
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {downloaded
                              ? '后台转写速度更快，实时转写可边转边看'
                              : '后台转写将自动下载音频，可离开页面等待完成'}
                          </p>
                        </div>
                      )}

                      {transcriptState === 'background-running' && (
                        <div className="flex flex-col items-center gap-3 text-gray-500 max-w-xs text-center">
                          <Cloud size={32} className="text-teal-400 opacity-70" />
                          <p className="text-sm text-gray-300">后台转写进行中</p>
                          {backgroundTask && (
                            <>
                              {backgroundTask.progress > 0 && (
                                <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-teal-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.round(backgroundTask.progress * 100)}%` }}
                                  />
                                </div>
                              )}
                              <p className="text-xs text-gray-500">
                                {backgroundTask.detail || '等待处理...'}
                              </p>
                            </>
                          )}
                          <p className="text-[11px] text-gray-600 mt-1">
                            可离开此页面，完成后将收到通知
                          </p>
                        </div>
                      )}

                      {transcriptState === 'transcribing' && segments.length === 0 && (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                          <Loader2 size={24} className="animate-spin text-teal-400" />
                          <p className="text-sm">正在处理音频...</p>
                          <p className="text-xs text-gray-600">转写结果将实时显示</p>
                        </div>
                      )}
                    </div>
                  )}
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
        onHighlightClick={handleHighlightClick}
      />
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
