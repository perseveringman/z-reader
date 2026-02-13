// ==================== Feed 相关类型 ====================
export interface Feed {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  category: string | null;
  fetchInterval: number;
  lastFetchedAt: string | null;
  errorCount: number;
  pinned: number;
  feedType: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedArticleCount {
  feedId: string;
  total: number;
  unseen: number;
}

export interface CreateFeedInput {
  url: string;
  title?: string;
  category?: string;
}

export interface UpdateFeedInput {
  id: string;
  title?: string;
  category?: string;
  fetchInterval?: number;
}

export type ArticleSource = 'library' | 'feed';
export type MediaType = 'article' | 'video' | 'podcast';
export type ReadStatus = 'inbox' | 'later' | 'archive' | 'unseen' | 'seen';

export interface SaveUrlInput {
  url: string;
  title?: string;
}

// ==================== Article 相关类型 ====================
export interface Article {
  id: string;
  feedId: string | null;
  guid: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  contentText: string | null;
  thumbnail: string | null;
  wordCount: number | null;
  readingTime: number | null;
  language: string | null;
  publishedAt: string | null;
  savedAt: string | null;
  readStatus: ReadStatus;
  readProgress: number;
  isShortlisted: number;
  source: ArticleSource;
  domain: string | null;
  mediaType: string;
  videoId: string | null;
  duration: number | null;
  audioUrl: string | null;
  audioMime: string | null;
  audioBytes: number | null;
  audioDuration: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  createdAt: string;
  updatedAt: string;
  feedTitle?: string | null;
}

export interface ArticleListQuery {
  readStatus?: ReadStatus;
  feedId?: string;
  source?: ArticleSource;
  isShortlisted?: boolean;
  search?: string;
  sortBy?: 'saved_at' | 'published_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  mediaType?: MediaType;
}

export interface ArticleSearchQuery {
  query: string;
  limit?: number;
}

export interface UpdateArticleInput {
  id: string;
  readStatus?: ReadStatus;
  readProgress?: number;
  isShortlisted?: boolean;
  source?: ArticleSource;
}

// ==================== Highlight 相关类型 ====================
export interface Highlight {
  id: string;
  articleId: string | null;
  bookId: string | null;
  text: string | null;
  note: string | null;
  color: string;
  startOffset: number | null;
  endOffset: number | null;
  anchorPath: string | null;
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
  anchorPath?: string;
  paragraphIndex?: number;
}

export interface UpdateHighlightInput {
  id: string;
  note?: string;
  color?: string;
}

export interface CreateBookHighlightInput {
  bookId: string;
  text: string;
  note?: string;
  color?: string;
  startOffset?: number;
  endOffset?: number;
  anchorPath?: string;
  paragraphIndex?: number;
}

// ==================== Tag 相关类型 ====================
export interface Tag {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  articleCount?: number;
}

// ==================== Highlight-Tag 相关类型 ====================
export interface HighlightTagsMap {
  [highlightId: string]: Tag[];
}

// ==================== Transcript 相关类型 ====================
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

// ==================== Book 相关类型 ====================
export type BookReadStatus = 'inbox' | 'later' | 'archive';

export interface Book {
  id: string;
  title: string | null;
  author: string | null;
  cover: string | null;
  filePath: string;
  fileType: 'epub' | 'pdf';
  fileSize: number | null;
  language: string | null;
  publisher: string | null;
  description: string | null;
  readStatus: BookReadStatus;
  readProgress: number;
  totalLocations: number | null;
  currentLocation: string | null;
  isShortlisted: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookListQuery {
  readStatus?: BookReadStatus;
  isShortlisted?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpdateBookInput {
  id: string;
  readStatus?: BookReadStatus;
  readProgress?: number;
  currentLocation?: string;
  isShortlisted?: boolean;
  title?: string;
  author?: string;
}

// ==================== YouTube 视频流相关类型 ====================
export interface VideoFormat {
  itag: number;
  qualityLabel: string;    // "1080p", "720p", "360p" 等
  width: number;
  height: number;
  url: string;
  mimeType: string;
  bitrate: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface VideoStreamData {
  formats: VideoFormat[];     // 所有可用的视频 format（muxed + adaptive 视频）
  bestAudio: VideoFormat | null; // 最佳音频流（给 adaptive 纯视频配对用）
}

// ==================== Podcast 相关类型 ====================
export interface PodcastSearchResult {
  title: string;
  author: string | null;
  image: string | null;
  feedUrl: string | null;
  website: string | null;
  source: 'itunes' | 'podcastindex';
  id: string;
}

export type PodcastSearchType = 'show' | 'episode';

export interface PodcastSearchQuery {
  query: string;
  type?: PodcastSearchType;
  limit?: number;
}

// ==================== Download 相关类型 ====================
export type DownloadStatus = 'queued' | 'downloading' | 'ready' | 'failed';

export interface DownloadRecord {
  id: string;
  articleId: string;
  filePath: string | null;
  bytes: number | null;
  status: DownloadStatus;
  addedAt: string;
  lastAccessedAt: string | null;
}

// ==================== Newsletter 相关类型 ====================
export interface CreateNewsletterInput {
  name: string;
  category?: string;
}

export interface NewsletterCreateResult {
  /** 用于订阅 newsletter 的专用邮箱地址 */
  email: string;
  /** 对应的 Atom feed URL */
  feedUrl: string;
  /** newsletter 名称 */
  name: string;
  /** 创建的 feed 记录 */
  feed: Feed;
}

// ==================== Settings 相关类型 ====================
export interface AppSettings {
  podcastIndexApiKey?: string;
  podcastIndexApiSecret?: string;
  downloadDirectory?: string;
  downloadCapacityMb?: number;
  rsshubBaseUrl?: string;
  language?: string;
}

// ==================== Discover 相关类型 ====================
export interface RSSHubRouteParam {
  name: string;
  description?: string;
  optional?: boolean;
  default?: string;
}

// RSSHub parameters 值：旧版为字符串，新版为对象 { description, options, default }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RSSHubParamValue = string | Record<string, any>;

export interface RSSHubRoute {
  path: string;
  name: string;
  description?: string;
  example?: string;
  parameters?: Record<string, RSSHubParamValue>;
  categories?: string[];
  maintainers?: string[];
}

export interface RSSHubNamespace {
  name: string;
  description?: string;
  url?: string;
  routes: Record<string, RSSHubRoute>;
}

export interface RSSHubCategory {
  name: string;
  count: number;
}

export interface DiscoverSearchQuery {
  query: string;
}

export type DiscoverResultType = 'podcast' | 'rss' | 'rsshub';

export interface DiscoverSearchResult {
  type: DiscoverResultType;
  title: string;
  description: string | null;
  image: string | null;
  feedUrl: string | null;
  website: string | null;
  // RSSHub 路由特有
  rsshubPath?: string;
  rsshubParams?: Record<string, RSSHubParamValue>;
}

export interface DiscoverPreviewResult {
  title: string | null;
  description: string | null;
  favicon: string | null;
  feedUrl: string;
  feedType: string;
  articles: {
    title: string | null;
    url: string | null;
    publishedAt: string | null;
  }[];
  alreadySubscribed: boolean;
}

// ==================== 分享卡片类型 ====================

export type CardType = 'single' | 'multi' | 'summary';
export type QuoteStyle = 'border-left' | 'quotation-marks' | 'highlight-bg' | 'minimal';
export type ThemeCategory = 'classic' | 'retro' | 'digital' | 'artistic';

export interface CardThemeStyles {
  background: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  quoteStyle: QuoteStyle;
  cardRadius: string;
  padding: string;
}

export interface CardTheme {
  id: string;
  name: string;
  category: ThemeCategory;
  styles: CardThemeStyles;
  cssClass: string;
}

export interface ShareCardData {
  cardType: CardType;
  themeId: string;
  highlights: Highlight[];
  article: Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;
}

// ==================== AI 模块类型 ====================
export interface AISettingsData {
  provider: 'openrouter' | 'minimax';
  apiKey: string;
  models: {
    fast: string;
    smart: string;
    cheap: string;
  };
}

export interface AISummarizeInput {
  articleId: string;
  language?: string;
}

export interface AISummarizeResult {
  summary: string;
  tokenCount: number;
}

export interface AITranslateInput {
  articleId: string;
  targetLanguage: string;
}

export interface AITranslateResult {
  translatedTitle: string;
  translatedContent: string;
  tokenCount: number;
}

export interface AIAutoTagInput {
  articleId: string;
}

export interface AIAutoTagResult {
  tags: string[];
  tokenCount: number;
}

export interface AITaskLogItem {
  id: string;
  taskType: string;
  status: string;
  tokenCount: number;
  costUsd: number;
  createdAt: string;
}

// ==================== IPC Channel 定义 ====================
export interface ElectronAPI {
  // Feed 操作
  feedAdd: (input: CreateFeedInput) => Promise<Feed>;
  feedList: () => Promise<Feed[]>;
  feedUpdate: (input: UpdateFeedInput) => Promise<Feed>;
  feedDelete: (id: string) => Promise<void>;
  feedFetch: (id: string) => Promise<void>;
  feedFetchAll: () => Promise<void>;
  feedImportOpml: () => Promise<Feed[]>;
  feedTogglePin: (id: string) => Promise<Feed>;
  feedArticleCount: () => Promise<FeedArticleCount[]>;

  // Article 操作
  articleList: (query: ArticleListQuery) => Promise<Article[]>;
  articleGet: (id: string) => Promise<Article | null>;
  articleUpdate: (input: UpdateArticleInput) => Promise<Article>;
  articleDelete: (id: string) => Promise<void>;
  articleParseContent: (id: string) => Promise<Article | null>;
  articleSearch: (query: ArticleSearchQuery) => Promise<Article[]>;
  articleRestore: (id: string) => Promise<Article>;
  articlePermanentDelete: (id: string) => Promise<void>;
  articleListDeleted: () => Promise<Article[]>;
  articleBatchUpdate: (ids: string[], input: Partial<Omit<UpdateArticleInput, 'id'>>) => Promise<void>;
  articleBatchDelete: (ids: string[]) => Promise<void>;
  articleSaveUrl: (input: SaveUrlInput) => Promise<Article>;
  articleSaveToLibrary: (id: string) => Promise<Article>;

  // Highlight 操作
  highlightList: (articleId: string) => Promise<Highlight[]>;
  highlightCreate: (input: CreateHighlightInput) => Promise<Highlight>;
  highlightDelete: (id: string) => Promise<void>;
  highlightUpdate: (input: UpdateHighlightInput) => Promise<Highlight>;
  highlightExport: (articleId: string, mode: 'clipboard' | 'file') => Promise<string>;
  highlightListByBook: (bookId: string) => Promise<Highlight[]>;
  highlightCreateForBook: (input: CreateBookHighlightInput) => Promise<Highlight>;

  // Tag 操作
  tagList: () => Promise<Tag[]>;
  tagCreate: (name: string, parentId?: string) => Promise<Tag>;
  tagDelete: (id: string) => Promise<void>;
  articleTagAdd: (articleId: string, tagId: string) => Promise<void>;
  articleTagRemove: (articleId: string, tagId: string) => Promise<void>;
  articleListByTag: (tagId: string) => Promise<Article[]>;
  articleTagsForArticle: (articleId: string) => Promise<Tag[]>;

  // Highlight-Tag 操作
  highlightTagAdd: (highlightId: string, tagId: string) => Promise<void>;
  highlightTagRemove: (highlightId: string, tagId: string) => Promise<void>;
  highlightTagsForHighlight: (highlightId: string) => Promise<Tag[]>;
  highlightTagsBatch: (highlightIds: string[]) => Promise<HighlightTagsMap>;

  // Book 操作
  bookList: (query: BookListQuery) => Promise<Book[]>;
  bookGet: (id: string) => Promise<Book | null>;
  bookImport: () => Promise<Book[]>;
  bookDelete: (id: string) => Promise<void>;
  bookUpdate: (input: UpdateBookInput) => Promise<Book>;
  bookGetContent: (id: string) => Promise<string | null>;
  bookGetFilePath: (id: string) => Promise<string | null>;
  bookReadFile: (id: string) => Promise<ArrayBuffer | null>;
  bookPermanentDelete: (id: string) => Promise<void>;
  bookRestore: (id: string) => Promise<Book>;

  // Book Highlight 操作
  bookHighlightList: (bookId: string) => Promise<Highlight[]>;
  bookHighlightCreate: (input: CreateBookHighlightInput) => Promise<Highlight>;

  // Transcript 操作
  transcriptGet: (articleId: string) => Promise<Transcript | null>;
  transcriptFetch: (articleId: string) => Promise<Transcript | null>;

  // YouTube 视频流
  youtubeGetStreamUrl: (videoId: string) => Promise<VideoStreamData | null>;

  // YouTube 认证
  youtubeLogin: () => Promise<boolean>;
  youtubeLogout: () => Promise<void>;
  youtubeAuthStatus: () => Promise<boolean>;

  // Podcast 操作
  podcastSearch: (query: PodcastSearchQuery) => Promise<PodcastSearchResult[]>;
  podcastResolveUrl: (url: string) => Promise<{ feedUrl: string; title?: string; author?: string; image?: string } | null>;

  // Download 操作
  downloadStart: (articleId: string) => Promise<DownloadRecord>;
  downloadCancel: (downloadId: string) => Promise<void>;
  downloadList: () => Promise<DownloadRecord[]>;
  downloadStatus: (downloadId: string) => Promise<DownloadRecord | null>;

  // Settings 操作
  settingsGet: () => Promise<AppSettings>;
  settingsSet: (settings: Partial<AppSettings>) => Promise<AppSettings>;

  // Discover 操作
  discoverSearch: (query: DiscoverSearchQuery) => Promise<DiscoverSearchResult[]>;
  discoverRsshubCategories: () => Promise<RSSHubCategory[]>;
  discoverRsshubRoutes: (category?: string) => Promise<Record<string, RSSHubNamespace>>;
  discoverPreview: (feedUrl: string) => Promise<DiscoverPreviewResult>;
  discoverRsshubConfig: (baseUrl?: string) => Promise<{ baseUrl: string | null }>;
  // Newsletter 操作
  newsletterCreate: (input: CreateNewsletterInput) => Promise<NewsletterCreateResult>;

  // Share Card 操作
  shareCardExportImage: (dataUrl: string, defaultName: string) => Promise<string>;
  shareCardCopyClipboard: (dataUrl: string) => Promise<void>;

  // AI 操作
  aiSettingsGet: () => Promise<AISettingsData>;
  aiSettingsSet: (settings: Partial<AISettingsData>) => Promise<void>;
  aiSummarize: (input: AISummarizeInput) => Promise<AISummarizeResult>;
  aiTranslate: (input: AITranslateInput) => Promise<AITranslateResult>;
  aiAutoTag: (input: AIAutoTagInput) => Promise<AIAutoTagResult>;
  aiTaskLogs: (limit?: number) => Promise<AITaskLogItem[]>;
}
