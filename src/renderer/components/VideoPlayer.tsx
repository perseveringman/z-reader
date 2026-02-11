import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

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
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const readyRef = useRef(false);

    // 向 iframe 发送 postMessage 命令
    const postCommand = useCallback((command: string, args?: unknown) => {
      if (!iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: args ? [args] : [] }),
        '*'
      );
    }, []);

    // 暴露 seekTo 方法
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        postCommand('seekTo', seconds);
      },
    }), [postCommand]);

    // 监听 iframe 消息
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== 'https://www.youtube.com') return;

        let data: Record<string, unknown>;
        try {
          data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }

        if (data.event === 'onReady') {
          readyRef.current = true;
          onReady?.();
          // 开始监听当前时间
          postCommand('addEventListener', 'onStateChange');
        }

        if (data.event === 'infoDelivery') {
          const info = data.info as Record<string, unknown> | undefined;
          if (info?.currentTime !== undefined) {
            onTimeUpdate?.(info.currentTime as number);
          }
          if (info?.duration !== undefined && (info.duration as number) > 0) {
            onDuration?.(info.duration as number);
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [onTimeUpdate, onReady, onDuration, postCommand]);

    // 定时轮询当前播放时间
    useEffect(() => {
      intervalRef.current = setInterval(() => {
        if (readyRef.current) {
          postCommand('getCurrentTime');
          postCommand('getDuration');
        }
      }, 1000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [postCommand]);

    const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&autoplay=0&rel=0`;

    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="absolute inset-0 w-full h-full rounded-lg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube Video Player"
        />
      </div>
    );
  }
);
