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

  const applyHighlights = useCallback((rendition: Rendition, hls: Highlight[]) => {
    for (const hl of hls) {
      if (!hl.anchorPath) continue;
      const colorValue = HIGHLIGHT_COLORS.find((c) => c.name === hl.color)?.value ?? HIGHLIGHT_COLORS[0].value;
      try {
        rendition.annotations.highlight(hl.anchorPath, {}, undefined, 'epub-highlight', {
          fill: colorValue,
          'fill-opacity': '0.3',
          'mix-blend-mode': 'multiply',
        });
      } catch {
        // CFI 可能无效，忽略
      }
    }
  }, []);

  useEffect(() => {
    if (!viewerRef.current) return;

    const url = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const book = ePub(url) as unknown as Book;
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      flow: 'scrolled',
      width: '100%',
      height: '100%',
    });
    renditionRef.current = rendition;

    applyTheme(rendition, settings);

    const target = initialLocation || undefined;
    rendition.display(target);

    book.loaded.navigation.then((nav) => {
      onTocLoaded(convertNavItems(nav.toc));
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

        const rect = range.getBoundingClientRect();
        const containerRect = viewerRef.current?.getBoundingClientRect();
        if (!rect || !containerRect) return;

        setToolbar({
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top - containerRect.top - 8,
          cfiRange,
          text,
        });
      } catch {
        // ignore
      }
    });

    rendition.on('markClicked', () => {
      // 点击已有高亮时不做额外操作
    });

    applyHighlights(rendition, highlightsRef.current);

    return () => {
      rendition.destroy();
      book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      locationsGeneratedRef.current = false;
    };
  }, [filePath, bookId]); // eslint-disable-line

  useEffect(() => {
    if (!renditionRef.current) return;
    applyTheme(renditionRef.current, settings);
  }, [settings, applyTheme]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const existing = rendition.annotations.each?.() ?? [];
    for (const ann of existing) {
      try {
        // @ts-expect-error epubjs annotation 有 cfiRange 属性但类型未暴露
        rendition.annotations.remove(ann.cfiRange, 'highlight');
      } catch {
        // ignore
      }
    }
    applyHighlights(rendition, highlights);
  }, [highlights, applyHighlights]);

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
    const colorValue = HIGHLIGHT_COLORS.find((c) => c.name === colorName)?.value ?? HIGHLIGHT_COLORS[0].value;

    try {
      renditionRef.current.annotations.highlight(cfiRange, {}, undefined, 'epub-highlight', {
        fill: colorValue,
        'fill-opacity': '0.3',
        'mix-blend-mode': 'multiply',
      });
    } catch {
      // ignore
    }

    setToolbar(null);

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
  }, [toolbar, bookId, onHighlightsChange]);

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
