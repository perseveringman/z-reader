import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  Download,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

export interface AudioPlayerRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

interface AudioPlayerProps {
  /** Direct audio URL (from RSS enclosure or local downloaded file). */
  audioUrl: string;
  /** Article title, shown in the player. */
  title?: string;
  /** Podcast show name. */
  showName?: string;
  /** Episode artwork URL. */
  artworkUrl?: string;
  /** Initial time to resume from (seconds). */
  initialTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onDownload?: () => void;
  /** Whether a download exists for this episode. */
  downloaded?: boolean;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const SKIP_BACK_SECONDS = 15;
const SKIP_FORWARD_SECONDS = 30;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  function AudioPlayer(
    { audioUrl, title, showName, artworkUrl, initialTime, onTimeUpdate, onDuration, onEnded, onDownload, downloaded },
    ref,
  ) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const hasSetInitialTime = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const audio = audioRef.current;
        if (audio) audio.currentTime = seconds;
      },
      play: () => { audioRef.current?.play().catch(() => {}); },
      pause: () => { audioRef.current?.pause(); },
    }), []);

    // Set initial time once when audio loads
    const handleLoadedMetadata = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setLoading(false);
      setDuration(audio.duration);
      onDuration?.(audio.duration);

      if (!hasSetInitialTime.current && initialTime && initialTime > 0) {
        audio.currentTime = initialTime;
        hasSetInitialTime.current = true;
      }
    }, [initialTime, onDuration]);

    const handleTimeUpdate = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    }, [onTimeUpdate]);

    const handleEnded = useCallback(() => {
      setPlaying(false);
      onEnded?.();
    }, [onEnded]);

    const handleDurationChange = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;
      setDuration(audio.duration);
      onDuration?.(audio.duration);
    }, [onDuration]);

    // Toggle play/pause
    const togglePlay = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }, []);

    // Skip backward
    const skipBack = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, audio.currentTime - SKIP_BACK_SECONDS);
    }, []);

    // Skip forward
    const skipForward = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.min(audio.duration, audio.currentTime + SKIP_FORWARD_SECONDS);
    }, []);

    // Cycle playback rate
    const cyclePlaybackRate = useCallback(() => {
      setPlaybackRate((prev) => {
        const idx = PLAYBACK_RATES.indexOf(prev);
        const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
        if (audioRef.current) audioRef.current.playbackRate = next;
        return next;
      });
    }, []);

    // Volume toggle
    const toggleMute = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = !audio.muted;
      setMuted(audio.muted);
    }, []);

    // Volume change
    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (audioRef.current) {
        audioRef.current.volume = v;
        audioRef.current.muted = v === 0;
        setMuted(v === 0);
      }
    }, []);

    // Click on progress bar to seek
    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;
      const audio = audioRef.current;
      if (!bar || !audio || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
    }, [duration]);

    // Sync play/pause state
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const onPlay = () => setPlaying(true);
      const onPause = () => setPlaying(false);
      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      return () => {
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
      };
    }, []);

    // Keyboard shortcuts when player is focused
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.key === ' ' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          togglePlay();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          skipBack();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          skipForward();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, skipBack, skipForward]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div className="flex flex-col gap-3 bg-[#1a1a1a] rounded-lg p-4 border border-white/5">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onDurationChange={handleDurationChange}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
        />

        {/* Episode info row */}
        {(title || showName) && (
          <div className="flex items-center gap-3">
            {artworkUrl && (
              <img
                src={artworkUrl}
                alt=""
                className="w-12 h-12 rounded-md object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              {title && (
                <div className="text-sm font-medium text-gray-200 truncate">{title}</div>
              )}
              {showName && (
                <div className="text-xs text-gray-500 truncate">{showName}</div>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12 text-right tabular-nums shrink-0">
            {formatTime(currentTime)}
          </span>
          <div
            ref={progressBarRef}
            className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer group relative"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-[width] duration-100 relative"
              style={{ width: `${progress}%` }}
            >
              {/* Seek handle */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-gray-500 w-12 tabular-nums shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          {/* Left: speed + download */}
          <div className="flex items-center gap-1 w-28 shrink-0">
            <button
              onClick={cyclePlaybackRate}
              className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors cursor-pointer min-w-[40px] text-center"
              title="播放速度"
            >
              {playbackRate}x
            </button>
            {onDownload && (
              <button
                onClick={onDownload}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  downloaded
                    ? 'text-green-400 hover:text-green-300'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title={downloaded ? '已下载' : '下载'}
              >
                <Download size={16} />
              </button>
            )}
          </div>

          {/* Center: transport controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={skipBack}
              className="p-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer relative"
              title={`后退 ${SKIP_BACK_SECONDS} 秒`}
            >
              <RotateCcw size={20} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">
                {SKIP_BACK_SECONDS}
              </span>
            </button>

            <button
              onClick={togglePlay}
              disabled={loading && !playing}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 transition-colors cursor-pointer"
              title={playing ? '暂停' : '播放'}
            >
              {loading && !playing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : playing ? (
                <Pause size={20} />
              ) : (
                <Play size={20} className="ml-0.5" />
              )}
            </button>

            <button
              onClick={skipForward}
              className="p-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer relative"
              title={`前进 ${SKIP_FORWARD_SECONDS} 秒`}
            >
              <RotateCw size={20} />
              <span className="absolute bottom-0 right-0 text-[8px] font-bold">
                {SKIP_FORWARD_SECONDS}
              </span>
            </button>
          </div>

          {/* Right: volume */}
          <div className="flex items-center justify-end gap-2 w-28 shrink-0">
            <button
              onClick={toggleMute}
              className="p-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div className="flex items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-blue-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
