import { describe, it, expect } from 'vitest';
import { mergeFields } from '../../src/main/services/sync/merge-strategy';

describe('merge-strategy', () => {
  it('readProgress 取最大值', () => {
    const result = mergeFields('articles', { readProgress: 0.3 }, { readProgress: 0.7 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.readProgress).toBe(0.7);
  });

  it('readProgress 远端更大时采用远端', () => {
    const result = mergeFields('articles', { readProgress: 0.8 }, { readProgress: 0.5 }, '2026-02-15T10:00:00Z', '2026-02-15T11:00:00Z');
    expect(result.readProgress).toBe(0.8);
  });

  it('readStatus 取优先级更高的值', () => {
    const result = mergeFields('articles', { readStatus: 'inbox' }, { readStatus: 'archive' }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.readStatus).toBe('archive');
  });

  it('isShortlisted OR 合并', () => {
    const result = mergeFields('articles', { isShortlisted: 0 }, { isShortlisted: 1 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.isShortlisted).toBe(1);
  });

  it('deletedFlg OR 合并', () => {
    const result = mergeFields('articles', { deletedFlg: 0 }, { deletedFlg: 1 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.deletedFlg).toBe(1);
  });

  it('普通文本字段 last-write-wins（远端更新）', () => {
    const result = mergeFields('feeds', { title: '本地标题' }, { title: '远端标题' }, '2026-02-15T09:00:00Z', '2026-02-15T10:00:00Z');
    expect(result.title).toBe('远端标题');
  });

  it('普通文本字段 last-write-wins（本地更新）', () => {
    const result = mergeFields('feeds', { title: '本地标题' }, { title: '远端标题' }, '2026-02-15T11:00:00Z', '2026-02-15T10:00:00Z');
    expect(result.title).toBe('本地标题');
  });

  it('混合字段合并', () => {
    const result = mergeFields('articles',
      { readProgress: 0.3, readStatus: 'later', title: '本地' },
      { readProgress: 0.7, readStatus: 'inbox', title: '远端' },
      '2026-02-15T09:00:00Z', '2026-02-15T10:00:00Z'
    );
    expect(result.readProgress).toBe(0.7);
    expect(result.readStatus).toBe('later');
    expect(result.title).toBe('远端');
  });
});
