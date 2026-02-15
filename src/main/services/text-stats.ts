const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g;

export function estimateWordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const normalized = text.trim();
  if (!normalized) return 0;

  // CJK languages do not separate words by spaces, so we count visible CJK characters.
  const cjkCount = normalized.match(CJK_CHAR_RE)?.length ?? 0;
  const withoutCjk = normalized.replace(CJK_CHAR_RE, ' ');
  const latinCount = withoutCjk.match(LATIN_WORD_RE)?.length ?? 0;

  return cjkCount + latinCount;
}

export function estimateReadingTimeMinutes(text: string | null | undefined): number {
  const wordCount = estimateWordCount(text);
  if (wordCount === 0) return 0;
  return Math.max(1, Math.round(wordCount / 200));
}
