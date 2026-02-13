import type { CardTheme } from '../../../../shared/types';

/**
 * 极简主义
 * 特征：大量留白、单色、极细分隔线、克制
 */
export const minimalism: CardTheme = {
  id: 'minimalism',
  name: 'Minimalism',
  category: 'classic',
  styles: {
    background: '#fafafa',
    textColor: '#333333',
    accentColor: '#999999',
    fontFamily: '"SF Pro Text", -apple-system, "PingFang SC", "Noto Sans SC", sans-serif',
    quoteStyle: 'minimal',
    cardRadius: '4px',
    padding: '48px',
  },
  cssClass: 'theme-minimalism',
};
