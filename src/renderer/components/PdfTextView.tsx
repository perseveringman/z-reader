import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Highlight } from '../../shared/types';
import type { TocItem } from './BookReaderToc';
import type { BookReaderSettingsValues } from './BookReaderSettings';
import { BOOK_FONT_FAMILY_MAP } from './BookReaderSettings';
import type { BookReaderHandle } from './EpubReader';

// @ts-expect-error Vite ?url import
// eslint-disable-next-line import/no-unresolved
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker as string;

const HIGHLIGHT_COLORS = [
  { name: 'yellow', bg: 'rgba(250, 204, 21, 0.4)', css: '#facc15' },
  { name: 'green', bg: 'rgba(74, 222, 128, 0.4)', css: '#4ade80' },
  { name: 'blue', bg: 'rgba(96, 165, 250, 0.4)', css: '#60a5fa' },
  { name: 'pink', bg: 'rgba(244, 114, 182, 0.4)', css: '#f472b6' },
  { name: 'purple', bg: 'rgba(192, 132, 252, 0.4)', css: '#c084fc' },
];

const THEME_BG: Record<BookReaderSettingsValues['theme'], string> = {
  dark: '#1a1a1a',
  light: '#ffffff',
  sepia: '#f4ecd8',
};

interface PdfTextViewProps {
  bookId: string;
  filePath: string;
  highlights: Highlight[];
  onHighlightClick?: (highlightId: string) => void;
  onHighlightsChange: (highlights: Highlight[]) => void;
  onTocLoaded: (items: TocItem[]) => void;
  onProgressChange: (progress: number) => void;
  onLocationChange: (location: string) => void;
  settings: BookReaderSettingsValues;
  initialLocation?: string | null;
}

// ==================== Content block types ====================

interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4;
  text: string;
  offset: number;
}

interface ParagraphBlock {
  type: 'paragraph';
  text: string;
  offset: number;
  bold?: boolean;
}

interface ImageBlock {
  type: 'image';
  dataUrl: string;
  width: number;
  height: number;
}

type ContentBlock = HeadingBlock | ParagraphBlock | ImageBlock;

interface PageContent {
  pageNum: number;
  blocks: ContentBlock[];
}

interface ToolbarState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  pageNumber: number;
  startOffset: number;
  endOffset: number;
}

// ==================== 工具函数 ====================

function parsePageFromHref(href: string): number | null {
  const m = href.match(/^page:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseAnchorPath(anchorPath: string): { page: number; start: number; end: number } | null {
  const m = anchorPath.match(/^page:(\d+):(\d+)-(\d+)$/);
  if (!m) return null;
  return { page: parseInt(m[1], 10), start: parseInt(m[2], 10), end: parseInt(m[3], 10) };
}

function getHighlightBg(color: string): string {
  const found = HIGHLIGHT_COLORS.find((c) => c.name === color || c.css === color);
  return found ? found.bg : HIGHLIGHT_COLORS[0].bg;
}

function isBoldFont(fontName: string): boolean {
  const upper = fontName.toUpperCase();
  return upper.includes('BOLD') || upper.includes('HEAVY') || upper.includes('BLACK');
}

function isItalicFont(fontName: string): boolean {
  const upper = fontName.toUpperCase();
  return upper.includes('ITALIC') || upper.includes('OBLIQUE');
}

/**
 * Find the most common font size in a set of text items (= body text size).
 */
function computeBodyFontSize(items: Array<{ height: number; str: string }>): number {
  const sizeCharCount = new Map<number, number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const h = Math.round(item.height * 10) / 10; // round to 1 decimal
    sizeCharCount.set(h, (sizeCharCount.get(h) ?? 0) + item.str.length);
  }
  let bodySize = 12;
  let maxChars = 0;
  for (const [size, count] of sizeCharCount) {
    if (count > maxChars) {
      maxChars = count;
      bodySize = size;
    }
  }
  return bodySize;
}

/**
 * Determine heading level from font size ratio to body size.
 */
function headingLevel(fontSize: number, bodySize: number, bold: boolean): 0 | 1 | 2 | 3 | 4 {
  if (bodySize <= 0) return 0;
  const ratio = fontSize / bodySize;
  if (ratio >= 1.8) return 1;
  if (ratio >= 1.4) return 2;
  if (ratio >= 1.15) return 3;
  if (bold && ratio >= 1.05) return 4;
  return 0;
}

// ==================== Image extraction ====================

async function extractPageImages(page: PDFPageProxy): Promise<Array<{ y: number; dataUrl: string; width: number; height: number }>> {
  const images: Array<{ y: number; dataUrl: string; width: number; height: number }> = [];

  try {
    const ops = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    for (let i = 0; i < ops.fnArray.length; i++) {
      // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82
      if (ops.fnArray[i] !== 85 && ops.fnArray[i] !== 82) continue;

      const imgName = ops.argsArray[i][0];
      if (!imgName) continue;

      try {
        const imgData = await new Promise<{ width: number; height: number; data?: Uint8ClampedArray }>((resolve, reject) => {
          // Try page.objs first, then page.commonObjs
          const tryGet = (source: typeof page.objs, fallback?: typeof page.commonObjs) => {
            try {
              source.get(imgName, (data: { width: number; height: number; data?: Uint8ClampedArray }) => {
                if (data) resolve(data);
                else if (fallback) tryGet(fallback);
                else reject(new Error('no data'));
              });
            } catch {
              if (fallback) tryGet(fallback);
              else reject(new Error('not found'));
            }
          };
          tryGet(page.objs, page.commonObjs);
        });

        // Skip tiny images (icons, bullets, etc.)
        if (imgData.width < 50 || imgData.height < 50) continue;

        // Find the transform matrix for this image by looking at preceding setTransform ops
        let imgY = pageHeight / 2; // default to middle if we can't determine position

        // Look backwards for the closest transform
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          // OPS.transform = 12
          if (ops.fnArray[j] === 12) {
            const matrix = ops.argsArray[j];
            // matrix = [a, b, c, d, e, f] — f is Y position, d is height scale
            if (matrix && matrix.length >= 6) {
              imgY = pageHeight - matrix[5] - Math.abs(matrix[3]);
            }
            break;
          }
        }

        // Convert image data to dataURL
        if (imgData.data) {
          const canvas = document.createElement('canvas');
          canvas.width = imgData.width;
          canvas.height = imgData.height;
          const ctx = canvas.getContext('2d')!;
          const imageData = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
          ctx.putImageData(imageData, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          images.push({ y: imgY, dataUrl, width: imgData.width, height: imgData.height });
        }
      } catch {
        // Skip images we can't extract
      }
    }
  } catch {
    // Operator list extraction failed — not critical
  }

  return images;
}

// ==================== Text extraction with structure ====================

interface TextLine {
  y: number;
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

async function extractPageContent(pdfDoc: PDFDocumentProxy, pageNum: number): Promise<PageContent> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  // Collect all text items with their properties
  const textItems: Array<{ str: string; height: number; y: number; fontName: string }> = [];
  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const ti = item as { str: string; height: number; transform: number[]; fontName: string };
    const y = pageHeight - ti.transform[5]; // convert to top-down
    const height = ti.height || Math.abs(ti.transform[3]);
    textItems.push({ str: ti.str, height, y, fontName: ti.fontName || '' });
  }

  if (textItems.length === 0) {
    return { pageNum, blocks: [] };
  }

  // Compute body font size for heading detection
  const bodySize = computeBodyFontSize(textItems);

  // Group into lines by Y coordinate (tolerance = 2pt)
  const lines: TextLine[] = [];
  for (const item of textItems) {
    const y = Math.round(item.y);
    const lastLine = lines[lines.length - 1];
    if (lastLine && Math.abs(lastLine.y - y) < 3) {
      lastLine.text += item.str;
      // Use max font size in the line
      if (item.height > lastLine.fontSize) {
        lastLine.fontSize = item.height;
        lastLine.bold = isBoldFont(item.fontName);
        lastLine.italic = isItalicFont(item.fontName);
      }
    } else {
      lines.push({
        y,
        text: item.str,
        fontSize: item.height,
        bold: isBoldFont(item.fontName),
        italic: isItalicFont(item.fontName),
      });
    }
  }

  // Extract images and sort by Y position
  const images = await extractPageImages(page);

  // Build content blocks, interleaving images based on Y position
  const blocks: ContentBlock[] = [];
  let currentParagraph = '';
  let currentOffset = 0;
  let totalChars = 0;
  let currentBold = false;
  let imgIdx = 0;

  const flushParagraph = () => {
    if (!currentParagraph) return;
    blocks.push({
      type: 'paragraph',
      text: currentParagraph,
      offset: totalChars - currentParagraph.length,
      bold: currentBold,
    });
    currentParagraph = '';
    currentBold = false;
  };

  const insertPendingImages = (beforeY: number) => {
    while (imgIdx < images.length && images[imgIdx].y <= beforeY) {
      flushParagraph();
      blocks.push({
        type: 'image',
        dataUrl: images[imgIdx].dataUrl,
        width: images[imgIdx].width,
        height: images[imgIdx].height,
      });
      imgIdx++;
    }
  };

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    // Insert images that should appear before this line
    insertPendingImages(line.y);

    // Check if this line is a heading
    const level = headingLevel(line.fontSize, bodySize, line.bold);
    if (level > 0) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: level as 1 | 2 | 3 | 4,
        text: trimmed,
        offset: totalChars,
      });
      totalChars += trimmed.length;
      continue;
    }

    // Regular text — accumulate into paragraphs
    if (currentParagraph) {
      currentParagraph += ' ' + trimmed;
    } else {
      currentParagraph = trimmed;
      currentBold = line.bold;
      currentOffset = totalChars;
    }
    totalChars += trimmed.length + (currentParagraph.length > trimmed.length ? 1 : 0);
  }

  // Flush remaining
  flushParagraph();

  // Insert any remaining images
  while (imgIdx < images.length) {
    blocks.push({
      type: 'image',
      dataUrl: images[imgIdx].dataUrl,
      width: images[imgIdx].width,
      height: images[imgIdx].height,
    });
    imgIdx++;
  }

  return { pageNum, blocks };
}

// ==================== TOC from headings ====================

function buildTocFromHeadings(pages: PageContent[]): TocItem[] {
  const items: TocItem[] = [];
  let counter = 0;

  for (const page of pages) {
    for (let i = 0; i < page.blocks.length; i++) {
      const block = page.blocks[i];
      if (block.type !== 'heading') continue;

      items.push({
        id: `heading-${counter++}`,
        label: block.text,
        href: `page:${page.pageNum}:heading:${i}`,
        level: block.level - 1, // level 0-based for TOC indentation
      });
    }
  }

  return items;
}

// ==================== PDF outline conversion ====================

async function convertOutlineItems(
  pdfDoc: PDFDocumentProxy,
  items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>,
  level: number,
  counter: { id: number },
): Promise<TocItem[]> {
  if (!items) return [];
  const result: TocItem[] = [];
  for (const item of items) {
    let pageNum = 1;
    try {
      if (typeof item.dest === 'string') {
        const dest = await pdfDoc.getDestination(item.dest);
        if (dest && dest[0]) {
          const idx = await pdfDoc.getPageIndex(dest[0]);
          pageNum = idx + 1;
        }
      } else if (Array.isArray(item.dest) && item.dest[0]) {
        const idx = await pdfDoc.getPageIndex(item.dest[0]);
        pageNum = idx + 1;
      }
    } catch {
      // ignore
    }
    const children = item.items
      ? await convertOutlineItems(pdfDoc, item.items, level + 1, counter)
      : undefined;
    result.push({
      id: `toc-${counter.id++}`,
      label: item.title,
      href: `page:${pageNum}`,
      level,
      children: children && children.length > 0 ? children : undefined,
    });
  }
  return result;
}

// ==================== 组件 ====================

export const PdfTextView = forwardRef<BookReaderHandle, PdfTextViewProps>(function PdfTextView(
  {
    bookId,
    highlights,
    onHighlightClick,
    onHighlightsChange,
    onTocLoaded,
    onProgressChange,
    onLocationChange,
    settings,
    initialLocation,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const totalPagesRef = useRef(0);
  const currentPageRef = useRef(1);
  const initialLocationApplied = useRef(false);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  const [pages, setPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
    pageNumber: 0,
    startOffset: 0,
    endOffset: 0,
  });

  // ==================== 导航 ====================

  const scrollToPage = useCallback((pageNumber: number) => {
    const el = scrollRef.current?.querySelector(`[data-page="${pageNumber}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToHeading = useCallback((headingId: string) => {
    const el = scrollRef.current?.querySelector(`[data-heading-id="${headingId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      navigateTo: (href: string) => {
        // href format: "page:N:heading:I" or "page:N"
        const headingMatch = href.match(/^page:(\d+):heading:(\d+)$/);
        if (headingMatch) {
          const headingId = `p${headingMatch[1]}-h${headingMatch[2]}`;
          scrollToHeading(headingId);
          return;
        }
        const page = parsePageFromHref(href);
        if (page) scrollToPage(page);
      },
      navigateToHighlight: (anchorPath: string) => {
        const parsed = parseAnchorPath(anchorPath);
        if (parsed) scrollToPage(parsed.page);
      },
    }),
    [scrollToPage, scrollToHeading],
  );

  // ==================== 加载 PDF 文本 ====================

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    async function init() {
      setLoading(true);
      const binary = await window.electronAPI.bookReadFile(bookId);
      if (!binary || cancelled) return;

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(binary) });
      doc = await loadingTask.promise;
      if (cancelled) { doc.destroy(); return; }

      pdfDocRef.current = doc;
      totalPagesRef.current = doc.numPages;

      // 提取所有页面内容（带结构）
      const pageContents: PageContent[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pc = await extractPageContent(doc, i);
        if (cancelled) return;
        pageContents.push(pc);
      }
      setPages(pageContents);
      setLoading(false);

      // TOC: prefer PDF outline, fall back to heading-based TOC
      try {
        const outline = await doc.getOutline();
        if (outline && outline.length > 0) {
          const counter = { id: 0 };
          const items = await convertOutlineItems(doc, outline, 0, counter);
          if (!cancelled) onTocLoaded(items);
        } else {
          // Generate TOC from detected headings
          const headingToc = buildTocFromHeadings(pageContents);
          if (!cancelled) onTocLoaded(headingToc);
        }
      } catch {
        const headingToc = buildTocFromHeadings(pageContents);
        if (!cancelled) onTocLoaded(headingToc);
      }

      // 初始位置
      if (initialLocation && !initialLocationApplied.current) {
        initialLocationApplied.current = true;
        const page = parsePageFromHref(initialLocation);
        if (page) {
          requestAnimationFrame(() => scrollToPage(page));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (doc) doc.destroy();
      pdfDocRef.current = null;
    };
  }, [bookId]); // eslint-disable-line

  // ==================== 滚动进度 ====================

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || totalPagesRef.current === 0) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const progress = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
    onProgressChange(Math.min(1, Math.max(0, progress)));

    // 计算可见页码
    const containerRect = container.getBoundingClientRect();
    const mid = containerRect.top + containerRect.height / 2;
    const pageDivs = container.querySelectorAll<HTMLElement>('[data-page]');
    let visiblePage = 1;
    for (const div of pageDivs) {
      const rect = div.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) {
        visiblePage = parseInt(div.dataset.page ?? '1', 10);
        break;
      }
    }

    if (currentPageRef.current !== visiblePage) {
      currentPageRef.current = visiblePage;
      onLocationChange(`page:${visiblePage}`);
    }
  }, [onProgressChange, onLocationChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ==================== 高亮应用 ====================

  const applyHighlights = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    // 清除旧高亮
    container.querySelectorAll('mark[data-highlight-id]').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      }
    });

    for (const hl of highlightsRef.current) {
      if (!hl.anchorPath) continue;
      const parsed = parseAnchorPath(hl.anchorPath);
      if (!parsed) continue;

      const pageDiv = container.querySelector(`[data-page="${parsed.page}"]`);
      if (!pageDiv) continue;

      const spans = pageDiv.querySelectorAll<HTMLElement>('[data-offset]');
      const bg = getHighlightBg(hl.color);

      for (const span of spans) {
        const spanStart = parseInt(span.dataset.offset ?? '0', 10);
        const spanText = span.textContent ?? '';
        const spanEnd = spanStart + spanText.length;

        if (parsed.end <= spanStart || parsed.start >= spanEnd) continue;

        const relStart = Math.max(0, parsed.start - spanStart);
        const relEnd = Math.min(spanText.length, parsed.end - spanStart);

        if (relStart === 0 && relEnd === spanText.length) {
          const mark = document.createElement('mark');
          mark.dataset.highlightId = hl.id;
          mark.style.backgroundColor = bg;
          mark.style.borderRadius = '2px';
          mark.style.cursor = 'pointer';
          mark.textContent = spanText;
          span.replaceChildren(mark);
        } else {
          const fragment = document.createDocumentFragment();
          if (relStart > 0) fragment.appendChild(document.createTextNode(spanText.slice(0, relStart)));
          const mark = document.createElement('mark');
          mark.dataset.highlightId = hl.id;
          mark.style.backgroundColor = bg;
          mark.style.borderRadius = '2px';
          mark.style.cursor = 'pointer';
          mark.textContent = spanText.slice(relStart, relEnd);
          fragment.appendChild(mark);
          if (relEnd < spanText.length) fragment.appendChild(document.createTextNode(spanText.slice(relEnd)));
          span.replaceChildren(fragment);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!loading && pages.length > 0) {
      requestAnimationFrame(() => applyHighlights());
    }
  }, [loading, pages, highlights, applyHighlights]);

  // ==================== 文本选择 + 高亮创建 ====================

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    const container = scrollRef.current;
    if (!container) return;

    // 找到所在的页面
    let pageDiv: HTMLElement | null = null;
    let node: Node | null = range.startContainer;
    while (node && node !== container) {
      if (node instanceof HTMLElement && node.dataset.page) {
        pageDiv = node;
        break;
      }
      node = node.parentNode;
    }
    if (!pageDiv) return;

    const pageNumber = parseInt(pageDiv.dataset.page ?? '0', 10);
    if (pageNumber === 0) return;

    // 计算页内字符偏移
    const spans = pageDiv.querySelectorAll<HTMLElement>('[data-offset]');
    let startOffset = 0;
    let endOffset = 0;
    let foundStart = false;
    let foundEnd = false;

    for (const span of spans) {
      const spanOffset = parseInt(span.dataset.offset ?? '0', 10);
      const treeWalker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let textNode: Text | null;
      let innerOffset = 0;

      while ((textNode = treeWalker.nextNode() as Text | null)) {
        if (!foundStart && range.startContainer === textNode) {
          startOffset = spanOffset + innerOffset + range.startOffset;
          foundStart = true;
        }
        if (!foundEnd && range.endContainer === textNode) {
          endOffset = spanOffset + innerOffset + range.endOffset;
          foundEnd = true;
        }
        innerOffset += textNode.length;
        if (foundStart && foundEnd) break;
      }
      if (foundStart && foundEnd) break;
    }

    if (!foundStart || !foundEnd || startOffset >= endOffset) return;

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setToolbar({
      visible: true,
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top - containerRect.top - 8,
      text,
      pageNumber,
      startOffset,
      endOffset,
    });
  }, []);

  const handleCreateHighlight = useCallback(
    async (color: string) => {
      if (!toolbar.text || toolbar.pageNumber === 0) return;

      const anchorPath = `page:${toolbar.pageNumber}:${toolbar.startOffset}-${toolbar.endOffset}`;
      const hl = await window.electronAPI.bookHighlightCreate({
        bookId,
        text: toolbar.text,
        color,
        anchorPath,
        startOffset: toolbar.startOffset,
        endOffset: toolbar.endOffset,
        paragraphIndex: toolbar.pageNumber,
      });

      onHighlightsChange([...highlightsRef.current, hl]);
      setToolbar((prev) => ({ ...prev, visible: false }));
      window.getSelection()?.removeAllRanges();
    },
    [toolbar, bookId, onHighlightsChange],
  );

  const dismissToolbar = useCallback(() => {
    setToolbar((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (!toolbar.visible) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.pdf-highlight-toolbar')) return;
      dismissToolbar();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolbar.visible, dismissToolbar]);

  // ==================== 点击高亮 ====================

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const mark = target.closest('mark[data-highlight-id]') as HTMLElement | null;
    if (mark?.dataset.highlightId) {
      e.preventDefault();
      e.stopPropagation();
      onHighlightClick?.(mark.dataset.highlightId);
    }
  }, [onHighlightClick]);

  // ==================== 渲染 block ====================

  const renderBlock = useCallback((block: ContentBlock, pageNum: number, blockIdx: number) => {
    if (block.type === 'image') {
      return (
        <figure key={`img-${pageNum}-${blockIdx}`} className="my-4">
          <img
            src={block.dataUrl}
            alt=""
            style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}
          />
        </figure>
      );
    }

    if (block.type === 'heading') {
      const headingId = `p${pageNum}-h${blockIdx}`;
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <Tag key={`h-${pageNum}-${blockIdx}`} data-heading-id={headingId}>
          <span data-offset={block.offset}>{block.text}</span>
        </Tag>
      );
    }

    // paragraph
    const inner = block.bold ? (
      <strong>
        <span data-offset={block.offset}>{block.text}</span>
      </strong>
    ) : (
      <span data-offset={block.offset}>{block.text}</span>
    );

    return <p key={`p-${pageNum}-${blockIdx}`}>{inner}</p>;
  }, []);

  // ==================== 渲染 ====================

  const bgColor = THEME_BG[settings.theme] || THEME_BG.dark;

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: bgColor }}>
      <div
        ref={scrollRef}
        className="w-full h-full overflow-y-auto outline-none"
        style={{ backgroundColor: bgColor }}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        tabIndex={0}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-gray-500">正在提取文本…</span>
          </div>
        ) : (
          <div
            className="mx-auto max-w-[680px] px-8 py-10 article-content"
            style={{
              fontFamily: BOOK_FONT_FAMILY_MAP[settings.font],
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {pages.map((page) => (
              <div key={page.pageNum} data-page={page.pageNum}>
                {/* 页码分隔 */}
                {page.pageNum > 1 && (
                  <div className="flex items-center gap-3 my-8 select-none">
                    <div className="flex-1 border-t border-current opacity-10" />
                    <span className="text-[11px] opacity-30">Page {page.pageNum}</span>
                    <div className="flex-1 border-t border-current opacity-10" />
                  </div>
                )}
                {page.blocks.map((block, i) => renderBlock(block, page.pageNum, i))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 高亮工具栏 */}
      {toolbar.visible && (
        <div
          className="pdf-highlight-toolbar absolute z-50 flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-xl border border-white/10"
          style={{
            left: `${toolbar.x}px`,
            top: `${toolbar.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => handleCreateHighlight(c.name)}
              className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white/40 transition-colors cursor-pointer"
              style={{ backgroundColor: c.css }}
              title={c.name}
            />
          ))}
        </div>
      )}
    </div>
  );
});
