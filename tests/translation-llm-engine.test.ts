import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn(() => ({ modelId: 'mock-chat-model' })),
  })),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateObject: vi.fn(),
    generateText: vi.fn(),
  };
});

import { generateObject, generateText } from 'ai';
import { LLMTranslationEngine } from '../src/main/translation/llm-engine';

const mockedGenerateObject = vi.mocked(generateObject);
const mockedGenerateText = vi.mocked(generateText);

describe('LLMTranslationEngine.translateBatch', () => {
  beforeEach(() => {
    mockedGenerateObject.mockReset();
    mockedGenerateText.mockReset();
  });

  it('retries when batch result count mismatches, then succeeds', async () => {
    const engine = new LLMTranslationEngine({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      style: 'professional',
      customPrompt: '',
    });

    const texts = Array.from({ length: 10 }, (_, i) => `text-${i + 1}`);

    mockedGenerateObject
      .mockResolvedValueOnce({
        object: { translations: Array.from({ length: 9 }, (_, i) => `bad-${i + 1}`) },
      } as never)
      .mockResolvedValueOnce({
        object: { translations: Array.from({ length: 10 }, (_, i) => `ok-${i + 1}`) },
      } as never);

    const translated = await engine.translateBatch(texts, 'en', 'zh-CN');

    expect(translated).toEqual(Array.from({ length: 10 }, (_, i) => `ok-${i + 1}`));
    expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('falls back to per-item translate when all batch retries still mismatch', async () => {
    const engine = new LLMTranslationEngine({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      style: 'professional',
      customPrompt: '',
    });

    const texts = Array.from({ length: 3 }, (_, i) => `text-${i + 1}`);

    mockedGenerateObject.mockResolvedValue({
      object: { translations: ['only-1', 'only-2'] },
    } as never);

    mockedGenerateText
      .mockResolvedValueOnce({ text: 'single-1' } as never)
      .mockResolvedValueOnce({ text: 'single-2' } as never)
      .mockResolvedValueOnce({ text: 'single-3' } as never);

    const translated = await engine.translateBatch(texts, 'en', 'zh-CN');

    expect(translated).toEqual(['single-1', 'single-2', 'single-3']);
    expect(mockedGenerateObject).toHaveBeenCalledTimes(3);
    expect(mockedGenerateText).toHaveBeenCalledTimes(3);
  });
});
