/**
 * 微信公众号操作面板
 * 嵌入到 FeedDetailPanel 中，提供文章列表拉取、内容下载、行为数据获取等操作
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Key, Download, BarChart3, ListPlus, Loader2,
  CheckCircle2, XCircle, PauseCircle, Play,
} from 'lucide-react';
import type { WechatTokenStatus, WechatProgressEvent } from '../../shared/types';
import { WechatTokenDialog } from './WechatTokenDialog';
import { useToast } from './Toast';

interface WechatOperationPanelProps {
  feedId: string;
  feedTitle: string;
  onRefresh?: () => void;
}

export function WechatOperationPanel({ feedId, feedTitle, onRefresh }: WechatOperationPanelProps) {
  const [tokenStatus, setTokenStatus] = useState<WechatTokenStatus | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [progress, setProgress] = useState<WechatProgressEvent | null>(null);
  const [pagesStart, setPagesStart] = useState(1);
  const [pagesEnd, setPagesEnd] = useState(5);
  const { showToast } = useToast();

  // 加载 Token 状态
  const loadTokenStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.wechatGetTokenStatus(feedId);
      setTokenStatus(status);
    } catch {
      setTokenStatus(null);
    }
  }, [feedId]);

  useEffect(() => {
    loadTokenStatus();
  }, [loadTokenStatus]);

  // 监听进度事件
  useEffect(() => {
    const unsubscribe = window.electronAPI.wechatOnProgress((event) => {
      if (event.feedId === feedId) {
        setProgress(event);
        if (event.status === 'completed') {
          onRefresh?.();
          // 3 秒后清除进度
          setTimeout(() => setProgress(null), 3000);
        }
        if (event.status === 'error') {
          showToast(event.error || '操作失败');
        }
      }
    });
    return unsubscribe;
  }, [feedId, onRefresh, showToast]);

  const isRunning = progress?.status === 'running';

  const handleFetchList = async () => {
    if (isRunning) return;
    try {
      await window.electronAPI.wechatFetchArticleList({
        feedId,
        pagesStart,
        pagesEnd,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : '拉取失败');
    }
  };

  const handleDownloadContent = async () => {
    if (isRunning) return;
    try {
      await window.electronAPI.wechatDownloadContent({ feedId });
    } catch (err) {
      showToast(err instanceof Error ? err.message : '下载失败');
    }
  };

  const handleFetchStats = async () => {
    if (isRunning) return;
    try {
      await window.electronAPI.wechatFetchStats({ feedId });
    } catch (err) {
      showToast(err instanceof Error ? err.message : '获取失败');
    }
  };

  const handleCancel = async () => {
    try {
      await window.electronAPI.wechatCancelTask(feedId);
      setProgress(prev => prev ? { ...prev, status: 'cancelled' } : null);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      {/* Token 状态 */}
      <div className="flex items-center gap-2 text-[12px]">
        <Key size={13} className="text-gray-500 shrink-0" />
        <span className="text-gray-500">Token</span>
        <span className="ml-auto flex items-center gap-1">
          {tokenStatus?.hasToken ? (
            <>
              <CheckCircle2 size={12} className="text-green-500" />
              <span className="text-green-400">已配置</span>
            </>
          ) : (
            <>
              <XCircle size={12} className="text-yellow-500" />
              <span className="text-yellow-400">未配置</span>
            </>
          )}
        </span>
        <button
          onClick={() => setShowTokenDialog(true)}
          className="px-2 py-0.5 rounded text-[11px] bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
        >
          {tokenStatus?.hasToken ? '更新' : '设置'}
        </button>
      </div>

      {/* 操作按钮组 */}
      <div className="space-y-2">
        {/* 拉取文章列表 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetchList}
            disabled={isRunning || !tokenStatus?.hasToken}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ListPlus size={12} />
            拉取文章列表
          </button>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <span>页:</span>
            <input
              type="number"
              value={pagesStart}
              onChange={(e) => setPagesStart(Number(e.target.value) || 1)}
              min={1}
              className="w-10 px-1 py-0.5 bg-[#111] border border-white/10 rounded text-center text-white text-[11px]"
            />
            <span>-</span>
            <input
              type="number"
              value={pagesEnd}
              onChange={(e) => setPagesEnd(Number(e.target.value) || 5)}
              min={pagesStart}
              className="w-10 px-1 py-0.5 bg-[#111] border border-white/10 rounded text-center text-white text-[11px]"
            />
          </div>
        </div>

        {/* 下载文章内容 */}
        <button
          onClick={handleDownloadContent}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full"
        >
          <Download size={12} />
          下载文章内容（离线保存）
        </button>

        {/* 获取行为数据 */}
        <button
          onClick={handleFetchStats}
          disabled={isRunning || !tokenStatus?.hasToken}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full"
        >
          <BarChart3 size={12} />
          获取行为数据（阅读量/点赞/评论）
        </button>
      </div>

      {/* 进度条 */}
      {progress && progress.status !== 'completed' && (
        <div className="p-3 bg-[#111] border border-white/5 rounded-md space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">
              {progress.taskType === 'fetch-list' && '拉取文章列表'}
              {progress.taskType === 'download-content' && '下载文章内容'}
              {progress.taskType === 'fetch-stats' && '获取行为数据'}
            </span>
            {isRunning && (
              <button
                onClick={handleCancel}
                className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                取消
              </button>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px]">
            {isRunning && <Loader2 size={10} className="animate-spin text-blue-400" />}
            {progress.status === 'error' && <XCircle size={10} className="text-red-400" />}
            {progress.status === 'cancelled' && <PauseCircle size={10} className="text-yellow-400" />}
            <span className="text-gray-500 truncate">
              {progress.total > 0 && `${progress.current}/${progress.total} `}
              {progress.currentTitle}
            </span>
          </div>
          {progress.error && (
            <p className="text-[11px] text-red-400">{progress.error}</p>
          )}
        </div>
      )}

      {progress?.status === 'completed' && (
        <div className="flex items-center gap-2 p-2 bg-green-500/5 border border-green-500/10 rounded-md">
          <CheckCircle2 size={12} className="text-green-400" />
          <span className="text-[11px] text-green-400">{progress.currentTitle}</span>
        </div>
      )}

      {/* Token 对话框 */}
      <WechatTokenDialog
        open={showTokenDialog}
        onClose={() => setShowTokenDialog(false)}
        feedId={feedId}
        feedTitle={feedTitle}
        onTokenSet={() => loadTokenStatus()}
      />
    </div>
  );
}
