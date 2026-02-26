/**
 * 研究相关 AI Tools
 * 提供在研究空间内搜索源材料、获取摘要、生成研究产物等能力
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/** 创建研究相关的 AI Tools */
export function createResearchTools(ctx: ToolContext) {
  return {
    /** 在当前研究空间的源材料中搜索相关内容 */
    search_research_sources: tool({
      description:
        '在当前研究空间的源材料中搜索相关内容。返回带引用编号的相关文本片段。',
      inputSchema: z.object({
        query: z.string().describe('搜索查询'),
        topK: z
          .number()
          .optional()
          .default(10)
          .describe('返回结果数量，默认 10'),
      }),
      execute: async ({ query, topK }) => {
        const sourceIds = await ctx.getResearchSpaceSourceIds(
          ctx._researchSpaceId ?? '',
        );
        if (sourceIds.length === 0) {
          return { text: '当前空间没有启用的源材料。', references: [] };
        }
        return ctx.searchResearchSources(query, sourceIds, topK);
      },
    }),

    /** 获取指定源材料的摘要信息 */
    get_source_summary: tool({
      description: '获取指定源材料的摘要信息（标题和内容概要）',
      inputSchema: z.object({
        sourceType: z.string().describe('源类型：article 或 book'),
        sourceId: z.string().describe('源 ID'),
      }),
      execute: async ({ sourceType, sourceId }) => {
        return ctx.getSourceSummary(sourceType, sourceId);
      },
    }),

    /** 生成研究产物并保存 */
    generate_artifact: tool({
      description:
        '生成研究产物（研究报告、对比矩阵、摘要、FAQ 等）并保存',
      inputSchema: z.object({
        type: z
          .enum(['report', 'comparison', 'summary', 'faq'])
          .describe('产物类型'),
        title: z.string().describe('产物标题'),
        content: z
          .string()
          .describe('产物内容（Markdown 或 JSON 字符串）'),
      }),
      execute: async ({ type, title, content }) => {
        const result = await ctx.saveResearchArtifact({
          spaceId: ctx._researchSpaceId ?? '',
          type,
          title,
          content,
        });
        return {
          success: true,
          artifactId: result.id,
          message: `已生成并保存产物「${title}」`,
        };
      },
    }),
  };
}
