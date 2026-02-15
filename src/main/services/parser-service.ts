import Parser from '@postlight/parser';
import { estimateReadingTimeMinutes, estimateWordCount } from './text-stats';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(rawUrl: string, baseUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return rawUrl;
  if (/^(#|data:|javascript:|mailto:|tel:)/i.test(value)) return rawUrl;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return rawUrl;
  }
}

function normalizeSrcset(srcset: string, baseUrl: string): string {
  return srcset
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;

      const parts = trimmed.split(/\s+/);
      const url = parts.shift() ?? '';
      const absoluteUrl = toAbsoluteUrl(url, baseUrl);
      return [absoluteUrl, ...parts].join(' ').trim();
    })
    .filter(Boolean)
    .join(', ');
}

function normalizeImageUrls(html: string, baseUrl: string): string {
  return html.replace(/<(img|source)\b[^>]*>/gi, (tag) => {
    let updatedTag = tag.replace(/(\s(?:src|data-src|poster)=['"])([^'"]+)(['"])/gi, (_, p1, p2, p3) => {
      return `${p1}${toAbsoluteUrl(p2, baseUrl)}${p3}`;
    });

    updatedTag = updatedTag.replace(/(\s(?:srcset|data-srcset)=['"])([^'"]+)(['"])/gi, (_, p1, p2, p3) => {
      return `${p1}${normalizeSrcset(p2, baseUrl)}${p3}`;
    });

    return updatedTag;
  });
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export interface ParseResult {
  title: string | null;
  content: string | null;
  contentText: string | null;
  author: string | null;
  domain: string | null;
  wordCount: number;
  readingTime: number;
  excerpt: string | null;
  leadImageUrl: string | null;
}

export async function parseArticleContent(url: string): Promise<ParseResult | null> {
  try {
    const result = await Parser.parse(url);

    const content = result.content ? normalizeImageUrls(result.content, url) : null;
    const contentText = content ? stripHtml(content) : null;
    const wordCount = estimateWordCount(contentText);
    const readingTime = estimateReadingTimeMinutes(contentText);

    return {
      title: result.title ?? null,
      content,
      contentText,
      author: result.author ?? null,
      domain: extractDomain(url),
      wordCount,
      readingTime,
      excerpt: result.excerpt ?? null,
      leadImageUrl: result.lead_image_url ? toAbsoluteUrl(result.lead_image_url, url) : null,
    };
  } catch (err) {
    console.error(`Failed to parse article content: ${url}`, err);
    return null;
  }
}
