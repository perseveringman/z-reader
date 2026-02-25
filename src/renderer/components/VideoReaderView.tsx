import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, Mic, PanelRightClose, PanelRightOpen, Languages } from 'lucide-react';
import type { Article, TranscriptSegment, Highlight, HighlightTagsMap, AppTask, Translation, TranslationProgressEvent, TranslationParagraph } from '../../shared/types';
import { useAgentContext } from '../hooks/useAgentContext';
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

export function shouldShowVideoAsrButton(params: {
  transcriptLoading: boolean;
  segmentsCount: number;
  asrTaskStatus: AppTask['status'] | null;
}): boolean {
  const isTaskRunning = params.asrTaskStatus === 'pending' || params.asrTaskStatus === 'running';
  return !params.transcriptLoading && params.segmentsCount === 0 && !isTaskRunning;
}

export const VIDEO_ASR_BACKGROUND_HINT = '后台转写中，可退出页面';

export function VideoReaderView({ articleId, onClose }: VideoReaderViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [localMediaLoading, setLocalMediaLoading] = useState(false);
  const [playableVideoUrl, setPlayableVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [asrTask, setAsrTask] = useState<AppTask | null>(null);
  const [asrError, setAsrError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(() =>
    localStorage.getItem('video-reader-detail-collapsed') === 'true'
  );

  // 高亮状态
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightTagsMap, setHighlightTagsMap] = useState<HighlightTagsMap>({});

  // 翻译状态
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<{ done: number; total: number } | null>(null);
  const [translationData, setTranslationData] = useState<Translation | null>(null);
  const [translationParagraphs, setTranslationParagraphs] = useState<TranslationParagraph[]>([]);
  const [defaultTargetLang, setDefaultTargetLang] = useState('zh-CN');
  const translationDisplayRef = useRef({ fontSize: 14, color: '#9ca3af', opacity: 0.85 });

  // 外部触发 TranscriptView 滚动到某个 segment（使用自增计数器触发更新）
  const [scrollToSegment, setScrollToSegment] = useState<number | null>(null);
  const scrollTriggerRef = useRef(0);

  const { reportContext } = useAgentContext();

  useEffect(() => {
    reportContext({
      common: { currentPage: 'video-reader', readerMode: true, selectedText: null },
      pageState: {
        page: 'video-reader',
        articleId,
        currentTime: currentTime ?? 0,
        hasTranscript: !!(segments && segments.length > 0),
      },
    });
  }, [articleId, currentTime, segments, reportContext]);

  // 加载用户配置的默认翻译目标语言
  useEffect(() => {
    window.electronAPI.translationSettingsGet().then((settings) => {
      if (settings?.defaultTargetLang) setDefaultTargetLang(settings.defaultTargetLang);
    }).catch(() => {});
  }, []);

  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number>(0);

  // 加载文章数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 切换文章时重置翻译状态
    setTranslationData(null);
    setTranslationVisible(false);
    setTranslationLoading(false);
    setTranslationProgress(null);
    setTranslationParagraphs([]);

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

  // 解析本地视频为 blob URL（避免 file:// 访问限制）
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    const resolveVideoUrl = async () => {
      if (!article) {
        setPlayableVideoUrl(null);
        setLocalMediaLoading(false);
        return;
      }

      // 有 videoId 时仍走 YouTube 流
      if (article.videoId) {
        setPlayableVideoUrl(null);
        setLocalMediaLoading(false);
        return;
      }

      if (!article.url) {
        setPlayableVideoUrl(null);
        setLocalMediaLoading(false);
        return;
      }

      if (!article.url.startsWith('file://')) {
        setPlayableVideoUrl(article.url);
        setLocalMediaLoading(false);
        return;
      }

      setLocalMediaLoading(true);
      try {
        const media = await window.electronAPI.articleReadLocalMedia(articleId);
        if (!media) {
          if (!cancelled) setPlayableVideoUrl(null);
          return;
        }
        blobUrl = URL.createObjectURL(new Blob(
          [media.data],
          { type: media.mime || 'video/mp4' },
        ));
        if (!cancelled) setPlayableVideoUrl(blobUrl);
      } catch (err) {
        console.error('读取本地视频失败:', err);
        if (!cancelled) setPlayableVideoUrl(null);
      } finally {
        if (!cancelled) setLocalMediaLoading(false);
      }
    };

    void resolveVideoUrl();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [articleId, article?.videoId, article?.url]);

  // 加载字幕（优先本地缓存；视频链接存在时再尝试 YouTube 获取）
  useEffect(() => {
    let cancelled = false;

    const loadTranscript = async () => {
      setTranscriptLoading(true);
      setSegments([]);
      try {
        const existing = await window.electronAPI.transcriptGet(articleId);
        if (existing?.segments?.length) {
          if (!cancelled) setSegments(existing.segments);
          return;
        }

        if (!article?.videoId) return;
        const data = await window.electronAPI.transcriptFetch(articleId);
        if (!cancelled && data?.segments?.length) {
          setSegments(data.segments);
        }
      } catch (err) {
        console.error('加载字幕失败:', err);
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    };

    void loadTranscript();

    return () => { cancelled = true; };
  }, [articleId, article?.videoId]);

  // 加载并监听该视频的后台转写任务
  useEffect(() => {
    let cancelled = false;

    window.electronAPI.appTaskList().then((tasks) => {
      if (cancelled) return;
      const running = tasks.find(
        (t) => t.articleId === articleId && t.type === 'asr-standard' && (t.status === 'pending' || t.status === 'running'),
      );
      setAsrTask(running ?? null);
    }).catch((err) => {
      console.error('加载后台转写任务失败:', err);
    });

    const unsub = window.electronAPI.appTaskOnUpdated((task) => {
      if (task.articleId !== articleId || task.type !== 'asr-standard') return;
      setAsrTask(task);

      if (task.status === 'completed') {
        window.electronAPI.transcriptGet(articleId).then((data) => {
          if (data?.segments?.length) setSegments(data.segments);
        }).catch((err) => {
          console.error('读取转写结果失败:', err);
        });
      }

      if (task.status === 'failed') {
        setAsrError(task.error || '转写失败');
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [articleId]);

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

  const handleStartAsr = useCallback(async () => {
    setAsrError(null);
    try {
      const task = await window.electronAPI.appTaskCreate({
        type: 'asr-standard',
        articleId,
        title: `转写: ${article?.title || '视频'}`,
      });
      setAsrTask(task);
    } catch (err) {
      console.error('创建视频转写任务失败:', err);
      setAsrError(err instanceof Error ? err.message : String(err));
    }
  }, [articleId, article?.title]);

  // 翻译触发
  const handleTranslate = useCallback(async (targetLang: string) => {
    if (!article) return;

    // 切换显示/隐藏
    if (translationVisible && translationData) {
      setTranslationVisible(false);
      return;
    }
    if (translationData && !translationVisible) {
      setTranslationVisible(true);
      return;
    }

    // 检查缓存
    const cached = await window.electronAPI.translationGet({
      articleId: article.id,
      targetLang,
    });
    if (cached && cached.status === 'completed') {
      setTranslationData(cached);
      setTranslationParagraphs(cached.paragraphs);
      setTranslationVisible(true);
      return;
    }

    // 发起翻译（sourceType 使用 'transcript'）
    setTranslationLoading(true);
    setTranslationProgress(null);
    try {
      const translation = await window.electronAPI.translationStart({
        articleId: article.id,
        sourceType: 'transcript',
        targetLang,
      });
      setTranslationData(translation);
    } catch (err) {
      console.error('翻译启动失败:', err);
      setTranslationLoading(false);
    }
  }, [article, translationVisible, translationData]);

  // 翻译进度监听
  useEffect(() => {
    if (!translationData?.id) return;
    const unsubscribe = window.electronAPI.translationOnProgress((event: TranslationProgressEvent) => {
      if (event.translationId !== translationData.id) return;
      setTranslationParagraphs((prev) => {
        const next = [...prev];
        next[event.index] = { index: event.index, original: '', translated: event.translated };
        return next;
      });
      const total = translationData.paragraphs.length || 1;
      setTranslationProgress({ done: Math.ceil(event.progress * total), total });
      if (event.progress >= 1) {
        setTranslationLoading(false);
        setTranslationVisible(true);
        setTranslationProgress(null);
      }
    });
    return unsubscribe;
  }, [translationData]);

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

  if (loading || !article || localMediaLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0f0f0f]">
        <Loader2 size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  // scrollToSegment 转为整数给 TranscriptView
  const scrollToSegmentInt = scrollToSegment != null ? Math.floor(scrollToSegment) : null;
  const asrTaskStatus = asrTask?.status ?? null;
  const isAsrTaskRunning = asrTaskStatus === 'pending' || asrTaskStatus === 'running';
  const showAsrButton = shouldShowVideoAsrButton({
    transcriptLoading,
    segmentsCount: segments.length,
    asrTaskStatus,
  });

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
          onClick={() => handleTranslate(defaultTargetLang)}
          className={`p-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer ${
            translationVisible ? 'text-blue-400' : 'text-gray-400 hover:text-white'
          }`}
          title={translationLoading ? `翻译中${translationProgress ? ` ${translationProgress.done}/${translationProgress.total}` : ''}` : translationVisible ? '隐藏翻译' : '翻译字幕'}
          disabled={translationLoading}
        >
          {translationLoading ? <Loader2 size={18} className="animate-spin" /> : <Languages size={18} />}
        </button>
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
              videoId={article.videoId ?? undefined}
              videoUrl={!article.videoId ? playableVideoUrl ?? undefined : undefined}
              onTimeUpdate={handleTimeUpdate}
              onDuration={handleDuration}
            />
          </div>

          {/* 字幕区域 */}
          <div className="flex-1 min-h-0 mt-2">
            {showAsrButton ? (
              <div className="h-full flex items-center justify-center px-6">
                <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#151515] p-5 text-center">
                  <div className="text-sm text-gray-300 mb-2">暂无可用字幕</div>
                  <p className="text-xs text-gray-500 mb-4">
                    你可以使用语音识别生成字幕，完成后会显示在这里。
                  </p>
                  <button
                    onClick={handleStartAsr}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors cursor-pointer"
                  >
                    <Mic size={16} />
                    开始转写
                  </button>
                  {asrError && (
                    <div className="mt-3 text-xs text-red-400">{asrError}</div>
                  )}
                </div>
              </div>
            ) : isAsrTaskRunning && segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span>视频转写中...</span>
                </div>
                <div className="text-xs text-gray-500">{VIDEO_ASR_BACKGROUND_HINT}</div>
              </div>
            ) : (
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
                translationParagraphs={translationParagraphs}
                translationVisible={translationVisible}
                translationDisplaySettings={translationDisplayRef.current}
              />
            )}
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
