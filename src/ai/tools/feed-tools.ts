/**
 * 订阅源相关 AI Tools
 * 提供列出订阅源、获取阅读统计等能力
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/** 创建订阅源相关的 AI Tools */
export function createFeedTools(ctx: ToolContext) {
  return {
    /** 获取所有订阅源列表 */
    list_feeds: tool({
      description: '获取所有已订阅的 RSS 源列表',
      inputSchema: z.object({}),
      execute: async () => {
        const feeds = await ctx.listFeeds();
        return { feeds, count: feeds.length };
      },
    }),

    /** 获取阅读统计数据 */
    get_reading_stats: tool({
      description: '获取阅读统计数据，包括已读文章数和总文章数',
      inputSchema: z.object({
        days: z.number().optional().describe('统计天数范围，默认 7 天'),
      }),
      execute: async ({ days }) => {
        const stats = await ctx.getReadingStats(days ?? 7);
        return stats;
      },
    }),
  };
}
