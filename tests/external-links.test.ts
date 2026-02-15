import { describe, expect, it } from 'vitest';
import { findAnchorExternalUrl, normalizeExternalHttpUrl } from '../src/renderer/utils/external-links';

describe('external link utilities', () => {
  it('normalizes absolute http/https links', () => {
    expect(normalizeExternalHttpUrl('https://example.com/path', 'https://app.local/current')).toBe(
      'https://example.com/path',
    );
    expect(normalizeExternalHttpUrl('http://example.com', 'https://app.local/current')).toBe(
      'http://example.com/',
    );
  });

  it('normalizes relative links to absolute urls', () => {
    expect(normalizeExternalHttpUrl('/news', 'https://app.local/current')).toBe(
      'https://app.local/news',
    );
  });

  it('rejects hash/mailto/javascript links', () => {
    expect(normalizeExternalHttpUrl('#section', 'https://app.local/current')).toBeNull();
    expect(normalizeExternalHttpUrl('mailto:test@example.com', 'https://app.local/current')).toBeNull();
    expect(normalizeExternalHttpUrl('javascript:alert(1)', 'https://app.local/current')).toBeNull();
  });

  it('finds nearest anchor href from nested target nodes', () => {
    document.body.innerHTML =
      '<a href="https://example.com/docs"><span id="child">docs</span></a>';

    const child = document.getElementById('child');
    expect(findAnchorExternalUrl(child, 'https://app.local/current')).toBe(
      'https://example.com/docs',
    );
  });
});
