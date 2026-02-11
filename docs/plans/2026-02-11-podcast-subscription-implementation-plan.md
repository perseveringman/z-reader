# Podcast Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add podcast subscriptions with search + URL resolve, podcast playback + downloads, and library categorization.

**Architecture:** RSS-first pipeline. Directory/URL resolve produce `feedUrl + metadata` and feed is created via existing `feed:add`. Backend services handle search/resolve/download/settings; renderer adds podcast manager + reader + audio player.

**Tech Stack:** Electron (main + preload), React, TypeScript, drizzle + better-sqlite3, rss-parser, vitest, @testing-library/react.

---

### Task 1: Enable TSX tests + podcast utility tests

**Files:**
- Modify: `vitest.config.ts`
- Create: `tests/podcast-utils.test.ts`
- Create: `src/main/services/podcast-utils.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import {
  parseItunesDuration,
  normalizeFeedUrl,
  mergePodcastResults,
  detectPodcastItem,
} from '../src/main/services/podcast-utils';

const sampleA = [{ title: 'Show A', author: 'A', feedUrl: 'https://a.com/rss' }];
const sampleB = [{ title: 'Show A', author: 'A', feedUrl: 'https://a.com/rss' }, { title: 'Show B', author: 'B', feedUrl: 'https://b.com/rss' }];

describe('podcast-utils', () => {
  it('parses iTunes duration formats', () => {
    expect(parseItunesDuration('01:02:03')).toBe(3723);
    expect(parseItunesDuration('12:34')).toBe(754);
    expect(parseItunesDuration('90')).toBe(90);
  });

  it('normalizes feed url for dedupe', () => {
    expect(normalizeFeedUrl('https://a.com/rss/')).toBe('https://a.com/rss');
  });

  it('merges podcast results by feedUrl', () => {
    const merged = mergePodcastResults(sampleA, sampleB);
    expect(merged).toHaveLength(2);
  });

  it('detects podcast item when enclosure present', () => {
    expect(detectPodcastItem({ enclosure: { url: 'https://a.com/ep.mp3' } })).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/podcast-utils.test.ts`
Expected: FAIL (module not found or missing functions)

**Step 3: Write minimal implementation**

```typescript
export function parseItunesDuration(input: string | undefined | null): number | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function normalizeFeedUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export interface PodcastSearchResult {
  title: string;
  author: string;
  feedUrl?: string;
  image?: string;
  source?: string;
}

export function mergePodcastResults(a: PodcastSearchResult[], b: PodcastSearchResult[]) {
  const map = new Map<string, PodcastSearchResult>();
  for (const item of [...a, ...b]) {
    const key = normalizeFeedUrl(item.feedUrl) ?? `${item.title}:${item.author}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

export function detectPodcastItem(item: { enclosure?: { url?: string } | null; itunes?: unknown }): boolean {
  if (item.enclosure?.url) return true;
  if (item.itunes) return true;
  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/podcast-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add vitest.config.ts tests/podcast-utils.test.ts src/main/services/podcast-utils.ts
git commit -m "test: add podcast utils and helpers"
```

---

### Task 2: Add DB columns + downloads table + migration tests

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/index.ts`
- Create: `tests/db-migrations.test.ts`

**Step 1: Write the failing test**

```typescript
/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from '../src/main/db/index';

function getColumns(db: Database.Database, table: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row: any) => row.name);
}

describe('db migrations', () => {
  it('adds podcast audio fields and downloads table', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const articleCols = getColumns(db, 'articles');
    expect(articleCols).toContain('audio_url');
    expect(articleCols).toContain('audio_mime');
    expect(articleCols).toContain('audio_bytes');
    expect(articleCols).toContain('audio_duration');
    expect(articleCols).toContain('episode_number');
    expect(articleCols).toContain('season_number');
    const downloadCols = getColumns(db, 'downloads');
    expect(downloadCols).toContain('article_id');
    expect(downloadCols).toContain('file_path');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/db-migrations.test.ts`
Expected: FAIL (applyMigrations missing or columns not present)

**Step 3: Write minimal implementation**

```typescript
// src/main/db/schema.ts
export const articles = sqliteTable('articles', {
  // ...existing columns...
  audioUrl: text('audio_url'),
  audioMime: text('audio_mime'),
  audioBytes: integer('audio_bytes'),
  audioDuration: integer('audio_duration'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
});

export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  filePath: text('file_path').notNull(),
  bytes: integer('bytes'),
  status: text('status').notNull(),
  addedAt: text('added_at').notNull(),
  lastAccessedAt: text('last_accessed_at'),
});
```

```typescript
// src/main/db/index.ts
export function applyMigrations(sqlite: Database.Database) {
  // existing CREATE TABLES
  // ...
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_url TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_mime TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_bytes INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN audio_duration INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN episode_number INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE articles ADD COLUMN season_number INTEGER`); } catch {}

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      article_id TEXT REFERENCES articles(id),
      file_path TEXT NOT NULL,
      bytes INTEGER,
      status TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_accessed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_article_id ON downloads(article_id);
  `);
}

function initTables(sqlite: Database.Database) {
  // existing schema creation
  // ...
  applyMigrations(sqlite);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/db-migrations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/db/schema.ts src/main/db/index.ts tests/db-migrations.test.ts
git commit -m "feat: add podcast audio fields and downloads table"
```

---

### Task 3: Add IPC channels + shared types + tests

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts`
- Create: `tests/ipc-channels.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc-channels';

describe('ipc channels', () => {
  it('includes podcast/search + download + settings channels', () => {
    expect(IPC_CHANNELS.PODCAST_SEARCH).toBe('podcast:search');
    expect(IPC_CHANNELS.PODCAST_RESOLVE_URL).toBe('podcast:resolveUrl');
    expect(IPC_CHANNELS.DOWNLOAD_START).toBe('download:start');
    expect(IPC_CHANNELS.SETTINGS_GET).toBe('settings:get');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: FAIL (fields missing)

**Step 3: Write minimal implementation**

```typescript
// src/shared/ipc-channels.ts
PODCAST_SEARCH: 'podcast:search',
PODCAST_RESOLVE_URL: 'podcast:resolveUrl',
DOWNLOAD_START: 'download:start',
DOWNLOAD_CANCEL: 'download:cancel',
DOWNLOAD_LIST: 'download:list',
DOWNLOAD_STATUS: 'download:status',
SETTINGS_GET: 'settings:get',
SETTINGS_SET: 'settings:set',
```

```typescript
// src/shared/types.ts
export interface PodcastSearchResult {
  title: string;
  author: string;
  feedUrl?: string;
  image?: string;
  website?: string;
  source: 'itunes' | 'podcast-index';
}

export interface PodcastSearchResponse {
  results: PodcastSearchResult[];
}

export interface PodcastResolveResult {
  feedUrl: string;
  title?: string;
  author?: string;
  image?: string;
}

export type DownloadStatus = 'queued' | 'downloading' | 'ready' | 'failed';

export interface DownloadItem {
  id: string;
  articleId: string;
  filePath: string;
  bytes: number | null;
  status: DownloadStatus;
  addedAt: string;
  lastAccessedAt: string | null;
}

export interface AppSettings {
  podcastIndexApiKey?: string;
  podcastDownloadDir?: string;
  podcastDownloadLimitBytes?: number;
}

// Extend ElectronAPI
podcastSearch: (query: string, type: 'show' | 'episode') => Promise<PodcastSearchResponse>;
podcastResolveUrl: (url: string) => Promise<PodcastResolveResult>;
settingsGet: () => Promise<AppSettings>;
settingsSet: (input: AppSettings) => Promise<AppSettings>;
downloadStart: (articleId: string) => Promise<DownloadItem>;
downloadCancel: (downloadId: string) => Promise<void>;
downloadList: () => Promise<DownloadItem[]>;
downloadStatus: (downloadId: string) => Promise<DownloadItem | null>;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts tests/ipc-channels.test.ts
git commit -m "feat: add podcast ipc channels and types"
```

---

### Task 4: Implement podcast directory search service

**Files:**
- Create: `src/main/services/podcast-directory-service.ts`
- Create: `tests/podcast-directory-service.test.ts`

**Step 1: Write the failing test**

```typescript
/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { createPodcastDirectoryClient } from '../src/main/services/podcast-directory-service';

const itunesResponse = {
  results: [
    { collectionName: 'Show A', artistName: 'Author A', feedUrl: 'https://a.com/rss', artworkUrl600: 'https://a.com/img.jpg' },
  ],
};

const podcastIndexResponse = {
  feeds: [
    { title: 'Show B', author: 'Author B', url: 'https://b.com/rss', image: 'https://b.com/img.jpg' },
  ],
};

describe('podcast directory', () => {
  it('merges itunes + podcast index when key exists', async () => {
    const fetchMock = async (url: string) => {
      if (url.includes('itunes')) return { ok: true, json: async () => itunesResponse } as any;
      return { ok: true, json: async () => podcastIndexResponse } as any;
    };
    const client = createPodcastDirectoryClient({ fetch: fetchMock, podcastIndexKey: 'key' });
    const res = await client.search('test', 'show');
    expect(res.results).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/podcast-directory-service.test.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```typescript
import type { PodcastSearchResponse, PodcastSearchResult } from '../../shared/types';
import { mergePodcastResults } from './podcast-utils';

interface DirectoryClientOptions {
  fetch: typeof fetch;
  podcastIndexKey?: string;
}

export function createPodcastDirectoryClient({ fetch, podcastIndexKey }: DirectoryClientOptions) {
  async function searchItunes(query: string): Promise<PodcastSearchResult[]> {
    const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&term=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.collectionName,
      author: r.artistName,
      feedUrl: r.feedUrl,
      image: r.artworkUrl600,
      website: r.collectionViewUrl,
      source: 'itunes',
    }));
  }

  async function searchPodcastIndex(query: string): Promise<PodcastSearchResult[]> {
    if (!podcastIndexKey) return [];
    const url = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'X-Auth-Key': podcastIndexKey },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.feeds || []).map((f: any) => ({
      title: f.title,
      author: f.author,
      feedUrl: f.url,
      image: f.image,
      website: f.link,
      source: 'podcast-index',
    }));
  }

  async function search(query: string, type: 'show' | 'episode'): Promise<PodcastSearchResponse> {
    const [itunes, index] = await Promise.all([
      searchItunes(query),
      searchPodcastIndex(query),
    ]);
    return { results: mergePodcastResults(itunes, index) };
  }

  return { search };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/podcast-directory-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/podcast-directory-service.ts tests/podcast-directory-service.test.ts
git commit -m "feat: add podcast directory search service"
```

---

### Task 5: Implement podcast URL resolver (Apple/Spotify/小宇宙)

**Files:**
- Create: `src/main/services/podcast-resolver.ts`
- Create: `tests/podcast-resolver.test.ts`

**Step 1: Write the failing test**

```typescript
/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { resolvePodcastUrlFromHtml, resolveAppleShowId } from '../src/main/services/podcast-resolver';

describe('podcast resolver', () => {
  it('extracts RSS link from html', () => {
    const html = '<link rel="alternate" type="application/rss+xml" href="https://a.com/rss">';
    expect(resolvePodcastUrlFromHtml(html)).toBe('https://a.com/rss');
  });

  it('extracts apple show id', () => {
    const url = 'https://podcasts.apple.com/us/podcast/foo/id123456789';
    expect(resolveAppleShowId(url)).toBe('123456789');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/podcast-resolver.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
export function resolvePodcastUrlFromHtml(html: string): string | null {
  const match = html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export function resolveAppleShowId(url: string): string | null {
  const match = url.match(/id(\d+)/);
  return match?.[1] ?? null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/podcast-resolver.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/podcast-resolver.ts tests/podcast-resolver.test.ts
git commit -m "feat: add podcast url resolver helpers"
```

---

### Task 6: Extend RSS fetch for podcast fields

**Files:**
- Modify: `src/main/services/rss-service.ts`
- Modify: `src/main/services/podcast-utils.ts`
- Create: `tests/rss-podcast-mapping.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mapPodcastFields } from '../src/main/services/podcast-utils';

describe('rss podcast mapping', () => {
  it('maps enclosure + itunes duration', () => {
    const item: any = {
      enclosure: { url: 'https://a.com/ep.mp3', type: 'audio/mpeg', length: '123' },
      itunes: { duration: '00:01:30' },
    };
    const result = mapPodcastFields(item);
    expect(result.audioUrl).toBe('https://a.com/ep.mp3');
    expect(result.audioMime).toBe('audio/mpeg');
    expect(result.audioBytes).toBe(123);
    expect(result.audioDuration).toBe(90);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/rss-podcast-mapping.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/main/services/podcast-utils.ts
export function mapPodcastFields(item: any) {
  const audioUrl = item.enclosure?.url ?? null;
  const audioMime = item.enclosure?.type ?? null;
  const audioBytes = item.enclosure?.length ? Number(item.enclosure.length) : null;
  const audioDuration = parseItunesDuration(item.itunes?.duration) ?? null;
  return { audioUrl, audioMime, audioBytes, audioDuration };
}
```

```typescript
// src/main/services/rss-service.ts
const isPodcastFeed = feedType === 'podcast';
const podcastFields = mapPodcastFields(item);

await db.insert(schema.articles).values({
  // ...existing fields...
  mediaType: isYouTubeFeed ? 'video' : isPodcastFeed ? 'podcast' : 'article',
  audioUrl: isPodcastFeed ? podcastFields.audioUrl : null,
  audioMime: isPodcastFeed ? podcastFields.audioMime : null,
  audioBytes: isPodcastFeed ? podcastFields.audioBytes : null,
  audioDuration: isPodcastFeed ? podcastFields.audioDuration : null,
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/rss-podcast-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/rss-service.ts src/main/services/podcast-utils.ts tests/rss-podcast-mapping.test.ts
git commit -m "feat: map podcast enclosure fields in rss service"
```

---

### Task 7: Add settings service (Podcast Index key + downloads)

**Files:**
- Create: `src/main/services/settings-service.ts`
- Create: `src/main/ipc/settings-handlers.ts`
- Modify: `src/main/ipc/index.ts`
- Create: `tests/settings-service.test.ts`

**Step 1: Write the failing test**

```typescript
/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { createSettingsStore } from '../src/main/services/settings-service';

const tempPath = 'tmp-settings.json';

describe('settings service', () => {
  it('saves and loads app settings', async () => {
    const store = createSettingsStore({ filePath: tempPath });
    await store.set({ podcastIndexApiKey: 'abc', podcastDownloadLimitBytes: 123 });
    const value = await store.get();
    expect(value.podcastIndexApiKey).toBe('abc');
    expect(value.podcastDownloadLimitBytes).toBe(123);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/settings-service.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { AppSettings } from '../../shared/types';

interface SettingsStoreOptions { filePath: string; }

export function createSettingsStore({ filePath }: SettingsStoreOptions) {
  async function get(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as AppSettings;
    } catch {
      return {};
    }
  }

  async function set(next: AppSettings): Promise<AppSettings> {
    const current = await get();
    const merged = { ...current, ...next };
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }

  return { get, set };
}
```

```typescript
// src/main/ipc/settings-handlers.ts
import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { createSettingsStore } from '../services/settings-service';
import { join } from 'node:path';

const store = createSettingsStore({ filePath: join(app.getPath('userData'), 'settings.json') });

export function registerSettingsHandlers() {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => store.get());
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, input) => store.set(input));
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/settings-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/settings-service.ts src/main/ipc/settings-handlers.ts src/main/ipc/index.ts tests/settings-service.test.ts
git commit -m "feat: add settings store for podcast config"
```

---

### Task 8: Add download service + IPC handlers

**Files:**
- Create: `src/main/services/download-service.ts`
- Create: `src/main/ipc/download-handlers.ts`
- Modify: `src/main/ipc/index.ts`
- Create: `tests/download-service.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { enforceDownloadLimit } from '../src/main/services/download-service';

const items = [
  { id: '1', bytes: 200, lastAccessedAt: '2026-02-10T00:00:00Z' },
  { id: '2', bytes: 200, lastAccessedAt: '2026-02-11T00:00:00Z' },
];

describe('download cleanup', () => {
  it('evicts oldest when over limit', () => {
    const evicted = enforceDownloadLimit(items as any, 300);
    expect(evicted).toEqual(['1']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/download-service.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
export function enforceDownloadLimit(items: { id: string; bytes: number; lastAccessedAt: string }[], limitBytes: number) {
  let total = items.reduce((sum, item) => sum + item.bytes, 0);
  if (total <= limitBytes) return [] as string[];
  const sorted = [...items].sort((a, b) => new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime());
  const evicted: string[] = [];
  for (const item of sorted) {
    if (total <= limitBytes) break;
    total -= item.bytes;
    evicted.push(item.id);
  }
  return evicted;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/download-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/download-service.ts src/main/ipc/download-handlers.ts src/main/ipc/index.ts tests/download-service.test.ts
git commit -m "feat: add download service and cleanup logic"
```

---

### Task 9: Wire IPC in preload + renderer API

**Files:**
- Modify: `src/preload.ts`
- Modify: `src/shared/types.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc-channels';

describe('ipc channels for preload', () => {
  it('defines podcast resolve channel', () => {
    expect(IPC_CHANNELS.PODCAST_RESOLVE_URL).toBe('podcast:resolveUrl');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: PASS (already covered), if not, fix

**Step 3: Write minimal implementation**

```typescript
// src/preload.ts
podcastSearch: (query, type) => ipcRenderer.invoke(IPC_CHANNELS.PODCAST_SEARCH, query, type),
podcastResolveUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.PODCAST_RESOLVE_URL, url),
settingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
settingsSet: (input) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, input),
downloadStart: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, articleId),
downloadCancel: (downloadId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, downloadId),
downloadList: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_LIST),
downloadStatus: (downloadId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_STATUS, downloadId),
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/preload.ts src/shared/types.ts
git commit -m "feat: expose podcast/search/settings/download ipc"
```

---

### Task 10: Add podcast UI entry + search/subscribe flow

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/AddFeedDialog.tsx`
- Create: `src/renderer/components/PodcastManager.tsx`
- Create: `src/renderer/components/PodcastSearchPanel.tsx`
- Create: `tests/podcast-search-panel.test.tsx`

**Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PodcastSearchPanel } from '../src/renderer/components/PodcastSearchPanel';

describe('PodcastSearchPanel', () => {
  it('renders results and invokes subscribe', () => {
    const results = [{ title: 'Show A', author: 'A', feedUrl: 'https://a.com/rss', source: 'itunes' }];
    const onSubscribe = vi.fn();
    render(<PodcastSearchPanel results={results as any} onSubscribe={onSubscribe} />);
    fireEvent.click(screen.getByText('Subscribe'));
    expect(onSubscribe).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/podcast-search-panel.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/renderer/components/PodcastSearchPanel.tsx
import type { PodcastSearchResult } from '../../shared/types';

interface PodcastSearchPanelProps {
  results: PodcastSearchResult[];
  onSubscribe: (result: PodcastSearchResult) => void;
}

export function PodcastSearchPanel({ results, onSubscribe }: PodcastSearchPanelProps) {
  return (
    <div className="space-y-3">
      {results.map((r) => (
        <div key={r.feedUrl ?? r.title} className="flex items-center gap-3 p-3 rounded bg-white/5">
          <div className="flex-1">
            <div className="text-sm text-white">{r.title}</div>
            <div className="text-xs text-gray-400">{r.author}</div>
          </div>
          <button className="text-xs px-3 py-1 bg-blue-600 rounded" onClick={() => onSubscribe(r)}>
            Subscribe
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/podcast-search-panel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/PodcastSearchPanel.tsx tests/podcast-search-panel.test.tsx

git commit -m "feat: add podcast search panel"
```

---

### Task 11: Add podcast reader + audio player

**Files:**
- Create: `src/renderer/components/AudioPlayer.tsx`
- Create: `src/renderer/components/PodcastReaderView.tsx`
- Create: `tests/audio-player.test.tsx`

**Step 1: Write the failing test**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AudioPlayer } from '../src/renderer/components/AudioPlayer';

describe('AudioPlayer', () => {
  it('toggles play state', () => {
    render(<AudioPlayer src="https://a.com/ep.mp3" title="Ep" onProgress={() => {}} />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/audio-player.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/renderer/components/AudioPlayer.tsx
import { useRef, useState } from 'react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  onProgress: (value: number, duration: number) => void;
}

export function AudioPlayer({ src, title, onProgress }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div className="p-4 bg-[#111] rounded">
      <div className="text-sm text-white mb-2">{title}</div>
      <button aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} className="px-3 py-1 bg-blue-600 rounded">
        {playing ? 'Pause' : 'Play'}
      </button>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          onProgress(el.currentTime, el.duration || 0);
        }}
      />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/audio-player.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/AudioPlayer.tsx src/renderer/components/PodcastReaderView.tsx tests/audio-player.test.tsx
git commit -m "feat: add podcast reader and audio player"
```

---

### Task 12: Hook routing + sidebar + feed add

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/AddFeedDialog.tsx`
- Modify: `src/main/ipc/feed-handlers.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc-channels';

describe('podcast routing', () => {
  it('has podcast search channel', () => {
    expect(IPC_CHANNELS.PODCAST_SEARCH).toBe('podcast:search');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: PASS (already)

**Step 3: Write minimal implementation**

```typescript
// App.tsx: use PodcastReaderView when mediaType === 'podcast'
{readerMode && readerMediaType === 'podcast' && readerArticleId ? (
  <PodcastReaderView articleId={readerArticleId} onClose={handleCloseReader} />
) : null}
```

```typescript
// Sidebar.tsx: add Podcasts entry
<NavItem
  label="Podcasts"
  active={activeView === 'manage-podcasts'}
  onClick={() => onViewChange('manage-podcasts')}
/>
```

```typescript
// AddFeedDialog.tsx: add tab for Podcasts, call podcastSearch + podcastResolveUrl
// (Full UI wiring done in implementation steps)
```

```typescript
// feed-handlers.ts: allow optional feedType
let feedType = input.feedType ?? 'rss';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest tests/ipc-channels.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Sidebar.tsx src/renderer/components/AddFeedDialog.tsx src/main/ipc/feed-handlers.ts
git commit -m "feat: add podcast routing and subscription entry"
```

---

## Manual Verification Checklist

- Add podcast via search in Add Feed → appears in Feed list with podcast label
- Play episode → progress updates; at 90% marked seen
- Save to Library → appears in Library > Podcasts
- Download episode → file created in configured directory; limit evicts oldest
- Resolve Apple/Spotify/小宇宙 URL successfully

---

Plan complete and saved to `docs/plans/2026-02-11-podcast-subscription-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate, uses executing-plans)

Which approach?
