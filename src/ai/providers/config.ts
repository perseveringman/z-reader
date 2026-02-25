/** AI Provider 配置 */
export interface AIProviderConfig {
  provider: 'openrouter' | 'minimax';
  apiKey: string;
  /** 模型映射 */
  models: {
    fast: string;    // 快速任务（标签、简单分析）
    smart: string;   // 复杂任务（摘要、对话）
    cheap: string;   // 低成本任务（翻译等）
  };
}

/** 默认模型配置 */
export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openrouter',
  apiKey: '',
  models: {
    fast: 'google/gemini-2.0-flash-001',
    smart: 'anthropic/claude-sonnet-4',
    cheap: 'google/gemini-2.0-flash-001',
  },
};

import type { EmbeddingConfig } from '../../shared/types';
import type Database from 'better-sqlite3';
import { AIDatabase } from './db';
import { DEFAULT_EMBEDDING_CONFIG } from '../services/embedding';

/**
 * 从数据库读取 Embedding 独立配置
 * 如果未配置则返回 null
 */
export function getEmbeddingConfig(sqlite: Database.Database): EmbeddingConfig | null {
  const aiDb = new AIDatabase(sqlite);
  const saved = aiDb.getSetting('embeddingConfig') as EmbeddingConfig | null;
  if (!saved || !saved.apiKey) return null;
  return {
    ...DEFAULT_EMBEDDING_CONFIG,
    ...saved,
    // dimensions 始终由 DEFAULT_EMBEDDING_CONFIG 决定，避免旧配置中残留的维度值
    dimensions: DEFAULT_EMBEDDING_CONFIG.dimensions,
  };
}
