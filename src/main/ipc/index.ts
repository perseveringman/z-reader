import { registerFeedHandlers } from './feed-handlers';
import { registerArticleHandlers } from './article-handlers';
import { registerHighlightHandlers } from './highlight-handlers';
import { registerTagHandlers } from './tag-handlers';
import { registerExportHandlers } from './export-handlers';

export function registerAllIpcHandlers() {
  registerFeedHandlers();
  registerArticleHandlers();
  registerHighlightHandlers();
  registerTagHandlers();
  registerExportHandlers();
}
