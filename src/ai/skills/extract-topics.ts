import { z } from 'zod';
import { generateObject } from 'ai';
import type { AISkill, AIContext } from './types';

/**
 * extract_topics Skill
 * 从文章内容提取核心主题关键词
 */
export const extractTopicsSkill: AISkill<{ articleId: string }, { topics: string[] }> = {
  name: 'extract_topics',
  description: '从文章内容提取主题关键词',
  inputSchema: z.object({ articleId: z.string() }),
  execute: async (input, ctx) => {
    const content = await ctx.getArticleContent?.(input.articleId);
    if (!content) throw new Error('文章内容为空');

    const result = await generateObject({
      model: ctx.getModel('fast'),
      schema: z.object({
        topics: z.array(z.string()).describe('5-10 个最关键的主题关键词'),
      }),
      prompt: `提取以下文章的 5-10 个核心主题关键词，每个关键词 2-4 个字：\n\n${content.slice(0, 6000)}`,
    });

    return { topics: result.object.topics };
  },
};
