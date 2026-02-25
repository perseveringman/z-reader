import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from './shared/ipc-channels';
import type { ElectronAPI, ChatStreamChunk, AgentStreamChunk, AsrProgressEvent, AsrSegmentEvent, AsrCompleteEvent, AsrErrorEvent, AppTask, AppNotification, WechatProgressEvent, WritingAssistStreamChunk, RAGBackfillProgress, EmbeddingConfig, TranslationProgressEvent } from './shared/types';

const electronAPI: ElectronAPI = {
  // Feed
  feedAdd: (input) => ipcRenderer.invoke(IPC_CHANNELS.FEED_ADD, input),
  feedList: () => ipcRenderer.invoke(IPC_CHANNELS.FEED_LIST),
  feedUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.FEED_UPDATE, input),
  feedDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.FEED_DELETE, id),
  feedFetch: (id) => ipcRenderer.invoke(IPC_CHANNELS.FEED_FETCH, id),
  feedFetchAll: () => ipcRenderer.invoke(IPC_CHANNELS.FEED_FETCH_ALL),
  feedImportOpml: () => ipcRenderer.invoke(IPC_CHANNELS.FEED_IMPORT_OPML),
  feedTogglePin: (id) => ipcRenderer.invoke(IPC_CHANNELS.FEED_TOGGLE_PIN, id),
  feedArticleCount: () => ipcRenderer.invoke(IPC_CHANNELS.FEED_ARTICLE_COUNT),

  // Article
  articleList: (query) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_LIST, query),
  articleGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_GET, id),
  articleUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_UPDATE, input),
  articleDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_DELETE, id),
  articleParseContent: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_PARSE_CONTENT, id),
  articleSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_SEARCH, query),
  articleRestore: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_RESTORE, id),
  articlePermanentDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_PERMANENT_DELETE, id),
  articleListDeleted: () => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_LIST_DELETED),
  articleBatchUpdate: (ids, input) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_BATCH_UPDATE, ids, input),
  articleBatchDelete: (ids) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_BATCH_DELETE, ids),
  articleSaveUrl: (input) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_SAVE_URL, input),
  articleImportLocalMedia: () => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_IMPORT_LOCAL_MEDIA),
  articleReadLocalMedia: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_READ_LOCAL_MEDIA, articleId),
  articleSaveToLibrary: (id) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_SAVE_TO_LIBRARY, id),

  // Highlight
  highlightList: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_LIST, articleId),
  highlightCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_CREATE, input),
  highlightDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_DELETE, id),
  highlightUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_UPDATE, input),
  highlightExport: (articleId, mode) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_EXPORT, articleId, mode),
  highlightListByBook: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_LIST_BY_BOOK, bookId),
  highlightCreateForBook: (input) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_CREATE_FOR_BOOK, input),

  // Tag
  tagList: () => ipcRenderer.invoke(IPC_CHANNELS.TAG_LIST),
  tagCreate: (name, parentId) => ipcRenderer.invoke(IPC_CHANNELS.TAG_CREATE, name, parentId),
  tagDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.TAG_DELETE, id),
  articleTagAdd: (articleId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_TAG_ADD, articleId, tagId),
  articleTagRemove: (articleId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_TAG_REMOVE, articleId, tagId),
  articleListByTag: (tagId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_LIST_BY_TAG, tagId),
  articleTagsForArticle: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_TAGS_FOR_ARTICLE, articleId),

  // Highlight-Tag
  highlightTagAdd: (highlightId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_TAG_ADD, highlightId, tagId),
  highlightTagRemove: (highlightId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_TAG_REMOVE, highlightId, tagId),
  highlightTagsForHighlight: (highlightId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_TAGS_FOR_HIGHLIGHT, highlightId),
  highlightTagsBatch: (highlightIds) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_TAGS_BATCH, highlightIds),

  // Book
  bookList: (query) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_LIST, query),
  bookGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET, id),
  bookImport: () => ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT),
  bookDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_DELETE, id),
  bookUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_UPDATE, input),
  bookGetContent: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_CONTENT, id),
  bookGetFilePath: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_FILE_PATH, id),
  bookReadFile: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_READ_FILE, id),
  bookPermanentDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_PERMANENT_DELETE, id),
  bookRestore: (id) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_RESTORE, id),

  // Book Highlight
  bookHighlightList: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_HIGHLIGHT_LIST, bookId),
  bookHighlightCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_HIGHLIGHT_CREATE, input),

  // Transcript
  transcriptGet: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_GET, articleId),
  transcriptFetch: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_FETCH, articleId),
  transcriptUpdateSpeaker: (articleId, speakerId, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_UPDATE_SPEAKER, articleId, speakerId, name),

  // YouTube 视频流
  youtubeGetStreamUrl: (videoId) => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_GET_STREAM_URL, videoId),

  // YouTube 认证
  youtubeLogin: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_LOGIN),
  youtubeLogout: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_LOGOUT),
  youtubeAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_AUTH_STATUS),

  // Podcast
  podcastSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.PODCAST_SEARCH, query),
  podcastResolveUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.PODCAST_RESOLVE_URL, url),

  // Download
  downloadStart: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, articleId),
  downloadCancel: (downloadId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, downloadId),
  downloadList: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_LIST),
  downloadStatus: (downloadId) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_STATUS, downloadId),
  downloadOpenDir: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_OPEN_DIR),
  externalOpenUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.EXTERNAL_OPEN_URL, url),

  // Settings
  settingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  settingsSet: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),

  // Discover
  discoverSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_SEARCH, query),
  discoverRsshubCategories: () => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_CATEGORIES),
  discoverRsshubRoutes: (category) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_ROUTES, category),
  discoverPreview: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_PREVIEW, feedUrl),
  discoverRsshubConfig: (baseUrl) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_CONFIG, baseUrl),
  // Newsletter
  newsletterCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.NEWSLETTER_CREATE, input),

  // Share Card
  shareCardExportImage: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHARE_CARD_EXPORT_IMAGE, dataUrl, defaultName),
  shareCardCopyClipboard: (dataUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHARE_CARD_COPY_CLIPBOARD, dataUrl),

  // AI
  aiSettingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_GET),
  aiSettingsSet: (settings) => ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_SET, settings),
  aiPromptPresetList: (query) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_LIST, query),
  aiPromptPresetCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_CREATE, input),
  aiPromptPresetUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_UPDATE, input),
  aiPromptPresetDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_DELETE, id),
  aiPromptPresetReorder: (items) => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_REORDER, items),
  aiPromptPresetResetBuiltins: () => ipcRenderer.invoke(IPC_CHANNELS.AI_PROMPT_PRESET_RESET_BUILTINS),
  aiSummarize: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_SUMMARIZE, input),
  aiTranslate: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_TRANSLATE, input),
  aiAutoTag: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_AUTO_TAG, input),
  aiMindmapGenerate: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_MINDMAP_GENERATE, input),
  aiMindmapGet: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.AI_MINDMAP_GET, articleId),
  aiTaskLogs: (limit) => ipcRenderer.invoke(IPC_CHANNELS.AI_TASK_LOGS, limit),

  // AI Chat 流式通信
  aiChatSend: (input) => ipcRenderer.send(IPC_CHANNELS.AI_CHAT_SEND, input),
  aiChatOnStream: (callback: (chunk: ChatStreamChunk) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: ChatStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.AI_CHAT_STREAM, handler);
    // 返回取消订阅函数，防止内存泄漏
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_STREAM, handler);
  },

  // AI Chat Session CRUD
  aiChatSessionCreate: (articleId) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_CREATE, articleId),
  aiChatSessionList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_LIST),
  aiChatSessionGet: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_GET, id),
  aiChatSessionDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_DELETE, id),

  // Agent 助手流式通信
  agentSend: (input) => ipcRenderer.send(IPC_CHANNELS.AGENT_SEND, input),
  agentOnStream: (callback: (chunk: AgentStreamChunk) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: AgentStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM, handler);
  },
  agentConfirm: (response) => ipcRenderer.send(IPC_CHANNELS.AGENT_CONFIRM, response),
  agentSessionCreate: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_CREATE),
  agentSessionList: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_LIST),
  agentSessionGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_GET, id),
  agentSessionDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_DELETE, id),
  agentGetTrustedActions: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_GET),
  agentSetTrustedActions: (actions) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_SET, actions),

  // AI 主题提取
  aiExtractTopics: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_EXTRACT_TOPICS, input),

  // AI 任务日志详情
  aiTaskLogDetail: (logId) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_TASK_LOG_DETAIL, logId),

  // ASR (语音识别)
  asrStart: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.ASR_START, articleId),
  asrCancel: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.ASR_CANCEL, articleId),
  asrOnProgress: (callback: (event: AsrProgressEvent) => void) => {
    const handler = (_event: IpcRendererEvent, data: AsrProgressEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ASR_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_PROGRESS, handler);
  },
  asrOnSegment: (callback: (event: AsrSegmentEvent) => void) => {
    const handler = (_event: IpcRendererEvent, data: AsrSegmentEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ASR_SEGMENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_SEGMENT, handler);
  },
  asrOnComplete: (callback: (event: AsrCompleteEvent) => void) => {
    const handler = (_event: IpcRendererEvent, data: AsrCompleteEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ASR_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_COMPLETE, handler);
  },
  asrOnError: (callback: (event: AsrErrorEvent) => void) => {
    const handler = (_event: IpcRendererEvent, data: AsrErrorEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ASR_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_ERROR, handler);
  },

  // App Task (通用任务系统)
  appTaskCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.APP_TASK_CREATE, input),
  appTaskCancel: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.APP_TASK_CANCEL, taskId),
  appTaskList: () => ipcRenderer.invoke(IPC_CHANNELS.APP_TASK_LIST),
  appTaskOnUpdated: (callback: (task: AppTask) => void) => {
    const handler = (_event: IpcRendererEvent, task: AppTask) => callback(task);
    ipcRenderer.on(IPC_CHANNELS.APP_TASK_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_TASK_UPDATED, handler);
  },

  // Notification (通知系统)
  notificationList: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_LIST),
  notificationRead: (id) => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_READ, id),
  notificationReadAll: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_READ_ALL),
  notificationClear: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_CLEAR),
  notificationOnNew: (callback: (notification: AppNotification) => void) => {
    const handler = (_event: IpcRendererEvent, notification: AppNotification) => callback(notification);
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_NEW, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_NEW, handler);
  },
  notificationUnreadCount: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_UNREAD_COUNT),

  // Sync (iCloud 同步)
  syncGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_STATUS),
  syncEnable: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_ENABLE),
  syncDisable: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_DISABLE),
  syncNow: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_NOW),
  syncGetDevices: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_DEVICES),

  // WeChat (微信公众号)
  wechatParseArticleUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_PARSE_ARTICLE_URL, url),
  wechatSetToken: (feedId, tokenUrl) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_SET_TOKEN, feedId, tokenUrl),
  wechatGetTokenStatus: (feedId) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_GET_TOKEN_STATUS, feedId),
  wechatFetchArticleList: (input) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_FETCH_ARTICLE_LIST, input),
  wechatDownloadContent: (input) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_DOWNLOAD_CONTENT, input),
  wechatFetchStats: (input) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_FETCH_STATS, input),
  wechatGetStats: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_GET_STATS, articleId),
  wechatGetComments: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_GET_COMMENTS, articleId),
  wechatCancelTask: (feedId) => ipcRenderer.invoke(IPC_CHANNELS.WECHAT_CANCEL_TASK, feedId),
  wechatOnProgress: (callback: (event: WechatProgressEvent) => void) => {
    const handler = (_event: IpcRendererEvent, data: WechatProgressEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.WECHAT_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WECHAT_PROGRESS, handler);
  },

  // Knowledge Graph (知识图谱)
  kgExtract: (input) => ipcRenderer.invoke(IPC_CHANNELS.KG_EXTRACT, input),
  kgGetArticleGraph: (sourceType, sourceId) => ipcRenderer.invoke(IPC_CHANNELS.KG_GET_ARTICLE_GRAPH, sourceType, sourceId),
  kgGetOverview: (topN) => ipcRenderer.invoke(IPC_CHANNELS.KG_GET_OVERVIEW, topN),
  kgSearchEntities: (query, type) => ipcRenderer.invoke(IPC_CHANNELS.KG_SEARCH_ENTITIES, query, type),
  kgGetSubgraph: (entityId, depth) => ipcRenderer.invoke(IPC_CHANNELS.KG_GET_SUBGRAPH, entityId, depth),
  kgGetStats: () => ipcRenderer.invoke(IPC_CHANNELS.KG_GET_STATS),
  kgRemove: (sourceType, sourceId) => ipcRenderer.invoke(IPC_CHANNELS.KG_REMOVE, sourceType, sourceId),

  // Feed Relevance (智能推荐)
  feedRelevanceCompute: (input) => ipcRenderer.invoke(IPC_CHANNELS.FEED_RELEVANCE_COMPUTE, input),
  feedRelevanceBatch: (input) => ipcRenderer.invoke(IPC_CHANNELS.FEED_RELEVANCE_BATCH, input),

  // Writing Assist (写作辅助)
  writingAssistSearch: (input) => ipcRenderer.invoke(IPC_CHANNELS.WRITING_ASSIST_SEARCH, input),
  writingAssistGenerate: (input) => ipcRenderer.send(IPC_CHANNELS.WRITING_ASSIST_GENERATE, input),
  writingAssistOnStream: (callback: (chunk: WritingAssistStreamChunk) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: WritingAssistStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.WRITING_ASSIST_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WRITING_ASSIST_STREAM, handler);
  },

  // RAG Backfill (批量回填)
  ragBackfillStart: () => ipcRenderer.invoke(IPC_CHANNELS.RAG_BACKFILL_START),
  ragBackfillCancel: () => ipcRenderer.invoke(IPC_CHANNELS.RAG_BACKFILL_CANCEL),
  ragBackfillStatus: () => ipcRenderer.invoke(IPC_CHANNELS.RAG_BACKFILL_STATUS),
  ragBackfillOnProgress: (callback: (progress: RAGBackfillProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: RAGBackfillProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.RAG_BACKFILL_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RAG_BACKFILL_PROGRESS, handler);
  },

  // RAG Incremental (增量索引)
  ragReindex: (sourceType, sourceId) => ipcRenderer.invoke(IPC_CHANNELS.RAG_REINDEX, sourceType, sourceId),
  ragCleanup: (sourceType, sourceId) => ipcRenderer.invoke(IPC_CHANNELS.RAG_CLEANUP, sourceType, sourceId),

  // Embedding Config (Embedding 独立配置)
  embeddingConfigGet: () => ipcRenderer.invoke(IPC_CHANNELS.EMBEDDING_CONFIG_GET),
  embeddingConfigSet: (config: EmbeddingConfig) => ipcRenderer.invoke(IPC_CHANNELS.EMBEDDING_CONFIG_SET, config),

  // Translation 沉浸式翻译
  translationStart: (input) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_START, input),
  translationCancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_CANCEL, id),
  translationGet: (input) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_GET, input),
  translationDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_DELETE, id),
  translationList: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_LIST, articleId),
  translationOnProgress: (callback: (event: TranslationProgressEvent) => void) => {
    const handler = (_event: IpcRendererEvent, event: TranslationProgressEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.TRANSLATION_ON_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_ON_PROGRESS, handler);
  },
  translationSettingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_SETTINGS_GET),
  translationSettingsSet: (partial) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION_SETTINGS_SET, partial),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
