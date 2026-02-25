import type { SearchResult } from './retriever';

/** 上下文构建配置 */
export interface ContextBuilderConfig {
  /** 最大上下文 token 数 */
  maxTokens?: number;
  /** 是否包含来源引用 */
  includeReferences?: boolean;
  /** 来源标题查询函数 */
  getSourceTitle?: (sourceType: string, sourceId: string) => Promise<string | null>;
}

/** 构建后的上下文 */
export interface BuiltContext {
  /** 组装后的上下文文本 */
  text: string;
  /** 引用的来源列表 */
  references: Array<{
    sourceType: string;
    sourceId: string;
    title: string | null;
    chunkIndex: number;
  }>;
  /** 估算的 token 数 */
  tokenCount: number;
}

const DEFAULT_CONFIG: Required<ContextBuilderConfig> = {
  maxTokens: 4000,
  includeReferences: true,
  getSourceTitle: async () => null,
};

/**
 * 估算 token 数
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Context Builder
 * 将检索结果组装为 LLM 可用的上下文
 */
export class ContextBuilder {
  private config: Required<ContextBuilderConfig>;

  constructor(config?: ContextBuilderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 构建上下文 */
  async build(results: SearchResult[]): Promise<BuiltContext> {
    if (results.length === 0) {
      return { text: '', references: [], tokenCount: 0 };
    }

    const contextParts: string[] = [];
    const references: BuiltContext['references'] = [];
    let currentTokens = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const chunkTokens = estimateTokens(result.content);

      // 检查是否超过最大 token 限制
      if (currentTokens + chunkTokens > this.config.maxTokens) {
        break;
      }

      // 获取来源标题
      const title = await this.config.getSourceTitle(result.sourceType, result.sourceId);

      // 构建上下文片段
      const refId = i + 1;
      const contextPart = this.config.includeReferences
        ? `[${refId}] ${result.content}`
        : result.content;

      contextParts.push(contextPart);
      currentTokens += chunkTokens;

      references.push({
        sourceType: result.sourceType,
        sourceId: result.sourceId,
        title,
        chunkIndex: result.chunkIndex,
      });
    }

    const text = contextParts.join('\n\n---\n\n');

    return {
      text,
      references,
      tokenCount: currentTokens,
    };
  }

  /** 构建带引用说明的系统提示后缀 */
  buildSystemPromptSuffix(references: BuiltContext['references']): string {
    if (references.length === 0) {
      return '';
    }

    const refLines = references.map((ref, index) => {
      const title = ref.title ?? `${ref.sourceType}/${ref.sourceId}`;
      return `[${index + 1}] ${title}`;
    });

    return `\n\n以下是从用户知识库中检索到的相关内容，请基于这些内容回答问题。如果答案来自特定来源，请标注引用编号（如 [1]）。\n\n来源列表：\n${refLines.join('\n')}`;
  }
}

/** 创建 Context Builder 实例 */
export function createContextBuilder(config?: ContextBuilderConfig): ContextBuilder {
  return new ContextBuilder(config);
}
