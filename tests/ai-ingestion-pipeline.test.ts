import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionPipeline, createIngestionPipeline } from '../src/ai/services/ingestion';
import type { IngestionPipelineDeps, IngestSource } from '../src/ai/services/ingestion';
import type { RAGDatabase, ChunkRow, CreateChunkInput, ChunkSourceType, ChunkEmbeddingStatus } from '../src/ai/providers/rag-db';
import type { ChunkingService, ChunkInput, ChunkResult } from '../src/ai/services/chunking';
import type { EmbeddingService, EmbeddingModelInfo, BatchEmbeddingResult } from '../src/ai/services/embedding';

function createMockRagDb(options?: { vecAvailable?: boolean }): RAGDatabase {
  const vecAvailable = options?.vecAvailable ?? true;
  let chunkStore: ChunkRow[] = [];
  let idCounter = 0;

  return {
    isSqliteVecAvailable: () => vecAvailable,
    deleteChunksBySource: vi.fn((sourceType: ChunkSourceType, sourceId: string) => {
      chunkStore = chunkStore.filter(c => !(c.source_type === sourceType && c.source_id === sourceId));
    }),
    createChunks: vi.fn((inputs: CreateChunkInput[]): ChunkRow[] => {
      const rows: ChunkRow[] = inputs.map((input) => {
        const id = `chunk-${idCounter++}`;
        const now = new Date().toISOString();
        const row: ChunkRow = {
          id,
          source_type: input.sourceType,
          source_id: input.sourceId,
          chunk_index: input.chunkIndex,
          content: input.content,
          token_count: input.tokenCount ?? null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          embedding_model: null,
          embedding_status: 'pending',
          created_at: now,
          updated_at: now,
        };
        chunkStore.push(row);
        return row;
      });
      return rows;
    }),
    insertEmbeddings: vi.fn(),
    updateChunkEmbeddingStatus: vi.fn((chunkId: string, status: ChunkEmbeddingStatus, model?: string) => {
      const chunk = chunkStore.find(c => c.id === chunkId);
      if (chunk) {
        chunk.embedding_status = status;
        chunk.embedding_model = model ?? null;
      }
    }),
    getChunksBySource: vi.fn((sourceType: ChunkSourceType, sourceId: string) => {
      return chunkStore.filter(c => c.source_type === sourceType && c.source_id === sourceId);
    }),
    getPendingChunks: vi.fn((limit?: number) => {
      return chunkStore.filter(c => c.embedding_status === 'pending').slice(0, limit ?? 100);
    }),
  } as unknown as RAGDatabase;
}

function createMockChunkingService(): ChunkingService {
  return {
    chunk: vi.fn((input: ChunkInput): ChunkResult[] => {
      if (!input.text.trim()) return [];
      // Simple mock: split by newlines, create one chunk per paragraph
      const paragraphs = input.text.split(/\n\n+/).filter(p => p.trim());
      return paragraphs.map((p, i) => ({
        content: p.trim(),
        index: i,
        tokenCount: Math.ceil(p.length / 3),
        metadata: input.metadata ?? {},
      }));
    }),
  } as unknown as ChunkingService;
}

function createMockEmbeddingService(options?: { shouldFail?: boolean }): EmbeddingService {
  return {
    getModelInfo: vi.fn((): EmbeddingModelInfo => ({
      model: 'text-embedding-3-small',
      dimensions: 2048,
      maxTokens: 8191,
    })),
    embedBatch: vi.fn(async (texts: string[]): Promise<BatchEmbeddingResult> => {
      if (options?.shouldFail) {
        throw new Error('Embedding API failed');
      }
      return {
        embeddings: texts.map(() => new Float32Array(2048)),
        totalTokens: texts.reduce((sum, t) => sum + Math.ceil(t.length / 3), 0),
      };
    }),
    embed: vi.fn(),
  } as unknown as EmbeddingService;
}

describe('IngestionPipeline', () => {
  let ragDb: RAGDatabase;
  let chunkingService: ChunkingService;
  let embeddingService: EmbeddingService;
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    ragDb = createMockRagDb();
    chunkingService = createMockChunkingService();
    embeddingService = createMockEmbeddingService();
    pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });
  });

  describe('ingest', () => {
    it('should complete full ingest flow', async () => {
      const source: IngestSource = {
        type: 'article',
        id: 'art-1',
        text: 'First paragraph.\n\nSecond paragraph.',
        metadata: { title: 'Test' },
      };

      const result = await pipeline.ingest(source);

      expect(result.success).toBe(true);
      expect(result.chunksCreated).toBe(2);
      expect(result.embeddingsGenerated).toBe(2);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.sourceType).toBe('article');
      expect(result.sourceId).toBe('art-1');
    });

    it('should delete old chunks before re-ingesting', async () => {
      const source: IngestSource = {
        type: 'article',
        id: 'art-1',
        text: 'Content here.',
      };

      await pipeline.ingest(source);
      expect(ragDb.deleteChunksBySource).toHaveBeenCalledWith('article', 'art-1');
    });

    it('should handle empty text', async () => {
      const result = await pipeline.ingest({
        type: 'article',
        id: 'art-empty',
        text: '',
      });

      expect(result.success).toBe(true);
      expect(result.chunksCreated).toBe(0);
    });

    it('should skip embeddings when sqlite-vec unavailable', async () => {
      ragDb = createMockRagDb({ vecAvailable: false });
      pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

      const result = await pipeline.ingest({
        type: 'article',
        id: 'art-1',
        text: 'Some content here.',
      });

      expect(result.success).toBe(true);
      expect(result.chunksCreated).toBe(1);
      expect(result.embeddingsGenerated).toBe(0);
      expect(embeddingService.embedBatch).not.toHaveBeenCalled();
    });

    it('should handle embedding failure and mark chunks as failed', async () => {
      embeddingService = createMockEmbeddingService({ shouldFail: true });
      pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

      const result = await pipeline.ingest({
        type: 'article',
        id: 'art-fail',
        text: 'Some content.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Embedding API failed');
    });
  });

  describe('remove', () => {
    it('should call deleteChunksBySource', () => {
      pipeline.remove('article', 'art-1');
      expect(ragDb.deleteChunksBySource).toHaveBeenCalledWith('article', 'art-1');
    });
  });

  describe('processPendingChunks', () => {
    it('should process pending chunks', async () => {
      // Pre-create some chunks with pending status
      (ragDb.createChunks as ReturnType<typeof vi.fn>)([
        { sourceType: 'article' as const, sourceId: 'a1', chunkIndex: 0, content: 'pending chunk 1' },
        { sourceType: 'article' as const, sourceId: 'a1', chunkIndex: 1, content: 'pending chunk 2' },
      ]);

      const result = await pipeline.processPendingChunks();
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should return zeros when no pending chunks', async () => {
      // Override getPendingChunks to return empty
      (ragDb.getPendingChunks as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = await pipeline.processPendingChunks();
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return zeros when sqlite-vec unavailable', async () => {
      ragDb = createMockRagDb({ vecAvailable: false });
      pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

      const result = await pipeline.processPendingChunks();
      expect(result.processed).toBe(0);
    });

    it('should mark chunks as failed on embedding error', async () => {
      // Create pending chunks
      (ragDb.createChunks as ReturnType<typeof vi.fn>)([
        { sourceType: 'article' as const, sourceId: 'a1', chunkIndex: 0, content: 'will fail' },
      ]);

      embeddingService = createMockEmbeddingService({ shouldFail: true });
      pipeline = createIngestionPipeline({ ragDb, chunkingService, embeddingService });

      const result = await pipeline.processPendingChunks();
      expect(result.failed).toBe(1);
      expect(result.processed).toBe(0);
    });
  });

  describe('createIngestionPipeline factory', () => {
    it('should create pipeline instance', () => {
      const p = createIngestionPipeline({ ragDb, chunkingService, embeddingService });
      expect(p).toBeInstanceOf(IngestionPipeline);
    });
  });
});
