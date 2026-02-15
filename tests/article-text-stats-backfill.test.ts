import { describe, expect, it } from 'vitest';
import { buildArticleTextStatsPatch, getArticleTextForStats } from '../src/main/services/article-text-stats';

describe('article text stats backfill helpers', () => {
  it('prefers contentText as source text', () => {
    const text = getArticleTextForStats({
      contentText: '这是一个中文段落，没有空格',
      content: '<p>ignored</p>',
      summary: 'ignored summary',
    });

    expect(text).toBe('这是一个中文段落，没有空格');
  });

  it('falls back to stripped content when contentText is empty', () => {
    const text = getArticleTextForStats({
      contentText: '   ',
      content: '<article><p>这是一个中文段落</p><p>Hello world</p></article>',
      summary: 'ignored summary',
    });

    expect(text).toBe('这是一个中文段落 Hello world');
  });

  it('falls back to summary when both contentText and content are missing', () => {
    const text = getArticleTextForStats({
      contentText: null,
      content: null,
      summary: 'summary only text',
    });

    expect(text).toBe('summary only text');
  });

  it('returns patch when word count or reading time differs', () => {
    const patch = buildArticleTextStatsPatch(
      {
        contentText: '这是一个中文段落，没有空格',
        content: null,
        summary: null,
      },
      {
        wordCount: 1,
        readingTime: 99,
      },
    );

    expect(patch).toEqual({ wordCount: 12, readingTime: 1 });
  });

  it('returns null when existing values already match', () => {
    const patch = buildArticleTextStatsPatch(
      {
        contentText: 'hello world',
        content: null,
        summary: null,
      },
      {
        wordCount: 2,
        readingTime: 1,
      },
    );

    expect(patch).toBeNull();
  });
});
