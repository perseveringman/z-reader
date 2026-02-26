/**
 * ToolContext 工厂
 * 注入 Drizzle DB 实例，实现 ToolContext 接口的每个方法
 * 这是 src/ai/ 与 src/main/ 的桥接点
 */

import { eq, like, and, gte, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ToolContext } from '../../ai/tools/types';
import {
  articles,
  feeds,
  tags,
  articleTags,
  highlights,
  researchSpaceSources,
  researchArtifacts,
} from '../db/schema';
import type { getDatabase } from '../db';
import type { HybridRetriever } from '../../ai/services/retriever';
import { createContextBuilder } from '../../ai/services/context-builder';

type DrizzleDB = ReturnType<typeof getDatabase>;

/** 可选的 RAG 依赖（研究模块需要） */
export interface ToolContextRAGDeps {
  retriever: HybridRetriever;
}

/**
 * 创建 ToolContext 实例
 * 将 Drizzle ORM 数据库操作注入到 AI Tool Calling 所需的上下文中
 *
 * @param db - Drizzle ORM 数据库实例
 * @param ragDeps - 可选的 RAG 依赖，提供后启用研究相关方法
 */
export function createToolContext(
  db: DrizzleDB,
  ragDeps?: ToolContextRAGDeps,
): ToolContext {
  return {
    // ==================== 文章操作 ====================

    searchArticles: async (query, limit = 10) => {
      // 使用 LIKE 模糊匹配标题
      const rows = await db
        .select({
          id: articles.id,
          title: articles.title,
          summary: articles.summary,
        })
        .from(articles)
        .where(
          and(
            like(articles.title, `%${query}%`),
            eq(articles.deletedFlg, 0),
          ),
        )
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        title: r.title ?? '',
        summary: r.summary,
      }));
    },

    getArticleContent: async (articleId) => {
      const row = await db
        .select({
          contentText: articles.contentText,
          content: articles.content,
        })
        .from(articles)
        .where(eq(articles.id, articleId))
        .get();

      if (!row) return null;
      return row.contentText || row.content || null;
    },

    markAsRead: async (articleId) => {
      const now = new Date().toISOString();
      await db
        .update(articles)
        .set({ readStatus: 'seen', updatedAt: now })
        .where(eq(articles.id, articleId));
    },

    archiveArticle: async (articleId) => {
      // 文章使用 readStatus = 'archive' 表示归档状态
      const now = new Date().toISOString();
      await db
        .update(articles)
        .set({ readStatus: 'archive', updatedAt: now })
        .where(eq(articles.id, articleId));
    },

    // ==================== 标签操作 ====================

    listTags: async () => {
      const rows = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.deletedFlg, 0));
      return rows;
    },

    addTag: async (articleId, tagName) => {
      const now = new Date().toISOString();

      // 查找已有标签（忽略大小写）
      const allTags = await db
        .select()
        .from(tags)
        .where(eq(tags.deletedFlg, 0));
      let existingTag = allTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );

      // 标签不存在则创建
      if (!existingTag) {
        const newTagId = randomUUID();
        await db.insert(tags).values({
          id: newTagId,
          name: tagName,
          parentId: null,
          createdAt: now,
          updatedAt: now,
        });
        existingTag = {
          id: newTagId,
          name: tagName,
          parentId: null,
          createdAt: now,
          updatedAt: now,
          deletedFlg: 0,
        };
      }

      // 检查关联是否已存在
      const existing = await db
        .select()
        .from(articleTags)
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(articleTags.tagId, existingTag.id),
          ),
        );

      if (existing.length === 0) {
        await db.insert(articleTags).values({
          articleId,
          tagId: existingTag.id,
          createdAt: now,
        });
      }
    },

    removeTag: async (articleId, tagName) => {
      // 根据名称找到标签
      const allTags = await db
        .select()
        .from(tags)
        .where(eq(tags.deletedFlg, 0));
      const tag = allTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );

      if (!tag) return; // 标签不存在，无需操作

      // 删除关联
      await db
        .delete(articleTags)
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(articleTags.tagId, tag.id),
          ),
        );
    },

    // ==================== 订阅源操作 ====================

    listFeeds: async () => {
      const rows = await db
        .select({ id: feeds.id, title: feeds.title, url: feeds.url })
        .from(feeds)
        .where(eq(feeds.deletedFlg, 0));
      return rows;
    },

    getReadingStats: async (days = 7) => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString();

      // 已读文章数（readStatus 为 seen 或 archive 且在时间范围内）
      const readResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
        .where(
          and(
            eq(articles.deletedFlg, 0),
            gte(articles.updatedAt, sinceStr),
            sql`${articles.readStatus} IN ('seen', 'archive')`,
          ),
        )
        .get();

      // 总文章数
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
        .where(eq(articles.deletedFlg, 0))
        .get();

      return {
        totalRead: readResult?.count ?? 0,
        totalArticles: totalResult?.count ?? 0,
      };
    },

    // ==================== 高亮操作 ====================

    listHighlights: async (articleId) => {
      const rows = await db
        .select({
          id: highlights.id,
          text: highlights.text,
          note: highlights.note,
        })
        .from(highlights)
        .where(
          and(
            eq(highlights.articleId, articleId),
            eq(highlights.deletedFlg, 0),
          ),
        );
      return rows;
    },

    createHighlight: async (articleId, text, note) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      await db.insert(highlights).values({
        id,
        articleId,
        text,
        note: note ?? null,
        color: 'yellow',
        createdAt: now,
        updatedAt: now,
      });
    },

    // ==================== 研究操作 ====================

    searchResearchSources: async (query, sourceIds, topK = 10) => {
      if (sourceIds.length === 0) {
        return { text: '没有源材料。', references: [], tokenCount: 0 };
      }

      // 尝试 RAG 检索（如果可用且文章已索引）
      if (ragDeps) {
        try {
          const searchResults = await ragDeps.retriever.search({
            text: query,
            topK,
            filters: { sourceIds },
          });

          if (searchResults.length > 0) {
            const contextBuilder = createContextBuilder({
              maxTokens: 4000,
              includeReferences: true,
              getSourceTitle: async (sourceType, sourceId) => {
                if (sourceType === 'article') {
                  const row = await db
                    .select({ title: articles.title })
                    .from(articles)
                    .where(eq(articles.id, sourceId))
                    .get();
                  return row?.title ?? null;
                }
                return null;
              },
            });
            return contextBuilder.build(searchResults);
          }
        } catch (err) {
          console.warn('RAG search failed, falling back to full-text:', err);
        }
      }

      // Fallback: 直接从 articles 表读全文（适用于未 RAG 索引的文章）
      const rows = await db
        .select({
          id: articles.id,
          title: articles.title,
          contentText: articles.contentText,
          content: articles.content,
        })
        .from(articles)
        .where(inArray(articles.id, sourceIds));

      if (rows.length === 0) {
        return { text: '未找到源材料内容。', references: [], tokenCount: 0 };
      }

      // 构建上下文：每篇文章截取相关片段
      const queryLower = query.toLowerCase();
      const keywords = queryLower.split(/\s+/).filter(k => k.length > 1);
      const refs: Array<{ sourceType: string; sourceId: string; title: string | null; chunkIndex: number }> = [];
      const segments: string[] = [];

      for (const row of rows) {
        const fullText = row.contentText || row.content || '';
        if (!fullText) continue;

        const refIndex = refs.length + 1;
        const title = row.title ?? '无标题';
        refs.push({ sourceType: 'article', sourceId: row.id, title, chunkIndex: 0 });

        // 提取相关段落（包含关键词的段落，或前 1500 字）
        const paragraphs = fullText.split(/\n\n+/);
        let relevantText = '';
        const maxChars = 1500;

        if (keywords.length > 0) {
          // 按关键词匹配度排序段落
          const scored = paragraphs
            .filter(p => p.trim().length > 20)
            .map(p => ({
              text: p.trim(),
              score: keywords.filter(k => p.toLowerCase().includes(k)).length,
            }))
            .sort((a, b) => b.score - a.score);

          for (const item of scored) {
            if (relevantText.length + item.text.length > maxChars) break;
            relevantText += item.text + '\n\n';
          }
        }

        // 如果没有关键词匹配，取前 maxChars 字
        if (!relevantText) {
          relevantText = fullText.slice(0, maxChars);
        }

        segments.push(`[${refIndex}] ${title}:\n${relevantText.trim()}`);
      }

      const text = segments.join('\n\n---\n\n');
      return {
        text,
        references: refs,
        tokenCount: Math.ceil(text.length / 2),
      };
    },

    getSourceSummary: async (sourceType, sourceId) => {
      if (sourceType === 'article') {
        const row = await db
          .select({
            title: articles.title,
            contentText: articles.contentText,
            content: articles.content,
          })
          .from(articles)
          .where(eq(articles.id, sourceId))
          .get();

        if (!row) return null;

        const fullText = row.contentText || row.content || '';
        const summary = fullText.slice(0, 500);
        return {
          title: row.title ?? '无标题',
          summary,
          wordCount: fullText.length,
        };
      }

      // 其他类型暂不支持
      return null;
    },

    getResearchSpaceSourceIds: async (spaceId) => {
      if (!spaceId) return [];

      const rows = await db
        .select({ sourceId: researchSpaceSources.sourceId })
        .from(researchSpaceSources)
        .where(
          and(
            eq(researchSpaceSources.spaceId, spaceId),
            eq(researchSpaceSources.enabled, 1),
          ),
        );

      return rows.map((r) => r.sourceId);
    },

    saveResearchArtifact: async (input) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      await db.insert(researchArtifacts).values({
        id,
        spaceId: input.spaceId,
        type: input.type,
        title: input.title,
        content: input.content,
        prompt: input.prompt ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id };
    },
  };
}
