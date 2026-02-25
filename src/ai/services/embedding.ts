import type { EmbeddingConfig } from '../../shared/types';

/* ------------------------------------------------------------------ */
/*  Multimodal Embedding API 类型定义                                  */
/* ------------------------------------------------------------------ */

/** Multimodal embedding API 请求中的 input item */
interface MultimodalInputItem {
  type: 'text';
  text: string;
}

/** Multimodal embedding API 请求体 */
interface MultimodalEmbeddingRequest {
  model: string;
  input: MultimodalInputItem[];
}

/**
 * Multimodal embedding API 响应体
 *
 * 实际响应示例：
 * {
 *   "created": 1771949682,
 *   "data": { "embedding": [-0.015..., ...], "object": "embedding" },
 *   "id": "...",
 *   "model": "doubao-embedding-vision-251215",
 *   "object": "list",
 *   "usage": { "prompt_tokens": 16, "total_tokens": 16, ... }
 * }
 *
 * 注意：data 是单个对象（非数组），整个 input 数组合并产出一个 embedding。
 */
interface MultimodalEmbeddingResponse {
  created: number;
  data: {
    embedding: number[];
    object: string;
  };
  id: string;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/* ------------------------------------------------------------------ */
/*  公共接口类型                                                       */
/* ------------------------------------------------------------------ */

/** Embedding 模型信息 */
export interface EmbeddingModelInfo {
  model: string;
  dimensions: number;
  maxTokens: number;
}

/** Embedding Service 配置 */
export interface EmbeddingServiceConfig {
  embeddingConfig: EmbeddingConfig;
  /** 批量处理每批最大数量（已废弃，保留兼容） */
  batchSize?: number;
  /** 最大并发请求数 */
  maxParallelCalls?: number;
}

/** Embedding 结果 */
export interface EmbeddingResult {
  embedding: Float32Array;
  tokenCount: number;
}

/** 批量 Embedding 结果 */
export interface BatchEmbeddingResult {
  embeddings: Float32Array[];
  totalTokens: number;
}

/** 默认 Embedding 配置 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  apiKey: '',
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  modelId: 'doubao-embedding-vision-251215',
  dimensions: 2048,
};

/* ------------------------------------------------------------------ */
/*  EmbeddingService                                                   */
/* ------------------------------------------------------------------ */

/**
 * Embedding Service
 * 负责将文本转换为向量
 * 直接调用火山引擎 multimodal embedding API（/embeddings/multimodal）
 *
 * 重要：multimodal API 每次调用只返回一个 embedding，
 * input 数组中的多个项目会被合并为一个向量。
 * 因此批量 embed 需要逐条调用，通过 maxParallelCalls 控制并发。
 */
export class EmbeddingService {
  private apiKey: string;
  private baseURL: string;
  private modelId: string;
  private modelInfo: EmbeddingModelInfo;
  private maxParallelCalls: number;

  constructor(config: EmbeddingServiceConfig) {
    const { embeddingConfig, maxParallelCalls = 2 } = config;

    if (!embeddingConfig.apiKey) {
      throw new Error('Embedding API Key 未配置');
    }

    this.apiKey = embeddingConfig.apiKey;
    this.baseURL = embeddingConfig.baseURL;
    this.modelId = embeddingConfig.modelId;
    this.modelInfo = {
      model: embeddingConfig.modelId,
      dimensions: embeddingConfig.dimensions,
      maxTokens: 8191,
    };
    this.maxParallelCalls = maxParallelCalls;
  }

  /** 获取模型信息 */
  getModelInfo(): EmbeddingModelInfo {
    return { ...this.modelInfo };
  }

  /** 单条文本 Embedding */
  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.callAPI(text);
    return {
      embedding: new Float32Array(result.embedding),
      tokenCount: result.totalTokens,
    };
  }

  /** 批量 Embedding（逐条并发调用，通过 maxParallelCalls 控制并发数） */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0 };
    }

    const results: Float32Array[] = new Array(texts.length);
    let totalTokens = 0;

    // 按 maxParallelCalls 分组并发执行
    for (let i = 0; i < texts.length; i += this.maxParallelCalls) {
      const chunk = texts.slice(i, i + this.maxParallelCalls);
      const chunkResults = await Promise.all(
        chunk.map((text) => this.callAPI(text))
      );

      for (let j = 0; j < chunkResults.length; j++) {
        results[i + j] = new Float32Array(chunkResults[j].embedding);
        totalTokens += chunkResults[j].totalTokens;
      }
    }

    return {
      embeddings: results,
      totalTokens,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Private: HTTP 调用                                               */
  /* ---------------------------------------------------------------- */

  /**
   * 调用 multimodal embedding API（单条文本）
   *
   * multimodal API 的 input 数组会合并为一个 embedding，
   * 所以每条文本需要单独调用。
   */
  private async callAPI(text: string): Promise<{
    embedding: number[];
    totalTokens: number;
  }> {
    const url = `${this.baseURL}/embeddings/multimodal`;

    const body: MultimodalEmbeddingRequest = {
      model: this.modelId,
      input: [{ type: 'text', text }],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Embedding API 请求失败 (${response.status}): ${errorText}`
      );
    }

    const result: MultimodalEmbeddingResponse = await response.json();

    if (!result.data?.embedding || !Array.isArray(result.data.embedding)) {
      throw new Error(
        `Embedding API 返回了意外的结构: ${JSON.stringify(result).slice(0, 300)}`
      );
    }

    return {
      embedding: result.data.embedding,
      totalTokens: result.usage?.total_tokens ?? 0,
    };
  }
}

/** 创建 Embedding Service 实例 */
export function createEmbeddingService(embeddingConfig: EmbeddingConfig): EmbeddingService {
  return new EmbeddingService({ embeddingConfig });
}
