import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ==================== feeds 表 ====================
export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  favicon: text('favicon'),
  category: text('category'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  fetchInterval: integer('fetch_interval').default(15),
  lastFetchedAt: text('last_fetched_at'),
  errorCount: integer('error_count').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
  pinned: integer('pinned').default(0),
});

// ==================== articles 表 ====================
export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  feedId: text('feed_id').references(() => feeds.id),
  guid: text('guid'),
  url: text('url'),
  title: text('title'),
  author: text('author'),
  summary: text('summary'),
  content: text('content'),
  contentText: text('content_text'),
  thumbnail: text('thumbnail'),
  wordCount: integer('word_count'),
  readingTime: integer('reading_time'),
  language: text('language'),
  publishedAt: text('published_at'),
  savedAt: text('saved_at'),
  readStatus: text('read_status').default('inbox'),
  readProgress: real('read_progress').default(0),
  isShortlisted: integer('is_shortlisted').default(0),
  source: text('source').default('feed'),
  domain: text('domain'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});

// ==================== highlights 表 ====================
export const highlights = sqliteTable('highlights', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  text: text('text'),
  note: text('note'),
  color: text('color').default('yellow'),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  paragraphIndex: integer('paragraph_index'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});

// ==================== tags 表 ====================
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});

// ==================== article_tags 关联表 ====================
export const articleTags = sqliteTable('article_tags', {
  articleId: text('article_id').notNull().references(() => articles.id),
  tagId: text('tag_id').notNull().references(() => tags.id),
  createdAt: text('created_at').notNull(),
});

// ==================== views 自定义视图表 ====================
export const views = sqliteTable('views', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  filterJson: text('filter_json'),
  sortField: text('sort_field'),
  sortOrder: text('sort_order').default('desc'),
  isPinned: integer('is_pinned').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== books 表 ====================
export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title'),
  author: text('author'),
  cover: text('cover'), // base64 或文件路径
  filePath: text('file_path').notNull(), // EPUB 文件存储路径
  fileSize: integer('file_size'),
  language: text('language'),
  publisher: text('publisher'),
  description: text('description'),
  readStatus: text('read_status').default('inbox'), // inbox | later | archive
  readProgress: real('read_progress').default(0),
  totalLocations: integer('total_locations'),
  currentLocation: text('current_location'), // EPUB CFI 位置
  isShortlisted: integer('is_shortlisted').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});
