import type { TranslationSettings } from '../../shared/types';
import type { TranslationEngine } from './engine';

// ==================== 类型 ====================

/** Google 翻译引擎配置，对应 TranslationSettings['google'] */
type GoogleTranslationConfig = TranslationSettings['google'];

/** Google Translate API v2 翻译响应 */
interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

/** Google Translate API v2 语言检测响应 */
interface GoogleDetectResponse {
  data: {
    detections: Array<
      Array<{
        language: string;
        confidence: number;
        isReliable: boolean;
      }>
    >;
  };
}

/** Google API 错误响应 */
interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain: string; reason: string }>;
  };
}

// ==================== Google 翻译引擎 ====================

/**
 * Google Cloud Translation API v2 翻译引擎
 *
 * 使用 Google Cloud Translation REST API 进行翻译和语言检测，
 * 通过 Node.js 原生 fetch（Electron 支持）发送请求，无额外依赖。
 */
export class GoogleTranslationEngine implements TranslationEngine {
  private config: GoogleTranslationConfig;

  /** API 基础 URL */
  private static readonly BASE_URL = 'https://translation.googleapis.com/language/translate/v2';

  constructor(config: GoogleTranslationConfig) {
    this.config = config;
  }

  // -------------------- 公开方法 --------------------

  /** 翻译单段文本 */
  async translate(
    text: string,
    sourceLang: string | null,
    targetLang: string
  ): Promise<string> {
    this.validateApiKey();

    const body: Record<string, unknown> = {
      q: text,
      target: targetLang,
      key: this.config.apiKey,
      format: 'text',
    };

    if (sourceLang) {
      body.source = sourceLang;
    }

    const response = await fetch(GoogleTranslationEngine.BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      this.throwApiError(json as GoogleErrorResponse);
    }

    const result = json as GoogleTranslateResponse;
    return result.data.translations[0].translatedText;
  }

  /**
   * 批量翻译多段文本
   *
   * 利用 Google API 原生支持的批量翻译：`q` 参数可传数组，
   * 一次请求翻译多段文本，减少网络往返。
   */
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

    this.validateApiKey();

    const body: Record<string, unknown> = {
      q: texts,
      target: targetLang,
      key: this.config.apiKey,
      format: 'text',
    };

    if (sourceLang) {
      body.source = sourceLang;
    }

    const response = await fetch(GoogleTranslationEngine.BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      this.throwApiError(json as GoogleErrorResponse);
    }

    const result = json as GoogleTranslateResponse;
    return result.data.translations.map((t) => t.translatedText);
  }

  /**
   * 检测文本语言
   *
   * 调用 Google Translate v2 detect 端点，返回置信度最高的语言代码。
   */
  async detectLanguage(text: string): Promise<string> {
    this.validateApiKey();

    const detectUrl = `${GoogleTranslationEngine.BASE_URL}/detect`;

    const body: Record<string, unknown> = {
      q: text,
      key: this.config.apiKey,
    };

    const response = await fetch(detectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      this.throwApiError(json as GoogleErrorResponse);
    }

    const result = json as GoogleDetectResponse;

    // detections 是二维数组，取第一个请求的第一个检测结果
    const detections = result.data.detections[0];
    if (!detections || detections.length === 0) {
      throw new Error('Google 语言检测未返回结果');
    }

    return detections[0].language;
  }

  // -------------------- 私有方法 --------------------

  /** 校验 API Key 是否已配置 */
  private validateApiKey(): void {
    if (!this.config.apiKey) {
      throw new Error('Google 翻译 API Key 未配置');
    }
  }

  /** 从 Google API 错误响应中提取信息并抛出 Error */
  private throwApiError(errorResponse: GoogleErrorResponse): never {
    const err = errorResponse.error;
    const message = err?.message || '未知的 Google API 错误';
    const code = err?.code || 0;
    throw new Error(`Google 翻译 API 错误 (${code}): ${message}`);
  }
}
