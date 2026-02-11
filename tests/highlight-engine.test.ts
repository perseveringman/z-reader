import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTextNodes,
  offsetsToRange,
  wrapRangeWithMark,
  unwrapHighlight,
  getBlockAncestor,
  computeAnchorPath,
  resolveAnchorPath,
  textSearchInElement,
  rangeToBlockOffsets,
} from '../src/renderer/highlight-engine';

// ==================== 辅助函数 ====================

/** 创建模拟文章 DOM */
function createArticleDOM(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/** 模拟用户选中文字：在 root 内选中指定文字 */
function selectText(root: HTMLElement, text: string): Range | null {
  const fullText = root.textContent ?? '';
  const idx = fullText.indexOf(text);
  if (idx === -1) return null;

  const nodes = getTextNodes(root);
  let offset = 0;
  const range = document.createRange();
  let setStart = false;

  for (const t of nodes) {
    const len = t.data.length;
    const next = offset + len;

    if (!setStart && idx >= offset && idx < next) {
      range.setStart(t, idx - offset);
      setStart = true;
    }
    if (setStart && idx + text.length >= offset && idx + text.length <= next) {
      range.setEnd(t, idx + text.length - offset);
      return range;
    }

    offset = next;
  }
  return null;
}

/** 获取 root 内所有 mark 标签的数量和高亮文字 */
function getMarks(root: HTMLElement, hlId?: string): Array<{ id: string; text: string }> {
  const selector = hlId
    ? `mark[data-highlight-id="${hlId}"]`
    : 'mark[data-highlight-id]';
  return Array.from(root.querySelectorAll(selector)).map((el) => ({
    id: (el as HTMLElement).dataset.highlightId!,
    text: el.textContent ?? '',
  }));
}

// ==================== 测试数据 ====================

const SIMPLE_HTML = `
<p>The first paragraph has some text.</p>
<p>The second paragraph is different.</p>
<p>The third paragraph ends the article.</p>
`;

const RICH_HTML = `
<h2>Introduction</h2>
<p>Welcome to the <strong>public beta</strong> of Reader!</p>
<p>Walkthrough guides can be really boring so we've laced ours with spicy memes.</p>
<blockquote>This is a quote from the article.</blockquote>
<ul>
  <li>First item in the list</li>
  <li>Second item in the list</li>
</ul>
<p>The end of the article with some text and more text.</p>
`;

const DUPLICATE_TEXT_HTML = `
<p>The word hello appears here.</p>
<p>The word hello appears again here.</p>
<p>And hello one more time.</p>
`;

// ==================== getTextNodes ====================

describe('getTextNodes', () => {
  it('获取简单段落中的 text nodes', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const nodes = getTextNodes(root);
    expect(nodes.length).toBe(1);
    expect(nodes[0].data).toBe('Hello World');
  });

  it('获取嵌套标签中的 text nodes', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong> world</p>');
    const nodes = getTextNodes(root);
    expect(nodes.length).toBe(3);
    expect(nodes.map(n => n.data)).toEqual(['Hello ', 'bold', ' world']);
  });

  it('获取多段落中的所有 text nodes', () => {
    const root = createArticleDOM(SIMPLE_HTML);
    const nodes = getTextNodes(root);
    // 每个段落一个 text node + 段落间的换行 text node
    const textContent = nodes.map(n => n.data.trim()).filter(Boolean);
    expect(textContent.length).toBe(3);
  });
});

// ==================== offsetsToRange ====================

describe('offsetsToRange', () => {
  it('在单个 text node 中创建 range', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = offsetsToRange(root, 0, 5);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('Hello');
  });

  it('在指定偏移位置创建 range', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = offsetsToRange(root, 6, 11);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('World');
  });

  it('跨 text node 创建 range', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong> world</p>');
    const range = offsetsToRange(root, 4, 12);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('o bold w');
  });

  it('跨段落创建 range', () => {
    // 用紧凑 HTML 避免换行 text node 干扰
    const root = createArticleDOM('<p>The first paragraph has some text.</p><p>Second.</p>');
    const firstText = 'The first paragraph has some text.';
    const range = offsetsToRange(root, 0, firstText.length);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe(firstText);
  });

  it('超出范围返回 null', () => {
    const root = createArticleDOM('<p>Short</p>');
    const range = offsetsToRange(root, 0, 100);
    expect(range).toBeNull();
  });

  it('空内容返回 null', () => {
    const root = createArticleDOM('');
    const range = offsetsToRange(root, 0, 5);
    expect(range).toBeNull();
  });
});

// ==================== wrapRangeWithMark ====================

describe('wrapRangeWithMark', () => {
  it('简单文字高亮', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = selectText(root, 'Hello')!;
    expect(range).not.toBeNull();

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('Hello');
    expect(marks[0].id).toBe('hl-1');
    // 原文保持完整
    expect(root.textContent).toBe('Hello World');
  });

  it('中间部分高亮', () => {
    const root = createArticleDOM('<p>Hello Beautiful World</p>');
    const range = selectText(root, 'Beautiful')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('Beautiful');
    expect(root.textContent).toBe('Hello Beautiful World');
  });

  it('整段高亮', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = selectText(root, 'Hello World')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    expect(marks.length).toBe(1);
    expect(marks[0].text).toBe('Hello World');
  });

  it('跨 inline 标签高亮', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong> world</p>');
    const range = selectText(root, 'bold world')!;
    expect(range).not.toBeNull();

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    // 跨 text node 应产生多个 mark
    expect(marks.length).toBeGreaterThanOrEqual(1);
    const fullText = marks.map(m => m.text).join('');
    expect(fullText).toBe('bold world');
    // 原文完整
    expect(root.textContent).toBe('Hello bold world');
  });

  it('多次高亮不互相干扰', () => {
    const root = createArticleDOM('<p>AAAA BBBB CCCC</p>');

    const range1 = selectText(root, 'AAAA')!;
    wrapRangeWithMark(root, range1, 'hl-1', 'yellow');

    const range2 = selectText(root, 'CCCC')!;
    wrapRangeWithMark(root, range2, 'hl-2', 'blue');

    const marks1 = getMarks(root, 'hl-1');
    const marks2 = getMarks(root, 'hl-2');
    expect(marks1.length).toBe(1);
    expect(marks1[0].text).toBe('AAAA');
    expect(marks2.length).toBe(1);
    expect(marks2[0].text).toBe('CCCC');
    expect(root.textContent).toBe('AAAA BBBB CCCC');
  });

  it('段首高亮', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = selectText(root, 'Hello')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    expect(marks[0].text).toBe('Hello');
    expect(root.textContent).toBe('Hello World');
  });

  it('段尾高亮', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = selectText(root, 'World')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const marks = getMarks(root);
    expect(marks[0].text).toBe('World');
    expect(root.textContent).toBe('Hello World');
  });
});

// ==================== unwrapHighlight ====================

describe('unwrapHighlight', () => {
  it('移除单个高亮', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const range = selectText(root, 'Hello')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    expect(getMarks(root).length).toBe(1);

    unwrapHighlight(root, 'hl-1');

    expect(getMarks(root).length).toBe(0);
    expect(root.textContent).toBe('Hello World');
  });

  it('只移除指定高亮，保留其他', () => {
    const root = createArticleDOM('<p>AAAA BBBB CCCC</p>');

    const range1 = selectText(root, 'AAAA')!;
    wrapRangeWithMark(root, range1, 'hl-1', 'yellow');
    const range2 = selectText(root, 'CCCC')!;
    wrapRangeWithMark(root, range2, 'hl-2', 'blue');

    unwrapHighlight(root, 'hl-1');

    expect(getMarks(root, 'hl-1').length).toBe(0);
    expect(getMarks(root, 'hl-2').length).toBe(1);
    expect(root.textContent).toBe('AAAA BBBB CCCC');
  });

  it('移除跨 inline 标签的高亮', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong> world</p>');
    const range = selectText(root, 'bold world')!;
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    unwrapHighlight(root, 'hl-1');

    expect(getMarks(root).length).toBe(0);
    expect(root.textContent).toBe('Hello bold world');
  });
});

// ==================== getBlockAncestor ====================

describe('getBlockAncestor', () => {
  it('从 text node 找到父级 p', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const textNode = getTextNodes(root)[0];
    const block = getBlockAncestor(textNode, root);
    expect(block).not.toBeNull();
    expect(block!.tagName.toLowerCase()).toBe('p');
  });

  it('从 strong 内的 text node 找到父级 p', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong></p>');
    const textNodes = getTextNodes(root);
    const boldText = textNodes.find(t => t.data === 'bold')!;
    const block = getBlockAncestor(boldText, root);
    expect(block).not.toBeNull();
    expect(block!.tagName.toLowerCase()).toBe('p');
  });

  it('找到 li 元素', () => {
    const root = createArticleDOM('<ul><li>Item one</li></ul>');
    const textNode = getTextNodes(root)[0];
    const block = getBlockAncestor(textNode, root);
    expect(block).not.toBeNull();
    expect(block!.tagName.toLowerCase()).toBe('li');
  });

  it('找到 blockquote 元素', () => {
    const root = createArticleDOM('<blockquote>A quote</blockquote>');
    const textNode = getTextNodes(root)[0];
    const block = getBlockAncestor(textNode, root);
    expect(block).not.toBeNull();
    expect(block!.tagName.toLowerCase()).toBe('blockquote');
  });

  it('不匹配的标签返回 null', () => {
    const root = createArticleDOM('<div><span>text</span></div>');
    const textNode = getTextNodes(root)[0];
    const block = getBlockAncestor(textNode, root);
    expect(block).toBeNull();
  });
});

// ==================== computeAnchorPath / resolveAnchorPath ====================

describe('computeAnchorPath + resolveAnchorPath 往返', () => {
  it('单层 p 元素', () => {
    const root = createArticleDOM(SIMPLE_HTML);
    const paragraphs = root.querySelectorAll('p');

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i] as HTMLElement;
      const path = computeAnchorPath(p, root);
      expect(path).toBeTruthy();

      const resolved = resolveAnchorPath(root, path);
      expect(resolved).toBe(p);
    }
  });

  it('混合结构：p、blockquote、li', () => {
    const root = createArticleDOM(RICH_HTML);
    const blocks = root.querySelectorAll('p, li, blockquote');

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i] as HTMLElement;
      const path = computeAnchorPath(block, root);
      expect(path).toBeTruthy();

      const resolved = resolveAnchorPath(root, path);
      expect(resolved).toBe(block);
    }
  });

  it('嵌套结构：ul > li', () => {
    const root = createArticleDOM('<ul><li>A</li><li>B</li></ul>');
    const lis = root.querySelectorAll('li');

    const path0 = computeAnchorPath(lis[0] as HTMLElement, root);
    const path1 = computeAnchorPath(lis[1] as HTMLElement, root);

    expect(path0).not.toBe(path1);
    expect(resolveAnchorPath(root, path0)).toBe(lis[0]);
    expect(resolveAnchorPath(root, path1)).toBe(lis[1]);
  });
});

// ==================== textSearchInElement ====================

describe('textSearchInElement', () => {
  it('找到文本', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const result = textSearchInElement(root, 'World');
    expect(result).toEqual({ startOffset: 6, endOffset: 11 });
  });

  it('找不到返回 null', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const result = textSearchInElement(root, 'Missing');
    expect(result).toBeNull();
  });

  it('在指定段落内搜索', () => {
    const root = createArticleDOM(DUPLICATE_TEXT_HTML);
    const paragraphs = root.querySelectorAll('p');

    // 在第二个 p 内搜索 hello
    const result = textSearchInElement(paragraphs[1], 'hello');
    expect(result).not.toBeNull();
    // offset 是相对于这个段落的
    const range = offsetsToRange(paragraphs[1], result!.startOffset, result!.endOffset);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('hello');
  });
});

// ==================== rangeToBlockOffsets ====================

describe('rangeToBlockOffsets', () => {
  it('计算段内偏移', () => {
    const root = createArticleDOM('<p>Hello World</p>');
    const p = root.querySelector('p')!;
    const range = selectText(root, 'World')!;

    const offsets = rangeToBlockOffsets(p, range);
    expect(offsets).toEqual({ startOffset: 6, endOffset: 11 });
  });

  it('嵌套标签内的偏移', () => {
    const root = createArticleDOM('<p>Hello <strong>bold</strong> world</p>');
    const p = root.querySelector('p')!;
    const range = selectText(root, 'bold')!;

    const offsets = rangeToBlockOffsets(p, range);
    expect(offsets).not.toBeNull();
    expect(offsets!.endOffset - offsets!.startOffset).toBe(4);
    // 验证可以往返
    const restored = offsetsToRange(p, offsets!.startOffset, offsets!.endOffset);
    expect(restored).not.toBeNull();
    expect(restored!.toString()).toBe('bold');
  });

  it('range 不在 block 内返回 null', () => {
    const root = createArticleDOM('<p>First</p><p>Second</p>');
    const firstP = root.querySelectorAll('p')[0]!;
    const range = selectText(root, 'Second')!;

    const offsets = rangeToBlockOffsets(firstP, range);
    expect(offsets).toBeNull();
  });
});

// ==================== 端到端场景：创建高亮 → 恢复高亮 ====================

describe('端到端：创建高亮 → 持久化 → 恢复', () => {
  it('简单文字高亮往返', () => {
    // 1. 模拟用户选中文字
    const root = createArticleDOM(SIMPLE_HTML);
    const range = selectText(root, 'second paragraph')!;
    expect(range).not.toBeNull();

    // 2. 计算 anchorPath 和段内 offset（模拟 createHighlightFromRange）
    const blockEl = getBlockAncestor(range.startContainer, root)!;
    expect(blockEl).not.toBeNull();
    const anchorPath = computeAnchorPath(blockEl, root);
    const offsets = rangeToBlockOffsets(blockEl, range)!;
    expect(offsets).not.toBeNull();
    const text = range.toString();

    // 3. 在当前 DOM 上 wrap
    wrapRangeWithMark(root, range, 'hl-1', 'yellow');
    expect(getMarks(root, 'hl-1').map(m => m.text).join('')).toBe('second paragraph');

    // 4. 模拟页面刷新 — 全新 DOM
    const freshRoot = createArticleDOM(SIMPLE_HTML);

    // 5. 恢复高亮（模拟 applyHighlights）
    const target = resolveAnchorPath(freshRoot, anchorPath);
    expect(target).not.toBeNull();

    const restoredRange = offsetsToRange(target!, offsets.startOffset, offsets.endOffset);
    expect(restoredRange).not.toBeNull();
    expect(restoredRange!.toString()).toBe(text);

    wrapRangeWithMark(freshRoot, restoredRange!, 'hl-1', 'yellow');
    expect(getMarks(freshRoot, 'hl-1').map(m => m.text).join('')).toBe('second paragraph');
  });

  it('富文本中跨 inline 标签高亮往返', () => {
    const root = createArticleDOM(RICH_HTML);
    const range = selectText(root, 'public beta')!;
    expect(range).not.toBeNull();

    const blockEl = getBlockAncestor(range.startContainer, root)!;
    const anchorPath = computeAnchorPath(blockEl, root);
    const offsets = rangeToBlockOffsets(blockEl, range)!;
    const text = range.toString();

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');
    const markedText = getMarks(root, 'hl-1').map(m => m.text).join('');
    expect(markedText).toBe('public beta');

    // 恢复
    const freshRoot = createArticleDOM(RICH_HTML);
    const target = resolveAnchorPath(freshRoot, anchorPath)!;
    const restoredRange = offsetsToRange(target, offsets.startOffset, offsets.endOffset);
    expect(restoredRange).not.toBeNull();
    expect(restoredRange!.toString()).toBe(text);

    wrapRangeWithMark(freshRoot, restoredRange!, 'hl-1', 'yellow');
    expect(getMarks(freshRoot, 'hl-1').map(m => m.text).join('')).toBe('public beta');
  });

  it('重复文字在不同段落的精确定位', () => {
    const root = createArticleDOM(DUPLICATE_TEXT_HTML);
    const paragraphs = root.querySelectorAll('p');

    // 选中第二个段落中的 hello
    const p2 = paragraphs[1] as HTMLElement;
    const range = offsetsToRange(p2, 9, 14)!; // "hello" in "The word hello appears again here."
    expect(range).not.toBeNull();
    expect(range.toString()).toBe('hello');

    const blockEl = getBlockAncestor(range.startContainer, root)!;
    expect(blockEl).toBe(p2);
    const anchorPath = computeAnchorPath(blockEl, root);
    const offsets = rangeToBlockOffsets(blockEl, range)!;

    // 恢复
    const freshRoot = createArticleDOM(DUPLICATE_TEXT_HTML);
    const target = resolveAnchorPath(freshRoot, anchorPath)!;
    expect(target.textContent).toContain('again'); // 确认是第二个段落

    const restoredRange = offsetsToRange(target, offsets.startOffset, offsets.endOffset);
    expect(restoredRange).not.toBeNull();
    expect(restoredRange!.toString()).toBe('hello');
  });

  it('整段高亮往返', () => {
    const root = createArticleDOM(SIMPLE_HTML);
    const p = root.querySelectorAll('p')[1] as HTMLElement;
    const fullText = p.textContent!;

    const range = document.createRange();
    range.selectNodeContents(p);
    expect(range.toString()).toBe(fullText);

    const anchorPath = computeAnchorPath(p, root);
    const offsets = rangeToBlockOffsets(p, range)!;

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');
    expect(getMarks(root, 'hl-1').map(m => m.text).join('')).toBe(fullText);

    // 恢复
    const freshRoot = createArticleDOM(SIMPLE_HTML);
    const target = resolveAnchorPath(freshRoot, anchorPath)!;
    const restoredRange = offsetsToRange(target, offsets.startOffset, offsets.endOffset);
    expect(restoredRange!.toString()).toBe(fullText);
  });

  it('blockquote 高亮往返', () => {
    const root = createArticleDOM(RICH_HTML);
    const bq = root.querySelector('blockquote')!;
    const range = document.createRange();
    range.selectNodeContents(bq);
    const text = range.toString();

    const anchorPath = computeAnchorPath(bq as HTMLElement, root);
    const offsets = rangeToBlockOffsets(bq as HTMLElement, range)!;

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');

    const freshRoot = createArticleDOM(RICH_HTML);
    const target = resolveAnchorPath(freshRoot, anchorPath)!;
    const restoredRange = offsetsToRange(target, offsets.startOffset, offsets.endOffset);
    expect(restoredRange!.toString()).toBe(text);
  });

  it('li 高亮往返', () => {
    const root = createArticleDOM(RICH_HTML);
    const li = root.querySelectorAll('li')[1]!;
    const range = document.createRange();
    range.selectNodeContents(li);
    const text = range.toString();

    const anchorPath = computeAnchorPath(li as HTMLElement, root);
    const offsets = rangeToBlockOffsets(li as HTMLElement, range)!;

    const freshRoot = createArticleDOM(RICH_HTML);
    const target = resolveAnchorPath(freshRoot, anchorPath)!;
    const restoredRange = offsetsToRange(target, offsets.startOffset, offsets.endOffset);
    expect(restoredRange!.toString()).toBe(text);
  });
});

// ==================== 边界情况 ====================

describe('边界情况', () => {
  it('在已有高亮旁边创建新高亮', () => {
    const root = createArticleDOM('<p>AAAA BBBB CCCC DDDD</p>');

    // 先高亮 BBBB
    const range1 = selectText(root, 'BBBB')!;
    wrapRangeWithMark(root, range1, 'hl-1', 'yellow');

    // 再高亮 CCCC（在已有 mark 之后）
    const range2 = selectText(root, 'CCCC')!;
    expect(range2).not.toBeNull();
    wrapRangeWithMark(root, range2, 'hl-2', 'blue');

    expect(getMarks(root, 'hl-1').map(m => m.text).join('')).toBe('BBBB');
    expect(getMarks(root, 'hl-2').map(m => m.text).join('')).toBe('CCCC');
    expect(root.textContent).toBe('AAAA BBBB CCCC DDDD');
  });

  it('高亮后删除再重新高亮同一位置', () => {
    const root = createArticleDOM('<p>Hello World</p>');

    const range1 = selectText(root, 'Hello')!;
    wrapRangeWithMark(root, range1, 'hl-1', 'yellow');
    expect(getMarks(root, 'hl-1').length).toBe(1);

    unwrapHighlight(root, 'hl-1');
    expect(getMarks(root).length).toBe(0);

    const range2 = selectText(root, 'Hello')!;
    wrapRangeWithMark(root, range2, 'hl-2', 'blue');
    expect(getMarks(root, 'hl-2').length).toBe(1);
    expect(getMarks(root, 'hl-2')[0].text).toBe('Hello');
  });

  it('连续多次高亮不破坏 DOM', () => {
    const root = createArticleDOM('<p>AAAA BBBB CCCC DDDD EEEE</p>');
    const originalText = root.textContent;

    const words = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'];
    words.forEach((word, i) => {
      const range = selectText(root, word)!;
      expect(range).not.toBeNull();
      wrapRangeWithMark(root, range, `hl-${i}`, 'yellow');
    });

    expect(root.textContent).toBe(originalText);
    expect(getMarks(root).length).toBe(5);
  });

  it('高亮空字符串无效', () => {
    const root = createArticleDOM('<p>Hello</p>');
    const range = document.createRange();
    const textNode = getTextNodes(root)[0];
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0); // 空 range

    wrapRangeWithMark(root, range, 'hl-1', 'yellow');
    expect(getMarks(root).length).toBe(0);
  });
});
