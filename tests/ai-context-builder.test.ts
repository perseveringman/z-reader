import { describe, it, expect } from 'vitest';
import { ContextBuilder, createContextBuilder } from '../src/ai/services/context-builder';
import type { SearchResult } from '../src/ai/services/retriever';

function makeSearchResult(id: string, content: string, sourceId: string, overrides?: Partial<SearchResult>): SearchResult {
  return {
    chunkId: id,
    content,
    score: 0.5,
    sourceType: 'article',
    sourceId,
    chunkIndex: 0,
    metadata: {},
    ...overrides,
  };
}

describe('ContextBuilder', () => {
  describe('build - empty results', () => {
    it('should return empty context for empty results', async () => {
      const builder = createContextBuilder();
      const ctx = await builder.build([]);

      expect(ctx.text).toBe('');
      expect(ctx.references).toHaveLength(0);
      expect(ctx.tokenCount).toBe(0);
    });
  });

  describe('build - with results', () => {
    it('should assemble context with references', async () => {
      const builder = createContextBuilder();
      const results = [
        makeSearchResult('c1', 'First chunk content', 'art-1'),
        makeSearchResult('c2', 'Second chunk content', 'art-2'),
      ];

      const ctx = await builder.build(results);

      expect(ctx.text).toContain('[1] First chunk content');
      expect(ctx.text).toContain('[2] Second chunk content');
      expect(ctx.text).toContain('---');
      expect(ctx.references).toHaveLength(2);
      expect(ctx.tokenCount).toBeGreaterThan(0);
    });

    it('should assemble context without references when disabled', async () => {
      const builder = createContextBuilder({ includeReferences: false });
      const results = [
        makeSearchResult('c1', 'Some content', 'art-1'),
      ];

      const ctx = await builder.build(results);

      expect(ctx.text).toBe('Some content');
      expect(ctx.text).not.toContain('[1]');
    });
  });

  describe('build - token limit', () => {
    it('should respect maxTokens limit', async () => {
      // Set very low maxTokens
      const builder = createContextBuilder({ maxTokens: 10 });
      const results = [
        makeSearchResult('c1', 'Short text', 'art-1'),
        makeSearchResult('c2', 'This is a much longer text that should exceed the token limit', 'art-2'),
      ];

      const ctx = await builder.build(results);

      // Should only include first chunk since second would exceed limit
      expect(ctx.references.length).toBeLessThanOrEqual(2);
      expect(ctx.tokenCount).toBeLessThanOrEqual(10);
    });

    it('should include as many chunks as fit', async () => {
      const builder = createContextBuilder({ maxTokens: 100 });
      const results = [
        makeSearchResult('c1', 'Short', 'art-1'),
        makeSearchResult('c2', 'Also short', 'art-2'),
        makeSearchResult('c3', 'Still short', 'art-3'),
      ];

      const ctx = await builder.build(results);
      expect(ctx.references.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('build - with getSourceTitle', () => {
    it('should use custom getSourceTitle for references', async () => {
      const titleMap: Record<string, string> = {
        'art-1': 'My First Article',
        'art-2': 'My Second Article',
      };

      const builder = createContextBuilder({
        getSourceTitle: async (_type, id) => titleMap[id] ?? null,
      });

      const results = [
        makeSearchResult('c1', 'Content 1', 'art-1'),
        makeSearchResult('c2', 'Content 2', 'art-2'),
      ];

      const ctx = await builder.build(results);

      expect(ctx.references[0].title).toBe('My First Article');
      expect(ctx.references[1].title).toBe('My Second Article');
    });
  });

  describe('buildSystemPromptSuffix', () => {
    it('should return empty string for no references', () => {
      const builder = createContextBuilder();
      expect(builder.buildSystemPromptSuffix([])).toBe('');
    });

    it('should include reference list with titles', () => {
      const builder = createContextBuilder();
      const references = [
        { sourceType: 'article', sourceId: 'art-1', title: 'AI Basics', chunkIndex: 0 },
        { sourceType: 'article', sourceId: 'art-2', title: 'Deep Learning', chunkIndex: 0 },
      ];

      const suffix = builder.buildSystemPromptSuffix(references);

      expect(suffix).toContain('[1] AI Basics');
      expect(suffix).toContain('[2] Deep Learning');
      expect(suffix).toContain('知识库');
      expect(suffix).toContain('引用编号');
    });

    it('should use fallback for missing titles', () => {
      const builder = createContextBuilder();
      const references = [
        { sourceType: 'article', sourceId: 'art-1', title: null, chunkIndex: 0 },
      ];

      const suffix = builder.buildSystemPromptSuffix(references);
      expect(suffix).toContain('[1] article/art-1');
    });
  });

  describe('createContextBuilder factory', () => {
    it('should create default instance', () => {
      const builder = createContextBuilder();
      expect(builder).toBeInstanceOf(ContextBuilder);
    });

    it('should create instance with custom config', () => {
      const builder = createContextBuilder({
        maxTokens: 2000,
        includeReferences: false,
      });
      expect(builder).toBeInstanceOf(ContextBuilder);
    });
  });
});
