/** 翻译引擎接口 */
export interface TranslationEngine {
  /** 翻译单段文本 */
  translate(
    text: string,
    sourceLang: string | null,
    targetLang: string
  ): Promise<string>;

  /** 批量翻译多段文本 */
  translateBatch(
    texts: string[],
    sourceLang: string | null,
    targetLang: string
  ): Promise<string[]>;

  /** 检测文本语言 */
  detectLanguage(text: string): Promise<string>;
}
