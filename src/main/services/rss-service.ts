import Parser from 'rss-parser';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '../db';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Z-Reader/1.0',
  },
  customFields: {
    feed: [
      ['itunes:author', 'itunesAuthor'] as unknown as string,
      ['itunes:image', 'itunesImage'] as unknown as string,
    ],
    item: [
      ['content:encoded', 'contentEncoded'] as unknown as string,
      ['yt:videoId', 'ytVideoId'] as unknown as string,
      ['itunes:duration', 'itunesDuration'] as unknown as string,
      ['itunes:episode', 'itunesEpisode'] as unknown as string,
      ['itunes:season', 'itunesSeason'] as unknown as string,
      ['itunes:image', 'itunesImage'] as unknown as string,
      ['itunes:author', 'itunesAuthor'] as unknown as string,
    ],
  },
});

function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

type RssItem = Parser.Item & {
  contentEncoded?: string;
  id?: string;
  author?: string;
  ytVideoId?: string;
  itunesDuration?: string;
  itunesEpisode?: string;
  itunesSeason?: string;
  itunesImage?: string | { $: { href: string } };
  itunesAuthor?: string;
};

function extractThumbnail(item: RssItem, isPodcast: boolean): string | null {
  // For podcasts, prefer itunes:image
  if (isPodcast && item.itunesImage) {
    if (typeof item.itunesImage === 'string') return item.itunesImage;
    if (item.itunesImage.$?.href) return item.itunesImage.$.href;
  }
  // For non-podcasts, enclosure is often an image thumbnail
  if (!isPodcast && item.enclosure?.url) return item.enclosure.url;
  const content = item.contentEncoded ?? item.content ?? '';
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/);
  return match?.[1] ?? null;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Detect if a parsed RSS feed is a podcast feed.
 * A feed is a podcast if any item has an audio enclosure or if the feed uses iTunes namespace.
 */
function isPodcastFeed(parsed: { items: Parser.Item[] }, xml: string): boolean {
  // Check for iTunes namespace in XML
  if (xml.includes('xmlns:itunes') || xml.includes('itunes:')) return true;
  // Check for audio enclosures in items
  return parsed.items.some((item) => {
    const enc = item.enclosure;
    return enc?.url && enc.type?.startsWith('audio/');
  });
}

/** Parse itunes:duration string to seconds. Supports HH:MM:SS, MM:SS, or raw seconds. */
function parseDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Pure numeric: treat as seconds
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export interface FetchResult {
  feedId: string;
  feedTitle: string | null;
  newArticles: number;
  error?: string;
}

export async function fetchFeed(feedId: string): Promise<FetchResult> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, feedId));
  if (!feed) throw new Error(`Feed not found: ${feedId}`);

  const feedType = feed.feedType ?? 'rss';
  const isYouTubeFeed = feedType === 'youtube';

  try {
    const requestHeaders: Record<string, string> = {};
    if (feed.etag) requestHeaders['If-None-Match'] = feed.etag;
    if (feed.lastModified) requestHeaders['If-Modified-Since'] = feed.lastModified;

    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'Z-Reader/1.0', ...requestHeaders },
    });

    if (response.status === 304) {
      await db.update(schema.feeds).set({
        lastFetchedAt: now,
        updatedAt: now,
      }).where(eq(schema.feeds.id, feedId));
      return { feedId, feedTitle: feed.title, newArticles: 0 };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = await parser.parseString(xml);

    const newEtag = response.headers.get('etag') ?? null;
    const newLastModified = response.headers.get('last-modified') ?? null;

    // Detect podcast feeds and auto-set feedType
    const isPodcast = feedType === 'podcast' || isPodcastFeed(parsed, xml);
    if (isPodcast && feedType !== 'podcast') {
      await db.update(schema.feeds).set({ feedType: 'podcast' }).where(eq(schema.feeds.id, feedId));
    }

    let newArticles = 0;

    for (const rawItem of parsed.items) {
      const item = rawItem as RssItem;
      const guid = item.guid ?? item.id ?? null;
      const articleUrl = item.link ?? null;

      const existing = await db.select({ id: schema.articles.id })
        .from(schema.articles)
        .where(
          guid
            ? eq(schema.articles.guid, guid)
            : and(
                eq(schema.articles.url, articleUrl ?? ''),
                eq(schema.articles.feedId, feedId),
              ),
        )
        .limit(1);

      if (existing.length > 0) continue;

      const rawContent = item.contentEncoded ?? item.content ?? '';
      const contentText = stripHtml(rawContent);
      const summary = item.contentSnippet
        ? truncate(item.contentSnippet, 500)
        : truncate(contentText, 500);
      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.max(1, Math.round(wordCount / 200));

      // Podcast-specific fields
      const enclosure = item.enclosure;
      const isAudioEnclosure = enclosure?.url && enclosure.type?.startsWith('audio/');
      const audioUrl = isPodcast && isAudioEnclosure ? enclosure.url : null;
      const audioMime = isPodcast && isAudioEnclosure ? (enclosure.type ?? null) : null;
      const audioBytes = isPodcast && isAudioEnclosure && enclosure.length
        ? parseInt(String(enclosure.length), 10) || null
        : null;
      const audioDuration = isPodcast ? parseDuration(item.itunesDuration) : null;
      const episodeNumber = isPodcast && item.itunesEpisode
        ? parseInt(item.itunesEpisode, 10) || null
        : null;
      const seasonNumber = isPodcast && item.itunesSeason
        ? parseInt(item.itunesSeason, 10) || null
        : null;

      // Determine media type
      let mediaType = 'article';
      if (isYouTubeFeed) mediaType = 'video';
      else if (isPodcast) mediaType = 'podcast';

      await db.insert(schema.articles).values({
        id: randomUUID(),
        feedId,
        guid,
        url: articleUrl,
        title: item.title ?? null,
        author: item.creator ?? (item.author as string | undefined) ?? item.itunesAuthor ?? null,
        summary,
        content: rawContent || null,
        contentText: contentText || null,
        thumbnail: isYouTubeFeed && (item as RssItem).ytVideoId
          ? `https://i.ytimg.com/vi/${(item as RssItem).ytVideoId}/hqdefault.jpg`
          : extractThumbnail(item, isPodcast),
        wordCount,
        readingTime,
        publishedAt: item.isoDate ?? null,
        savedAt: now,
        readStatus: 'unseen',
        source: 'feed',
        domain: isYouTubeFeed ? 'youtube.com' : extractDomain(articleUrl ?? undefined),
        mediaType,
        videoId: isYouTubeFeed ? (item as RssItem).ytVideoId ?? null : null,
        duration: audioDuration ?? null,
        audioUrl,
        audioMime,
        audioBytes,
        audioDuration,
        episodeNumber,
        seasonNumber,
        createdAt: now,
        updatedAt: now,
      });

      newArticles++;
    }

    const feedTitle = parsed.title ?? feed.title;
    await db.update(schema.feeds).set({
      title: feed.title ?? feedTitle ?? null,
      description: feed.description ?? parsed.description ?? null,
      etag: newEtag,
      lastModified: newLastModified,
      lastFetchedAt: now,
      errorCount: 0,
      updatedAt: now,
    }).where(eq(schema.feeds.id, feedId));

    return { feedId, feedTitle: feedTitle ?? null, newArticles };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.update(schema.feeds).set({
      errorCount: (feed.errorCount ?? 0) + 1,
      lastFetchedAt: now,
      updatedAt: now,
    }).where(eq(schema.feeds.id, feedId));
    return { feedId, feedTitle: feed.title, newArticles: 0, error: errorMessage };
  }
}

export async function fetchAllFeeds(): Promise<FetchResult[]> {
  const db = getDatabase();
  const feeds = await db.select()
    .from(schema.feeds)
    .where(eq(schema.feeds.deletedFlg, 0));

  const results: FetchResult[] = [];
  for (const feed of feeds) {
    const result = await fetchFeed(feed.id);
    results.push(result);
  }
  return results;
}

export async function importOpml(opmlXml: string) {
  const db = getDatabase();
  const now = new Date().toISOString();

  const outlineRegex = /<outline[^>]*\/?>/gi;
  const attrRegex = /(\w+)=["']([^"']*?)["']/g;

  const createdFeeds: Array<typeof schema.feeds.$inferSelect> = [];
  let match: RegExpExecArray | null;

  while ((match = outlineRegex.exec(opmlXml)) !== null) {
    const tag = match[0];
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(tag)) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }

    const xmlUrl = attrs.xmlurl;
    if (!xmlUrl) continue;

    const existing = await db.select({ id: schema.feeds.id })
      .from(schema.feeds)
      .where(eq(schema.feeds.url, xmlUrl))
      .limit(1);

    if (existing.length > 0) continue;

    const id = randomUUID();
    await db.insert(schema.feeds).values({
      id,
      url: xmlUrl,
      title: attrs.title || attrs.text || null,
      category: attrs.category || null,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));
    if (created) createdFeeds.push(created);
  }

  return createdFeeds;
}

let fetchTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduledFetch(intervalMinutes: number): () => void {
  if (fetchTimer) clearInterval(fetchTimer);
  const ms = intervalMinutes * 60 * 1000;
  fetchTimer = setInterval(() => {
    fetchAllFeeds().catch(console.error);
  }, ms);
  return () => {
    if (fetchTimer) {
      clearInterval(fetchTimer);
      fetchTimer = null;
    }
  };
}
