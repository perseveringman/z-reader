import type { TranslationSettings } from '../../shared/types';
import type { TranslationEngine } from './engine';

// ==================== 类型 ====================

/** Microsoft Azure Translator 引擎配置，对应 TranslationSettings['microsoft'] */
type MicrosoftTranslationConfig = TranslationSettings['microsoft'];

/** Azure Translator API 基础 URL */
const API_BASE = 'https://api.cognitive.microsofttranslator.com';

/** Azure Translator API 翻译响应结构 */
interface TranslateResponseItem {
  translations: Array<{
    text: string;
    to: string;
  }>;
}

/** Azure Translator API 检测响应结构 */
interface DetectResponseItem {
  language: string;
  score: number;
  isTranslationSupported: boolean;
  isTransliterationSupported: boolean;
}

/** Azure Translator API 错误响应结构 */
interface ApiErrorResponse {
  error: {
    code: number | string;
    message: string;
  };
}

// ==================== Microsoft Azure 翻译引擎 ====================

/**
 * 基于 Azure Translator API 的翻译引擎
 *
 * 使用 Microsoft Azure Cognitive Services Translator，
 * 支持单段翻译、原生批量翻译和语言检测。
 * 使用 Node.js 原生 fetch，无额外依赖。
 */
export class MicrosoftTranslationEngine implements TranslationEngine {
  private config: MicrosoftTranslationConfig;

  constructor(config: MicrosoftTranslationConfig) {
    this.config = config;
  }

  // -------------------- 公开方法 --------------------

  /** 翻译单段文本 */
  async translate(
    text: string,
    sourceLang: string | null,
    targetLang: string
  ): Promise<string> {
    const url = this.buildTranslateUrl(targetLang, sourceLang);
    const body = [{ Text: text }];

    const data = await this.request<TranslateResponseItem[]>(url, body);

    if (!data?.[0]?.translations?.[0]?.text) {
      throw new Error('Azure Translator 返回结果格式异常');
    }

    return data[0].translations[0].text;
  }

  /** 批量翻译多段文本（利用 Azure API 原生批量支持） */
  async translateBatch(
    texts: string[],
    sourceLang: string | null,
    targetLang: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const url = this.buildTranslateUrl(targetLang, sourceLang);
    const body = texts.map((t) => ({ Text: t }));

    const data = await this.request<TranslateResponseItem[]>(url, body);

    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error(
        `Azure Translator 批量翻译结果数量不匹配: 期望 ${texts.length}，实际 ${data?.length ?? 0}`
      );
    }

    return data.map((item, index) => {
      if (!item?.translations?.[0]?.text) {
        throw new Error(`Azure Translator 第 ${index + 1} 段翻译结果格式异常`);
      }
      return item.translations[0].text;
    });
  }

  /** 检测文本语言 */
  async detectLanguage(text: string): Promise<string> {
    const url = `${API_BASE}/detect?api-version=3.0`;
    const body = [{ Text: text }];

    const data = await this.request<DetectResponseItem[]>(url, body);

    if (!data?.[0]?.language) {
      throw new Error('Azure Translator 语言检测返回结果格式异常');
    }

    return data[0].language;
  }

  // -------------------- 私有方法 --------------------

  /** 构建翻译 API URL */
  private buildTranslateUrl(targetLang: string, sourceLang: string | null): string {
    let url = `${API_BASE}/translate?api-version=3.0&to=${encodeURIComponent(targetLang)}`;

    if (sourceLang) {
      url += `&from=${encodeURIComponent(sourceLang)}`;
    }

    return url;
  }

  /** 构建请求头 */
  private buildHeaders(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error('Azure Translator API Key 未配置');
    }

    return {
      'Ocp-Apim-Subscription-Key': this.config.apiKey,
      'Ocp-Apim-Subscription-Region': this.config.region,
      'Content-Type': 'application/json',
    };
  }

  /** 发送请求并处理响应 */
  private async request<T>(url: string, body: unknown): Promise<T> {
    const headers = this.buildHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    // Azure API 错误处理
    if (!response.ok) {
      const errorData = responseData as ApiErrorResponse;
      const message = errorData?.error?.message ?? `HTTP ${response.status}`;
      const code = errorData?.error?.code ?? response.status;
      throw new Error(`Azure Translator API 错误 [${code}]: ${message}`);
    }

    return responseData as T;
  }
}
