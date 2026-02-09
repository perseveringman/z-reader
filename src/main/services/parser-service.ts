import Parser from '@postlight/parser';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
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

    const content = result.content ?? null;
    const contentText = content ? stripHtml(content) : null;
    const wordCount = contentText ? contentText.split(/\s+/).filter(Boolean).length : 0;
    const readingTime = Math.max(1, Math.round(wordCount / 200));

    return {
      title: result.title ?? null,
      content,
      contentText,
      author: result.author ?? null,
      domain: extractDomain(url),
      wordCount,
      readingTime,
      excerpt: result.excerpt ?? null,
      leadImageUrl: result.lead_image_url ?? null,
    };
  } catch (err) {
    console.error(`Failed to parse article content: ${url}`, err);
    return null;
  }
}
