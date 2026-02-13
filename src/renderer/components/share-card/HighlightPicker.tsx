import React from 'react';
import type { Highlight } from '../../../shared/types';

interface HighlightPickerProps {
  highlights: Highlight[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

/** 高亮颜色到实际色值的映射 */
const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  yellow: '#fbbf24',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
};

/**
 * 高亮选择器
 *
 * 供用户勾选分享卡片中要包含的高亮条目。
 * 顶部提供全选/取消全选快捷操作，列表中每条高亮显示颜色标记和截断文本。
 */
const HighlightPicker: React.FC<HighlightPickerProps> = ({
  highlights,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}) => {
  const allSelected = highlights.length > 0 && selectedIds.size === highlights.length;

  return (
    <div className="flex flex-col gap-2">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#888]">
          已选 {selectedIds.size}/{highlights.length}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:text-[#555] disabled:cursor-not-allowed transition-colors"
          >
            全选
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            disabled={selectedIds.size === 0}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:text-[#555] disabled:cursor-not-allowed transition-colors"
          >
            取消全选
          </button>
        </div>
      </div>

      {/* 高亮列表 */}
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
        {highlights.length === 0 ? (
          <p className="text-xs text-[#666] text-center py-4">暂无高亮</p>
        ) : (
          highlights.map((hl) => {
            const isChecked = selectedIds.has(hl.id);
            const colorValue = HIGHLIGHT_COLOR_MAP[hl.color] ?? HIGHLIGHT_COLOR_MAP.yellow;
            const displayText = hl.text
              ? hl.text.length > 50
                ? hl.text.slice(0, 50) + '...'
                : hl.text
              : '(空高亮)';

            return (
              <label
                key={hl.id}
                className={`
                  flex items-start gap-2 p-2 rounded-md cursor-pointer
                  transition-colors duration-100
                  ${isChecked ? 'bg-[#2a2a35]' : 'hover:bg-[#1e1e28]'}
                `}
              >
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(hl.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#555] bg-transparent accent-blue-500 shrink-0"
                />
                {/* 颜色标记条 */}
                <div
                  className="w-1 h-full min-h-[16px] rounded-full shrink-0"
                  style={{ background: colorValue }}
                />
                {/* 文本 */}
                <span className="text-xs text-[#ccc] leading-relaxed break-all">
                  {displayText}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HighlightPicker;
