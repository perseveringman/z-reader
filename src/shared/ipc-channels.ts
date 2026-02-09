export const IPC_CHANNELS = {
  // Feed
  FEED_ADD: 'feed:add',
  FEED_LIST: 'feed:list',
  FEED_UPDATE: 'feed:update',
  FEED_DELETE: 'feed:delete',
  FEED_FETCH: 'feed:fetch',
  FEED_FETCH_ALL: 'feed:fetchAll',
  FEED_IMPORT_OPML: 'feed:importOpml',

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

  // Highlight
  HIGHLIGHT_LIST: 'highlight:list',
  HIGHLIGHT_CREATE: 'highlight:create',
  HIGHLIGHT_DELETE: 'highlight:delete',

  // Tag
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_DELETE: 'tag:delete',
  ARTICLE_TAG_ADD: 'articleTag:add',
  ARTICLE_TAG_REMOVE: 'articleTag:remove',
} as const;
