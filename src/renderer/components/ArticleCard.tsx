import { useState } from 'react';
import { Archive, Clock, MoreHorizontal, Star, RotateCcw, Trash2 } from 'lucide-react';
import type { Article } from '../../shared/types';

interface ArticleCardProps {
  article: Article;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onStatusChange: (id: string, status: 'inbox' | 'later' | 'archive') => void;
  onToggleShortlist?: (id: string, current: boolean) => void;
  trashMode?: boolean;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  if (diff < 0) return 'just now';

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function getDomainInitial(domain: string | null): string {
  if (!domain) return '?';
  return domain.replace(/^www\./, '').charAt(0).toUpperCase();
}

export function ArticleCard({ article, isSelected, onSelect, onDoubleClick, onStatusChange, onToggleShortlist, trashMode, onRestore, onPermanentDelete }: ArticleCardProps) {
  const [hovered, setHovered] = useState(false);

  const handleQuickAction = (e: React.MouseEvent, status: 'inbox' | 'later' | 'archive') => {
    e.stopPropagation();
    onStatusChange(article.id, status);
  };

  const handleToggleShortlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleShortlist?.(article.id, article.isShortlisted === 1);
  };

  const domainInitial = getDomainInitial(article.domain);
  const timestamp = formatRelativeTime(article.savedAt || article.publishedAt);
  const isRead = article.readProgress >= 0.9 || article.readStatus === 'archive';

  const metaParts: string[] = [];
  if (article.domain) metaParts.push(article.domain.replace(/^www\./, ''));
  if (article.author) metaParts.push(article.author);
  if (article.readingTime != null && article.readingTime > 0) {
    metaParts.push(`${article.readingTime} min`);
  }

  return (
    <div
      onClick={() => onSelect(article.id)}
      onDoubleClick={() => onDoubleClick(article.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative flex gap-3 px-4 py-3 cursor-pointer transition-colors
        ${isSelected
          ? 'border-l-2 border-blue-500 bg-white/[0.04]'
          : 'border-l-2 border-transparent hover:bg-white/[0.03]'
        }
        ${isRead ? 'opacity-70' : ''}
      `}
    >
      {/* 缩略图 / 域名首字母 */}
      <div className="shrink-0">
        {article.thumbnail ? (
          <img
            src={article.thumbnail}
            alt=""
            className={`w-14 h-14 rounded-md object-cover ${isRead ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className={`w-14 h-14 rounded-md bg-white/[0.06] flex items-center justify-center text-base font-semibold ${isRead ? 'text-gray-600' : 'text-gray-500'}`}>
            {domainInitial}
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-w-0">
        {/* 标题行 + 时间戳 */}
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-[14px] font-medium truncate leading-snug ${isRead ? 'text-gray-500' : 'text-gray-100'}`}>
            {article.title || 'Untitled'}
          </h3>
          {!hovered && timestamp && (
            <span className="shrink-0 text-[11px] text-gray-500 pt-0.5">
              {timestamp}
            </span>
          )}
        </div>

        {/* 摘要 */}
        {article.summary && (
          <p className={`mt-0.5 text-[13px] leading-snug line-clamp-2 ${isRead ? 'text-gray-600' : 'text-gray-500'}`}>
            {article.summary}
          </p>
        )}

        {/* 元信息行: favicon initial + domain · author · reading time */}
        {metaParts.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="shrink-0 w-4 h-4 rounded bg-white/[0.08] flex items-center justify-center text-[10px] font-medium text-gray-400">
              {domainInitial}
            </span>
            {metaParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-600">·</span>}
                <span className="truncate max-w-[120px]">{part}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hover 快捷操作浮层 */}
      {hovered && (
        <div className="absolute right-3 top-2.5 flex items-center gap-0.5 bg-[#1e1e1e] border border-white/10 rounded-md px-0.5 py-0.5 shadow-lg">
          {trashMode ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onRestore?.(article.id); }}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-green-400 transition-colors"
                title="Restore"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPermanentDelete?.(article.id); }}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                title="Permanently Delete"
              >
                <Trash2 size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleToggleShortlist}
                className={`p-1 rounded hover:bg-white/10 transition-colors ${
                  article.isShortlisted === 1 ? 'text-yellow-400' : 'text-gray-400 hover:text-white'
                }`}
                title={article.isShortlisted === 1 ? 'Remove from Shortlist' : 'Add to Shortlist'}
              >
                <Star size={14} fill={article.isShortlisted === 1 ? 'currentColor' : 'none'} />
              </button>
              {article.readStatus !== 'archive' && (
                <button
                  onClick={(e) => handleQuickAction(e, 'archive')}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Archive"
                >
                  <Archive size={14} />
                </button>
              )}
              {article.readStatus !== 'later' && (
                <button
                  onClick={(e) => handleQuickAction(e, 'later')}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Read Later"
                >
                  <Clock size={14} />
                </button>
              )}
              <button
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="More"
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {/* 阅读进度条 */}
      {article.readProgress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-violet-500 transition-all"
            style={{ width: `${Math.min(article.readProgress * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
