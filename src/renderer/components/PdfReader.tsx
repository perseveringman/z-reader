import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { Highlight } from '../../shared/types';
import type { TocItem } from './BookReaderToc';
import type { BookReaderSettingsValues } from './BookReaderSettings';
import type { BookReaderHandle } from './EpubReader';

// @ts-expect-error Vite ?url import
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

const RENDER_BUFFER = 2;

interface PdfReaderProps {
  bookId: string;
  filePath: string;
  highlights: Highlight[];
  onHighlightsChange: (highlights: Highlight[]) => void;
  onTocLoaded: (items: TocItem[]) => void;
  onProgressChange: (progress: number) => void;
  onLocationChange: (location: string) => void;
  settings: BookReaderSettingsValues;
  initialLocation?: string | null;
}

interface PageState {
  rendered: boolean;
  rendering: boolean;
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

function parsePageFromHref(href: string): number | null {
  const m = href.match(/^page:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseAnchorPath(anchorPath: string): { page: number; start: number; end: number } | null {
  const m = anchorPath.match(/^page:(\d+):(\d+)-(\d+)$/);
  if (!m) return null;
  return { page: parseInt(m[1], 10), start: parseInt(m[2], 10), end: parseInt(m[3], 10) };
}

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
      // 无法解析目标页码
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

function getHighlightBg(color: string): string {
  const found = HIGHLIGHT_COLORS.find((c) => c.name === color || c.css === color);
  return found ? found.bg : HIGHLIGHT_COLORS[0].bg;
}

export const PdfReader = forwardRef<BookReaderHandle, PdfReaderProps>(function PdfReader(
  {
    bookId,
    filePath,
    highlights,
    onHighlightsChange,
    onTocLoaded,
    onProgressChange,
    onLocationChange,
    settings,
    initialLocation,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefsMap = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageStatesRef = useRef<Map<number, PageState>>(new Map());
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());
  const totalPagesRef = useRef(0);
  const currentPageRef = useRef(1);
  const initialLocationApplied = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
    pageNumber: 0,
    startOffset: 0,
    endOffset: 0,
  });

  const scaleFromSettings = useCallback(
    (baseScale: number) => {
      const fontRatio = settings.fontSize / 16;
      return baseScale * fontRatio;
    },
    [settings.fontSize],
  );

  const getViewportScale = useCallback(
    (page: PDFPageProxy, containerWidth: number) => {
      const defaultViewport = page.getViewport({ scale: 1 });
      const padding = 80;
      const baseScale = (containerWidth - padding) / defaultViewport.width;
      return scaleFromSettings(baseScale);
    },
    [scaleFromSettings],
  );

  const applyHighlightsToPage = useCallback(
    (pageNumber: number) => {
      const textLayerDiv = textLayerRefsMap.current.get(pageNumber);
      if (!textLayerDiv) return;

      textLayerDiv.querySelectorAll('mark[data-highlight-id]').forEach((el) => el.replaceWith(...el.childNodes));

      const pageHighlights = highlightsRef.current.filter((h) => {
        const parsed = h.anchorPath ? parseAnchorPath(h.anchorPath) : null;
        return parsed && parsed.page === pageNumber;
      });

      if (pageHighlights.length === 0) return;

      const spans = textLayerDiv.querySelectorAll('span');
      let cumulativeOffset = 0;
      const spanOffsets: { span: HTMLSpanElement; start: number; end: number }[] = [];

      spans.forEach((span) => {
        const text = span.textContent ?? '';
        spanOffsets.push({ span, start: cumulativeOffset, end: cumulativeOffset + text.length });
        cumulativeOffset += text.length;
      });

      for (const hl of pageHighlights) {
        const parsed = parseAnchorPath(hl.anchorPath!);
        if (!parsed) continue;
        const { start: hlStart, end: hlEnd } = parsed;
        const bg = getHighlightBg(hl.color);

        for (const { span, start: spanStart, end: spanEnd } of spanOffsets) {
          if (hlEnd <= spanStart || hlStart >= spanEnd) continue;

          const relStart = Math.max(0, hlStart - spanStart);
          const relEnd = Math.min(spanEnd - spanStart, hlEnd - spanStart);
          const text = span.textContent ?? '';

          if (relStart === 0 && relEnd === text.length) {
            const mark = document.createElement('mark');
            mark.dataset.highlightId = hl.id;
            mark.style.backgroundColor = bg;
            mark.style.borderRadius = '2px';
            mark.style.color = 'transparent';
            span.replaceChildren(mark);
            mark.textContent = text;
          } else {
            const fragment = document.createDocumentFragment();
            if (relStart > 0) {
              fragment.appendChild(document.createTextNode(text.slice(0, relStart)));
            }
            const mark = document.createElement('mark');
            mark.dataset.highlightId = hl.id;
            mark.style.backgroundColor = bg;
            mark.style.borderRadius = '2px';
            mark.style.color = 'transparent';
            mark.textContent = text.slice(relStart, relEnd);
            fragment.appendChild(mark);
            if (relEnd < text.length) {
              fragment.appendChild(document.createTextNode(text.slice(relEnd)));
            }
            span.replaceChildren(fragment);
          }
        }
      }
    },
    [],
  );

  const renderPage = useCallback(
    async (pageNumber: number) => {
      const pdfDoc = pdfDocRef.current;
      const container = containerRef.current;
      if (!pdfDoc || !container) return;

      const state = pageStatesRef.current.get(pageNumber);
      if (state?.rendered || state?.rendering) return;
      pageStatesRef.current.set(pageNumber, { rendered: false, rendering: true });

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const containerWidth = container.clientWidth;
        const scale = getViewportScale(page, containerWidth);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        const pageDiv = pageRefsMap.current.get(pageNumber);
        const canvas = canvasRefsMap.current.get(pageNumber);
        const textLayerDiv = textLayerRefsMap.current.get(pageNumber);
        if (!pageDiv || !canvas || !textLayerDiv) return;

        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;

        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const existingTask = renderTasksRef.current.get(pageNumber);
        if (existingTask) existingTask.cancel();

        const renderTask = page.render({ canvas, canvasContext: ctx, viewport });
        renderTasksRef.current.set(pageNumber, renderTask);

        await renderTask.promise;

        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();

        pageStatesRef.current.set(pageNumber, { rendered: true, rendering: false });
        renderTasksRef.current.delete(pageNumber);

        applyHighlightsToPage(pageNumber);
      } catch (e: unknown) {
        if (e instanceof pdfjsLib.RenderingCancelledException) return;
        console.error(`渲染页面 ${pageNumber} 失败:`, e);
        pageStatesRef.current.set(pageNumber, { rendered: false, rendering: false });
      }
    },
    [getViewportScale, applyHighlightsToPage],
  );

  const clearPage = useCallback((pageNumber: number) => {
    const task = renderTasksRef.current.get(pageNumber);
    if (task) {
      task.cancel();
      renderTasksRef.current.delete(pageNumber);
    }

    const canvas = canvasRefsMap.current.get(pageNumber);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const textLayerDiv = textLayerRefsMap.current.get(pageNumber);
    if (textLayerDiv) textLayerDiv.innerHTML = '';

    pageStatesRef.current.set(pageNumber, { rendered: false, rendering: false });
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || totalPagesRef.current === 0) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const progress = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
    onProgressChange(Math.min(1, Math.max(0, progress)));

    let visiblePage = 1;
    const containerRect = container.getBoundingClientRect();
    const mid = containerRect.top + containerRect.height / 2;

    for (const [pageNum, div] of pageRefsMap.current) {
      const rect = div.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) {
        visiblePage = pageNum;
        break;
      }
    }

    if (currentPageRef.current !== visiblePage) {
      currentPageRef.current = visiblePage;
      onLocationChange(`page:${visiblePage}`);
    }
  }, [onProgressChange, onLocationChange]);

  const loadOutline = useCallback(
    async (pdfDoc: PDFDocumentProxy) => {
      try {
        const outline = await pdfDoc.getOutline();
        if (!outline || outline.length === 0) {
          onTocLoaded([]);
          return;
        }

        const counter = { id: 0 };
        const items = await convertOutlineItems(pdfDoc, outline, 0, counter);
        onTocLoaded(items);
      } catch {
        onTocLoaded([]);
      }
    },
    [onTocLoaded],
  );

  const scrollToPage = useCallback((pageNumber: number) => {
    const container = containerRef.current;
    const pageDiv = pageRefsMap.current.get(pageNumber);
    if (!container || !pageDiv) return;
    pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      navigateTo: (href: string) => {
        const page = parsePageFromHref(href);
        if (page) scrollToPage(page);
      },
      navigateToHighlight: (anchorPath: string) => {
        const parsed = parseAnchorPath(anchorPath);
        if (parsed) scrollToPage(parsed.page);
      },
    }),
    [scrollToPage],
  );

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    async function init() {
      const url = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const loadingTask = pdfjsLib.getDocument({ url });
      doc = await loadingTask.promise;
      if (cancelled) {
        doc.destroy();
        return;
      }
      pdfDocRef.current = doc;
      totalPagesRef.current = doc.numPages;

      const container = containerRef.current;
      if (!container) return;

      container.innerHTML = '';
      pageRefsMap.current.clear();
      canvasRefsMap.current.clear();
      textLayerRefsMap.current.clear();
      pageStatesRef.current.clear();

      for (let i = 1; i <= doc.numPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page-wrapper';
        pageDiv.style.position = 'relative';
        pageDiv.style.margin = '0 auto 16px auto';
        pageDiv.style.overflow = 'hidden';
        pageDiv.dataset.pageNumber = String(i);

        const page = await doc.getPage(i);
        const containerWidth = container.clientWidth;
        const scale = getViewportScale(page, containerWidth);
        const viewport = page.getViewport({ scale });
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        pageDiv.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'pdf-text-layer';
        pageDiv.appendChild(textLayerDiv);

        const pageLabel = document.createElement('div');
        pageLabel.className = 'pdf-page-label';
        pageLabel.textContent = String(i);
        pageDiv.appendChild(pageLabel);

        container.appendChild(pageDiv);
        pageRefsMap.current.set(i, pageDiv);
        canvasRefsMap.current.set(i, canvas);
        textLayerRefsMap.current.set(i, textLayerDiv);
        pageStatesRef.current.set(i, { rendered: false, rendering: false });
      }

      if (observerRef.current) observerRef.current.disconnect();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const pageNum = parseInt(
              (entry.target as HTMLElement).dataset.pageNumber ?? '0',
              10,
            );
            if (pageNum === 0) continue;

            if (entry.isIntersecting) {
              for (
                let p = Math.max(1, pageNum - RENDER_BUFFER);
                p <= Math.min(totalPagesRef.current, pageNum + RENDER_BUFFER);
                p++
              ) {
                renderPage(p);
              }
            } else {
              const state = pageStatesRef.current.get(pageNum);
              if (state?.rendered) {
                const pageDiv = pageRefsMap.current.get(pageNum);
                if (pageDiv) {
                  const rect = pageDiv.getBoundingClientRect();
                  const containerRect = container.getBoundingClientRect();
                  const distance = Math.abs(rect.top - containerRect.top);
                  if (distance > containerRect.height * 3) {
                    clearPage(pageNum);
                  }
                }
              }
            }
          }
        },
        { root: container, rootMargin: '200% 0px' },
      );
      observerRef.current = observer;

      for (const [, div] of pageRefsMap.current) {
        observer.observe(div);
      }

      loadOutline(doc);

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
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      for (const [, task] of renderTasksRef.current) {
        task.cancel();
      }
      renderTasksRef.current.clear();
      if (doc) doc.destroy();
      pdfDocRef.current = null;
    };
  }, [filePath]); // eslint-disable-line

  useEffect(() => {
    if (!pdfDocRef.current) return;
    for (const [pageNum] of pageStatesRef.current) {
      const state = pageStatesRef.current.get(pageNum);
      if (state?.rendered) {
        clearPage(pageNum);
        renderPage(pageNum);
      }
    }
  }, [settings.fontSize, settings.theme, clearPage, renderPage]);

  useEffect(() => {
    for (const [pageNum] of pageStatesRef.current) {
      const state = pageStatesRef.current.get(pageNum);
      if (state?.rendered) {
        applyHighlightsToPage(pageNum);
      }
    }
  }, [highlights, applyHighlightsToPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    let textLayerDiv: HTMLDivElement | null = null;
    let pageNumber = 0;
    let node: Node | null = range.startContainer;
    while (node) {
      if (node instanceof HTMLElement && node.classList.contains('pdf-text-layer')) {
        textLayerDiv = node as HTMLDivElement;
        const pageDiv = node.parentElement;
        pageNumber = parseInt(pageDiv?.dataset.pageNumber ?? '0', 10);
        break;
      }
      node = node.parentNode;
    }

    if (!textLayerDiv || pageNumber === 0) return;

    const spans = textLayerDiv.querySelectorAll('span');
    let totalOffset = 0;
    let startOffset = 0;
    let endOffset = 0;
    let foundStart = false;
    let foundEnd = false;

    for (const span of spans) {
      const spanText = span.textContent ?? '';
      const treeWalker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let textNode: Text | null;
      let spanInternalOffset = 0;

      while ((textNode = treeWalker.nextNode() as Text | null)) {
        const nodeLen = textNode.length;
        if (!foundStart && range.startContainer === textNode) {
          startOffset = totalOffset + spanInternalOffset + range.startOffset;
          foundStart = true;
        }
        if (!foundEnd && range.endContainer === textNode) {
          endOffset = totalOffset + spanInternalOffset + range.endOffset;
          foundEnd = true;
        }
        spanInternalOffset += nodeLen;
        if (foundStart && foundEnd) break;
      }

      if (!foundStart || !foundEnd) {
        if (!foundStart && range.startContainer === span) {
          startOffset = totalOffset;
          foundStart = true;
        }
        if (!foundEnd && range.endContainer === span) {
          endOffset = totalOffset + spanText.length;
          foundEnd = true;
        }
      }

      totalOffset += spanText.length;
      if (foundStart && foundEnd) break;
    }

    if (!foundStart || !foundEnd || startOffset >= endOffset) return;

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'PageDown':
          e.preventDefault();
          container.scrollBy({ top: container.clientHeight * 0.9, behavior: 'smooth' });
          break;
        case 'PageUp':
          e.preventDefault();
          container.scrollBy({ top: -container.clientHeight * 0.9, behavior: 'smooth' });
          break;
        case 'ArrowDown':
          e.preventDefault();
          container.scrollBy({ top: 80, behavior: 'smooth' });
          break;
        case 'ArrowUp':
          e.preventDefault();
          container.scrollBy({ top: -80, behavior: 'smooth' });
          break;
      }
    };
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }, []);

  const bgColor = THEME_BG[settings.theme] || THEME_BG.dark;

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: bgColor }}>
      <div
        ref={containerRef}
        className="w-full h-full overflow-y-auto outline-none py-4"
        tabIndex={0}
        onMouseUp={handleMouseUp}
        style={{ backgroundColor: bgColor }}
      />

      {toolbar.visible && (
        <HighlightToolbar
          x={toolbar.x}
          y={toolbar.y}
          containerRef={containerRef}
          onSelectColor={handleCreateHighlight}
        />
      )}
    </div>
  );
});

function HighlightToolbar({
  x,
  y,
  containerRef,
  onSelectColor,
}: {
  x: number;
  y: number;
  containerRef: RefObject<HTMLDivElement | null>;
  onSelectColor: (color: string) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const container = containerRef.current;
    if (!toolbar || !container) return;

    const tw = toolbar.offsetWidth;
    const cw = container.clientWidth;
    let left = x - tw / 2;
    left = Math.max(8, Math.min(left, cw - tw - 8));
    const top = Math.max(8, y - toolbar.offsetHeight);
    setPos({ left, top });
  }, [x, y, containerRef]);

  return (
    <div
      ref={toolbarRef}
      className="pdf-highlight-toolbar absolute z-50 flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-xl border border-white/10"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.name}
          onClick={() => onSelectColor(c.name)}
          className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white/40 transition-colors cursor-pointer"
          style={{ backgroundColor: c.css }}
          title={c.name}
        />
      ))}
    </div>
  );
}
