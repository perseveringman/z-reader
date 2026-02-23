/**
 * 微信公众号 Token 配置对话框
 */
import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Key, CheckCircle2, AlertCircle, Copy, Info } from 'lucide-react';
import { useToast } from './Toast';

interface WechatTokenDialogProps {
  open: boolean;
  onClose: () => void;
  feedId: string;
  feedTitle: string;
  onTokenSet?: () => void;
}

export function WechatTokenDialog({ open, onClose, feedId, feedTitle, onTokenSet }: WechatTokenDialogProps) {
  const [tokenUrl, setTokenUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setTokenUrl('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenUrl.trim()) return;

    setLoading(true);
    try {
      const status = await window.electronAPI.wechatSetToken(feedId, tokenUrl.trim());
      if (status.hasToken) {
        showToast('Token 设置成功');
        onClose();
        onTokenSet?.();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token 设置失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-green-400" />
            <h2 className="text-lg font-semibold text-white">设置 Token</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              公众号: <span className="text-white">{feedTitle}</span>
            </label>
          </div>

          <div>
            <label htmlFor="token-url" className="block text-sm font-medium text-gray-300 mb-1.5">
              Token URL <span className="text-red-400">*</span>
            </label>
            <textarea
              ref={inputRef}
              id="token-url"
              value={tokenUrl}
              onChange={(e) => setTokenUrl(e.target.value)}
              placeholder="从 Fiddler/Charles 中复制的包含 __biz, uin, key, pass_ticket 参数的完整 URL"
              rows={4}
              className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono resize-none"
              disabled={loading}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !tokenUrl.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>验证中...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>设置 Token</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* 操作指引 */}
        <div className="px-6 pb-6">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Info size={12} />
            <span>{showGuide ? '收起' : '如何获取 Token？'}</span>
          </button>
          {showGuide && (
            <div className="mt-3 p-3 bg-[#111] border border-white/5 rounded-md space-y-2 text-xs text-gray-400">
              <p className="font-medium text-gray-300">获取 Token 步骤：</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>打开 Fiddler Classic 并开始抓包</li>
                <li>在微信 PC 客户端中，打开该公众号的主页</li>
                <li>在 Fiddler 中找到主机为 <code className="px-1 py-0.5 bg-white/5 rounded">mp.weixin.qq.com</code> 的请求</li>
                <li>选中该请求，按 <code className="px-1 py-0.5 bg-white/5 rounded">Ctrl+U</code> 复制完整 URL</li>
                <li>粘贴到上方输入框中</li>
              </ol>
              <div className="mt-2 flex items-start gap-1.5 p-2 bg-yellow-500/5 border border-yellow-500/10 rounded">
                <AlertCircle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-yellow-400/80">
                  Token 有效期约 2-6 小时，过期后需重新获取。手动获取 Token 是最安全的方式，不会触发微信的风控系统。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
