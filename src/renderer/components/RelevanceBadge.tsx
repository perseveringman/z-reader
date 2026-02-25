import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeedRelevanceInfo } from '../../shared/types';

interface RelevanceBadgeProps {
  metadata?: string | null;
  compact?: boolean;
}

/**
 * 解析 article.metadata JSON 中的 feedRelevance 信息
 */
function parseFeedRelevance(metadata?: string | null): FeedRelevanceInfo | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (parsed?.feedRelevance && parsed.feedRelevance.label !== 'none') {
      return parsed.feedRelevance as FeedRelevanceInfo;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Feed 文章相关度标记组件
 * 在 ArticleCard 中显示 high/medium 级别的相关度标记
 */
export function RelevanceBadge({ metadata, compact }: RelevanceBadgeProps) {
  const { t } = useTranslation();
  const relevance = parseFeedRelevance(metadata);

  if (!relevance) return null;

  const isHigh = relevance.label === 'high';
  const label = isHigh
    ? t('relevance.high', '高度相关')
    : t('relevance.medium', '可能相关');

  const tooltip = relevance.topMatches.length > 0
    ? `${label}: ${relevance.topMatches.join(', ')}`
    : label;

  if (compact) {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-center shrink-0 ${
          isHigh ? 'text-blue-400' : 'text-amber-400'
        }`}
      >
        <Sparkles size={12} />
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
        isHigh
          ? 'bg-blue-500/15 text-blue-400'
          : 'bg-amber-500/15 text-amber-400'
      }`}
    >
      <Sparkles size={10} />
      {label}
    </span>
  );
}
