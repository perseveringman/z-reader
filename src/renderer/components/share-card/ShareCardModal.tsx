import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { CardType, Highlight, Article } from '../../../shared/types';
import CardPreview from './CardPreview';
import CardControls from './CardControls';
import { getTheme } from './themes';

interface ShareCardModalProps {
  open: boolean;
  onClose: () => void;
  highlights: Highlight[];
  article: Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;
  initialCardType?: CardType; // 默认根据 highlights 数量决定
}

/**
 * 分享卡片 Modal
 *
 * 全屏遮罩 + 居中面板，左右分栏布局：
 * - 左侧（约 60%）: CardPreview 预览区
 * - 右侧（约 40%）: CardControls 控制面板
 *
 * 支持 ESC 键关闭和点击遮罩关闭。
 */
const ShareCardModal: React.FC<ShareCardModalProps> = ({
  open,
  onClose,
  highlights,
  article,
  initialCardType,
}) => {
  // ---- State 管理 ----
  const [cardType, setCardType] = useState<CardType>(
    initialCardType ?? (highlights.length === 1 ? 'single' : 'multi'),
  );
  const [themeId, setThemeId] = useState('swiss-design');
  const [selectedHighlightIds, setSelectedHighlightIds] = useState<Set<string>>(
    () => new Set(highlights.map((h) => h.id)),
  );
  const [isExporting, setIsExporting] = useState(false);

  // 使用 null! 断言以匹配 CardPreview 的 RefObject<HTMLDivElement> 类型
  const cardRendererRef = useRef<HTMLDivElement>(null!);


  // ---- ESC 键关闭 ----
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ---- 当 highlights 变化时重置选中状态 ----
  useEffect(() => {
    setSelectedHighlightIds(new Set(highlights.map((h) => h.id)));
  }, [highlights]);

  // ---- 高亮过滤逻辑 ----
  const filteredHighlights = useMemo(() => {
    const selected = highlights.filter((h) => selectedHighlightIds.has(h.id));
    if (cardType === 'single') {
      // single 模式只取第一个选中的
      return selected.length > 0 ? [selected[0]] : [];
    }
    return selected;
  }, [highlights, selectedHighlightIds, cardType]);

  // ---- 高亮选择回调 ----
  const handleToggleHighlight = useCallback((id: string) => {
    setSelectedHighlightIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllHighlights = useCallback(() => {
    setSelectedHighlightIds(new Set(highlights.map((h) => h.id)));
  }, [highlights]);

  const handleDeselectAllHighlights = useCallback(() => {
    setSelectedHighlightIds(new Set());
  }, []);

  // ---- 导出逻辑 ----
  const handleExport = useCallback(
    async (mode: 'file' | 'clipboard') => {
      const node = cardRendererRef.current;
      if (!node) return;
      setIsExporting(true);
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2 });
        if (mode === 'file') {
          const name = `z-reader-${(article.title || 'card').slice(0, 30)}-${Date.now()}.png`;
          await window.electronAPI.shareCardExportImage(dataUrl, name);
        } else {
          await window.electronAPI.shareCardCopyClipboard(dataUrl);
        }
      } catch (err) {
        console.error('导出失败:', err);
      } finally {
        setIsExporting(false);
      }
    },
    [article.title],
  );

  // ---- 点击遮罩关闭 ----
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 仅当点击的是遮罩本身时关闭
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ---- 获取主题 ----
  const theme = useMemo(() => getTheme(themeId), [themeId]);

  // 不渲染时返回 null
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* 遮罩背景 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 面板主体 */}
      <div
        className="relative z-10 flex flex-col bg-[#1e1e24] rounded-xl shadow-2xl border border-[#333]"
        style={{ width: '80vw', maxWidth: 960, maxHeight: '90vh' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#333]">
          <h2 className="text-sm font-medium text-[#ddd]">分享卡片</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#888] hover:text-white hover:bg-[#333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 左右分栏内容区 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧预览区（约 60%） */}
          <div className="flex-[3] p-5 overflow-auto">
            <CardPreview
              rendererRef={cardRendererRef}
              cardType={cardType}
              theme={theme}
              highlights={filteredHighlights}
              article={article}
            />
          </div>

          {/* 右侧控制面板（约 40%） */}
          <div className="flex-[2] border-l border-[#333] overflow-auto">
            <CardControls
              cardType={cardType}
              onCardTypeChange={setCardType}
              selectedThemeId={themeId}
              onSelectTheme={setThemeId}
              highlights={highlights}
              selectedHighlightIds={selectedHighlightIds}
              onToggleHighlight={handleToggleHighlight}
              onSelectAllHighlights={handleSelectAllHighlights}
              onDeselectAllHighlights={handleDeselectAllHighlights}
              onExport={handleExport}
              isExporting={isExporting}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareCardModal;
