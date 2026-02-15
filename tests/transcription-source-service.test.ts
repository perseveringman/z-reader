import { describe, expect, it } from 'vitest';
import {
  resolveTranscriptionSourceDescriptor,
  toLocalFilePathFromUrl,
  type TranscriptionSourceDescriptor,
} from '../src/main/services/transcription-source-service';

describe('transcription-source-service', () => {
  it('parses file:// urls into local file paths', () => {
    const result = toLocalFilePathFromUrl('file:///tmp/sample.mp3');
    expect(result).toContain('/tmp/sample.mp3');
  });

  it('resolves local audio file as highest-priority source', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'podcast',
        audioUrl: 'file:///tmp/podcast-episode.mp3',
        url: null,
        videoId: null,
      },
      downloadedAudioFilePath: '/tmp/downloaded.mp3',
    });

    expect(source).toEqual<TranscriptionSourceDescriptor>({
      kind: 'local-audio-file',
      filePath: expect.stringContaining('/tmp/podcast-episode.mp3'),
    });
  });

  it('resolves local video file and marks extraction requirement', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'video',
        audioUrl: null,
        url: 'file:///tmp/video-demo.mp4',
        videoId: null,
      },
      downloadedAudioFilePath: null,
    });

    expect(source).toEqual<TranscriptionSourceDescriptor>({
      kind: 'local-video-file',
      filePath: expect.stringContaining('/tmp/video-demo.mp4'),
      requiresExtraction: true,
    });
  });

  it('falls back to downloaded audio when no local file url exists', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'podcast',
        audioUrl: 'https://cdn.example.com/episode.mp3',
        url: null,
        videoId: null,
      },
      downloadedAudioFilePath: '/tmp/downloaded-episode.mp3',
    });

    expect(source).toEqual<TranscriptionSourceDescriptor>({
      kind: 'downloaded-audio-file',
      filePath: '/tmp/downloaded-episode.mp3',
    });
  });

  it('falls back to remote audio url when available', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'podcast',
        audioUrl: 'https://cdn.example.com/episode.mp3',
        url: null,
        videoId: null,
      },
      downloadedAudioFilePath: null,
    });

    expect(source).toEqual<TranscriptionSourceDescriptor>({
      kind: 'remote-audio-url',
      audioUrl: 'https://cdn.example.com/episode.mp3',
    });
  });

  it('falls back to youtube video id when no direct local/remote audio exists', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'video',
        audioUrl: null,
        url: 'https://www.youtube.com/watch?v=abc123',
        videoId: 'abc123',
      },
      downloadedAudioFilePath: null,
    });

    expect(source).toEqual<TranscriptionSourceDescriptor>({
      kind: 'youtube-video',
      videoId: 'abc123',
    });
  });

  it('returns null when no usable transcription source exists', () => {
    const source = resolveTranscriptionSourceDescriptor({
      article: {
        mediaType: 'video',
        audioUrl: null,
        url: null,
        videoId: null,
      },
      downloadedAudioFilePath: null,
    });

    expect(source).toBeNull();
  });
});
