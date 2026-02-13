import type { CardTheme } from '../../../../shared/types';

/**
 * 赛博朋克
 * 特征：深色底、霓虹色强调、等宽字体、科技感
 */
export const cyberpunk: CardTheme = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  category: 'digital',
  styles: {
    background: '#0a0a0f',
    textColor: '#e0e0e8',
    accentColor: '#00ffcc',
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", "Noto Sans SC", monospace',
    quoteStyle: 'highlight-bg',
    cardRadius: '0px',
    padding: '36px',
  },
  cssClass: 'theme-cyberpunk',
};
