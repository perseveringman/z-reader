import type { ChunkSourceType } from '../providers/rag-db';

/** 分块输入 */
export interface ChunkInput {
  text: string;
  sourceType: ChunkSourceType;
  metadata?: Record<string, unknown>;
}

/** 分块结果 */
export interface ChunkResult {
  content: string;
  index: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

/** 分块策略配置 */
export interface ChunkingConfig {
  /** 目标 chunk 大小（token 数） */
  targetSize?: number;
  /** 最小 chunk 大小 */
  minSize?: number;
  /** 相邻 chunk 重叠大小 */
  overlap?: number;
}

const DEFAULT_CONFIG: Required<ChunkingConfig> = {
  targetSize: 400,
  minSize: 100,
  overlap: 50,
};

/**
 * 粗略估算 token 数（中文约 2 字符/token，英文约 4 字符/token）
 * 使用简化的估算：平均 3 字符/token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Chunking Service
 * 负责将长文本切分为适合 Embedding 的片段
 */
export class ChunkingService {
  private config: Required<ChunkingConfig>;

  constructor(config?: ChunkingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 分块主方法 */
  chunk(input: ChunkInput): ChunkResult[] {
    const { text, sourceType, metadata = {} } = input;

    if (!text || text.trim().length === 0) {
      return [];
    }

    switch (sourceType) {
      case 'article':
        return this.chunkArticle(text, metadata);
      case 'transcript':
        return this.chunkTranscript(text, metadata);
      case 'highlight':
        return this.chunkHighlight(text, metadata);
      case 'book':
        return this.chunkBook(text, metadata);
      default:
        return this.chunkGeneric(text, metadata);
    }
  }

  /** 文章分块：按段落分割，合并短段落 */
  private chunkArticle(text: string, metadata: Record<string, unknown>): ChunkResult[] {
    // 按双换行分段
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    return this.mergeAndSplitParagraphs(paragraphs, metadata);
  }

  /** 转录分块：按段落分割 */
  private chunkTranscript(text: string, metadata: Record<string, unknown>): ChunkResult[] {
    // 转录文本按换行分段
    const segments = text.split(/\n+/).filter(s => s.trim());
    return this.mergeAndSplitParagraphs(segments, metadata);
  }

  /** 高亮分块：单条高亮作为一个 chunk */
  private chunkHighlight(text: string, metadata: Record<string, unknown>): ChunkResult[] {
    const tokenCount = estimateTokenCount(text);
    return [{
      content: text.trim(),
      index: 0,
      tokenCount,
      metadata,
    }];
  }

  /** 电子书分块：与文章类似 */
  private chunkBook(text: string, metadata: Record<string, unknown>): ChunkResult[] {
    return this.chunkArticle(text, metadata);
  }

  /** 通用分块 */
  private chunkGeneric(text: string, metadata: Record<string, unknown>): ChunkResult[] {
    return this.chunkArticle(text, metadata);
  }

  /** 从文本尾部按句子边界截取不超过 maxTokens 的重叠内容 */
  private extractOverlapTail(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return '';
    const sentences = this.splitIntoSentences(text);
    // 从尾部向前累积句子，直到超出 maxTokens
    const selected: string[] = [];
    let tokens = 0;
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentTokens = estimateTokenCount(sentences[i]);
      if (tokens + sentTokens > maxTokens && selected.length > 0) break;
      selected.unshift(sentences[i]);
      tokens += sentTokens;
    }
    return selected.join(' ');
  }

  /** 合并短段落、拆分长段落 */
  private mergeAndSplitParagraphs(
    paragraphs: string[],
    metadata: Record<string, unknown>
  ): ChunkResult[] {
    const results: ChunkResult[] = [];
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    let previousOverlap = '';

    const flushChunk = () => {
      if (currentChunk.trim()) {
        results.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount: currentTokens,
          metadata,
        });

        // 提取当前 chunk 尾部作为下一个 chunk 的 overlap 前缀
        previousOverlap = this.extractOverlapTail(currentChunk.trim(), this.config.overlap);

        currentChunk = '';
        currentTokens = 0;

        // 将 overlap 文本作为新 chunk 的开头
        if (previousOverlap) {
          currentChunk = previousOverlap;
          currentTokens = estimateTokenCount(previousOverlap);
        }
      }
    };

    for (const para of paragraphs) {
      const paraTokens = estimateTokenCount(para);

      // 如果单段落超过目标大小，需要拆分
      if (paraTokens > this.config.targetSize) {
        // 先 flush 当前累积内容
        flushChunk();

        // 拆分长段落
        const sentences = this.splitIntoSentences(para);
        for (const sentence of sentences) {
          const sentTokens = estimateTokenCount(sentence);
          if (currentTokens + sentTokens > this.config.targetSize && currentTokens >= this.config.minSize) {
            flushChunk();
          }
          currentChunk += (currentChunk ? ' ' : '') + sentence;
          currentTokens += sentTokens;
        }
        continue;
      }

      // 如果加入当前段落会超过目标大小，先 flush
      if (currentTokens + paraTokens > this.config.targetSize && currentTokens >= this.config.minSize) {
        flushChunk();
      }

      // 添加段落
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      currentTokens += paraTokens;
    }

    // flush 最后的内容
    flushChunk();

    // 移除最后一次 flush 产生的多余 overlap-only chunk
    // 如果最后一个 chunk 仅包含 overlap 内容（即与前一个 chunk 的尾部完全相同），则移除
    if (results.length >= 2) {
      const lastResult = results[results.length - 1];
      if (lastResult.content === previousOverlap) {
        results.pop();
      }
    }

    return results;
  }

  /** 将段落拆分为句子 */
  private splitIntoSentences(text: string): string[] {
    // 中英文句子结束符
    const sentences = text.split(/(?<=[。！？.!?])\s*/);
    return sentences.filter(s => s.trim());
  }
}

/** 创建 Chunking Service 实例 */
export function createChunkingService(config?: ChunkingConfig): ChunkingService {
  return new ChunkingService(config);
}
