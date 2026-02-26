import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_LIST_SORT_BY } from '../src/renderer/components/ContentList';

describe('ContentList default sorting', () => {
  it('defaults to published date sorting', () => {
    expect(DEFAULT_CONTENT_LIST_SORT_BY).toBe('published_at');
  });
});
