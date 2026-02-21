import { createOpenAI } from '@ai-sdk/openai';
import type { AIProviderConfig } from './config';
import { DEFAULT_AI_CONFIG } from './config';

/** 创建 LLM Provider 实例 */
export function createLLMProvider(config: AIProviderConfig) {
  if (!config.apiKey) {
    throw new Error('AI API Key 未配置');
  }

  const baseURL = config.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.minimax.chat/v1';

  const provider = createOpenAI({
    baseURL,
    apiKey: config.apiKey,
  });

  return {
    /** 根据任务类型获取模型 */
    getModel(task: 'fast' | 'smart' | 'cheap') {
      const modelId = config.models[task] || DEFAULT_AI_CONFIG.models[task];
      // 使用 chat() 走 Chat Completions API，避免 OpenRouter 不兼容 Responses API
      return provider.chat(modelId);
    },
    provider,
  };
}
