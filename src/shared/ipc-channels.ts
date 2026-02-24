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
  ARTICLE_IMPORT_LOCAL_MEDIA: 'article:importLocalMedia',
  ARTICLE_READ_LOCAL_MEDIA: 'article:readLocalMedia',
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
  TRANSCRIPT_UPDATE_SPEAKER: 'transcript:updateSpeaker',

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
  DOWNLOAD_OPEN_DIR: 'download:openDir',

  // External
  EXTERNAL_OPEN_URL: 'external:open-url',

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
  AI_PROMPT_PRESET_LIST: 'ai:promptPreset:list',
  AI_PROMPT_PRESET_CREATE: 'ai:promptPreset:create',
  AI_PROMPT_PRESET_UPDATE: 'ai:promptPreset:update',
  AI_PROMPT_PRESET_DELETE: 'ai:promptPreset:delete',
  AI_PROMPT_PRESET_REORDER: 'ai:promptPreset:reorder',
  AI_PROMPT_PRESET_RESET_BUILTINS: 'ai:promptPreset:resetBuiltins',
  AI_SUMMARIZE: 'ai:summarize',
  AI_TRANSLATE: 'ai:translate',
  AI_AUTO_TAG: 'ai:autoTag',
  AI_MINDMAP_GENERATE: 'ai:mindmap:generate',
  AI_MINDMAP_GET: 'ai:mindmap:get',
  AI_TASK_LOGS: 'ai:taskLogs',

  // AI Chat
  AI_CHAT_SEND: 'ai:chat:send',
  AI_CHAT_STREAM: 'ai:chat:stream',
  AI_CHAT_SESSION_CREATE: 'ai:chat:session:create',
  AI_CHAT_SESSION_LIST: 'ai:chat:session:list',
  AI_CHAT_SESSION_GET: 'ai:chat:session:get',
  AI_CHAT_SESSION_DELETE: 'ai:chat:session:delete',

  // AI 新增
  AI_EXTRACT_TOPICS: 'ai:extractTopics',
  AI_TASK_LOG_DETAIL: 'ai:taskLogDetail',

  // ASR (语音识别)
  ASR_START: 'asr:start',
  ASR_CANCEL: 'asr:cancel',
  ASR_PROGRESS: 'asr:progress',
  ASR_SEGMENT: 'asr:segment',
  ASR_COMPLETE: 'asr:complete',
  ASR_ERROR: 'asr:error',

  // App Task (通用任务系统)
  APP_TASK_CREATE: 'app-task:create',
  APP_TASK_CANCEL: 'app-task:cancel',
  APP_TASK_LIST: 'app-task:list',
  APP_TASK_UPDATED: 'app-task:updated',

  // Notification (通知系统)
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_READ_ALL: 'notification:read-all',
  NOTIFICATION_CLEAR: 'notification:clear',
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count',

  // Sync (iCloud 同步)
  SYNC_GET_STATUS: 'sync:getStatus',
  SYNC_ENABLE: 'sync:enable',
  SYNC_DISABLE: 'sync:disable',
  SYNC_NOW: 'sync:now',
  SYNC_GET_DEVICES: 'sync:getDevices',

  // WeChat (微信公众号)
  WECHAT_PARSE_ARTICLE_URL: 'wechat:parseArticleUrl',
  WECHAT_SET_TOKEN: 'wechat:setToken',
  WECHAT_GET_TOKEN_STATUS: 'wechat:getTokenStatus',
  WECHAT_FETCH_ARTICLE_LIST: 'wechat:fetchArticleList',
  WECHAT_DOWNLOAD_CONTENT: 'wechat:downloadContent',
  WECHAT_FETCH_STATS: 'wechat:fetchStats',
  WECHAT_GET_STATS: 'wechat:getStats',
  WECHAT_GET_COMMENTS: 'wechat:getComments',
  WECHAT_CANCEL_TASK: 'wechat:cancelTask',
  WECHAT_PROGRESS: 'wechat:progress',
} as const;
