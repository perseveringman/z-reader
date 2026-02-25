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
  wechatBiz: text('wechat_biz'),
  wechatTokenUrl: text('wechat_token_url'),
  wechatTokenExpiry: text('wechat_token_expiry'),
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
  metadata: text('metadata'),
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
  segments: text('segments'), // JSON: [{start, end, text, speakerId?}]
  speakerMap: text('speaker_map'), // JSON: {"0":"张三","1":"李四"} — 说话人 ID 到自定义名称的映射
  language: text('language'),
  createdAt: text('created_at').notNull(),
});

// ==================== AI 模块表 ====================

/** AI 设置键值存储 */
export const aiSettings = sqliteTable('ai_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** AI 思维导图缓存 */
export const aiMindmaps = sqliteTable('ai_mindmaps', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id),
  title: text('title'),
  sourceType: text('source_type').notNull(), // article | transcript | summary
  sourceHash: text('source_hash').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  mindmapMarkdown: text('mindmap_markdown').notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** AI 快捷提示词 */
export const aiPromptPresets = sqliteTable('ai_prompt_presets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  iconKey: text('icon_key').notNull().default('message-square'),
  enabled: integer('enabled').notNull().default(1),
  displayOrder: integer('display_order').notNull().default(0),
  targetsJson: text('targets_json').notNull(),
  isBuiltin: integer('is_builtin').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== app_tasks 通用任务表 ====================
export const appTasks = sqliteTable('app_tasks', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),            // 'asr-realtime' | 'asr-standard' | 'download' | ...
  articleId: text('article_id'),
  status: text('status').notNull(),        // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: real('progress').default(0),
  title: text('title').notNull(),
  detail: text('detail'),
  meta: text('meta'),                      // JSON
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== notifications 通知表 ====================
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),            // 'success' | 'error' | 'info'
  title: text('title').notNull(),
  body: text('body'),
  articleId: text('article_id'),
  read: integer('read').default(0),
  createdAt: text('created_at').notNull(),
});

// ==================== 微信公众号相关表 ====================

/** 微信文章行为数据 */
export const wechatStats = sqliteTable('wechat_stats', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  readCount: integer('read_count'),
  likeCount: integer('like_count'),
  shareCount: integer('share_count'),
  wowCount: integer('wow_count'),
  fetchedAt: text('fetched_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** 微信文章评论 */
export const wechatComments = sqliteTable('wechat_comments', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  content: text('content'),
  likeCount: integer('like_count'),
  nickname: text('nickname'),
  createdAt: text('created_at').notNull(),
});

/** AI 任务执行日志 */
export const aiTaskLogs = sqliteTable('ai_task_logs', {
  id: text('id').primaryKey(),
  taskType: text('task_type').notNull(),
  status: text('status').notNull().default('pending'),
  inputJson: text('input_json'),
  outputJson: text('output_json'),
  tracesJson: text('traces_json'),
  tokenCount: integer('token_count').default(0),
  costUsd: real('cost_usd').default(0),
  errorText: text('error_text'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull(),
});

// ==================== translations 表 ====================
export const translations = sqliteTable('translations', {
  id: text('id').primaryKey(),
  articleId: text('article_id').references(() => articles.id),
  bookId: text('book_id').references(() => books.id),
  sourceType: text('source_type').notNull(), // 'article' | 'transcript' | 'book'
  sourceLang: text('source_lang'),
  targetLang: text('target_lang').notNull(),
  paragraphs: text('paragraphs'), // JSON: [{index, original, translated}]
  model: text('model'),
  promptTemplate: text('prompt_template'),
  tokenCount: integer('token_count').default(0),
  status: text('status').default('pending'), // 'pending' | 'translating' | 'completed' | 'failed'
  progress: real('progress').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});
