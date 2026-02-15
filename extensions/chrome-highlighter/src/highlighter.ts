import { HIGHLIGHT_COLORS, type HighlightColor } from './types';

const HIGHLIGHT_ATTR = 'data-zr-highlight-id';
const HIGHLIGHT_CLASS = 'zr-highlight';

export interface HighlightResult {
  text: string;
  startOffset: number;
  endOffset: number;
  paragraphIndex: number;
  updateId: (newId: string) => void;
}

export function highlightSelection(color: HighlightColor = 'yellow'): HighlightResult | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  if (!text) return null;

  const container = range.startContainer.parentElement;
  const paragraphIndex = getParagraphIndex(container);
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  const id = generateId();
  const wrapper = createMarkElement(id, color);

  try {
    range.surroundContents(wrapper);
  } catch {
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
  }

  selection.removeAllRanges();
  attachClickHandler(wrapper);

  return {
    text,
    startOffset,
    endOffset,
    paragraphIndex,
    updateId: (newId: string) => {
      wrapper.setAttribute(HIGHLIGHT_ATTR, newId);
    },
  };
}

export interface RestoreHighlightOptions {
  startOffset?: number;
  endOffset?: number;
  paragraphIndex?: number;
  note?: string;
}

export function restoreHighlight(id: string, text: string, color: HighlightColor, options?: RestoreHighlightOptions): boolean {
  // 如果提供了 paragraphIndex，先定位到对应段落再搜索，提高准确性
  let searchRoot: Node = document.body;
  if (options?.paragraphIndex !== undefined) {
    const allBlocks = document.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre');
    if (options.paragraphIndex < allBlocks.length) {
      searchRoot = allBlocks[options.paragraphIndex];
    }
  }

  const treeWalker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT);
  let node: Node | null;

  while ((node = treeWalker.nextNode())) {
    const textNode = node as Text;
    const content = textNode.textContent ?? '';
    const index = content.indexOf(text);
    if (index === -1) continue;

    // 已被高亮的跳过
    if (textNode.parentElement?.classList.contains(HIGHLIGHT_CLASS)) continue;

    const range = document.createRange();
    range.setStart(textNode, index);
    range.setEnd(textNode, index + text.length);

    const wrapper = createMarkElement(id, color);
    try {
      range.surroundContents(wrapper);
    } catch {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
    }

    // 如果有笔记，设置 data-note 属性
    if (options?.note) {
      wrapper.setAttribute('data-note', options.note);
    }
    wrapper.setAttribute('data-zr-color', color);

    attachClickHandler(wrapper);
    return true;
  }

  // 如果在段落内未找到，回退到全文搜索
  if (searchRoot !== document.body) {
    return restoreHighlight(id, text, color);
  }

  return false;
}

export function removeHighlight(highlightId: string): void {
  const marks = document.querySelectorAll(`[${HIGHLIGHT_ATTR}="${highlightId}"]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function setHighlightNote(highlightId: string, note: string | null): void {
  const marks = document.querySelectorAll(`[${HIGHLIGHT_ATTR}="${highlightId}"]`);
  marks.forEach((mark) => {
    if (note) {
      mark.setAttribute('data-note', note);
    } else {
      mark.removeAttribute('data-note');
    }
  });
}

export function changeHighlightColor(highlightId: string, color: HighlightColor): void {
  const marks = document.querySelectorAll(`[${HIGHLIGHT_ATTR}="${highlightId}"]`);
  marks.forEach((mark) => {
    (mark as HTMLElement).style.backgroundColor = HIGHLIGHT_COLORS[color];
    mark.setAttribute('data-zr-color', color);
  });
}

function createMarkElement(id: string, color: HighlightColor): HTMLElement {
  const wrapper = document.createElement('mark');
  wrapper.className = HIGHLIGHT_CLASS;
  wrapper.setAttribute(HIGHLIGHT_ATTR, id);
  wrapper.setAttribute('data-zr-color', color);
  wrapper.style.backgroundColor = HIGHLIGHT_COLORS[color];
  wrapper.style.borderRadius = '2px';
  wrapper.style.padding = '0 1px';
  wrapper.style.cursor = 'pointer';
  return wrapper;
}

function attachClickHandler(element: HTMLElement): void {
  element.addEventListener('click', () => {
    const id = element.getAttribute(HIGHLIGHT_ATTR);
    const text = element.textContent;
    const note = element.getAttribute('data-note');
    const color = element.getAttribute('data-zr-color');
    document.dispatchEvent(new CustomEvent('zr-highlight-click', {
      detail: { id, text, note, color, element },
    }));
  });
}

function getParagraphIndex(element: Element | null): number {
  if (!element) return 0;
  const blockEl = element.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre');
  if (!blockEl) return 0;

  const allBlocks = document.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, pre');
  for (let i = 0; i < allBlocks.length; i++) {
    if (allBlocks[i] === blockEl) return i;
  }
  return 0;
}

function generateId(): string {
  return `zr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
