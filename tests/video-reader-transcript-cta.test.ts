import { describe, expect, it } from 'vitest';
import { shouldShowVideoAsrButton, VIDEO_ASR_BACKGROUND_HINT } from '../src/renderer/components/VideoReaderView';

describe('VideoReader transcript-area ASR CTA', () => {
  it('hides CTA when transcript segments already exist', () => {
    const show = shouldShowVideoAsrButton({
      transcriptLoading: false,
      segmentsCount: 3,
      asrTaskStatus: null,
    });
    expect(show).toBe(false);
  });

  it('shows CTA when transcript is missing and no ASR task is running', () => {
    const show = shouldShowVideoAsrButton({
      transcriptLoading: false,
      segmentsCount: 0,
      asrTaskStatus: null,
    });
    expect(show).toBe(true);
  });

  it('hides CTA while ASR task is pending/running', () => {
    expect(shouldShowVideoAsrButton({
      transcriptLoading: false,
      segmentsCount: 0,
      asrTaskStatus: 'pending',
    })).toBe(false);

    expect(shouldShowVideoAsrButton({
      transcriptLoading: false,
      segmentsCount: 0,
      asrTaskStatus: 'running',
    })).toBe(false);
  });

  it('defines explicit background hint so users know they can leave page', () => {
    expect(VIDEO_ASR_BACKGROUND_HINT).toContain('后台转写');
    expect(VIDEO_ASR_BACKGROUND_HINT).toContain('可退出页面');
  });
});
