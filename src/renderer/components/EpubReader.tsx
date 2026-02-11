import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import ePub from 'epubjs';
import type Book from 'epubjs/types/book';
import type Rendition from 'epubjs/types/rendition';
import type { NavItem } from 'epubjs/types/navigation';
import type { Location } from 'epubjs/types/rendition';
import type { Highlight } from '../../shared/types';
import type { TocItem } from './BookReaderToc';
import type { BookReaderSettingsValues } from './BookReaderSettings';
import { BOOK_FONT_FAMILY_MAP } from './BookReaderSettings';

export interface BookReaderHandle {
  navigateTo: (href: string) => void;
  navigateToHighlight: (anchorPath: string) => void;
}

interface EpubReaderProps {
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

const HIGHLIGHT_COLORS = [
  { name: 'yellow', value: '#fbbf24' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'green', value: '#22c55e' },
  { name: 'red', value: '#ef4444' },
];

const THEME_STYLES: Record<BookReaderSettingsValues['theme'], { color: string; background: string }> = {
  dark: { color: '#e5e5e5', background: '#0f0f0f' },
  light: { color: '#1a1a1a', background: '#ffffff' },
  sepia: { color: '#5b4636', background: '#f4ecd8' },
};

function convertNavItems(items: NavItem[], level = 0): TocItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label.trim(),
    href: item.href,
    level,
    children: item.subitems?.length ? convertNavItems(item.subitems, level + 1) : undefined,
  }));
}

export const EpubReader = forwardRef<BookReaderHandle, EpubReaderProps>(function EpubReader(
  { bookId, filePath, highlights, onHighlightsChange, onTocLoaded, onProgressChange, onLocationChange, settings, initialLocation },
  ref,
) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const locationsGeneratedRef = useRef(false);
  const appliedHighlightAnchorsRef = useRef<string[]>([]);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  const [toolbar, setToolbar] = useState<{ x: number; y: number; cfiRange: string; text: string } | null>(null);

  useImperativeHandle(ref, () => ({
    navigateTo(href: string) {
      renditionRef.current?.display(href);
    },
    navigateToHighlight(anchorPath: string) {
      renditionRef.current?.display(anchorPath);
    },
  }));

  const applyTheme = useCallback((rendition: Rendition, s: BookReaderSettingsValues) => {
    const theme = THEME_STYLES[s.theme];
    rendition.themes.override('color', theme.color);
    rendition.themes.override('background', theme.background);
    rendition.themes.fontSize(s.fontSize + 'px');
    rendition.themes.font(BOOK_FONT_FAMILY_MAP[s.font]);
    rendition.themes.override('line-height', String(s.lineHeight));
  }, []);

  const clearSelectionInRendition = useCallback(() => {
    try {
      const rendition = renditionRef.current as unknown as { getContents?: () => Array<{ window?: Window }> } | null;
      const contents = rendition?.getContents?.() ?? [];
      for (const content of contents) {
        content.window?.getSelection?.()?.removeAllRanges();
      }
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
  }, []);

  const clearAppliedHighlights = useCallback((rendition: Rendition) => {
    for (const cfiRange of appliedHighlightAnchorsRef.current) {
      try {
        rendition.annotations.remove(cfiRange, 'epub-highlight');
      } catch {
        // ignore
      }
    }
    appliedHighlightAnchorsRef.current = [];
  }, []);

  const applyHighlights = useCallback((rendition: Rendition, hls: Highlight[]) => {
    const nextAppliedAnchors: string[] = [];

    for (const hl of hls) {
      if (!hl.anchorPath) continue;
      const colorValue = HIGHLIGHT_COLORS.find((c) => c.name === hl.color)?.value ?? HIGHLIGHT_COLORS[0].value;
      try {
        rendition.annotations.highlight(hl.anchorPath, {}, undefined, 'epub-highlight', {
          fill: colorValue,
          'fill-opacity': '0.3',
          'mix-blend-mode': 'multiply',
        });
        nextAppliedAnchors.push(hl.anchorPath);
      } catch {
        // CFI 可能无效，忽略
      }
    }

    appliedHighlightAnchorsRef.current = nextAppliedAnchors;
  }, []);

  useEffect(() => {
    if (!viewerRef.current) return;
    let cancelled = false;
    let localBook: Book | null = null;
    let localRendition: Rendition | null = null;

    async function init() {
      const binary = await window.electronAPI.bookReadFile(bookId);
      if (cancelled || !binary || !viewerRef.current) return;

      const book = ePub(binary) as unknown as Book;
      localBook = book;
      bookRef.current = book;

      const rendition = book.renderTo(viewerRef.current, {
        flow: 'scrolled',
        width: '100%',
        height: '100%',
      });
      localRendition = rendition;
      renditionRef.current = rendition;

      applyTheme(rendition, settings);

      const target = initialLocation || undefined;
      rendition.display(target);

      book.loaded.navigation.then((nav) => {
        onTocLoaded(convertNavItems(nav.toc));
      }).catch(() => {
        onTocLoaded([]);
      });

      book.ready.then(() => {
        if (!locationsGeneratedRef.current) {
          locationsGeneratedRef.current = true;
          book.locations.generate(1600);
        }
      });

      rendition.on('relocated', (location: Location) => {
        if (location?.start) {
          onProgressChange(location.start.percentage);
          onLocationChange(location.start.cfi);
        }
      });

      rendition.on('selected', (cfiRange: string) => {
        try {
          const range = rendition.getRange(cfiRange);
          const text = range?.toString() ?? '';
          if (!text.trim()) return;

          // 已存在相同锚点的高亮时，不重复弹出创建工具栏
          const exists = highlightsRef.current.some((hl) => hl.anchorPath === cfiRange);
          if (exists) {
            clearSelectionInRendition();
            setToolbar(null);
            return;
          }

          const rect = range.getBoundingClientRect();
          const containerRect = viewerRef.current?.getBoundingClientRect();
          if (!rect || !containerRect) return;

          const ownerDoc = range.startContainer?.ownerDocument ?? null;
          const frameEl = ownerDoc?.defaultView?.frameElement as HTMLElement | null;
          const frameRect = frameEl?.getBoundingClientRect();

          const anchorX = frameRect
            ? frameRect.left + rect.left + rect.width / 2
            : rect.left + rect.width / 2;
          const anchorY = frameRect
            ? frameRect.top + rect.top
            : rect.top;

          setToolbar({
            x: anchorX - containerRect.left,
            y: anchorY - containerRect.top - 8,
            cfiRange,
            text,
          });
        } catch {
          // ignore
        }
      });

      rendition.on('markClicked', (_cfiRange: unknown, data: unknown) => {
        const possibleAnchor =
          (typeof _cfiRange === 'string' && _cfiRange)
          || ((data as { cfiRange?: string } | undefined)?.cfiRange)
          || ((data as { annotation?: { cfiRange?: string } } | undefined)?.annotation?.cfiRange)
          || null;

        if (!possibleAnchor) return;

        const target = highlightsRef.current.find((hl) => hl.anchorPath === possibleAnchor);
        if (!target) return;

        window.dispatchEvent(new CustomEvent('book-reader:highlight-click', {
          detail: {
            bookId,
            highlightId: target.id,
          },
        }));
      });

      clearAppliedHighlights(rendition);
      applyHighlights(rendition, highlightsRef.current);
    }

    init().catch(() => {
      onTocLoaded([]);
    });

    return () => {
      cancelled = true;
      if (localRendition) localRendition.destroy();
      if (localBook) localBook.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      appliedHighlightAnchorsRef.current = [];
      locationsGeneratedRef.current = false;
    };
  }, [filePath, bookId, initialLocation, onLocationChange, onProgressChange, onTocLoaded, applyTheme, applyHighlights, clearAppliedHighlights, clearSelectionInRendition]); // eslint-disable-line

  useEffect(() => {
    if (!renditionRef.current) return;
    applyTheme(renditionRef.current, settings);
  }, [settings, applyTheme]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    clearAppliedHighlights(rendition);
    applyHighlights(rendition, highlights);
  }, [highlights, applyHighlights, clearAppliedHighlights]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') renditionRef.current?.prev();
      if (e.key === 'ArrowRight') renditionRef.current?.next();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!toolbar) return;
    const dismiss = () => setToolbar(null);
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [toolbar]);

  const handleHighlight = useCallback(async (colorName: string) => {
    if (!toolbar || !renditionRef.current) return;
    const { cfiRange, text } = toolbar;
    const existing = highlightsRef.current.find((hl) => hl.anchorPath === cfiRange);

    setToolbar(null);
    clearSelectionInRendition();

    if (existing) {
      if (existing.color !== colorName) {
        try {
          const updated = await window.electronAPI.highlightUpdate({ id: existing.id, color: colorName });
          onHighlightsChange(highlightsRef.current.map((hl) => (hl.id === existing.id ? updated : hl)));
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      const created = await window.electronAPI.bookHighlightCreate({
        bookId,
        text,
        anchorPath: cfiRange,
        color: colorName,
      });
      onHighlightsChange([...highlightsRef.current, created]);
    } catch {
      // ignore
    }
  }, [toolbar, bookId, onHighlightsChange, clearSelectionInRendition]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={viewerRef} className="w-full h-full" />

      {toolbar && (
        <div
          className="absolute z-50 flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl"
          style={{
            left: toolbar.x,
            top: toolbar.y,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => handleHighlight(c.name)}
              className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform cursor-pointer"
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
      )}
    </div>
  );
});
