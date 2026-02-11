import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import type { DownloadRecord } from '../../shared/types';

interface DownloadManagerProps {
  open: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  queued: {
    icon: <Download size={14} />,
    label: '排队中',
    color: 'text-gray-400',
  },
  downloading: {
    icon: <Loader2 size={14} className="animate-spin" />,
    label: '下载中',
    color: 'text-blue-400',
  },
  ready: {
    icon: <CheckCircle2 size={14} />,
    label: '已完成',
    color: 'text-green-400',
  },
  failed: {
    icon: <XCircle size={14} />,
    label: '失败',
    color: 'text-red-400',
  },
};

export function DownloadManager({ open, onClose }: DownloadManagerProps) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDownloads = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.downloadList();
      setDownloads(list);
    } catch (err) {
      console.error('Failed to load downloads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDownloads();
    }
  }, [open, loadDownloads]);

  // Poll for updates while panel is open and there are active downloads
  useEffect(() => {
    if (!open) return;
    const hasActive = downloads.some(
      (d) => d.status === 'queued' || d.status === 'downloading'
    );
    if (!hasActive) return;

    const timer = setInterval(loadDownloads, 3000);
    return () => clearInterval(timer);
  }, [open, downloads, loadDownloads]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleCancel = async (downloadId: string) => {
    try {
      await window.electronAPI.downloadCancel(downloadId);
      loadDownloads();
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  };

  const handleRetry = async (download: DownloadRecord) => {
    try {
      await window.electronAPI.downloadStart(download.articleId);
      loadDownloads();
    } catch (err) {
      console.error('Failed to retry download:', err);
    }
  };

  if (!open) return null;

  const totalBytes = downloads
    .filter((d) => d.status === 'ready')
    .reduce((sum, d) => sum + (d.bytes || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">下载管理</h2>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <HardDrive size={12} />
              {formatBytes(totalBytes)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadDownloads}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="刷新"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Download list */}
        <div className="max-h-[400px] overflow-y-auto">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Download size={32} className="mb-3 opacity-50" />
              <p className="text-sm">暂无下载记录</p>
              <p className="text-xs mt-1">在播客播放器中点击下载按钮开始离线缓存</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {downloads.map((dl) => {
                const status = statusConfig[dl.status] || statusConfig.queued;
                return (
                  <div
                    key={dl.id}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-white/[0.03] transition-colors"
                  >
                    {/* Status icon */}
                    <span className={`shrink-0 ${status.color}`}>
                      {status.icon}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">
                        {dl.articleId}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className={status.color}>{status.label}</span>
                        {dl.bytes && <span>{formatBytes(dl.bytes)}</span>}
                        <span>{formatDate(dl.addedAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-1">
                      {(dl.status === 'queued' || dl.status === 'downloading') && (
                        <button
                          onClick={() => handleCancel(dl.id)}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                          title="取消下载"
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                      {dl.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(dl)}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-blue-400 transition-colors"
                          title="重试"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      {dl.status === 'ready' && (
                        <button
                          onClick={() => handleCancel(dl.id)}
                          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                          title="删除下载"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
