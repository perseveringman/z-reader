import type { CardTheme } from '../../../../shared/types';

/**
 * 瑞士设计 / 国际主义风格
 * 特征：网格布局、无衬线字体、红色强调线、高对比度
 */
export const swissDesign: CardTheme = {
  id: 'swiss-design',
  name: 'Swiss Design',
  category: 'classic',
  styles: {
    background: '#ffffff',
    textColor: '#1a1a1a',
    accentColor: '#e63333',
    fontFamily: '"Helvetica Neue", Helvetica, "PingFang SC", "Noto Sans SC", Arial, sans-serif',
    quoteStyle: 'border-left',
    cardRadius: '0px',
    padding: '40px',
  },
  cssClass: 'theme-swiss-design',
};
