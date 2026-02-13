import type { CardTheme } from '../../../../shared/types';

/**
 * Risograph 孔版印刷风
 * 特征：双色叠印、颗粒纹理、珊瑚粉+深蓝配色、复古印刷质感
 */
export const risograph: CardTheme = {
  id: 'risograph',
  name: 'Risograph',
  category: 'retro',
  styles: {
    background: '#fef5f0',
    textColor: '#1a2744',
    accentColor: '#e8614d',
    fontFamily: '"Georgia", "Noto Serif SC", "Times New Roman", serif',
    quoteStyle: 'quotation-marks',
    cardRadius: '4px',
    padding: '40px',
  },
  cssClass: 'theme-risograph',
};
