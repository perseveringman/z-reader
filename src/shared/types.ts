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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

export interface UpdateHighlightInput {
  id: string;
  note?: string;
  color?: string;
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

  // Tag 操作
  tagList: () => Promise<Tag[]>;
  tagCreate: (name: string, parentId?: string) => Promise<Tag>;
  tagDelete: (id: string) => Promise<void>;
  articleTagAdd: (articleId: string, tagId: string) => Promise<void>;
  articleTagRemove: (articleId: string, tagId: string) => Promise<void>;
  articleListByTag: (tagId: string) => Promise<Article[]>;
  articleTagsForArticle: (articleId: string) => Promise<Tag[]>;
}
