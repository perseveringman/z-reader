import { estimateReadingTimeMinutes, estimateWordCount } from './text-stats';

const HTML_TAG_RE = /<[^>]*>/g;
const WHITESPACE_RE = /\s+/g;

export interface ArticleTextStatsSource {
  contentText: string | null;
  content: string | null;
  summary: string | null;
}

export interface ExistingArticleTextStats {
  wordCount: number | null;
  readingTime: number | null;
}

function stripHtml(input: string): string {
  return input.replace(HTML_TAG_RE, ' ').replace(WHITESPACE_RE, ' ').trim();
}

export function getArticleTextForStats(source: ArticleTextStatsSource): string {
  const contentText = source.contentText?.trim();
  if (contentText) return contentText;

  const content = source.content?.trim();
  if (content) return stripHtml(content);

  return source.summary?.trim() ?? '';
}

export function buildArticleTextStatsPatch(
  source: ArticleTextStatsSource,
  existing: ExistingArticleTextStats,
): { wordCount: number; readingTime: number } | null {
  const sourceText = getArticleTextForStats(source);
  const wordCount = estimateWordCount(sourceText);
  const readingTime = estimateReadingTimeMinutes(sourceText);

  if (existing.wordCount === wordCount && existing.readingTime === readingTime) {
    return null;
  }

  return { wordCount, readingTime };
}
