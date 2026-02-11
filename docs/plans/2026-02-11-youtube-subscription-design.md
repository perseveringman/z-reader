# YouTube 订阅与阅读能力 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Z-Reader 增加 YouTube 频道订阅能力，用户粘贴频道 URL 即可订阅，视频以嵌入播放器 + 字幕同步的方式阅读。

**Architecture:** 复用现有 article 体系，通过 `mediaType` 字段区分内容类型。新增 `youtube-service.ts` 处理频道 URL 解析和字幕获取，新增 `VideoPlayer` 和 `TranscriptView` 组件实现视频阅读体验。Library 侧栏已有 Videos 入口，需要接通 `mediaType` 筛选。

**Tech Stack:** `youtubei.js`（字幕提取），YouTube IFrame Player API（视频嵌入），现有 `rss-parser`（YouTube RSS 解析）

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 youtubei.js**

```bash
pnpm add youtubei.js
```

**Step 2: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 安装 youtubei.js 依赖"
```

---

### Task 2: 数据库 Schema 扩展

**Files:**
- Modify: `src/main/db/schema.ts` — 在 articles 表添加 `mediaType`, `videoId`, `duration` 字段；在 feeds 表添加 `feedType` 字段；新增 `transcripts` 表
- Modify: `src/main/db/index.ts` — 添加 migration SQL

**Step 1: 修改 schema.ts**

在 `feeds` 表添加:
```typescript
feedType: text('feed_type').default('rss'),
```

在 `articles` 表添加:
```typescript
mediaType: text('media_type').default('article'),
videoId: text('video_id'),
duration: integer('duration'),
```

新增 transcripts 表:
```typescript
export const transcripts = sqliteTable('transcripts', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  segments: text('segments'), // JSON: [{start, end, text}]
  language: text('language'),
  createdAt: text('created_at').notNull(),
});
```

**Step 2: 修改 db/index.ts — 添加 migration**

在 `initTables` 函数末尾追加 migration:
```typescript
// Migration: articles 表新增 YouTube 相关字段
try {
  sqlite.exec(`ALTER TABLE articles ADD COLUMN media_type TEXT DEFAULT 'article'`);
} catch { /* Column already exists */ }
try {
  sqlite.exec(`ALTER TABLE articles ADD COLUMN video_id TEXT`);
} catch { /* Column already exists */ }
try {
  sqlite.exec(`ALTER TABLE articles ADD COLUMN duration INTEGER`);
} catch { /* Column already exists */ }
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_articles_media_type ON articles(media_type)`);

// Migration: feeds 表新增 feed_type 字段
try {
  sqlite.exec(`ALTER TABLE feeds ADD COLUMN feed_type TEXT DEFAULT 'rss'`);
} catch { /* Column already exists */ }

// Migration: transcripts 表
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    article_id TEXT REFERENCES articles(id),
    segments TEXT,
    language TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transcripts_article_id ON transcripts(article_id);
`);
```

**Step 3: 验证应用启动无报错**

```bash
pnpm start
```
预期: 应用正常启动，SQLite 数据库迁移自动执行。

**Step 4: 提交**

```bash
git add src/main/db/schema.ts src/main/db/index.ts
git commit -m "feat(db): 添加 YouTube 相关字段和 transcripts 表"
```

---

### Task 3: 共享类型扩展

**Files:**
- Modify: `src/shared/types.ts` — 扩展 Article, Feed, ArticleListQuery 类型，添加 Transcript 类型
- Modify: `src/shared/ipc-channels.ts` — 添加 Transcript IPC 通道

**Step 1: 修改 types.ts**

在 `Feed` 接口中添加:
```typescript
feedType: string;
```

在 `Article` 接口中添加:
```typescript
mediaType: string;
videoId: string | null;
duration: number | null;
```

添加 `MediaType` 类型:
```typescript
export type MediaType = 'article' | 'video' | 'podcast';
```

在 `ArticleListQuery` 中添加:
```typescript
mediaType?: MediaType;
```

添加 `Transcript` 相关类型:
```typescript
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id: string;
  articleId: string;
  segments: TranscriptSegment[];
  language: string | null;
  createdAt: string;
}
```

在 `ElectronAPI` 接口中添加:
```typescript
// Transcript 操作
transcriptGet: (articleId: string) => Promise<Transcript | null>;
transcriptFetch: (articleId: string) => Promise<Transcript | null>;
```

**Step 2: 修改 ipc-channels.ts**

添加:
```typescript
// Transcript
TRANSCRIPT_GET: 'transcript:get',
TRANSCRIPT_FETCH: 'transcript:fetch',
```

**Step 3: 提交**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat(types): 扩展 YouTube 相关类型和 IPC 通道定义"
```

---

### Task 4: YouTube 服务层

**Files:**
- Create: `src/main/services/youtube-service.ts` — YouTube 频道解析 + 字幕获取

**Step 1: 创建 youtube-service.ts**

该服务提供两个核心功能:

1. `resolveYouTubeChannelFeed(url)` — 检测 YouTube URL 并解析为 RSS feed 地址
   - 匹配 `youtube.com/@xxx`, `youtube.com/channel/xxx`, `youtube.com/c/xxx`
   - 抓取频道页面 HTML，从 `<meta>` 标签或 `<link rel="canonical">` 提取 channel_id
   - 返回 RSS feed URL: `https://www.youtube.com/feeds/videos.xml?channel_id={id}`

2. `fetchTranscript(videoId)` — 获取视频字幕
   - 使用 `youtubei.js` 的 `Innertube` 客户端
   - 优先获取手动上传字幕，其次自动生成字幕
   - 返回 `TranscriptSegment[]` 数组

辅助函数:
- `isYouTubeUrl(url)` — 判断是否为 YouTube 域名
- `parseYouTubeDuration(duration)` — ISO 8601 时长转秒数

```typescript
import { Innertube } from 'youtubei.js';
import type { TranscriptSegment } from '../../shared/types';

let innertubeClient: Innertube | null = null;

async function getClient(): Promise<Innertube> {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create();
  }
  return innertubeClient;
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function resolveYouTubeChannelFeed(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const html = await response.text();

    // 方法1: 从 meta 标签提取 channel_id
    const metaMatch = html.match(/<meta\s+itemprop="channelId"\s+content="([^"]+)"/);
    if (metaMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${metaMatch[1]}`;
    }

    // 方法2: 从 canonical URL 提取
    const canonicalMatch = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (canonicalMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${canonicalMatch[1]}`;
    }

    // 方法3: 从 RSS link 标签直接获取
    const rssMatch = html.match(/<link[^>]+type="application\/rss\+xml"[^>]+href="([^"]+)"/);
    if (rssMatch) {
      return rssMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchTranscript(videoId: string): Promise<{ segments: TranscriptSegment[]; language: string | null } | null> {
  try {
    const client = await getClient();
    const info = await client.getInfo(videoId);
    const transcriptInfo = await info.getTranscript();

    if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
      return null;
    }

    const segments: TranscriptSegment[] = [];
    for (const seg of transcriptInfo.transcript.content.body.initial_segments) {
      if (seg.type === 'TranscriptSegment') {
        const start = Number(seg.start_ms) / 1000;
        const end = Number(seg.end_ms) / 1000;
        const text = seg.snippet?.text ?? '';
        if (text) {
          segments.push({ start, end, text });
        }
      }
    }

    const language = transcriptInfo.transcript.content?.body?.initial_segments?.[0]?.type === 'TranscriptSegment'
      ? null // youtubei.js 不直接暴露语言标识，需从 metadata 获取
      : null;

    return segments.length > 0 ? { segments, language } : null;
  } catch (err) {
    console.error('Failed to fetch transcript:', err);
    return null;
  }
}
```

**Step 2: 验证 TypeScript 编译**

```bash
pnpm lint
```

**Step 3: 提交**

```bash
git add src/main/services/youtube-service.ts
git commit -m "feat: 创建 YouTube 服务层（频道解析 + 字幕获取）"
```

---

### Task 5: RSS 服务适配 YouTube Feed

**Files:**
- Modify: `src/main/services/rss-service.ts` — 识别 YouTube feed，解析 videoId/duration/mediaType
- Modify: `src/main/ipc/feed-handlers.ts` — FEED_ADD 时检测 YouTube URL 并自动转换

**Step 1: 修改 rss-service.ts**

修改 `rss-parser` 配置，添加 YouTube 自定义字段:
```typescript
const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Z-Reader/1.0' },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['yt:videoId', 'ytVideoId'],
      ['media:group', 'mediaGroup'],
    ],
  },
});
```

扩展 `RssItem` 类型:
```typescript
type RssItem = Parser.Item & {
  contentEncoded?: string;
  id?: string;
  author?: string;
  ytVideoId?: string;
  mediaGroup?: string;
};
```

在 `fetchFeed` 函数中，查询 feed 的 `feedType`。当 `feedType === 'youtube'` 时，在 insert article 时:
- 设置 `mediaType: 'video'`
- 设置 `videoId: item.ytVideoId`
- 从 feed XML 中提取缩略图: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
- 设置 `domain: 'youtube.com'`
- 设置 `readStatus: 'unseen'` (feed 来源默认值)

**Step 2: 修改 feed-handlers.ts**

在 `FEED_ADD` handler 中，添加 YouTube URL 检测:
```typescript
import { isYouTubeUrl, resolveYouTubeChannelFeed } from '../services/youtube-service';

// 在 FEED_ADD handler 开头:
let feedUrl = input.url;
let feedType = 'rss';

if (isYouTubeUrl(input.url)) {
  const resolved = await resolveYouTubeChannelFeed(input.url);
  if (!resolved) throw new Error('无法解析 YouTube 频道的 RSS 地址');
  feedUrl = resolved;
  feedType = 'youtube';
}

// 使用 feedUrl 和 feedType 创建 feed 记录
const values = {
  id,
  url: feedUrl,
  title: input.title ?? null,
  category: input.category ?? null,
  feedType,
  createdAt: now,
  updatedAt: now,
};
```

**Step 3: 验证整体流程**

```bash
pnpm start
```
手动测试: 在添加订阅对话框粘贴 YouTube 频道 URL，验证:
- feed 被正确创建，`feedType` 为 `youtube`
- 视频 article 被抓取，`mediaType` 为 `video`，`videoId` 不为空

**Step 4: 提交**

```bash
git add src/main/services/rss-service.ts src/main/ipc/feed-handlers.ts
git commit -m "feat: RSS 服务适配 YouTube Feed 解析"
```

---

### Task 6: Transcript IPC Handlers

**Files:**
- Create: `src/main/ipc/transcript-handlers.ts` — 字幕查询与获取
- Modify: `src/main/ipc/index.ts` — 注册 transcript handlers
- Modify: `src/preload.ts` — 暴露 transcript API

**Step 1: 创建 transcript-handlers.ts**

```typescript
import { ipcMain } from 'electron';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { fetchTranscript } from '../services/youtube-service';

export function registerTranscriptHandlers() {
  // 查询缓存字幕
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_GET, async (_event, articleId: string) => {
    const db = getDatabase();
    const [row] = await db.select().from(schema.transcripts)
      .where(eq(schema.transcripts.articleId, articleId));
    if (!row) return null;
    return {
      ...row,
      segments: JSON.parse(row.segments || '[]'),
    };
  });

  // 从 YouTube 获取字幕并缓存
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_FETCH, async (_event, articleId: string) => {
    const db = getDatabase();

    // 检查缓存
    const [existing] = await db.select().from(schema.transcripts)
      .where(eq(schema.transcripts.articleId, articleId));
    if (existing) {
      return { ...existing, segments: JSON.parse(existing.segments || '[]') };
    }

    // 获取 article 的 videoId
    const [article] = await db.select().from(schema.articles)
      .where(eq(schema.articles.id, articleId));
    if (!article?.videoId) return null;

    const result = await fetchTranscript(article.videoId);
    if (!result) return null;

    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(schema.transcripts).values({
      id,
      articleId,
      segments: JSON.stringify(result.segments),
      language: result.language,
      createdAt: now,
    });

    return {
      id,
      articleId,
      segments: result.segments,
      language: result.language,
      createdAt: now,
    };
  });
}
```

**Step 2: 修改 ipc/index.ts — 注册 handler**

```typescript
import { registerTranscriptHandlers } from './transcript-handlers';

// 在 registerAllIpcHandlers 中添加:
registerTranscriptHandlers();
```

**Step 3: 修改 preload.ts — 暴露 API**

在 electronAPI 对象中添加:
```typescript
// Transcript
transcriptGet: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_GET, articleId),
transcriptFetch: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_FETCH, articleId),
```

**Step 4: 提交**

```bash
git add src/main/ipc/transcript-handlers.ts src/main/ipc/index.ts src/preload.ts
git commit -m "feat: 添加 Transcript IPC handlers 和 preload 桥接"
```

---

### Task 7: ArticleListQuery 支持 mediaType 筛选

**Files:**
- Modify: `src/main/ipc/article-handlers.ts` — ARTICLE_LIST 中增加 `mediaType` 条件
- Modify: `src/renderer/App.tsx` — 从 `activeView` 派生 `mediaType` 并传入 ContentList
- Modify: `src/renderer/components/ContentList.tsx` — 接收和传递 `mediaType`

**Step 1: 修改 article-handlers.ts**

在 `ARTICLE_LIST` handler 中添加 mediaType 筛选:
```typescript
if (query.mediaType) {
  conditions.push(eq(schema.articles.mediaType, query.mediaType));
}
```

**Step 2: 修改 App.tsx**

从 `activeView` 派生 `mediaType`:
```typescript
import type { Feed, ArticleSource, MediaType } from '../shared/types';

const contentMediaType: MediaType | undefined =
  activeView === 'library-videos' ? 'video'
  : activeView === 'library-podcasts' ? 'podcast'
  : activeView === 'library-articles' ? 'article'
  : undefined;
```

传入 ContentList:
```typescript
<ContentList
  // ... 现有 props
  mediaType={contentMediaType}
/>
```

**Step 3: 修改 ContentList.tsx**

在 props 中添加 `mediaType`:
```typescript
interface ContentListProps {
  // ... 现有 props
  mediaType?: MediaType;
}
```

在 `fetchArticles` 中使用:
```typescript
if (mediaType) {
  query.mediaType = mediaType;
}
```

更新底部计数文案，视频时显示 "N videos" 而不是 "N articles":
```typescript
const itemLabel = mediaType === 'video' ? 'video' : mediaType === 'podcast' ? 'podcast' : 'article';
// 底部: `${articles.length} ${articles.length === 1 ? itemLabel : itemLabel + 's'}`
```

**Step 4: 提交**

```bash
git add src/main/ipc/article-handlers.ts src/renderer/App.tsx src/renderer/components/ContentList.tsx
git commit -m "feat: Library 按 mediaType 筛选（Articles/Videos/Podcasts）"
```

---

### Task 8: ArticleCard 视频样式

**Files:**
- Modify: `src/renderer/components/ArticleCard.tsx` — 视频条目显示时长标签和播放图标

**Step 1: 修改 ArticleCard**

当 `article.mediaType === 'video'` 时:
- 缩略图右下角叠加时长标签（如 `07:25`），黑底白字半透明
- 替换 domain 图标为播放按钮图标
- 格式化时长: `formatDuration(article.duration)` — 将秒数转为 `MM:SS` 或 `HH:MM:SS`

```typescript
function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

缩略图叠加层（仅 video 类型且有 thumbnail 时）:
```tsx
{article.mediaType === 'video' && article.duration && (
  <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-white text-[10px] rounded">
    {formatDuration(article.duration)}
  </span>
)}
```

**Step 2: 提交**

```bash
git add src/renderer/components/ArticleCard.tsx
git commit -m "feat: ArticleCard 视频条目显示时长标签"
```

---

### Task 9: VideoPlayer 组件

**Files:**
- Create: `src/renderer/components/VideoPlayer.tsx` — YouTube IFrame 嵌入播放器

**Step 1: 创建 VideoPlayer.tsx**

```typescript
interface VideoPlayerProps {
  videoId: string;
  onTimeUpdate?: (currentTime: number) => void;
  onReady?: () => void;
}
```

核心逻辑:
- 使用 `<iframe>` 嵌入 `https://www.youtube.com/embed/{videoId}?enablejsapi=1&origin=...`
- 通过 `postMessage` 与 YouTube IFrame API 通信
- 监听 `message` 事件获取播放状态和当前时间
- 提供 `seekTo(seconds)` 方法（通过 ref 暴露）
- 每秒轮询 `getCurrentTime` 并调用 `onTimeUpdate`
- 16:9 响应式比例容器

使用 `forwardRef` + `useImperativeHandle` 暴露:
```typescript
export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/VideoPlayer.tsx
git commit -m "feat: 创建 VideoPlayer 组件（YouTube IFrame 嵌入）"
```

---

### Task 10: TranscriptView 组件

**Files:**
- Create: `src/renderer/components/TranscriptView.tsx` — 字幕视图（同步/自由浏览模式）

**Step 1: 创建 TranscriptView.tsx**

```typescript
interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSegmentClick: (startTime: number) => void;
  loading?: boolean;
}
```

核心逻辑:

**字幕渲染:**
- 每个 segment 渲染为 `<div>` 行，左侧有蓝色竖线进度指示条
- 当前播放 segment 高亮（背景色 + 蓝色左边框加粗）
- segment 可点击，触发 `onSegmentClick(segment.start)`

**两种模式:**
- `syncMode` state（默认 true）
- 同步模式: 自动 `scrollIntoView` 当前 segment
- 自由浏览模式: 监听 `onWheel` 事件切换到自由模式
- 自由模式下显示浮动提示: "自由浏览模式"，点击回到同步模式
- 蓝色进度条在两种模式下都跟随播放位置

**进度指示条:**
- 每个 segment 左侧有一条 2px 竖线
- 已播放的 segment: 蓝色 (`bg-blue-500`)
- 当前 segment: 蓝色 + 脉冲动画
- 未播放的 segment: 灰色 (`bg-gray-700`)

**空状态:**
- loading 时显示加载动画
- 无字幕时显示 "暂无字幕"

**Step 2: 提交**

```bash
git add src/renderer/components/TranscriptView.tsx
git commit -m "feat: 创建 TranscriptView 组件（字幕同步 + 自由浏览）"
```

---

### Task 11: VideoReaderView 组件

**Files:**
- Create: `src/renderer/components/VideoReaderView.tsx` — 视频阅读器主视图
- Modify: `src/renderer/App.tsx` — 根据 article.mediaType 选择渲染 ReaderView 或 VideoReaderView

**Step 1: 创建 VideoReaderView.tsx**

```typescript
interface VideoReaderViewProps {
  articleId: string;
  onClose: () => void;
}
```

布局结构（参考截图）:
- 顶部工具栏: 返回按钮 + 标题 + 右侧详情面板切换
- 主内容区分左右:
  - 左侧（主区域）:
    - 上方: `<VideoPlayer>` 16:9 播放器
    - 下方: `<TranscriptView>` 字幕区域（可滚动）
  - 右侧: 复用 `<ReaderDetailPanel>` 或 `<DetailPanel>`

核心逻辑:
- 加载 article 数据
- 加载字幕（调用 `transcriptFetch`）
- `VideoPlayer` 的 `onTimeUpdate` 驱动 `TranscriptView` 的 `currentTime`
- 字幕 segment 点击时调用 `videoPlayerRef.seekTo()`
- 播放进度（`readProgress`）按 `currentTime / duration` 计算，定期保存
- 进度保存节流: 每 10 秒保存一次到数据库

**Step 2: 修改 App.tsx**

在打开阅读器时，需要根据 article 的 `mediaType` 决定渲染哪个组件。

在 `handleOpenReader` 中获取 article 信息判断类型，或在渲染时判断:

方案: 在 ReaderView 渲染处添加判断:
```tsx
import { VideoReaderView } from './components/VideoReaderView';

// 添加 state 追踪当前阅读器 article 的 mediaType
const [readerMediaType, setReaderMediaType] = useState<string>('article');

const handleOpenReader = useCallback(async (articleId: string) => {
  const article = await window.electronAPI.articleGet(articleId);
  setReaderMediaType(article?.mediaType ?? 'article');
  setReaderArticleId(articleId);
  setReaderMode(true);
}, []);

// 渲染时根据类型选择:
) : readerMediaType === 'video' ? (
  <div className="flex-1 min-h-0">
    <VideoReaderView articleId={readerArticleId!} onClose={handleCloseReader} />
  </div>
) : (
  <div className="flex-1 min-h-0">
    <ReaderView articleId={readerArticleId!} onClose={handleCloseReader} />
  </div>
)
```

**Step 3: 验证**

```bash
pnpm start
```
手动测试: 订阅一个 YouTube 频道，点击视频条目，验证:
- VideoReaderView 正确渲染
- 播放器显示视频
- 字幕加载并显示
- 字幕同步滚动
- 点击字幕跳转播放
- 滚动字幕切换为自由浏览模式

**Step 4: 提交**

```bash
git add src/renderer/components/VideoReaderView.tsx src/renderer/App.tsx
git commit -m "feat: 创建 VideoReaderView 视频阅读器"
```

---

### Task 12: DetailPanel 适配视频 metadata

**Files:**
- Modify: `src/renderer/components/DetailPanel.tsx` — Info Tab 根据 mediaType 切换显示字段

**Step 1: 修改 DetailPanel.tsx**

在 Info Tab 的 metadata 行生成逻辑中:

```typescript
// 格式化视频时长
function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const isVideo = article.mediaType === 'video';

const metaRows: MetaRow[] = [
  { label: 'Published', value: formatDate(article.publishedAt), icon: <Calendar size={14} /> },
  ...(isVideo ? [] : [{ label: 'Author', value: article.author, icon: <User size={14} /> }]),
  { label: 'Domain', value: article.domain, icon: <Globe size={14} /> },
  ...(isVideo
    ? [{ label: 'Length', value: formatDuration(article.duration), icon: <Clock size={14} /> }]
    : [
        { label: 'Reading Time', value: article.readingTime ? `${article.readingTime} min` : null, icon: <Clock size={14} /> },
        { label: 'Word Count', value: article.wordCount ? String(article.wordCount) : null, icon: <FileText size={14} /> },
      ]
  ),
  { label: 'Progress', value: `${Math.round(article.readProgress * 100)}%`, icon: <FileText size={14} /> },
];
```

**Step 2: 提交**

```bash
git add src/renderer/components/DetailPanel.tsx
git commit -m "feat: DetailPanel Info Tab 适配视频 metadata 显示"
```

---

### Task 13: AddFeedDialog 提示优化

**Files:**
- Modify: `src/renderer/components/AddFeedDialog.tsx` — URL 输入框 placeholder 和提示文案支持 YouTube

**Step 1: 修改 AddFeedDialog.tsx**

更新 placeholder:
```
https://example.com/feed.xml 或 YouTube 频道 URL
```

更新底部提示:
```
提示: 可以直接输入 RSS URL、网站首页或 YouTube 频道链接
```

**Step 2: 修改 URL 输入的 type**

将 `type="url"` 改为 `type="text"`，因为 YouTube 频道 URL 如 `https://www.youtube.com/@xxx` 在某些浏览器中可能不被 url 类型完全接受。

**Step 3: 提交**

```bash
git add src/renderer/components/AddFeedDialog.tsx
git commit -m "feat: AddFeedDialog 支持 YouTube 频道 URL 提示"
```

---

### Task 14: 端到端测试与修复

**Step 1: 启动应用完整测试**

```bash
pnpm start
```

**测试清单:**
1. 粘贴 YouTube 频道 URL（如 `https://www.youtube.com/@xxx`）添加订阅
2. 验证 feed 列表中出现 YouTube 频道
3. 验证视频列表正确显示（带时长标签和缩略图）
4. 点击 Sidebar > Library > Videos，验证只显示视频类型
5. 点击视频条目进入 VideoReaderView
6. 验证播放器加载并可播放
7. 验证字幕加载并同步滚动
8. 测试点击字幕跳转
9. 测试滚动触发自由浏览模式
10. 测试点击浮动提示回到同步模式
11. 验证右侧 Info 面板显示 Length/Progress
12. 验证关闭阅读器回到列表

**Step 2: 修复发现的问题**

根据测试结果修复 bug。

**Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: YouTube 订阅与阅读能力完整实现"
```

---

### Task 15: 文档沉淀

**Files:**
- Create: `docs/youtube-subscription.md` — 功能文档

**Step 1: 写入文档**

记录:
- 功能概述
- 技术实现细节
- 已知限制（某些频道可能无法获取字幕等）
- 数据库变更说明

**Step 2: 提交**

```bash
git add docs/youtube-subscription.md
git commit -m "docs: YouTube 订阅与阅读能力文档"
```
