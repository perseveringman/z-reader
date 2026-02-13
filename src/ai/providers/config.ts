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
