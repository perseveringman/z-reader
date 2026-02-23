/**
 * 微信文章行为数据展示区块
 * 嵌入到 DetailPanel 中，显示阅读量、点赞、转发、在看、评论
 */
import { useState, useEffect } from 'react';
import { Eye, ThumbsUp, Share2, Sparkles, MessageCircle, RefreshCw, Loader2 } from 'lucide-react';
import type { WechatStats, WechatComment } from '../../shared/types';

interface WechatStatsSectionProps {
  articleId: string;
}

export function WechatStatsSection({ articleId }: WechatStatsSectionProps) {
  const [stats, setStats] = useState<WechatStats | null>(null);
  const [comments, setComments] = useState<WechatComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    loadData();
  }, [articleId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        window.electronAPI.wechatGetStats(articleId),
        window.electronAPI.wechatGetComments(articleId),
      ]);
      setStats(s);
      setComments(c);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!stats && !loading) return null;

  const formatNumber = (n: number | null): string => {
    if (n === null || n === undefined) return '-';
    if (n >= 100000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return n.toLocaleString();
  };

  return (
    <div className="px-5 py-4 border-t border-[#1e1e1e]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
          微信数据
        </h3>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          title="刷新数据"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      {stats && (
        <div className="space-y-2">
          {/* 统计数据网格 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-md">
              <Eye size={13} className="text-blue-400 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-white">{formatNumber(stats.readCount)}</div>
                <div className="text-[10px] text-gray-500">阅读</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-md">
              <ThumbsUp size={13} className="text-red-400 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-white">{formatNumber(stats.likeCount)}</div>
                <div className="text-[10px] text-gray-500">点赞</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-md">
              <Share2 size={13} className="text-green-400 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-white">{formatNumber(stats.shareCount)}</div>
                <div className="text-[10px] text-gray-500">转发</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-md">
              <Sparkles size={13} className="text-yellow-400 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-white">{formatNumber(stats.wowCount)}</div>
                <div className="text-[10px] text-gray-500">在看</div>
              </div>
            </div>
          </div>

          {/* 获取时间 */}
          {stats.fetchedAt && (
            <div className="text-[10px] text-gray-600 text-right">
              数据获取于 {new Date(stats.fetchedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      )}

      {/* 评论区 */}
      {comments.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
          >
            <MessageCircle size={12} />
            <span>评论 ({comments.length})</span>
          </button>
          {showComments && (
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="p-2 bg-white/[0.02] rounded-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-400">{comment.nickname || '匿名'}</span>
                    {comment.likeCount !== null && comment.likeCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <ThumbsUp size={9} />
                        {comment.likeCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-gray-300 leading-relaxed">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
