export interface Article {
  id: string;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  contentText: string | null;
  thumbnail: string | null;
  wordCount: number | null;
  readingTime: number | null;
  domain: string | null;
  createdAt: string;
}

export interface Highlight {
  id: string;
  articleId: string;
  text: string | null;
  note: string | null;
  color: string;
  startOffset: number | null;
  endOffset: number | null;
  paragraphIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHighlightInput {
  articleId: string;
  text: string;
  note?: string;
  color?: string;
  startOffset?: number;
  endOffset?: number;
  paragraphIndex?: number;
}

export interface SaveArticleInput {
  url: string;
  title?: string;
  content?: string;
  contentText?: string;
  author?: string;
  summary?: string;
  thumbnail?: string;
}

export type HighlightColor = 'yellow' | 'blue' | 'green' | 'red';

export interface Tag {
  id: string;
  name: string;
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#fef08a',
  blue: '#93c5fd',
  green: '#86efac',
  red: '#fca5a5',
};
