import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, generateObject } from 'ai';
import type { TranslationSettings, TranslationStyle } from '../../shared/types';
import type { TranslationEngine } from './engine';

// ==================== 类型 ====================

/** LLM 翻译引擎配置，对应 TranslationSettings['llm'] */
type LLMTranslationConfig = TranslationSettings['llm'];

// ==================== 风格映射 ====================

/** 翻译风格到 prompt 描述的映射 */
const STYLE_DESCRIPTIONS: Record<TranslationStyle, string> = {
  professional: '使用正式、专业的语言风格',
  casual: '使用轻松、口语化的语言风格',
  literal: '尽量直译，保持原文结构',
};

// ==================== LLM 翻译引擎 ====================

/**
 * 基于 LLM 的翻译引擎
 *
 * 使用 AI SDK 的 OpenAI 兼容 provider 进行翻译，
 * 支持自定义 baseUrl / model / apiKey，独立于主 AI 配置。
 */
export class LLMTranslationEngine implements TranslationEngine {
  private config: LLMTranslationConfig;

  constructor(config: LLMTranslationConfig) {
    this.config = config;
  }

  // -------------------- 公开方法 --------------------

  /** 翻译单段文本 */
  async translate(
    text: string,
    sourceLang: string | null,
    targetLang: string
  ): Promise<string> {
    const model = this.createModel();
    const prompt = this.buildTranslatePrompt(text, sourceLang, targetLang);

    const { text: translated } = await generateText({
      model,
      prompt,
    });

    return translated.trim();
  }

  /** 批量翻译多段文本 */
  async translateBatch(
    texts: string[],
    sourceLang: string | null,
    targetLang: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];
    if (texts.length === 1) {
      const result = await this.translate(texts[0], sourceLang, targetLang);
      return [result];
    }

    const model = this.createModel();
    const prompt = this.buildBatchTranslatePrompt(texts, sourceLang, targetLang);

    // 使用 generateObject + zod schema 确保返回结构化 JSON 数组
    const batchResultSchema = z.object({
      translations: z
        .array(z.string())
        .describe('翻译结果数组，按原文顺序排列，长度与输入一致'),
    });

    const { object } = await generateObject({
      model,
      schema: batchResultSchema,
      prompt,
    });

    // 安全校验：确保返回数量与输入一致
    if (object.translations.length !== texts.length) {
      throw new Error(
        `批量翻译结果数量不匹配: 期望 ${texts.length}，实际 ${object.translations.length}`
      );
    }

    return object.translations;
  }

  /** 检测文本语言 */
  async detectLanguage(text: string): Promise<string> {
    const model = this.createModel();

    const langResultSchema = z.object({
      language: z
        .string()
        .describe(
          '检测到的语言代码，使用 BCP 47 格式，如 "en", "zh-CN", "ja", "ko", "fr", "de"'
        ),
    });

    const { object } = await generateObject({
      model,
      schema: langResultSchema,
      prompt: `请检测以下文本的语言，返回对应的语言代码（BCP 47 格式）。

文本:
${text.slice(0, 500)}`,
    });

    return object.language;
  }

  // -------------------- 私有方法 --------------------

  /** 创建 OpenAI 兼容的模型实例 */
  private createModel() {
    if (!this.config.apiKey) {
      throw new Error('翻译 API Key 未配置');
    }

    const provider = createOpenAI({
      baseURL: this.config.baseUrl || 'https://api.openai.com/v1',
      apiKey: this.config.apiKey,
    });

    // 使用 chat() 走 Chat Completions API，保持与项目其他地方一致
    return provider.chat(this.config.model || 'gpt-4o-mini');
  }

  /** 获取风格描述文本 */
  private getStyleInstruction(): string {
    // 如果有自定义 prompt 则优先使用
    if (this.config.customPrompt?.trim()) {
      return this.config.customPrompt.trim();
    }

    return STYLE_DESCRIPTIONS[this.config.style] || STYLE_DESCRIPTIONS.professional;
  }

  /** 构建单段翻译 prompt */
  private buildTranslatePrompt(
    text: string,
    sourceLang: string | null,
    targetLang: string
  ): string {
    const styleInstruction = this.getStyleInstruction();
    const sourcePart = sourceLang ? `源语言: ${sourceLang}` : '源语言: 自动检测';

    return `你是一位专业的翻译专家。请将以下文本翻译为目标语言。

## 翻译要求
- ${sourcePart}
- 目标语言: ${targetLang}
- 风格要求: ${styleInstruction}
- 只返回翻译结果，不要包含任何解释或额外文字

## 原文
${text}`;
  }

  /** 构建批量翻译 prompt */
  private buildBatchTranslatePrompt(
    texts: string[],
    sourceLang: string | null,
    targetLang: string
  ): string {
    const styleInstruction = this.getStyleInstruction();
    const sourcePart = sourceLang ? `源语言: ${sourceLang}` : '源语言: 自动检测';

    // 将多段文本编号后合并
    const numberedTexts = texts
      .map((t, i) => `[${i + 1}] ${t}`)
      .join('\n\n');

    return `你是一位专业的翻译专家。请将以下编号文本逐条翻译为目标语言。

## 翻译要求
- ${sourcePart}
- 目标语言: ${targetLang}
- 风格要求: ${styleInstruction}
- 共 ${texts.length} 段文本，请按原编号顺序返回翻译结果
- 每段翻译只包含译文，不要包含编号或额外说明

## 原文
${numberedTexts}`;
  }
}
