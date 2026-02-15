import type { AppSettings } from '../../shared/types';

export type PrimaryPreferenceSectionId = 'general' | 'content' | 'asr' | 'ai' | 'sync';

export type SecondaryPreferenceSectionId =
  | 'language'
  | 'reading'
  | 'podcast'
  | 'rsshub'
  | 'download'
  | 'asr-provider'
  | 'asr-credentials-volcengine'
  | 'asr-credentials-tencent'
  | 'ai-models'
  | 'ai-debug'
  | 'sync-general';

export interface PrimaryPreferenceSection {
  id: PrimaryPreferenceSectionId;
}

export interface SecondaryPreferenceSection {
  id: SecondaryPreferenceSectionId;
}

export interface PreferencesDialogLayout {
  containerClass: string;
  bodyClass: string;
  sidebarClass: string;
}

export const PRIMARY_PREFERENCE_SECTIONS: PrimaryPreferenceSection[] = [
  { id: 'general' },
  { id: 'content' },
  { id: 'asr' },
  { id: 'ai' },
  { id: 'sync' },
];

export function getSecondarySectionsForPrimary(
  primaryId: PrimaryPreferenceSectionId,
  settings: Pick<AppSettings, 'asrProvider'>,
): SecondaryPreferenceSection[] {
  if (primaryId === 'general') {
    return [{ id: 'language' }, { id: 'reading' }];
  }

  if (primaryId === 'content') {
    return [{ id: 'podcast' }, { id: 'rsshub' }, { id: 'download' }];
  }

  if (primaryId === 'asr') {
    const provider = settings.asrProvider || 'volcengine';
    return [
      { id: 'asr-provider' },
      { id: provider === 'tencent' ? 'asr-credentials-tencent' : 'asr-credentials-volcengine' },
    ];
  }

  if (primaryId === 'sync') {
    return [{ id: 'sync-general' }];
  }

  return [{ id: 'ai-models' }, { id: 'ai-debug' }];
}

export function getFirstSecondarySection(
  primaryId: PrimaryPreferenceSectionId,
  settings: Pick<AppSettings, 'asrProvider'>,
): SecondaryPreferenceSectionId {
  return getSecondarySectionsForPrimary(primaryId, settings)[0].id;
}

export function isSecondarySectionInPrimary(
  primaryId: PrimaryPreferenceSectionId,
  secondaryId: SecondaryPreferenceSectionId,
  settings: Pick<AppSettings, 'asrProvider'>,
): boolean {
  return getSecondarySectionsForPrimary(primaryId, settings).some((section) => section.id === secondaryId);
}

export function getPreferencesDialogLayout(): PreferencesDialogLayout {
  return {
    containerClass: 'w-[clamp(620px,74vw,860px)] max-w-[calc(100vw-32px)] max-h-[80vh]',
    bodyClass: 'h-[clamp(380px,62vh,560px)]',
    sidebarClass: 'w-40',
  };
}
