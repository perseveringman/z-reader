import { registerFeedHandlers } from './feed-handlers';
import { registerArticleHandlers } from './article-handlers';
import { registerHighlightHandlers } from './highlight-handlers';

export function registerAllIpcHandlers() {
  registerFeedHandlers();
  registerArticleHandlers();
  registerHighlightHandlers();
}
