export const IPC_CHANNELS = {
  // Feed
  FEED_ADD: 'feed:add',
  FEED_LIST: 'feed:list',
  FEED_UPDATE: 'feed:update',
  FEED_DELETE: 'feed:delete',
  FEED_FETCH: 'feed:fetch',
  FEED_FETCH_ALL: 'feed:fetchAll',
  FEED_IMPORT_OPML: 'feed:importOpml',
  FEED_TOGGLE_PIN: 'feed:togglePin',
  FEED_ARTICLE_COUNT: 'feed:articleCount',

  // Article
  ARTICLE_LIST: 'article:list',
  ARTICLE_GET: 'article:get',
  ARTICLE_UPDATE: 'article:update',
  ARTICLE_DELETE: 'article:delete',
  ARTICLE_PARSE_CONTENT: 'article:parseContent',
  ARTICLE_SEARCH: 'article:search',
  ARTICLE_RESTORE: 'article:restore',
  ARTICLE_PERMANENT_DELETE: 'article:permanentDelete',
  ARTICLE_LIST_DELETED: 'article:listDeleted',
  ARTICLE_BATCH_UPDATE: 'article:batchUpdate',
  ARTICLE_BATCH_DELETE: 'article:batchDelete',
  ARTICLE_SAVE_URL: 'article:saveUrl',
  ARTICLE_SAVE_TO_LIBRARY: 'article:saveToLibrary',

  // Highlight
  HIGHLIGHT_LIST: 'highlight:list',
  HIGHLIGHT_CREATE: 'highlight:create',
  HIGHLIGHT_DELETE: 'highlight:delete',
  HIGHLIGHT_UPDATE: 'highlight:update',
  HIGHLIGHT_EXPORT: 'highlight:export',
  HIGHLIGHT_LIST_BY_BOOK: 'highlight:listByBook',
  HIGHLIGHT_CREATE_FOR_BOOK: 'highlight:createForBook',

  // Tag
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',
  ARTICLE_TAG_ADD: 'articleTag:add',
  ARTICLE_TAG_REMOVE: 'articleTag:remove',
  ARTICLE_LIST_BY_TAG: 'article:listByTag',
  ARTICLE_TAGS_FOR_ARTICLE: 'article:tagsForArticle',

  // Highlight-Tag
  HIGHLIGHT_TAG_ADD: 'highlightTag:add',
  HIGHLIGHT_TAG_REMOVE: 'highlightTag:remove',
  HIGHLIGHT_TAGS_FOR_HIGHLIGHT: 'highlightTag:forHighlight',
  HIGHLIGHT_TAGS_BATCH: 'highlightTag:batch',

  // Book
  BOOK_LIST: 'book:list',
  BOOK_GET: 'book:get',
  BOOK_IMPORT: 'book:import',
  BOOK_DELETE: 'book:delete',
  BOOK_UPDATE: 'book:update',
  BOOK_GET_CONTENT: 'book:getContent',
  BOOK_GET_FILE_PATH: 'book:getFilePath',
  BOOK_READ_FILE: 'book:readFile',
  BOOK_PERMANENT_DELETE: 'book:permanentDelete',
  BOOK_RESTORE: 'book:restore',

  // Book Highlight
  BOOK_HIGHLIGHT_LIST: 'bookHighlight:list',
  BOOK_HIGHLIGHT_CREATE: 'bookHighlight:create',

  // Transcript
  TRANSCRIPT_GET: 'transcript:get',
  TRANSCRIPT_FETCH: 'transcript:fetch',

  // YouTube 视频流
  YOUTUBE_GET_STREAM_URL: 'youtube:getStreamUrl',

  // YouTube 认证
  YOUTUBE_LOGIN: 'youtube:login',
  YOUTUBE_LOGOUT: 'youtube:logout',
  YOUTUBE_AUTH_STATUS: 'youtube:authStatus',

  // Newsletter
  NEWSLETTER_CREATE: 'newsletter:create',

  // Podcast
  PODCAST_SEARCH: 'podcast:search',
  PODCAST_RESOLVE_URL: 'podcast:resolveUrl',

  // Download
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_STATUS: 'download:status',

  // Discover
  DISCOVER_SEARCH: 'discover:search',
  DISCOVER_RSSHUB_CATEGORIES: 'discover:rsshubCategories',
  DISCOVER_RSSHUB_ROUTES: 'discover:rsshubRoutes',
  DISCOVER_PREVIEW: 'discover:preview',
  DISCOVER_RSSHUB_CONFIG: 'discover:rsshubConfig',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Share Card
  SHARE_CARD_EXPORT_IMAGE: 'shareCard:exportImage',
  SHARE_CARD_COPY_CLIPBOARD: 'shareCard:copyClipboard',

  // AI
  AI_SETTINGS_GET: 'ai:settings:get',
  AI_SETTINGS_SET: 'ai:settings:set',
  AI_SUMMARIZE: 'ai:summarize',
  AI_TRANSLATE: 'ai:translate',
  AI_AUTO_TAG: 'ai:autoTag',
  AI_TASK_LOGS: 'ai:taskLogs',
} as const;
