import React from 'react';
import { themes } from './themes';

interface ThemeSelectorProps {
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
}

/**
 * 主题选择器
 *
 * 以 3 列网格展示所有可用主题，每个主题项包含：
 * - 色块预览（主题 background 底色 + accentColor 横线装饰）
 * - 主题名称
 * 选中态使用蓝色高亮边框。
 */
const ThemeSelector: React.FC<ThemeSelectorProps> = ({ selectedThemeId, onSelectTheme }) => {
  return (
    <div className="grid grid-cols-3 gap-2">
      {themes.map((theme) => {
        const isSelected = theme.id === selectedThemeId;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelectTheme(theme.id)}
            className={`
              flex flex-col items-center gap-1.5 p-2 rounded-lg cursor-pointer
              transition-all duration-150
              border-2
              ${isSelected
                ? 'border-blue-500 ring-2 ring-blue-500/30 bg-[#2a2a30]'
                : 'border-transparent hover:border-[#444] bg-[#1e1e24]'
              }
            `}
          >
            {/* 色块预览 */}
            <div
              className="w-full h-10 rounded overflow-hidden relative"
              style={{ background: theme.styles.background }}
            >
              {/* accentColor 横线装饰 */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1.5"
                style={{ background: theme.styles.accentColor }}
              />
              {/* 模拟文字行 */}
              <div className="absolute top-2 left-2 right-4 space-y-1">
                <div
                  className="h-[3px] rounded-full opacity-30"
                  style={{ background: theme.styles.textColor, width: '70%' }}
                />
                <div
                  className="h-[3px] rounded-full opacity-20"
                  style={{ background: theme.styles.textColor, width: '50%' }}
                />
              </div>
            </div>
            {/* 主题名称 */}
            <span className="text-[11px] text-[#aaa] truncate w-full text-center">
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeSelector;
