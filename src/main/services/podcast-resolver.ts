import { itunesLookup, searchPodcasts } from './podcast-directory-service';

export interface ResolvedPodcast {
  feedUrl: string;
  title?: string;
  author?: string;
  image?: string;
}

/** 播客单集元数据 */
export interface PodcastEpisodeMeta {
  title: string;
  author: string | null;
  showName: string | null;
  summary: string | null;
  content: string | null;      // 完整正文（含时间轴等）
  thumbnail: string | null;
  audioUrl: string | null;
  duration: number | null;     // 秒
  publishedAt: string | null;  // ISO 8601
}

/**
 * Resolve a URL to a podcast RSS feed URL.
 *
 * Strategy:
 * 1. If the URL itself is an RSS feed (contains XML/RSS content type), return it directly.
 * 2. If the page has `<link rel="alternate" type="application/rss+xml">`, extract feedUrl.
 * 3. Apple Podcasts: extract show ID -> iTunes Lookup -> feedUrl.
 * 4. Spotify / 小宇宙: scrape page metadata (title/author) -> directory search -> best match feedUrl.
 * 5. Fallback: return null (caller should prompt manual RSS entry).
 */
export async function resolvePodcastUrl(url: string): Promise<ResolvedPodcast | null> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Apple Podcasts
    if (hostname.includes('podcasts.apple.com') || hostname.includes('itunes.apple.com')) {
      return resolveApplePodcasts(url);
    }

    // Spotify
    if (hostname.includes('open.spotify.com') || hostname.includes('spotify.com')) {
      return resolveViaMetadataSearch(url);
    }

    // 小宇宙
    if (hostname.includes('xiaoyuzhoufm.com') || hostname.includes('xyzfm.link')) {
      return resolveViaMetadataSearch(url);
    }

    // Generic URL: try to fetch and check for RSS link or RSS content
    return resolveGenericUrl(url);
  } catch (err) {
    console.error('Podcast URL resolution failed:', err);
    return null;
  }
}

/** Apple Podcasts: extract show ID from URL path, then iTunes Lookup. */
async function resolveApplePodcasts(url: string): Promise<ResolvedPodcast | null> {
  // URL pattern: https://podcasts.apple.com/us/podcast/podcast-name/id1234567890
  const idMatch = url.match(/\/id(\d+)/);
  if (!idMatch) {
    // Fallback: try to fetch page and scrape
    return resolveViaMetadataSearch(url);
  }

  const itunesId = idMatch[1];
  const result = await itunesLookup(itunesId);
  if (!result.feedUrl) return null;

  return {
    feedUrl: result.feedUrl,
    title: result.title ?? undefined,
    author: result.author ?? undefined,
    image: result.image ?? undefined,
  };
}

/**
 * Resolve by fetching page HTML, extracting title/author from meta tags,
 * then searching the directory for a matching podcast.
 */
async function resolveViaMetadataSearch(url: string): Promise<ResolvedPodcast | null> {
  const html = await fetchPageHtml(url);
  if (!html) return null;

  // Try RSS link first
  const rssLink = extractRssLink(html, url);
  if (rssLink) return { feedUrl: rssLink };

  // Extract metadata
  const title = extractMetaContent(html, 'og:title')
    ?? extractMetaContent(html, 'twitter:title')
    ?? extractHtmlTitle(html);
  const author = extractMetaContent(html, 'og:site_name')
    ?? extractMetaContent(html, 'author');
  const image = extractMetaContent(html, 'og:image');

  if (!title) return null;

  // Search directory for a match
  const results = await searchPodcasts(title, 'show', 10);
  if (results.length === 0) return null;

  // Find the best match (simple title similarity)
  const normalizedTitle = title.toLowerCase().trim();
  const bestMatch = results.find((r) =>
    r.feedUrl && r.title.toLowerCase().trim() === normalizedTitle,
  ) ?? results.find((r) =>
    r.feedUrl && normalizedTitle.includes(r.title.toLowerCase().trim()),
  ) ?? results.find((r) =>
    r.feedUrl && r.title.toLowerCase().trim().includes(normalizedTitle),
  ) ?? results.find((r) => r.feedUrl);

  if (!bestMatch?.feedUrl) return null;

  return {
    feedUrl: bestMatch.feedUrl,
    title: bestMatch.title ?? title ?? undefined,
    author: bestMatch.author ?? author ?? undefined,
    image: bestMatch.image ?? image ?? undefined,
  };
}

/** Generic URL: fetch and check if it's RSS content or has RSS link. */
async function resolveGenericUrl(url: string): Promise<ResolvedPodcast | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Z-Reader/1.0' },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });

  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? '';

  // If the URL is already an RSS/XML feed
  if (
    contentType.includes('application/rss+xml') ||
    contentType.includes('application/atom+xml') ||
    contentType.includes('text/xml') ||
    contentType.includes('application/xml')
  ) {
    return { feedUrl: url };
  }

  // Check HTML for RSS link
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const rssLink = extractRssLink(html, url);
    if (rssLink) return { feedUrl: rssLink };
  }

  return null;
}

// ==================== Podcast Episode URL Handling ====================

/**
 * 判断 URL 是否为播客单集链接（而非播客节目/频道链接）
 * 支持: 小宇宙 episode, Apple Podcasts episode, Spotify episode
 */
export function isPodcastEpisodeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 小宇宙: /episode/xxxxx
    if ((hostname.includes('xiaoyuzhoufm.com') || hostname.includes('xyzfm.link'))
      && pathname.startsWith('/episode/')) {
      return true;
    }

    // Apple Podcasts: /podcast/.../id12345?i=67890 (i= param indicates episode)
    if ((hostname.includes('podcasts.apple.com') || hostname.includes('itunes.apple.com'))
      && parsed.searchParams.has('i')) {
      return true;
    }

    // Spotify: /episode/xxxxx
    if ((hostname.includes('open.spotify.com') || hostname.includes('spotify.com'))
      && pathname.startsWith('/episode/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 从播客单集页面 HTML 提取元数据
 * 使用 og: meta 标签 + JSON-LD 结构化数据
 */
export async function fetchPodcastEpisodeMeta(url: string): Promise<PodcastEpisodeMeta | null> {
  const html = await fetchPageHtml(url);
  if (!html) return null;

  // 基本元数据: og: tags
  const title = extractMetaContent(html, 'og:title')
    ?? extractMetaContent(html, 'twitter:title')
    ?? extractHtmlTitle(html);
  if (!title) return null;

  const ogDescription = extractMetaContent(html, 'og:description')
    ?? extractMetaContent(html, 'description');
  const thumbnail = extractMetaContent(html, 'og:image');
  const audioUrl = extractMetaContent(html, 'og:audio');

  // JSON-LD: PodcastEpisode 结构化数据（小宇宙等平台提供）
  let showName: string | null = null;
  let duration: number | null = null;
  let publishedAt: string | null = null;
  let ldAuthor: string | null = null;
  let ldDescription: string | null = null;

  const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]) as {
        '@type'?: string;
        name?: string;
        description?: string;
        datePublished?: string;
        timeRequired?: string;
        partOfSeries?: { name?: string };
        author?: { name?: string } | string;
      };
      if (ld.description) {
        ldDescription = ld.description;
      }
      if (ld.datePublished) {
        publishedAt = ld.datePublished;
      }
      if (ld.timeRequired) {
        duration = parseIso8601Duration(ld.timeRequired);
      }
      if (ld.partOfSeries?.name) {
        showName = ld.partOfSeries.name;
      }
      if (typeof ld.author === 'string') {
        ldAuthor = ld.author;
      } else if (ld.author?.name) {
        ldAuthor = ld.author.name;
      }
    } catch {
      // JSON-LD 解析失败，继续用 meta 数据
    }
  }

  const author = ldAuthor
    ?? extractMetaContent(html, 'og:site_name')
    ?? extractMetaContent(html, 'author');

  // 优先使用 JSON-LD 中的完整单集描述，og:description 通常只是节目简介
  const fullDescription = ldDescription ?? ogDescription;

  return {
    title,
    author,
    showName,
    summary: fullDescription ? truncateText(fullDescription, 500) : null,
    content: fullDescription ?? null,
    thumbnail,
    audioUrl,
    duration,
    publishedAt,
  };
}

/** 解析 ISO 8601 duration (PT173M, PT1H30M, PT45M30S 等) 为秒数 */
function parseIso8601Duration(iso: string): number | null {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// ==================== HTML Utilities ====================

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Extract RSS feed URL from `<link rel="alternate" type="application/rss+xml">`. */
function extractRssLink(html: string, baseUrl: string): string | null {
  const linkMatch = html.match(
    /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/rss\+xml["'][^>]*>/i,
  );
  if (!linkMatch) {
    // Try reverse attribute order
    const reverseMatch = html.match(
      /<link[^>]+type=["']application\/rss\+xml["'][^>]+rel=["']alternate["'][^>]*>/i,
    );
    if (!reverseMatch) return null;
    return extractHrefFromTag(reverseMatch[0], baseUrl);
  }
  return extractHrefFromTag(linkMatch[0], baseUrl);
}

function extractHrefFromTag(tag: string, baseUrl: string): string | null {
  const hrefMatch = tag.match(/href=["']([^"']+)["']/);
  if (!hrefMatch) return null;
  const href = hrefMatch[1];
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  // Try property attribute
  const propMatch = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
  );
  if (propMatch) return propMatch[1];

  // Try name attribute
  const nameMatch = html.match(
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
  );
  if (nameMatch) return nameMatch[1];

  // Try reverse order (content before property)
  const revMatch = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  );
  return revMatch?.[1] ?? null;
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}
