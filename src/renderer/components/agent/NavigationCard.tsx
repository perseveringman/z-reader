import { ChevronRight } from 'lucide-react';

interface NavigationCardProps {
  title: string;
  subtitle?: string;
  targetType: string;
  targetId: string;
  thumbnail?: string;
  onNavigate: (targetType: string, targetId: string) => void;
}

export function NavigationCard({
  title,
  subtitle,
  targetType,
  targetId,
  thumbnail,
  onNavigate,
}: NavigationCardProps) {
  return (
    <button
      onClick={() => onNavigate(targetType, targetId)}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10 
                 bg-white/5 hover:bg-white/10 transition-colors text-left group"
    >
      {/* 缩略图 */}
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="w-10 h-10 rounded object-cover shrink-0 bg-white/5"
        />
      )}

      {/* 文本信息 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-200 truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* 箭头 */}
      <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 shrink-0 transition-colors" />
    </button>
  );
}
