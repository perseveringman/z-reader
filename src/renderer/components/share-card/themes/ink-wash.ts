import type { CardTheme } from '../../../../shared/types';

/**
 * 水墨风
 * 特征：宣纸纹理背景、书法字体、墨色渐变、东方美学
 */
export const inkWash: CardTheme = {
  id: 'ink-wash',
  name: '水墨',
  category: 'artistic',
  styles: {
    background: '#f5f0e8',
    textColor: '#2c2416',
    accentColor: '#5a4a3a',
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
    quoteStyle: 'border-left',
    cardRadius: '8px',
    padding: '44px',
  },
  cssClass: 'theme-ink-wash',
};
