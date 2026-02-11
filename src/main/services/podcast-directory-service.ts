import { createHash } from 'node:crypto';
import type { PodcastSearchResult, PodcastSearchType } from '../../shared/types';

// ==================== iTunes Search API ====================

interface ITunesResult {
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  feedUrl?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  kind?: string;
}

async function searchItunes(
  query: string,
  type: PodcastSearchType,
  limit: number,
): Promise<PodcastSearchResult[]> {
  const entity = type === 'episode' ? 'podcastEpisode' : 'podcast';
  const params = new URLSearchParams({
    term: query,
    entity,
    limit: String(limit),
    media: 'podcast',
  });

  const res = await fetch(`https://itunes.apple.com/search?${params}`, {
    headers: { 'User-Agent': 'Z-Reader/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);

  const data = (await res.json()) as { results: ITunesResult[] };

  return data.results.map((r) => ({
    title: r.collectionName ?? r.trackName ?? '',
    author: r.artistName ?? null,
    image: r.artworkUrl600 ?? r.artworkUrl100 ?? null,
    feedUrl: r.feedUrl ?? null,
    website: r.collectionViewUrl ?? r.trackViewUrl ?? null,
    source: 'itunes' as const,
    id: String(r.collectionId ?? r.trackId ?? ''),
  }));
}

// ==================== Podcast Index API ====================

interface PodcastIndexResult {
  id: number;
  title: string;
  author?: string;
  image?: string;
  url?: string; // RSS feed URL
  link?: string; // website
  originalUrl?: string;
}

async function searchPodcastIndex(
  query: string,
  type: PodcastSearchType,
  limit: number,
  apiKey: string,
  apiSecret: string,
): Promise<PodcastSearchResult[]> {
  const now = Math.floor(Date.now() / 1000);
  const authHash = createHash('sha1')
    .update(`${apiKey}${apiSecret}${now}`)
    .digest('hex');

  const endpoint = type === 'episode'
    ? 'https://api.podcastindex.org/api/1.0/search/byterm'
    : 'https://api.podcastindex.org/api/1.0/search/byterm';

  const params = new URLSearchParams({
    q: query,
    max: String(limit),
  });

  const res = await fetch(`${endpoint}?${params}`, {
    headers: {
      'User-Agent': 'Z-Reader/1.0',
      'X-Auth-Date': String(now),
      'X-Auth-Key': apiKey,
      'Authorization': authHash,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Podcast Index API error: ${res.status}`);

  const data = (await res.json()) as { feeds?: PodcastIndexResult[] };
  const feeds = data.feeds ?? [];

  return feeds.map((f) => ({
    title: f.title,
    author: f.author ?? null,
    image: f.image ?? null,
    feedUrl: f.url ?? f.originalUrl ?? null,
    website: f.link ?? null,
    source: 'podcastindex' as const,
    id: String(f.id),
  }));
}

// ==================== iTunes Lookup (by Apple Podcasts ID) ====================

export async function itunesLookup(itunesId: string): Promise<{
  feedUrl: string | null;
  title: string | null;
  author: string | null;
  image: string | null;
}> {
  const params = new URLSearchParams({
    id: itunesId,
    entity: 'podcast',
  });

  const res = await fetch(`https://itunes.apple.com/lookup?${params}`, {
    headers: { 'User-Agent': 'Z-Reader/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`iTunes Lookup error: ${res.status}`);

  const data = (await res.json()) as { results: ITunesResult[] };
  const r = data.results[0];
  if (!r) return { feedUrl: null, title: null, author: null, image: null };

  return {
    feedUrl: r.feedUrl ?? null,
    title: r.collectionName ?? null,
    author: r.artistName ?? null,
    image: r.artworkUrl600 ?? r.artworkUrl100 ?? null,
  };
}

// ==================== Merged Search ====================

/** Deduplicate results by feedUrl, preferring the first occurrence. */
function deduplicateByFeedUrl(results: PodcastSearchResult[]): PodcastSearchResult[] {
  const seen = new Set<string>();
  const deduped: PodcastSearchResult[] = [];
  for (const r of results) {
    const key = r.feedUrl ?? `__no_feed_${r.id}_${r.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  return deduped;
}

export interface DirectorySearchOptions {
  podcastIndexApiKey?: string;
  podcastIndexApiSecret?: string;
}

/**
 * Search podcast directories. Uses iTunes by default.
 * If Podcast Index API credentials are provided, searches both in parallel and merges.
 */
export async function searchPodcasts(
  query: string,
  type: PodcastSearchType = 'show',
  limit = 20,
  options?: DirectorySearchOptions,
): Promise<PodcastSearchResult[]> {
  const searches: Promise<PodcastSearchResult[]>[] = [
    searchItunes(query, type, limit).catch((err) => {
      console.error('iTunes search failed:', err);
      return [] as PodcastSearchResult[];
    }),
  ];

  if (options?.podcastIndexApiKey && options?.podcastIndexApiSecret) {
    searches.push(
      searchPodcastIndex(
        query,
        type,
        limit,
        options.podcastIndexApiKey,
        options.podcastIndexApiSecret,
      ).catch((err) => {
        console.error('Podcast Index search failed:', err);
        return [] as PodcastSearchResult[];
      }),
    );
  }

  const results = await Promise.all(searches);
  const merged = results.flat();
  return deduplicateByFeedUrl(merged);
}
