import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
}

interface VideoPlayerProps {
  videoId: string;
  onTimeUpdate?: (currentTime: number) => void;
  onReady?: () => void;
  onDuration?: (duration: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer({ videoId, onTimeUpdate, onReady, onDuration }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [needsLogin, setNeedsLogin] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);

    // 暴露 seekTo 方法
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
        }
      },
    }), []);

    // 获取视频流
    const fetchStream = useCallback(async () => {
      setLoading(true);
      setError(null);
      setStreamUrl(null);
      setNeedsLogin(false);

      try {
        const result = await window.electronAPI.youtubeGetStreamUrl(videoId);
        if (result?.url) {
          setStreamUrl(result.url);
        } else {
          // 检查是否已登录来判断失败原因
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
      let cancelled = false;
      (async () => {
        await fetchStream();
        if (cancelled) return;
      })();
      return () => { cancelled = true; };
    }, [fetchStream]);

    // 处理登录
    const handleLogin = useCallback(async () => {
      setLoggingIn(true);
      try {
        const success = await window.electronAPI.youtubeLogin();
        if (success) {
          // 登录成功，重新获取视频流
          await fetchStream();
        }
      } catch {
        setError('登录失败');
      }
      setLoggingIn(false);
    }, [fetchStream]);

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

    if (loading) {
      return (
        <div className="relative w-full bg-black rounded-lg flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-zinc-400 text-sm">加载视频中...</div>
          </div>
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

    if (error || !streamUrl) {
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
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <video
          ref={videoRef}
          src={streamUrl}
          className="absolute inset-0 w-full h-full rounded-lg bg-black"
          controls
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
        />
      </div>
    );
  }
);
