/**
 * AI Tools 统一导出
 * 汇总所有 Tool 模块，提供 createAllTools() 工厂函数
 */

export type { ToolContext } from './types';
export { createArticleTools } from './article-tools';
export { createTagTools } from './tag-tools';
export { createFeedTools } from './feed-tools';
export { createHighlightTools } from './highlight-tools';

import type { ToolContext } from './types';
import { createArticleTools } from './article-tools';
import { createTagTools } from './tag-tools';
import { createFeedTools } from './feed-tools';
import { createHighlightTools } from './highlight-tools';

/**
 * 创建所有 AI Tools 的合集
 * 将各模块的 tools 合并为一个扁平的 Record，供 AI SDK 的 generateText/streamText 使用
 */
export function createAllTools(ctx: ToolContext) {
  return {
    ...createArticleTools(ctx),
    ...createTagTools(ctx),
    ...createFeedTools(ctx),
    ...createHighlightTools(ctx),
  };
}
