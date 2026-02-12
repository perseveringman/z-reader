import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioPlayer } from '../src/renderer/components/AudioPlayer';

describe('AudioPlayer skip icon direction', () => {
  it('前进 30 秒图标与后退 15 秒图标方向相反', () => {
    const html = renderToStaticMarkup(
      React.createElement(AudioPlayer, {
        audioUrl: 'https://example.com/episode.mp3',
      }),
    );

    expect(html).toContain('lucide-rotate-ccw');
    expect(html).toContain('lucide-rotate-cw');
    expect(html).not.toContain('lucide-skip-forward');
  });
});
