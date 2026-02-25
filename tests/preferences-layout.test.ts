import { describe, it, expect } from 'vitest';
import {
  PRIMARY_PREFERENCE_SECTIONS,
  getSecondarySectionsForPrimary,
  getFirstSecondarySection,
  getPreferencesDialogLayout,
} from '../src/renderer/components/preferences-layout';

describe('preferences layout model', () => {
  it('defines stable primary sections in focused order', () => {
    expect(PRIMARY_PREFERENCE_SECTIONS.map((section) => section.id)).toEqual([
      'general',
      'content',
      'asr',
      'ai',
      'sync',
    ]);
  });

  it('returns tencent credentials section for tencent ASR provider', () => {
    const sections = getSecondarySectionsForPrimary('asr', { asrProvider: 'tencent' });

    expect(sections.map((section) => section.id)).toEqual([
      'asr-provider',
      'asr-credentials-tencent',
    ]);
    expect(getFirstSecondarySection('asr', { asrProvider: 'tencent' })).toBe('asr-provider');
  });

  it('returns volcengine credentials section by default', () => {
    const sections = getSecondarySectionsForPrimary('asr', {});

    expect(sections.map((section) => section.id)).toEqual([
      'asr-provider',
      'asr-credentials-volcengine',
    ]);
  });

  it('exposes prompt presets section under AI', () => {
    const sections = getSecondarySectionsForPrimary('ai', {});

    expect(sections.map((section) => section.id)).toEqual([
      'ai-models',
      'ai-prompts',
      'ai-smart',
      'ai-debug',
    ]);
  });

  it('provides responsive compact-by-default dialog layout classes', () => {
    const layout = getPreferencesDialogLayout();

    expect(layout.containerClass).toContain('w-[clamp(620px,74vw,860px)]');
    expect(layout.containerClass).toContain('max-w-[calc(100vw-32px)]');
    expect(layout.containerClass).toContain('max-h-[80vh]');
    expect(layout.bodyClass).toContain('h-[clamp(380px,62vh,560px)]');
    expect(layout.sidebarClass).toBe('w-40');
  });
});
