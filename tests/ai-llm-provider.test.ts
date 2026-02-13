import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '../src/ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../src/ai/providers/config';

describe('createLLMProvider', () => {
  it('无 API Key 时抛出错误', () => {
    expect(() => createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: '' }))
      .toThrow('AI API Key 未配置');
  });

  it('有 API Key 时成功创建 provider', () => {
    const llm = createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: 'test-key' });
    expect(llm.getModel).toBeDefined();
    expect(typeof llm.getModel).toBe('function');
  });

  it('getModel 返回对应任务类型的模型', () => {
    const llm = createLLMProvider({ ...DEFAULT_AI_CONFIG, apiKey: 'test-key' });
    const fastModel = llm.getModel('fast');
    const smartModel = llm.getModel('smart');
    expect(fastModel).toBeDefined();
    expect(smartModel).toBeDefined();
  });
});
