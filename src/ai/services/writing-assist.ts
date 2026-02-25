import { streamText } from 'ai';
import type Database from 'better-sqlite3';
import type { HybridRetriever, SearchResult } from './retriever';
import type { EntityRow } from '../providers/kg-db';
import type { WritingAssistSearchResult, WritingAssistStreamChunk } from '../../shared/types';
import type { LanguageModel } from 'ai';

interface WritingAssistServiceDeps {
  retriever: HybridRetriever;
  sqlite: Database.Database;
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
  /** KG searchEntities 函数（可选，KG 模块可能未初始化） */
  kgSearchEntities?: (query: string) => EntityRow[];
}

/**
 * 写作辅助服务
 * 综合 RAG、知识图谱、高亮注释生成写作参考材料
 */
export function createWritingAssistService(deps: WritingAssistServiceDeps) {
  const { retriever, sqlite, getModel, kgSearchEntities } = deps;

  return {
    /**
     * 搜索相关材料
     * 并行: RAG 混合检索 + KG 实体搜索 + 高亮注释搜索
     */
    async search(topic: string, topK = 15): Promise<WritingAssistSearchResult> {
      // 并行执行三路搜索
      const [ragResults, entities, highlights] = await Promise.all([
        // RAG 混合检索（限 Library 分区）
        retriever.search({
          text: topic,
          topK,
          filters: { partition: 'library' },
          mode: 'hybrid',
        }).catch((err) => {
          console.error('Writing assist RAG search failed:', err);
          return [] as SearchResult[];
        }),

        // KG 实体搜索
        Promise.resolve().then(() => {
          if (!kgSearchEntities) return [];
          try {
            return kgSearchEntities(topic);
          } catch (err) {
            console.error('Writing assist KG search failed:', err);
            return [];
          }
        }),

        // 高亮注释搜索
        Promise.resolve().then(() => {
          try {
            const rows = sqlite.prepare(`
              SELECT h.text, a.title AS article_title
              FROM highlights h
              LEFT JOIN articles a ON h.article_id = a.id
              WHERE h.text LIKE ? AND h.deleted_flg = 0
              ORDER BY h.created_at DESC
              LIMIT 20
            `).all(`%${topic}%`) as Array<{ text: string | null; article_title: string | null }>;
            return rows;
          } catch (err) {
            console.error('Writing assist highlights search failed:', err);
            return [];
          }
        }),
      ]);

      // 按文章分组 RAG 结果
      const articleMap = new Map<string, {
        id: string;
        title: string | null;
        maxScore: number;
        snippets: string[];
      }>();

      for (const result of ragResults) {
        if (result.sourceType !== 'article') continue;
        const existing = articleMap.get(result.sourceId);
        const title = (result.metadata?.title as string) || null;

        if (existing) {
          existing.snippets.push(result.content.slice(0, 200));
          if (result.score > existing.maxScore) {
            existing.maxScore = result.score;
          }
        } else {
          articleMap.set(result.sourceId, {
            id: result.sourceId,
            title,
            maxScore: result.score,
            snippets: [result.content.slice(0, 200)],
          });
        }
      }

      // 排序并限制
      const articles = Array.from(articleMap.values())
        .sort((a, b) => b.maxScore - a.maxScore)
        .slice(0, 10)
        .map(a => ({
          id: a.id,
          title: a.title,
          relevance: Math.round(a.maxScore * 1000) / 1000,
          snippets: a.snippets.slice(0, 3),
        }));

      // 格式化实体
      const formattedEntities = entities.slice(0, 10).map(e => ({
        name: e.name,
        type: e.type,
        description: e.description,
      }));

      // 格式化高亮
      const formattedHighlights = highlights
        .filter(h => h.text)
        .slice(0, 10)
        .map(h => ({
          text: h.text!,
          articleTitle: h.article_title,
        }));

      return {
        articles,
        entities: formattedEntities,
        highlights: formattedHighlights,
      };
    },

    /**
     * 流式生成写作辅助材料
     * 返回 async generator
     */
    async *generateStream(
      topic: string,
      searchResults: WritingAssistSearchResult
    ): AsyncGenerator<WritingAssistStreamChunk> {
      // 组装上下文
      const contextParts: string[] = [];

      if (searchResults.articles.length > 0) {
        contextParts.push('## 相关文章');
        for (const article of searchResults.articles) {
          contextParts.push(`### ${article.title || '无标题'} (相关度: ${article.relevance})`);
          for (const snippet of article.snippets) {
            contextParts.push(`> ${snippet}`);
          }
        }
      }

      if (searchResults.entities.length > 0) {
        contextParts.push('\n## 相关概念/实体');
        for (const entity of searchResults.entities) {
          const desc = entity.description ? `: ${entity.description}` : '';
          contextParts.push(`- **${entity.name}** (${entity.type})${desc}`);
        }
      }

      if (searchResults.highlights.length > 0) {
        contextParts.push('\n## 相关笔记/高亮');
        for (const hl of searchResults.highlights) {
          const source = hl.articleTitle ? ` —— ${hl.articleTitle}` : '';
          contextParts.push(`- "${hl.text}"${source}`);
        }
      }

      const context = contextParts.join('\n');

      const systemPrompt = `你是一位写作辅助助手。用户正在围绕特定主题进行写作。
你的任务是根据用户的个人知识库中检索到的参考材料，为用户整理有价值的写作素材。

请按以下结构组织输出（使用 Markdown 格式）：
1. **主题概述**: 简要概括该主题在用户资料库中的覆盖情况
2. **关键观点**: 从参考材料中提炼的核心观点和见解（带引用来源）
3. **概念关联**: 相关概念之间的关联和对比
4. **精选引用**: 最有价值的原文引用段落
5. **写作建议**: 基于素材的写作方向和大纲建议

注意：
- 始终标注信息来源（文章标题）
- 用中文回复
- 保持客观，忠实于原始材料
- 如果参考材料不足，如实说明`;

      const userMessage = `主题：${topic}\n\n参考材料：\n${context}`;

      try {
        const result = streamText({
          model: getModel('smart'),
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        let fullText = '';
        for await (const chunk of result.textStream) {
          fullText += chunk;
          yield {
            type: 'text-delta' as const,
            textDelta: chunk,
          };
        }

        yield {
          type: 'done' as const,
          fullText,
        };
      } catch (error) {
        yield {
          type: 'error' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
