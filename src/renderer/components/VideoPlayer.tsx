import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { VideoFormat } from '../../shared/types';

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
}

interface VideoPlayerProps {
  videoId?: string;
  videoUrl?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onReady?: () => void;
  onDuration?: (duration: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer({ videoId, videoUrl, onTimeUpdate, onReady, onDuration }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [formats, setFormats] = useState<VideoFormat[]>([]);
    const [bestAudio, setBestAudio] = useState<VideoFormat | null>(null);
    const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
    const [showQualityMenu, setShowQualityMenu] = useState(false);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [needsLogin, setNeedsLogin] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);

    const usingDirectVideoUrl = !!videoUrl && !videoId;
    // 当前 format 是否需要独立音频轨
    const needsSeparateAudio = selectedFormat != null && !selectedFormat.hasAudio;

    // 暴露 seekTo 方法
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
        }
        if (needsSeparateAudio && audioRef.current) {
          audioRef.current.currentTime = seconds;
        }
      },
    }), [needsSeparateAudio]);

    // 获取视频流
    const fetchStream = useCallback(async () => {
      if (!videoId) {
        setLoading(false);
        setError('视频不可用');
        return;
      }

      setLoading(true);
      setError(null);
      setFormats([]);
      setBestAudio(null);
      setSelectedFormat(null);
      setNeedsLogin(false);

      try {
        const result = await window.electronAPI.youtubeGetStreamUrl(videoId);
        if (result && result.formats.length > 0) {
          setFormats(result.formats);
          setBestAudio(result.bestAudio);
          // 默认选最高的 muxed format（有音频的最高画质）
          const defaultFormat = result.formats.find(f => f.hasAudio) ?? result.formats[0];
          setSelectedFormat(defaultFormat);
        } else {
          const loggedIn = await window.electronAPI.youtubeAuthStatus();
          if (!loggedIn) {
            setNeedsLogin(true);
          } else {
            setError('无法获取视频流，请稍后重试');
          }
        }
      } catch {
        setError('获取视频流失败');
      }
      setLoading(false);
    }, [videoId]);

    // 首次加载和 videoId 变化时获取流
    useEffect(() => {
      if (usingDirectVideoUrl) {
        setLoading(false);
        setError(null);
        setNeedsLogin(false);
        return;
      }

      let cancelled = false;
      (async () => {
        await fetchStream();
        if (cancelled) return;
      })();
      return () => { cancelled = true; };
    }, [fetchStream, usingDirectVideoUrl]);

    // 处理登录
    const handleLogin = useCallback(async () => {
      setLoggingIn(true);
      try {
        const success = await window.electronAPI.youtubeLogin();
        if (success) {
          await fetchStream();
        }
      } catch {
        setError('登录失败');
      }
      setLoggingIn(false);
    }, [fetchStream]);

    // 双轨同步：video play/pause → audio play/pause
    useEffect(() => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || !audio || !needsSeparateAudio) return;

      const onPlay = () => { audio.play().catch(() => undefined); };
      const onPause = () => { audio.pause(); };
      const onSeeked = () => { audio.currentTime = video.currentTime; };

      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeked', onSeeked);

      return () => {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('seeked', onSeeked);
      };
    }, [needsSeparateAudio, selectedFormat]);

    // 双轨同步：定时校正（每 3 秒检查时间差，超 0.3 秒则校正）
    useEffect(() => {
      if (!needsSeparateAudio) {
        if (syncTimerRef.current) {
          clearInterval(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        return;
      }

      syncTimerRef.current = setInterval(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;
        const diff = Math.abs(video.currentTime - audio.currentTime);
        if (diff > 0.3) {
          audio.currentTime = video.currentTime;
        }
      }, 3000);

      return () => {
        if (syncTimerRef.current) {
          clearInterval(syncTimerRef.current);
          syncTimerRef.current = null;
        }
      };
    }, [needsSeparateAudio]);

    // 切换清晰度
    const handleQualityChange = useCallback((format: VideoFormat) => {
      const video = videoRef.current;
      const currentTime = video?.currentTime ?? 0;
      const wasPlaying = video ? !video.paused : false;

      setSelectedFormat(format);
      setShowQualityMenu(false);

      // 切换后恢复播放位置
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          const onCanPlay = () => {
            v.currentTime = currentTime;
            if (wasPlaying) v.play().catch(() => undefined);
            v.removeEventListener('canplay', onCanPlay);
          };
          v.addEventListener('canplay', onCanPlay);
        }
        const a = audioRef.current;
        if (a && !format.hasAudio) {
          const onAudioCanPlay = () => {
            a.currentTime = currentTime;
            a.removeEventListener('canplay', onAudioCanPlay);
          };
          a.addEventListener('canplay', onAudioCanPlay);
        }
      });
    }, []);

    // 监听 video 事件
    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      onReady?.();
      if (video.duration && video.duration > 0) {
        onDuration?.(video.duration);
      }
    }, [onReady, onDuration]);

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      onTimeUpdate?.(video.currentTime);
    }, [onTimeUpdate]);

    const handleDurationChange = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.duration && video.duration > 0) {
        onDuration?.(video.duration);
      }
    }, [onDuration]);

    // 点击菜单外部关闭
    useEffect(() => {
      if (!showQualityMenu) return;
      const handleClick = () => setShowQualityMenu(false);
      // 延迟一帧避免立即触发
      const id = requestAnimationFrame(() => {
        document.addEventListener('click', handleClick);
      });
      return () => {
        cancelAnimationFrame(id);
        document.removeEventListener('click', handleClick);
      };
    }, [showQualityMenu]);

    if (loading) {
      return (
        <div className="relative w-full bg-black rounded-lg flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-zinc-400 text-sm">加载视频中...</div>
          </div>
        </div>
      );
    }

    if (usingDirectVideoUrl && videoUrl) {
      return (
        <div className="relative w-full group" style={{ paddingBottom: '56.25%' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full rounded-lg bg-black"
            controls
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
          />
        </div>
      );
    }

    if (needsLogin) {
      return (
        <div className="relative w-full bg-black rounded-lg flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="text-zinc-400 text-sm">需要登录 YouTube 才能播放视频</div>
            <button
              onClick={handleLogin}
              disabled={loggingIn}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 text-white text-sm rounded-md transition-colors"
            >
              {loggingIn ? '登录中...' : '登录 YouTube'}
            </button>
          </div>
        </div>
      );
    }

    if (error || !selectedFormat) {
      return (
        <div className="relative w-full bg-black rounded-lg flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="text-zinc-400 text-sm">{error ?? '视频不可用'}</div>
            <button
              onClick={handleLogin}
              disabled={loggingIn}
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-zinc-300 text-xs rounded transition-colors"
            >
              {loggingIn ? '登录中...' : '重新登录 YouTube'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full group" style={{ paddingBottom: '56.25%' }}>
        <video
          ref={videoRef}
          src={selectedFormat.url}
          className="absolute inset-0 w-full h-full rounded-lg bg-black"
          controls
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
        />
        {/* 独立音频轨（仅 adaptive 纯视频需要） */}
        {needsSeparateAudio && bestAudio && (
          <audio ref={audioRef} src={bestAudio.url} preload="auto" />
        )}
        {/* 清晰度选择器 */}
        {formats.length > 1 && (
          <div className="absolute bottom-12 right-3 z-10">
            {showQualityMenu && (
              <div
                className="mb-1 bg-black/90 rounded-md py-1 min-w-[100px] shadow-lg"
                onClick={e => e.stopPropagation()}
              >
                {formats.map(f => (
                  <button
                    key={f.itag}
                    onClick={() => handleQualityChange(f)}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      f.itag === selectedFormat.itag
                        ? 'text-blue-400 bg-white/10'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    {f.qualityLabel}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={e => {
                e.stopPropagation();
                setShowQualityMenu(prev => !prev);
              }}
              className="px-2 py-1 bg-black/70 hover:bg-black/90 text-white text-xs rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              {selectedFormat.qualityLabel}
            </button>
          </div>
        )}
      </div>
    );
  }
);
