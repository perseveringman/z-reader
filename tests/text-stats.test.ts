import { describe, expect, it } from 'vitest';
import { estimateReadingTimeMinutes, estimateWordCount } from '../src/main/services/text-stats';

describe('text stats', () => {
  it('counts latin words by whitespace/punctuation boundaries', () => {
    expect(estimateWordCount('Hello, world! This is a test.')).toBe(6);
  });

  it('counts CJK characters without relying on spaces', () => {
    expect(estimateWordCount('这是一个中文段落，没有空格')).toBe(12);
  });

  it('supports mixed CJK and latin content', () => {
    expect(estimateWordCount('这是 AI summary 的 test case')).toBe(7);
  });

  it('derives reading time from estimated word count', () => {
    expect(estimateReadingTimeMinutes('')).toBe(0);
    expect(estimateReadingTimeMinutes('hello world')).toBe(1);
    expect(estimateReadingTimeMinutes('词'.repeat(450))).toBe(2);
  });
});
