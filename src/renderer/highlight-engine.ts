// 高亮引擎核心工具函数 — 从 ReaderView.tsx 提取为可测试模块

// 可导航/高亮的块级元素选择器
export const BLOCK_SELECTOR = 'p, li, blockquote';

export const COLOR_BG_MAP: Record<string, string> = {
  yellow: 'rgba(251, 191, 36, 0.25)',
  blue: 'rgba(59, 130, 246, 0.25)',
  green: 'rgba(34, 197, 94, 0.25)',
  red: 'rgba(239, 68, 68, 0.25)',
};

export const HIGHLIGHT_BORDER_COLOR = 'rgba(251, 191, 36, 0.45)';

export function getTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

export function offsetsToRange(root: Node, start: number, end: number): Range | null {
  const nodes = getTextNodes(root);
  let offset = 0;
  const range = document.createRange();
  let setStart = false;

  for (const t of nodes) {
    const len = t.data.length;
    const next = offset + len;

    if (!setStart && start >= offset && start <= next) {
      range.setStart(t, start - offset);
      setStart = true;
    }
    if (setStart && end >= offset && end <= next) {
      range.setEnd(t, end - offset);
      return range;
    }

    offset = next;
  }
  return null;
}

export function wrapRangeWithMark(root: HTMLElement, range: Range, hlId: string, color: string) {
  // 先收集所有需要处理的 text node（快照，避免遍历时 DOM 变动）
  const textNodesInRange: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (range.intersectsNode(t)) textNodesInRange.push(t);
  }

  if (textNodesInRange.length === 0) return;

  const bg = COLOR_BG_MAP[color] ?? COLOR_BG_MAP.yellow;

  // 确定每个 text node 需要 wrap 的精确字符范围
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  for (const t of textNodesInRange) {
    const start = (t === range.startContainer) ? range.startOffset : 0;
    const end = (t === range.endContainer) ? range.endOffset : t.data.length;
    if (end <= start) continue;
    segments.push({ node: t, start, end });
  }

  // 从后往前处理（避免 splitText 导致后续 node 引用失效）
  for (let i = segments.length - 1; i >= 0; i--) {
    const { node: t, start, end } = segments[i];

    let target = t;
    // 先分割右侧
    if (end < target.data.length) {
      target.splitText(end);
    }
    // 再分割左侧
    if (start > 0) {
      target = t.splitText(start);
    }

    const mark = document.createElement('mark');
    mark.dataset.highlightId = hlId;
    mark.style.backgroundColor = bg;
    mark.style.borderTop = `1px solid ${HIGHLIGHT_BORDER_COLOR}`;
    mark.style.borderBottom = `1px solid ${HIGHLIGHT_BORDER_COLOR}`;
    mark.style.borderRadius = '2px';
    mark.style.padding = '2px 0';
    mark.style.color = 'inherit';
    mark.style.cursor = 'pointer';

    target.parentNode!.insertBefore(mark, target);
    mark.appendChild(target);
  }
}

/** 移除指定高亮的所有 mark 标签（增量删除） */
export function unwrapHighlight(root: HTMLElement, hlId: string) {
  root.querySelectorAll(`mark[data-highlight-id="${hlId}"]`).forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  });
}

/** 找到最近的块级祖先元素 */
export function getBlockAncestor(node: Node, contentRoot: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== contentRoot) {
    if (current instanceof HTMLElement && current.matches(BLOCK_SELECTOR)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/** 计算元素在 contentRoot 下的 CSS 路径 */
export function computeAnchorPath(el: HTMLElement, contentRoot: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== contentRoot) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName.toLowerCase() === tag
    );
    const idx = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    if (parent === contentRoot) break;
    current = parent;
  }
  return parts.join(' > ');
}

/** 通过 CSS 路径查找元素 */
export function resolveAnchorPath(contentRoot: HTMLElement, anchorPath: string): HTMLElement | null {
  try {
    return contentRoot.querySelector(anchorPath);
  } catch {
    return null;
  }
}

/** 在指定元素内做文本搜索 fallback */
export function textSearchInElement(el: Node, text: string): { startOffset: number; endOffset: number } | null {
  const fullText = el.textContent ?? '';
  const idx = fullText.indexOf(text);
  if (idx === -1) return null;
  return { startOffset: idx, endOffset: idx + text.length };
}

/** 计算 Range 相对于指定块元素的段内 offset */
export function rangeToBlockOffsets(blockEl: HTMLElement, range: Range): { startOffset: number; endOffset: number } | null {
  // 将 range 的端点规范化为 text node 级别
  // range.startContainer 可能是 Element（例如 selectNodeContents 后）
  const nodes = getTextNodes(blockEl);
  if (nodes.length === 0) return null;

  let startOffset = -1;
  let endOffset = -1;
  let offset = 0;

  for (let i = 0; i < nodes.length; i++) {
    const t = nodes[i];
    const len = t.data.length;

    // 处理 startContainer
    if (startOffset < 0) {
      if (t === range.startContainer) {
        // 直接在 text node 上
        startOffset = offset + range.startOffset;
      } else if (range.startContainer === t.parentNode && range.startOffset === Array.from(t.parentNode!.childNodes).indexOf(t)) {
        // startContainer 是父元素，startOffset 指向这个 text node
        startOffset = offset;
      } else if (range.startContainer.contains(t) && i === 0 && range.startOffset === 0) {
        // selectNodeContents — startContainer 是祖先元素，offset 0
        startOffset = 0;
      }
    }

    // 处理 endContainer
    if (t === range.endContainer) {
      endOffset = offset + range.endOffset;
    } else if (range.endContainer === t.parentNode) {
      const childIdx = Array.from(t.parentNode!.childNodes).indexOf(t);
      if (range.endOffset === childIdx + 1) {
        endOffset = offset + len;
      }
    } else if (range.endContainer.contains(t) && i === nodes.length - 1) {
      // selectNodeContents — endContainer 是祖先元素
      endOffset = offset + len;
    }

    offset += len;
  }

  if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) return null;
  return { startOffset, endOffset };
}
