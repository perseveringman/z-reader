import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/ipc-channels';
import type { ElectronAPI } from './shared/types';

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

  // Settings
  settingsGet: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  settingsSet: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),

  // Discover
  discoverSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_SEARCH, query),
  discoverRsshubCategories: () => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_CATEGORIES),
  discoverRsshubRoutes: (category) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_ROUTES, category),
  discoverPreview: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_PREVIEW, feedUrl),
  discoverRsshubConfig: (baseUrl) => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_RSSHUB_CONFIG, baseUrl),
  // Agent
  agentApprovalList: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_APPROVAL_LIST),
  agentApprovalDecide: (input) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_APPROVAL_DECIDE, input),
  agentReplayGet: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_REPLAY_GET, taskId),
  agentPolicyGet: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_POLICY_GET),
  agentPolicySet: (patch) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_POLICY_SET, patch),
  agentSnapshotList: (query) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SNAPSHOT_LIST, query),
  agentSnapshotCleanup: (input) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SNAPSHOT_CLEANUP, input),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
