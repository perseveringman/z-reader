/**
 * 文章相关 AI Tools
 * 提供搜索文章、获取内容、标记已读、归档等能力
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/** 创建文章相关的 AI Tools */
export function createArticleTools(ctx: ToolContext) {
  return {
    /** 搜索文章，支持关键词查询 */
    search_articles: tool({
      description: '搜索文章，支持关键词查询标题和摘要',
      inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
        limit: z.number().optional().describe('最大返回数量，默认 5'),
      }),
      execute: async ({ query, limit }) => {
        const results = await ctx.searchArticles(query, limit ?? 5);
        return { articles: results, count: results.length };
      },
    }),

    /** 获取文章完整内容 */
    get_article_content: tool({
      description: '获取文章的完整正文内容',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
      }),
      execute: async ({ articleId }) => {
        const content = await ctx.getArticleContent(articleId);
        return { content: content ?? '（文章内容为空）' };
      },
    }),

    /** 将文章标记为已读 */
    mark_as_read: tool({
      description: '将文章标记为已读',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
      }),
      execute: async ({ articleId }) => {
        await ctx.markAsRead(articleId);
        return { success: true };
      },
    }),

    /** 归档文章 */
    archive_article: tool({
      description: '归档文章，将文章移入归档列表',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
      }),
      execute: async ({ articleId }) => {
        await ctx.archiveArticle(articleId);
        return { success: true };
      },
    }),
  };
}
