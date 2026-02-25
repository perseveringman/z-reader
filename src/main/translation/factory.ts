import type { TranslationEngine } from './engine';
import type { TranslationSettings } from '../../shared/types';
import { LLMTranslationEngine } from './llm-engine';
import { GoogleTranslationEngine } from './google-engine';
import { MicrosoftTranslationEngine } from './microsoft-engine';

/**
 * 根据翻译设置创建对应的翻译引擎实例
 *
 * 支持三种引擎：LLM（默认）、Google、Microsoft
 */
export function createTranslationEngine(settings: TranslationSettings): TranslationEngine {
  switch (settings.provider) {
    case 'google':
      return new GoogleTranslationEngine(settings.google);
    case 'microsoft':
      return new MicrosoftTranslationEngine(settings.microsoft);
    case 'llm':
    default:
      return new LLMTranslationEngine(settings.llm);
  }
}
