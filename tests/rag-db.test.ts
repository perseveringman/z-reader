import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { RAGDatabase } from '../src/ai/providers/rag-db';
import type { CreateChunkInput } from '../src/ai/providers/rag-db';

describe('RAGDatabase', () => {
  let sqlite: Database.Database;
  let ragDb: RAGDatabase;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqliteVec.load(sqlite);
    ragDb = new RAGDatabase(sqlite);
    ragDb.initTables();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('initialization', () => {
    it('should detect sqlite-vec availability', () => {
      expect(ragDb.isSqliteVecAvailable()).toBe(true);
    });

    it('should create chunks table', () => {
      const table = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'"
      ).get() as { name: string } | undefined;
      expect(table).toBeDefined();
      expect(table!.name).toBe('chunks');
    });

    it('should create vec_chunks virtual table', () => {
      const table = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
      ).get() as { name: string } | undefined;
      expect(table).toBeDefined();
    });

    it('should work without sqlite-vec (degraded mode)', () => {
      const plainSqlite = new Database(':memory:');
      const plainRagDb = new RAGDatabase(plainSqlite);
      expect(plainRagDb.isSqliteVecAvailable()).toBe(false);

      // initTables should not throw
      plainRagDb.initTables();

      // chunks table should still be created
      const table = plainSqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'"
      ).get() as { name: string } | undefined;
      expect(table).toBeDefined();

      // vec_chunks should NOT be created
      const vecTable = plainSqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
      ).get();
      expect(vecTable).toBeUndefined();

      plainSqlite.close();
    });
  });

  describe('createChunk', () => {
    it('should create a single chunk', () => {
      const chunk = ragDb.createChunk({
        sourceType: 'article',
        sourceId: 'art-1',
        chunkIndex: 0,
        content: 'Hello world',
        tokenCount: 3,
      });

      expect(chunk.id).toBeDefined();
      expect(chunk.source_type).toBe('article');
      expect(chunk.source_id).toBe('art-1');
      expect(chunk.chunk_index).toBe(0);
      expect(chunk.content).toBe('Hello world');
      expect(chunk.token_count).toBe(3);
      expect(chunk.embedding_status).toBe('pending');
    });

    it('should store metadata as JSON', () => {
      const chunk = ragDb.createChunk({
        sourceType: 'article',
        sourceId: 'art-1',
        chunkIndex: 0,
        content: 'test',
        metadata: { title: 'Test Article', position: 'start' },
      });

      expect(chunk.metadata_json).toBeDefined();
      const meta = JSON.parse(chunk.metadata_json!);
      expect(meta.title).toBe('Test Article');
    });
  });

  describe('createChunks (batch)', () => {
    it('should batch-create chunks in a transaction', () => {
      const inputs: CreateChunkInput[] = [
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 0, content: 'chunk 0', tokenCount: 2 },
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 1, content: 'chunk 1', tokenCount: 2 },
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 2, content: 'chunk 2', tokenCount: 2 },
      ];

      const chunks = ragDb.createChunks(inputs);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[2].chunk_index).toBe(2);

      // Verify in DB
      const dbChunks = ragDb.getChunksBySource('article', 'art-1');
      expect(dbChunks).toHaveLength(3);
    });

    it('should handle empty input', () => {
      const chunks = ragDb.createChunks([]);
      expect(chunks).toHaveLength(0);
    });
  });

  describe('getChunksBySource', () => {
    it('should return chunks ordered by chunk_index', () => {
      ragDb.createChunks([
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 2, content: 'c2' },
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 0, content: 'c0' },
        { sourceType: 'article', sourceId: 'art-1', chunkIndex: 1, content: 'c1' },
      ]);

      const chunks = ragDb.getChunksBySource('article', 'art-1');
      expect(chunks).toHaveLength(3);
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[1].chunk_index).toBe(1);
      expect(chunks[2].chunk_index).toBe(2);
    });

    it('should not return chunks from other sources', () => {
      ragDb.createChunk({ sourceType: 'article', sourceId: 'art-1', chunkIndex: 0, content: 'a' });
      ragDb.createChunk({ sourceType: 'article', sourceId: 'art-2', chunkIndex: 0, content: 'b' });

      const chunks = ragDb.getChunksBySource('article', 'art-1');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].source_id).toBe('art-1');
    });
  });

  describe('getPendingChunks', () => {
    it('should return chunks with pending status', () => {
      const chunk = ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'pending' });
      ragDb.createChunk({ sourceType: 'article', sourceId: 'a2', chunkIndex: 0, content: 'also pending' });

      // Mark one as done
      ragDb.updateChunkEmbeddingStatus(chunk.id, 'done', 'text-embedding-3-small');

      const pending = ragDb.getPendingChunks();
      expect(pending).toHaveLength(1);
      expect(pending[0].source_id).toBe('a2');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        ragDb.createChunk({ sourceType: 'article', sourceId: `a${i}`, chunkIndex: 0, content: `chunk ${i}` });
      }

      const pending = ragDb.getPendingChunks(3);
      expect(pending).toHaveLength(3);
    });
  });

  describe('updateChunkEmbeddingStatus', () => {
    it('should update status and model', () => {
      const chunk = ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'test' });
      ragDb.updateChunkEmbeddingStatus(chunk.id, 'done', 'text-embedding-3-small');

      const updated = ragDb.getChunk(chunk.id);
      expect(updated!.embedding_status).toBe('done');
      expect(updated!.embedding_model).toBe('text-embedding-3-small');
    });

    it('should update to failed status', () => {
      const chunk = ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'test' });
      ragDb.updateChunkEmbeddingStatus(chunk.id, 'failed');

      const updated = ragDb.getChunk(chunk.id);
      expect(updated!.embedding_status).toBe('failed');
      expect(updated!.embedding_model).toBeNull();
    });
  });

  describe('vector operations', () => {
    it('should insert and search vectors', () => {
      const chunk = ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'test vector' });

      const embedding = new Float32Array(2048);
      embedding[0] = 1.0;
      embedding[1] = 0.5;

      ragDb.insertEmbedding(chunk.id, embedding);

      const queryVec = new Float32Array(2048);
      queryVec[0] = 1.0;
      queryVec[1] = 0.5;

      const results = ragDb.searchVectors(queryVec, 5);
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe(chunk.id);
      expect(results[0].distance).toBeCloseTo(0, 4);
    });

    it('should batch-insert embeddings', () => {
      const chunks = ragDb.createChunks([
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'chunk 0' },
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 1, content: 'chunk 1' },
      ]);

      const items = chunks.map((chunk, i) => {
        const embedding = new Float32Array(2048);
        embedding[0] = i === 0 ? 1.0 : 0.0;
        embedding[1] = i === 0 ? 0.0 : 1.0;
        return { chunkId: chunk.id, embedding };
      });

      ragDb.insertEmbeddings(items);

      const queryVec = new Float32Array(2048);
      queryVec[0] = 1.0;

      const results = ragDb.searchVectors(queryVec, 2);
      expect(results).toHaveLength(2);
      // First result should be chunk 0 (closer to [1, 0, ...])
      expect(results[0].chunkId).toBe(chunks[0].id);
    });

    it('should return empty results for non-vec database', () => {
      const plainSqlite = new Database(':memory:');
      const plainRagDb = new RAGDatabase(plainSqlite);
      plainRagDb.initTables();

      const queryVec = new Float32Array(2048);
      const results = plainRagDb.searchVectors(queryVec, 5);
      expect(results).toHaveLength(0);

      plainSqlite.close();
    });

    it('should throw when inserting embedding without sqlite-vec', () => {
      const plainSqlite = new Database(':memory:');
      const plainRagDb = new RAGDatabase(plainSqlite);
      plainRagDb.initTables();

      const embedding = new Float32Array(2048);
      expect(() => plainRagDb.insertEmbedding('fake-id', embedding)).toThrow('sqlite-vec not available');

      plainSqlite.close();
    });
  });

  describe('deleteChunksBySource', () => {
    it('should delete chunks and their vectors', () => {
      const chunks = ragDb.createChunks([
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'chunk 0' },
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 1, content: 'chunk 1' },
      ]);

      // Insert vectors
      for (const chunk of chunks) {
        const embedding = new Float32Array(2048);
        ragDb.insertEmbedding(chunk.id, embedding);
      }

      // Delete
      ragDb.deleteChunksBySource('article', 'a1');

      expect(ragDb.getChunksBySource('article', 'a1')).toHaveLength(0);

      // Vector search should return nothing
      const queryVec = new Float32Array(2048);
      const results = ragDb.searchVectors(queryVec, 5);
      expect(results).toHaveLength(0);
    });

    it('should not delete chunks from other sources', () => {
      ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'keep' });
      ragDb.createChunk({ sourceType: 'article', sourceId: 'a2', chunkIndex: 0, content: 'delete' });

      ragDb.deleteChunksBySource('article', 'a2');

      expect(ragDb.getChunksBySource('article', 'a1')).toHaveLength(1);
      expect(ragDb.getChunksBySource('article', 'a2')).toHaveLength(0);
    });

    it('should handle deletion of non-existent source', () => {
      // Should not throw
      ragDb.deleteChunksBySource('article', 'nonexistent');
    });
  });

  describe('getSourceIndexStatus', () => {
    it('should return correct status counts', () => {
      ragDb.createChunks([
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'c0' },
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 1, content: 'c1' },
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 2, content: 'c2' },
      ]);

      const chunks = ragDb.getChunksBySource('article', 'a1');
      ragDb.updateChunkEmbeddingStatus(chunks[0].id, 'done', 'model');
      ragDb.updateChunkEmbeddingStatus(chunks[1].id, 'failed');

      const status = ragDb.getSourceIndexStatus('article', 'a1');
      expect(status.totalChunks).toBe(3);
      expect(status.doneChunks).toBe(1);
      expect(status.failedChunks).toBe(1);
      expect(status.pendingChunks).toBe(1);
    });

    it('should return zeros for non-existent source', () => {
      const status = ragDb.getSourceIndexStatus('article', 'nonexistent');
      expect(status.totalChunks).toBe(0);
      expect(status.pendingChunks).toBe(0);
    });
  });

  describe('getChunk / getChunks', () => {
    it('should get single chunk by ID', () => {
      const created = ragDb.createChunk({ sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'test' });
      const chunk = ragDb.getChunk(created.id);
      expect(chunk).toBeDefined();
      expect(chunk!.content).toBe('test');
    });

    it('should return null for non-existent chunk', () => {
      expect(ragDb.getChunk('nonexistent')).toBeNull();
    });

    it('should batch-get chunks by IDs', () => {
      const chunks = ragDb.createChunks([
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 0, content: 'c0' },
        { sourceType: 'article', sourceId: 'a1', chunkIndex: 1, content: 'c1' },
      ]);

      const fetched = ragDb.getChunks(chunks.map(c => c.id));
      expect(fetched).toHaveLength(2);
    });

    it('should return empty array for empty IDs', () => {
      expect(ragDb.getChunks([])).toHaveLength(0);
    });
  });
});
