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

  // Highlight
  highlightList: (articleId) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_LIST, articleId),
  highlightCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_CREATE, input),
  highlightDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHT_DELETE, id),

  // Tag
  tagList: () => ipcRenderer.invoke(IPC_CHANNELS.TAG_LIST),
  tagCreate: (name, parentId) => ipcRenderer.invoke(IPC_CHANNELS.TAG_CREATE, name, parentId),
  tagDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.TAG_DELETE, id),
  articleTagAdd: (articleId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_TAG_ADD, articleId, tagId),
  articleTagRemove: (articleId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.ARTICLE_TAG_REMOVE, articleId, tagId),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
