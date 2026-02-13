import React from 'react';
import { Download, Copy, Loader2 } from 'lucide-react';
import type { CardType, Highlight } from '../../../shared/types';
import ThemeSelector from './ThemeSelector';
import HighlightPicker from './HighlightPicker';

interface CardControlsProps {
  cardType: CardType;
  onCardTypeChange: (type: CardType) => void;
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
  highlights: Highlight[];
  selectedHighlightIds: Set<string>;
  onToggleHighlight: (id: string) => void;
  onSelectAllHighlights: () => void;
  onDeselectAllHighlights: () => void;
  onExport: (mode: 'file' | 'clipboard') => void;
  isExporting: boolean;
}

/** 卡片类型配置 */
const CARD_TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'single', label: '单条' },
  { value: 'multi', label: '合集' },
  { value: 'summary', label: '摘要' },
];

/** 区块标题 */
const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="text-xs font-medium text-[#888] uppercase tracking-wider mb-2">
    {title}
  </h3>
);

/**
 * 控制面板
 *
 * 整合所有分享卡片的设置项，从上到下依次为：
 * 1. 卡片类型切换（Segmented Control）
 * 2. 主题风格选择（ThemeSelector）
 * 3. 高亮选择（HighlightPicker，仅 multi/summary 模式显示）
 * 4. 导出操作（保存图片 / 复制剪贴板）
 */
const CardControls: React.FC<CardControlsProps> = ({
  cardType,
  onCardTypeChange,
  selectedThemeId,
  onSelectTheme,
  highlights,
  selectedHighlightIds,
  onToggleHighlight,
  onSelectAllHighlights,
  onDeselectAllHighlights,
  onExport,
  isExporting,
}) => {
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* 1. 卡片类型 */}
      <div>
        <SectionTitle title="卡片类型" />
        <div className="flex bg-[#1a1a20] rounded-lg p-1 gap-0.5">
          {CARD_TYPE_OPTIONS.map((opt) => {
            const isActive = cardType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onCardTypeChange(opt.value)}
                className={`
                  flex-1 text-xs py-1.5 rounded-md font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-[#333340] text-white shadow-sm'
                    : 'text-[#888] hover:text-[#bbb]'
                  }
                `}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 主题风格 */}
      <div>
        <SectionTitle title="主题风格" />
        <ThemeSelector
          selectedThemeId={selectedThemeId}
          onSelectTheme={onSelectTheme}
        />
      </div>

      {/* 3. 选择高亮 — 仅 multi/summary 时显示 */}
      {(cardType === 'multi' || cardType === 'summary') && (
        <div>
          <SectionTitle title="选择高亮" />
          <HighlightPicker
            highlights={highlights}
            selectedIds={selectedHighlightIds}
            onToggle={onToggleHighlight}
            onSelectAll={onSelectAllHighlights}
            onDeselectAll={onDeselectAllHighlights}
          />
        </div>
      )}

      {/* 4. 导出 */}
      <div>
        <SectionTitle title="导出" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onExport('file')}
            disabled={isExporting}
            className={`
              flex-1 flex items-center justify-center gap-1.5
              text-xs font-medium py-2 rounded-lg
              transition-all duration-150
              ${isExporting
                ? 'bg-[#2a2a30] text-[#555] cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]'
              }
            `}
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            保存图片
          </button>
          <button
            type="button"
            onClick={() => onExport('clipboard')}
            disabled={isExporting}
            className={`
              flex-1 flex items-center justify-center gap-1.5
              text-xs font-medium py-2 rounded-lg
              transition-all duration-150
              ${isExporting
                ? 'bg-[#2a2a30] text-[#555] cursor-not-allowed'
                : 'bg-[#2a2a35] hover:bg-[#35353e] text-[#ccc] border border-[#444] active:scale-[0.98]'
              }
            `}
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            复制剪贴板
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardControls;
