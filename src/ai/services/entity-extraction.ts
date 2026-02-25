import { z } from 'zod';
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';

// ==================== Zod Schemas ====================

/** 单个抽取出的实体 */
export const extractedEntitySchema = z.object({
  name: z
    .string()
    .describe('实体名称，保持原始大小写和完整表述，如 "React", "Elon Musk"'),
  type: z
    .enum(['concept', 'person', 'technology', 'topic', 'organization'])
    .describe(
      '实体类型: concept=抽象概念, person=人物, technology=技术/工具, topic=主题/领域, organization=组织/公司'
    ),
  description: z
    .string()
    .describe('实体的简短描述，1-2 句话概括其含义或在文中的角色'),
  aliases: z
    .array(z.string())
    .describe('实体的别名或缩写，例如 ["JS"] 对应 "JavaScript"'),
});

/** 单个抽取出的关系 */
export const extractedRelationSchema = z.object({
  source: z.string().describe('关系的源实体名称（必须出现在 entities 列表中）'),
  target: z
    .string()
    .describe('关系的目标实体名称（必须出现在 entities 列表中）'),
  type: z
    .enum([
      'related_to',
      'part_of',
      'prerequisite',
      'contrasts_with',
      'applied_in',
      'created_by',
    ])
    .describe(
      '关系类型: related_to=相关, part_of=组成部分, prerequisite=前置条件, contrasts_with=对比, applied_in=应用于, created_by=创建者'
    ),
});

/** 完整抽取结果 */
export const extractionResultSchema = z.object({
  entities: z
    .array(extractedEntitySchema)
    .describe('从文本中识别出的关键实体，通常 5-15 个'),
  relations: z
    .array(extractedRelationSchema)
    .describe('实体之间的关系，source 和 target 必须在 entities 列表中'),
});

// ==================== 类型定义 ====================

export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedRelation = z.infer<typeof extractedRelationSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** 抽取输入（来自 RAG chunks） */
export interface ExtractInput {
  chunkId: string;
  content: string;
  sourceTitle: string;
}

/** 实体抽取服务的依赖 */
export interface EntityExtractionDeps {
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
}

// ==================== 常量 ====================

/** 单次 LLM 调用的最大内容长度 */
const MAX_CONTENT_LENGTH = 8000;

/** 构建实体抽取 prompt */
function buildExtractionPrompt(
  sourceTitle: string,
  content: string
): string {
  return `你是一个知识图谱实体抽取专家。请从以下文章内容中识别关键实体和它们之间的关系。

## 文章标题
${sourceTitle}

## 文章内容
${content}

## 要求
1. 识别 5-15 个最关键的实体（概念、人物、技术、主题、组织）
2. 为每个实体提供简短描述和可能的别名
3. 识别实体之间的关系，关系的 source 和 target 必须使用 entities 列表中的准确名称
4. 优先抽取有实质意义的实体，跳过过于宽泛或无信息量的词语
5. 实体名称保持原始语言（中文文章用中文名，英文文章用英文名）`;
}

// ==================== Service ====================

/**
 * 创建实体抽取服务
 * 使用 LLM 结构化输出从文本中提取实体和关系
 */
export function createEntityExtractionService(deps: EntityExtractionDeps) {
  /**
   * 单次抽取（内容已截断到 MAX_CONTENT_LENGTH）
   */
  async function extractSingle(
    sourceTitle: string,
    content: string
  ): Promise<ExtractionResult> {
    const result = await generateObject({
      model: deps.getModel('fast'),
      schema: extractionResultSchema,
      prompt: buildExtractionPrompt(sourceTitle, content),
    });

    return result.object;
  }

  /**
   * 合并多次抽取结果，对相同实体名称去重
   */
  function mergeResults(results: ExtractionResult[]): ExtractionResult {
    const entityMap = new Map<string, ExtractedEntity>();
    const allRelations: ExtractedRelation[] = [];

    for (const result of results) {
      for (const entity of result.entities) {
        const key = entity.name.toLowerCase().trim();
        const existing = entityMap.get(key);
        if (!existing) {
          entityMap.set(key, entity);
        } else {
          // 合并 aliases
          const mergedAliases = Array.from(
            new Set([...existing.aliases, ...entity.aliases])
          );
          // 保留更长的 description
          const mergedDescription =
            entity.description.length > existing.description.length
              ? entity.description
              : existing.description;
          entityMap.set(key, {
            ...existing,
            aliases: mergedAliases,
            description: mergedDescription,
          });
        }
      }
      allRelations.push(...result.relations);
    }

    // 对关系去重
    const relSet = new Set<string>();
    const uniqueRelations: ExtractedRelation[] = [];
    for (const rel of allRelations) {
      const key = `${rel.source.toLowerCase()}|${rel.target.toLowerCase()}|${rel.type}`;
      if (!relSet.has(key)) {
        relSet.add(key);
        uniqueRelations.push(rel);
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      relations: uniqueRelations,
    };
  }

  return {
    /**
     * 从一组 chunks 中抽取实体和关系
     * 如果内容超过 MAX_CONTENT_LENGTH，分批抽取后合并
     */
    async extract(chunks: ExtractInput[]): Promise<ExtractionResult> {
      if (chunks.length === 0) {
        return { entities: [], relations: [] };
      }

      const sourceTitle = chunks[0].sourceTitle;

      // 合并所有 chunk 内容
      const fullContent = chunks.map((c) => c.content).join('\n\n');

      if (fullContent.length <= MAX_CONTENT_LENGTH) {
        // 单次抽取
        return extractSingle(sourceTitle, fullContent);
      }

      // 分批抽取
      const batches: string[] = [];
      let current = '';
      for (const chunk of chunks) {
        if (
          current.length + chunk.content.length + 2 >
          MAX_CONTENT_LENGTH
        ) {
          if (current.length > 0) {
            batches.push(current);
          }
          current = chunk.content;
        } else {
          current += (current ? '\n\n' : '') + chunk.content;
        }
      }
      if (current.length > 0) {
        batches.push(current);
      }

      // 并行抽取各批次
      const results = await Promise.all(
        batches.map((batch) => extractSingle(sourceTitle, batch))
      );

      return mergeResults(results);
    },
  };
}
