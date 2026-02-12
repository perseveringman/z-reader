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
  feedType: text('feed_type').default('rss'),
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
  mediaType: text('media_type').default('article'),
  videoId: text('video_id'),
  duration: integer('duration'),
  audioUrl: text('audio_url'),
  audioMime: text('audio_mime'),
  audioBytes: integer('audio_bytes'),
  audioDuration: integer('audio_duration'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});

// ==================== highlights 表 ====================
export const highlights = sqliteTable('highlights', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  bookId: text('book_id').references(() => books.id),
  text: text('text'),
  note: text('note'),
  color: text('color').default('yellow'),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  anchorPath: text('anchor_path'),
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

// ==================== highlight_tags 关联表 ====================
export const highlightTags = sqliteTable('highlight_tags', {
  highlightId: text('highlight_id').notNull().references(() => highlights.id),
  tagId: text('tag_id').notNull().references(() => tags.id),
  createdAt: text('created_at').notNull(),
});

// ==================== books 表 ====================
export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title'),
  author: text('author'),
  cover: text('cover'), // base64 或文件路径
  filePath: text('file_path').notNull(), // EPUB 文件存储路径
  fileType: text('file_type').default('epub'), // epub | pdf
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

// ==================== downloads 表 ====================
export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  filePath: text('file_path'),
  bytes: integer('bytes'),
  status: text('status').default('queued'), // queued | downloading | ready | failed
  addedAt: text('added_at').notNull(),
  lastAccessedAt: text('last_accessed_at'),
});

// ==================== transcripts 表 ====================
export const transcripts = sqliteTable('transcripts', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  segments: text('segments'), // JSON: [{start, end, text}]
  language: text('language'),
  createdAt: text('created_at').notNull(),
});

// ==================== agent_tasks 表 ====================
export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  status: text('status').notNull(),
  strategy: text('strategy').notNull(),
  riskLevel: text('risk_level').notNull(),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  errorText: text('error_text'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== agent_task_events 表 ====================
export const agentTaskEvents = sqliteTable('agent_task_events', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => agentTasks.id),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  occurredAt: text('occurred_at').notNull(),
});

// ==================== agent_memories 表 ====================
export const agentMemories = sqliteTable('agent_memories', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  namespace: text('namespace').notNull(),
  key: text('key').notNull(),
  valueJson: text('value_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== agent_traces 表 ====================
export const agentTraces = sqliteTable('agent_traces', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => agentTasks.id),
  span: text('span').notNull(),
  kind: text('kind').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  tokenIn: integer('token_in'),
  tokenOut: integer('token_out'),
  costUsd: real('cost_usd'),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
});

// ==================== agent_graph_snapshots 表 ====================
export const agentGraphSnapshots = sqliteTable('agent_graph_snapshots', {
  id: text('id').primaryKey(),
  graphId: text('graph_id').notNull(),
  graphSignature: text('graph_signature'),
  graphDefinitionJson: text('graph_definition_json'),
  taskId: text('task_id').notNull(),
  sessionId: text('session_id').notNull(),
  status: text('status').notNull(),
  executionOrderJson: text('execution_order_json').notNull(),
  nodesJson: text('nodes_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
