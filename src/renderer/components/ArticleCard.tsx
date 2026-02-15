import { useState } from 'react';
import { Archive, Clock, MoreHorizontal, Star, RotateCcw, Trash2, Check, BookmarkPlus } from 'lucide-react';
import type { Article, ArticleSource, ReadStatus } from '../../shared/types';

interface ArticleCardProps {
  article: Article;
  isSelected: boolean;
  onHover: (id: string) => void;
  onClick: (id: string) => void;
  onStatusChange: (id: string, status: ReadStatus) => void;
  onToggleShortlist?: (id: string, current: boolean) => void;
  trashMode?: boolean;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  compact?: boolean;
  multiSelect?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (id: string, e: React.MouseEvent) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  source?: ArticleSource;
  onSaveToLibrary?: (id: string) => void;
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

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ArticleCard({ article, isSelected, onHover, onClick, onStatusChange, onToggleShortlist, trashMode, onRestore, onPermanentDelete, compact, multiSelect, isChecked, onToggleCheck, onContextMenu: onCtxMenu, source, onSaveToLibrary }: ArticleCardProps) {
  const [hovered, setHovered] = useState(false);

  const isFeedArticle = source === 'feed' || article.source === 'feed';
  const isLibraryArticle = source === 'library' || article.source === 'library';

  const handleQuickAction = (e: React.MouseEvent, status: ReadStatus) => {
    e.stopPropagation();
    onStatusChange(article.id, status);
  };

  const handleToggleShortlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleShortlist?.(article.id, article.isShortlisted === 1);
  };

  const handleSaveToLibrary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveToLibrary?.(article.id);
  };

  const displayName = article.feedTitle || article.domain;
  const domainInitial = getDomainInitial(displayName);
  const timestamp = formatRelativeTime(article.savedAt || article.publishedAt);
  const isRead = article.readProgress >= 0.9 || article.readStatus === 'archive' || article.readStatus === 'seen';

  const metaParts: string[] = [];
  if (displayName) metaParts.push(displayName.replace(/^www\./, ''));
  if (article.author) metaParts.push(article.author);
  const isVideoOrPodcast = article.mediaType === 'video' || article.mediaType === 'podcast';
  const effectiveDuration = article.audioDuration || article.duration;
  if (isVideoOrPodcast && effectiveDuration) {
    const durationStr = formatDuration(effectiveDuration);
    if (durationStr) metaParts.push(durationStr);
  } else if (article.readingTime != null && article.readingTime > 0) {
    metaParts.push(`${article.readingTime} min`);
  }

  return (
    <div
      onClick={(e) => {
        if (multiSelect || e.metaKey || e.ctrlKey || e.shiftKey) {
          onToggleCheck?.(article.id, e);
        } else {
          onClick(article.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onCtxMenu?.(article.id, e.clientX, e.clientY);
      }}
      onMouseEnter={() => {
        setHovered(true);
        onHover(article.id);
      }}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative flex gap-3 px-4 ${compact ? 'py-2' : 'py-3'} cursor-pointer transition-colors
        ${isSelected
          ? 'border-l-2 border-blue-500 bg-white/[0.04]'
          : 'border-l-2 border-transparent hover:bg-white/[0.03]'
        }
        ${isRead ? 'opacity-70' : ''}
      `}
    >
      {/* Checkbox 多选 */}
      {multiSelect && (
        <div className="shrink-0 flex items-center">
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              isChecked
                ? 'bg-blue-500 border-blue-500'
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            {isChecked && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      {/* 缩略图 / 域名首字母 */}
      {!compact && (
        <div className="shrink-0 relative">
          {article.thumbnail ? (
            <>
              <img
                src={article.thumbnail}
                alt=""
                className={`w-14 h-14 rounded-md object-cover ${isRead ? 'opacity-60' : ''}`}
              />
              {isVideoOrPodcast && effectiveDuration && (
                <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-white text-[10px] font-medium rounded">
                  {formatDuration(effectiveDuration)}
                </span>
              )}
            </>
          ) : (
            <div className={`w-14 h-14 rounded-md bg-white/[0.06] flex items-center justify-center text-base font-semibold ${isRead ? 'text-gray-600' : 'text-gray-500'}`}>
              {domainInitial}
            </div>
          )}
        </div>
      )}

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
        {!compact && article.summary && (
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
                {i > 0 && <span className="text-gray-600">&middot;</span>}
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
              {/* Save to Library button for feed articles */}
              {isFeedArticle && onSaveToLibrary && (
                <button
                  onClick={handleSaveToLibrary}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-blue-400 transition-colors"
                  title="Save to Library"
                >
                  <BookmarkPlus size={14} />
                </button>
              )}
              <button
                onClick={handleToggleShortlist}
                className={`p-1 rounded hover:bg-white/10 transition-colors ${
                  article.isShortlisted === 1 ? 'text-yellow-400' : 'text-gray-400 hover:text-white'
                }`}
                title={article.isShortlisted === 1 ? 'Remove from Shortlist' : 'Add to Shortlist'}
              >
                <Star size={14} fill={article.isShortlisted === 1 ? 'currentColor' : 'none'} />
              </button>
              {/* Library-specific quick actions */}
              {isLibraryArticle && (
                <>
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
                </>
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
