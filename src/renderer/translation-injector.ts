// 翻译 DOM 注入工具模块 — 在原文段落下方注入/清除/切换翻译节点

import { BLOCK_SELECTOR } from './highlight-engine';
import type { TranslationParagraph } from '../shared/types';

/** 译文显示配置 */
interface TranslationDisplaySettings {
  fontSize: number;
  color: string;
  opacity: number;
}

/**
 * 为文章内容批量注入翻译段落
 *
 * 1. 先清除已有翻译节点
 * 2. 获取所有块级元素
 * 3. 对每个有译文的段落，在对应原文块后插入翻译 div
 */
export function injectTranslations(
  contentRoot: HTMLElement,
  paragraphs: TranslationParagraph[],
  displaySettings: TranslationDisplaySettings,
): void {
  clearTranslations(contentRoot);

  const blocks = contentRoot.querySelectorAll(BLOCK_SELECTOR);

  for (const para of paragraphs) {
    if (!para.translated) continue;
    const block = blocks[para.index];
    if (!block) continue;

    const div = createTranslationDiv(para, displaySettings);
    block.after(div);
  }
}

/**
 * 为单个段落注入翻译（流式进度更新用）
 *
 * 如果该段落已有翻译节点则先移除再重新创建。
 */
export function injectSingleTranslation(
  contentRoot: HTMLElement,
  para: TranslationParagraph,
  displaySettings: TranslationDisplaySettings,
): void {
  const blocks = contentRoot.querySelectorAll(BLOCK_SELECTOR);
  const block = blocks[para.index];
  if (!block) return;

  // 移除该段落已有的翻译节点
  const existing = block.nextElementSibling;
  if (
    existing?.hasAttribute('data-translation') &&
    existing.getAttribute('data-para-index') === String(para.index)
  ) {
    existing.remove();
  }

  const div = createTranslationDiv(para, displaySettings);
  block.after(div);
}

/** 清除所有翻译节点 */
export function clearTranslations(root: HTMLElement): void {
  root.querySelectorAll('[data-translation]').forEach((el) => el.remove());
}

/** 切换翻译显示/隐藏 */
export function toggleTranslations(root: HTMLElement, visible: boolean): void {
  root.querySelectorAll('.z-translation').forEach((el) => {
    el.classList.toggle('z-translation-hidden', !visible);
  });
}

// ==================== 内部工具 ====================

/** 创建翻译 div 元素 */
function createTranslationDiv(
  para: TranslationParagraph,
  displaySettings: TranslationDisplaySettings,
): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute('data-translation', 'true');
  div.setAttribute('data-para-index', String(para.index));
  div.className = 'z-translation';
  div.textContent = para.translated;
  div.style.fontSize = `${displaySettings.fontSize}px`;
  div.style.color = displaySettings.color;
  div.style.opacity = String(displaySettings.opacity);
  return div;
}
