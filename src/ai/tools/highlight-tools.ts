/**
 * 高亮相关 AI Tools
 * 提供列出高亮、创建高亮等能力
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/** 创建高亮相关的 AI Tools */
export function createHighlightTools(ctx: ToolContext) {
  return {
    /** 获取文章的高亮列表 */
    list_highlights: tool({
      description: '获取指定文章的所有高亮标注列表',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
      }),
      execute: async ({ articleId }) => {
        const highlights = await ctx.listHighlights(articleId);
        return { highlights, count: highlights.length };
      },
    }),

    /** 创建高亮标注 */
    create_highlight: tool({
      description: '为文章创建高亮标注，可附带笔记',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
        text: z.string().describe('高亮的文本内容'),
        note: z.string().optional().describe('附加笔记说明'),
      }),
      execute: async ({ articleId, text, note }) => {
        await ctx.createHighlight(articleId, text, note);
        return { success: true };
      },
    }),
  };
}
