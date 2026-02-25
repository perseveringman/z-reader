import { describe, it, expect } from 'vitest';
import { ChunkingService, estimateTokenCount, createChunkingService } from '../src/ai/services/chunking';
import type { ChunkInput } from '../src/ai/services/chunking';

describe('ChunkingService', () => {
  describe('estimateTokenCount', () => {
    it('should estimate token count based on character length', () => {
      expect(estimateTokenCount('hello')).toBe(2); // ceil(5/3) = 2
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount('a')).toBe(1);
    });

    it('should handle Chinese text', () => {
      // 6 Chinese chars -> ceil(6/3) = 2 tokens
      const tokens = estimateTokenCount('你好世界测试');
      expect(tokens).toBe(2);
    });
  });

  describe('empty input', () => {
    const svc = createChunkingService();

    it('should return empty array for empty text', () => {
      expect(svc.chunk({ text: '', sourceType: 'article' })).toHaveLength(0);
    });

    it('should return empty array for whitespace-only text', () => {
      expect(svc.chunk({ text: '   \n\n  ', sourceType: 'article' })).toHaveLength(0);
    });
  });

  describe('article chunking', () => {
    it('should split by double newline', () => {
      const svc = createChunkingService({ targetSize: 50, minSize: 10 });
      const text = 'Paragraph one with some content here.\n\nParagraph two with different content.\n\nParagraph three with more content.';
      const result = svc.chunk({ text, sourceType: 'article' });

      expect(result.length).toBeGreaterThanOrEqual(1);
      // All chunks should have content
      for (const chunk of result) {
        expect(chunk.content.trim().length).toBeGreaterThan(0);
      }
    });

    it('should merge short paragraphs', () => {
      const svc = createChunkingService({ targetSize: 100, minSize: 20 });
      const text = 'Short.\n\nAlso short.\n\nStill short.';
      const result = svc.chunk({ text, sourceType: 'article' });

      // All three paragraphs should be merged into one chunk
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Short.');
      expect(result[0].content).toContain('Also short.');
    });

    it('should split long paragraphs into sentences', () => {
      const svc = createChunkingService({ targetSize: 20, minSize: 5 });
      // Create a paragraph with multiple sentences that exceeds targetSize
      const longPara = 'This is the first sentence. This is the second sentence. This is the third sentence. This is the fourth sentence.';
      const result = svc.chunk({ text: longPara, sourceType: 'article' });

      expect(result.length).toBeGreaterThan(1);
    });

    it('should preserve metadata in all chunks', () => {
      const svc = createChunkingService({ targetSize: 20, minSize: 5 });
      const meta = { title: 'Test', author: 'Author' };
      const text = 'First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph content here.';
      const result = svc.chunk({ text, sourceType: 'article', metadata: meta });

      for (const chunk of result) {
        expect(chunk.metadata).toEqual(meta);
      }
    });

    it('should assign sequential indices', () => {
      const svc = createChunkingService({ targetSize: 20, minSize: 5 });
      const text = 'Chunk one content is here.\n\nChunk two content is here.\n\nChunk three content is here.';
      const result = svc.chunk({ text, sourceType: 'article' });

      for (let i = 0; i < result.length; i++) {
        expect(result[i].index).toBe(i);
      }
    });
  });

  describe('highlight chunking', () => {
    it('should treat entire highlight as single chunk', () => {
      const svc = createChunkingService();
      const text = 'This is an important highlighted passage.';
      const result = svc.chunk({ text, sourceType: 'highlight' });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(text);
      expect(result[0].index).toBe(0);
    });
  });

  describe('transcript chunking', () => {
    it('should split by single newlines', () => {
      const svc = createChunkingService({ targetSize: 30, minSize: 5 });
      const text = 'Speaker 1: Hello everyone.\nSpeaker 2: Welcome to the show.\nSpeaker 1: Today we discuss AI.\nSpeaker 2: Very exciting topic.';
      const result = svc.chunk({ text, sourceType: 'transcript' });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('book chunking', () => {
    it('should use article chunking strategy', () => {
      const svc = createChunkingService({ targetSize: 50, minSize: 10 });
      const text = 'Chapter content paragraph one.\n\nChapter content paragraph two.';
      const result = svc.chunk({ text, sourceType: 'book' });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Chinese text handling', () => {
    it('should split Chinese text by Chinese punctuation', () => {
      const svc = createChunkingService({ targetSize: 15, minSize: 5 });
      const text = '这是第一段很长的中文内容，包含了很多有用的信息。这是第二段中文内容，同样包含了重要的知识。这是第三段中文内容，用于测试分块功能。';
      const result = svc.chunk({ text, sourceType: 'article' });

      expect(result.length).toBeGreaterThanOrEqual(1);
      for (const chunk of result) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });
  });

  describe('createChunkingService factory', () => {
    it('should create service with default config', () => {
      const svc = createChunkingService();
      expect(svc).toBeInstanceOf(ChunkingService);
    });

    it('should create service with custom config', () => {
      const svc = createChunkingService({ targetSize: 200, minSize: 50, overlap: 30 });
      expect(svc).toBeInstanceOf(ChunkingService);
    });
  });
});
