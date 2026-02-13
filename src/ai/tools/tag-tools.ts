/**
 * 标签相关 AI Tools
 * 提供列出标签、添加标签、移除标签等能力
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/** 创建标签相关的 AI Tools */
export function createTagTools(ctx: ToolContext) {
  return {
    /** 获取所有标签列表 */
    list_tags: tool({
      description: '获取所有可用的标签列表',
      inputSchema: z.object({}),
      execute: async () => {
        const tags = await ctx.listTags();
        return { tags, count: tags.length };
      },
    }),

    /** 为文章添加标签 */
    add_tag: tool({
      description: '为指定文章添加标签，如果标签不存在则自动创建',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
        tagName: z.string().describe('标签名称'),
      }),
      execute: async ({ articleId, tagName }) => {
        await ctx.addTag(articleId, tagName);
        return { success: true };
      },
    }),

    /** 移除文章标签 */
    remove_tag: tool({
      description: '移除指定文章上的标签',
      inputSchema: z.object({
        articleId: z.string().describe('文章 ID'),
        tagName: z.string().describe('标签名称'),
      }),
      execute: async ({ articleId, tagName }) => {
        await ctx.removeTag(articleId, tagName);
        return { success: true };
      },
    }),
  };
}
