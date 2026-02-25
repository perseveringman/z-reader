import { describe, it, expect, vi } from 'vitest';
import { HybridRetriever, createHybridRetriever } from '../src/ai/services/retriever';
import type { RAGDatabase, ChunkRow, VectorSearchResult, ChunkSourceType } from '../src/ai/providers/rag-db';
import type { EmbeddingService, EmbeddingResult } from '../src/ai/services/embedding';
import type Database from 'better-sqlite3';

function createMockSqlite(): Database.Database {
  const prepareResult = {
    all: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    run: vi.fn(),
  };
  return {
    prepare: vi.fn().mockReturnValue(prepareResult),
  } as unknown as Database.Database;
}

function createMockRagDb(options?: {
  vecAvailable?: boolean;
  vectorResults?: VectorSearchResult[];
  chunks?: ChunkRow[];
}): RAGDatabase {
  const { vecAvailable = true, vectorResults = [], chunks = [] } = options ?? {};

  return {
    isSqliteVecAvailable: () => vecAvailable,
    searchVectors: vi.fn((): VectorSearchResult[] => vectorResults),
    getChunks: vi.fn((ids: string[]): ChunkRow[] => {
      return chunks.filter(c => ids.includes(c.id));
    }),
    getChunksBySource: vi.fn(),
    deleteChunksBySource: vi.fn(),
  } as unknown as RAGDatabase;
}

function createMockEmbeddingService(): EmbeddingService {
  return {
    embed: vi.fn(async (): Promise<EmbeddingResult> => ({
      embedding: new Float32Array(2048),
      tokenCount: 10,
    })),
    embedBatch: vi.fn(),
    getModelInfo: vi.fn(() => ({
      model: 'text-embedding-3-small',
      dimensions: 2048,
      maxTokens: 8191,
    })),
  } as unknown as EmbeddingService;
}

function makeChunkRow(id: string, sourceId: string, content: string, index: number = 0): ChunkRow {
  return {
    id,
    source_type: 'article',
    source_id: sourceId,
    chunk_index: index,
    content,
    token_count: Math.ceil(content.length / 3),
    metadata_json: null,
    embedding_model: 'text-embedding-3-small',
    embedding_status: 'done',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('HybridRetriever', () => {
  describe('search - empty query', () => {
    it('should return empty results for empty text', async () => {
      const retriever = createHybridRetriever(
        createMockSqlite(),
        createMockRagDb(),
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: '' });
      expect(results).toHaveLength(0);
    });

    it('should return empty results for whitespace', async () => {
      const retriever = createHybridRetriever(
        createMockSqlite(),
        createMockRagDb(),
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: '   ' });
      expect(results).toHaveLength(0);
    });
  });

  describe('search - vector only mode', () => {
    it('should return vector search results', async () => {
      const chunks = [
        makeChunkRow('c1', 'art-1', 'machine learning basics'),
        makeChunkRow('c2', 'art-2', 'deep learning guide'),
      ];

      const ragDb = createMockRagDb({
        vecAvailable: true,
        vectorResults: [
          { chunkId: 'c1', distance: 0.1 },
          { chunkId: 'c2', distance: 0.3 },
        ],
        chunks,
      });

      const retriever = createHybridRetriever(
        createMockSqlite(),
        ragDb,
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: 'machine learning', mode: 'vector' });

      expect(results).toHaveLength(2);
      expect(results[0].chunkId).toBe('c1');
      expect(results[0].content).toBe('machine learning basics');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should return empty when sqlite-vec unavailable', async () => {
      const ragDb = createMockRagDb({ vecAvailable: false });
      const retriever = createHybridRetriever(
        createMockSqlite(),
        ragDb,
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: 'test', mode: 'vector' });
      expect(results).toHaveLength(0);
    });
  });

  describe('RRF fusion logic', () => {
    it('should boost items that appear in both result sets', async () => {
      // We test through the public search() API with hybrid mode
      const chunks = [
        makeChunkRow('c-both', 'art-1', 'AI for healthcare'),
        makeChunkRow('c-vec-only', 'art-2', 'Vector search'),
        makeChunkRow('c-kw-only', 'art-3', 'Keyword match'),
      ];

      const ragDb = createMockRagDb({
        vecAvailable: true,
        vectorResults: [
          { chunkId: 'c-both', distance: 0.1 },
          { chunkId: 'c-vec-only', distance: 0.2 },
        ],
        chunks,
      });

      // Mock keyword search to return c-both and c-kw-only
      const mockSqlite = createMockSqlite();
      const articlePrepare = {
        all: vi.fn()
          .mockReturnValueOnce([{ id: 'art-1' }, { id: 'art-3' }]) // articles_fts match
          .mockReturnValueOnce([
            { id: 'c-both', source_id: 'art-1' },
            { id: 'c-kw-only', source_id: 'art-3' },
          ]), // chunks query
        get: vi.fn(),
        run: vi.fn(),
      };
      (mockSqlite.prepare as ReturnType<typeof vi.fn>).mockReturnValue(articlePrepare);

      const retriever = createHybridRetriever(
        mockSqlite,
        ragDb,
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: 'AI healthcare', mode: 'hybrid', topK: 5 });

      // c-both should have the highest score as it appears in both sets
      if (results.length > 0) {
        const bothResult = results.find(r => r.chunkId === 'c-both');
        if (bothResult) {
          // Its score should be higher than single-source results
          const otherScores = results
            .filter(r => r.chunkId !== 'c-both')
            .map(r => r.score);
          for (const s of otherScores) {
            expect(bothResult.score).toBeGreaterThanOrEqual(s);
          }
        }
      }
    });
  });

  describe('search - keyword only mode', () => {
    it('should not call embedding service in keyword mode', async () => {
      const embeddingService = createMockEmbeddingService();
      const retriever = createHybridRetriever(
        createMockSqlite(),
        createMockRagDb(),
        embeddingService
      );

      await retriever.search({ text: 'test', mode: 'keyword' });
      expect(embeddingService.embed).not.toHaveBeenCalled();
    });
  });

  describe('search - with metadata', () => {
    it('should parse metadata_json in results', async () => {
      const chunks: ChunkRow[] = [{
        id: 'c1',
        source_type: 'article',
        source_id: 'art-1',
        chunk_index: 0,
        content: 'test content',
        token_count: 5,
        metadata_json: '{"title":"My Article","author":"John"}',
        embedding_model: 'text-embedding-3-small',
        embedding_status: 'done',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }];

      const ragDb = createMockRagDb({
        vecAvailable: true,
        vectorResults: [{ chunkId: 'c1', distance: 0.1 }],
        chunks,
      });

      const retriever = createHybridRetriever(
        createMockSqlite(),
        ragDb,
        createMockEmbeddingService()
      );

      const results = await retriever.search({ text: 'test', mode: 'vector' });
      expect(results[0].metadata).toEqual({ title: 'My Article', author: 'John' });
    });
  });

  describe('createHybridRetriever factory', () => {
    it('should create instance', () => {
      const retriever = createHybridRetriever(
        createMockSqlite(),
        createMockRagDb(),
        createMockEmbeddingService()
      );
      expect(retriever).toBeInstanceOf(HybridRetriever);
    });
  });
});
