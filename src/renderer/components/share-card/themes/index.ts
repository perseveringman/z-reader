import type { CardTheme } from '../../../../shared/types';
import { swissDesign } from './swiss-design';
import { minimalism } from './minimalism';
import { inkWash } from './ink-wash';
import { cyberpunk } from './cyberpunk';
import { risograph } from './risograph';

export const themes: CardTheme[] = [swissDesign, minimalism, inkWash, cyberpunk, risograph];
export const getTheme = (id: string): CardTheme => themes.find(t => t.id === id) ?? themes[0];
