import { describe, expect, it } from 'vitest';
import {
  buildImportedMediaArticle,
  detectLocalMediaTypeFromExtension,
  toFileUrl,
} from '../src/main/services/local-media-import';

describe('local-media-import mapper', () => {
  it('maps supported extensions to podcast/video media types', () => {
    expect(detectLocalMediaTypeFromExtension('.mp3')).toBe('podcast');
    expect(detectLocalMediaTypeFromExtension('.m4a')).toBe('podcast');
    expect(detectLocalMediaTypeFromExtension('.mp4')).toBe('video');
    expect(detectLocalMediaTypeFromExtension('.mkv')).toBe('video');
  });

  it('returns null for unsupported extensions', () => {
    expect(detectLocalMediaTypeFromExtension('.txt')).toBeNull();
  });

  it('builds podcast rows with audioUrl file:// and no page url', () => {
    const now = '2026-02-15T00:00:00.000Z';
    const row = buildImportedMediaArticle({
      id: 'pod-1',
      title: 'Episode 01',
      filePath: '/tmp/episode-01.mp3',
      mediaType: 'podcast',
      fileSize: 1024,
      duration: 321,
      now,
    });

    expect(row.mediaType).toBe('podcast');
    expect(row.audioUrl).toBe(toFileUrl('/tmp/episode-01.mp3'));
    expect(row.url).toBeNull();
    expect(row.audioDuration).toBe(321);
    expect(row.duration).toBe(321);
    expect(row.source).toBe('library');
  });

  it('builds video rows with url file:// and no audioUrl', () => {
    const now = '2026-02-15T00:00:00.000Z';
    const row = buildImportedMediaArticle({
      id: 'vid-1',
      title: 'Video 01',
      filePath: '/tmp/video-01.mp4',
      mediaType: 'video',
      fileSize: 2048,
      duration: 654,
      now,
    });

    expect(row.mediaType).toBe('video');
    expect(row.url).toBe(toFileUrl('/tmp/video-01.mp4'));
    expect(row.audioUrl).toBeNull();
    expect(row.duration).toBe(654);
    expect(row.source).toBe('library');
  });
});
