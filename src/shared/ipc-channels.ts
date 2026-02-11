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
  BOOK_PERMANENT_DELETE: 'book:permanentDelete',
  BOOK_RESTORE: 'book:restore',

  // Book Highlight
  BOOK_HIGHLIGHT_LIST: 'bookHighlight:list',
  BOOK_HIGHLIGHT_CREATE: 'bookHighlight:create',

  // Transcript
  TRANSCRIPT_GET: 'transcript:get',
  TRANSCRIPT_FETCH: 'transcript:fetch',
} as const;
