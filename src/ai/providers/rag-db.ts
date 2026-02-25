import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

/** 将 Float32Array 转换为 Node.js Buffer，确保 better-sqlite3 兼容 */
function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/** Chunk 来源类型 */
export type ChunkSourceType = 'article' | 'book' | 'highlight' | 'transcript';

/** Chunk 嵌入状态 */
export type ChunkEmbeddingStatus = 'pending' | 'done' | 'failed';

/** Chunk 行类型（匹配数据库列） */
export interface ChunkRow {
  id: string;
  source_type: ChunkSourceType;
  source_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  metadata_json: string | null;
  embedding_model: string | null;
  embedding_status: ChunkEmbeddingStatus;
  created_at: string;
  updated_at: string;
}

/** 创建 Chunk 的输入 */
export interface CreateChunkInput {
  sourceType: ChunkSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

/** 向量搜索结果 */
export interface VectorSearchResult {
  chunkId: string;
  distance: number;
}

/**
 * RAG 模块数据库操作层
 * 负责 chunks 和 vec_chunks 两张表的 CRUD
 */
export class RAGDatabase {
  private sqliteVecAvailable: boolean = false;
  private dimensions: number;

  constructor(private sqlite: Database.Database, dimensions: number = 2048) {
    this.dimensions = dimensions;
    this.checkSqliteVec();
  }

  /** 检查 sqlite-vec 是否可用 */
  private checkSqliteVec(): void {
    try {
      this.sqlite.prepare('SELECT vec_version()').get();
      this.sqliteVecAvailable = true;
    } catch {
      this.sqliteVecAvailable = false;
      console.warn('sqlite-vec not available, vector search disabled');
    }
  }

  /** 获取 sqlite-vec 可用状态 */
  isSqliteVecAvailable(): boolean {
    return this.sqliteVecAvailable;
  }

  /** 初始化 RAG 相关表 */
  initTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        metadata_json TEXT,
        embedding_model TEXT,
        embedding_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_source
        ON chunks(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_status
        ON chunks(embedding_status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_source_index
        ON chunks(source_type, source_id, chunk_index);
    `);

    // 仅在 sqlite-vec 可用时创建向量表
    if (this.sqliteVecAvailable) {
      // 检测现有表维度是否匹配，不匹配则清空重建
      this.migrateVecTableIfNeeded();

      this.sqlite.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
          chunk_id TEXT PRIMARY KEY,
          embedding FLOAT[${this.dimensions}] distance_metric=cosine
        );
      `);
    }
  }

  /**
   * 检测 vec_chunks 表维度或距离函数是否匹配，不匹配则 DROP 表并重置 embedding 状态
   */
  private migrateVecTableIfNeeded(): void {
    try {
      // 检查表是否存在
      const tableExists = this.sqlite.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vec_chunks'"
      ).get() as { sql: string } | undefined;
      if (!tableExists) return;

      let needsRebuild = false;

      // 检查距离函数：旧表可能没有 distance_metric=cosine
      if (!tableExists.sql.includes('distance_metric=cosine')) {
        console.warn('vec_chunks missing distance_metric=cosine, will rebuild');
        needsRebuild = true;
      }

      // 检查维度是否匹配
      if (!needsRebuild) {
        const testVector = new Float32Array(this.dimensions);
        try {
          this.sqlite.prepare(
            'INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)'
          ).run('__dim_check__', float32ToBuffer(testVector));
          this.sqlite.prepare("DELETE FROM vec_chunks WHERE chunk_id = '__dim_check__'").run();
        } catch {
          console.warn(`vec_chunks dimensions mismatch, will rebuild for ${this.dimensions} dimensions`);
          needsRebuild = true;
        }
      }

      if (needsRebuild) {
        this.sqlite.exec('DROP TABLE vec_chunks');
        // 重置所有 chunks 的 embedding_status 为 pending，向量需要重新插入
        this.sqlite.prepare(
          "UPDATE chunks SET embedding_status = 'pending' WHERE embedding_status = 'done'"
        ).run();
        // 清除旧的 feedRelevance 数据（基于旧距离度量计算，已无效）
        const cleared = this.sqlite.prepare(
          "UPDATE articles SET metadata = NULL WHERE source = 'feed' AND metadata LIKE '%feedRelevance%'"
        ).run();
        if (cleared.changes > 0) {
          console.log(`Cleared ${cleared.changes} stale feedRelevance entries due to vec_chunks rebuild`);
        }
      }
    } catch (err) {
      console.error('migrateVecTableIfNeeded error:', err);
    }
  }

  /** 创建单个 Chunk */
  createChunk(input: CreateChunkInput): ChunkRow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    this.sqlite.prepare(`
      INSERT INTO chunks (
        id, source_type, source_id, chunk_index, content,
        token_count, metadata_json, embedding_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      input.sourceType,
      input.sourceId,
      input.chunkIndex,
      input.content,
      input.tokenCount ?? null,
      metadataJson,
      now,
      now
    );

    return {
      id,
      source_type: input.sourceType,
      source_id: input.sourceId,
      chunk_index: input.chunkIndex,
      content: input.content,
      token_count: input.tokenCount ?? null,
      metadata_json: metadataJson,
      embedding_model: null,
      embedding_status: 'pending',
      created_at: now,
      updated_at: now,
    };
  }

  /** 批量创建 Chunks */
  createChunks(inputs: CreateChunkInput[]): ChunkRow[] {
    const results: ChunkRow[] = [];
    const insertStmt = this.sqlite.prepare(`
      INSERT INTO chunks (
        id, source_type, source_id, chunk_index, content,
        token_count, metadata_json, embedding_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    const tx = this.sqlite.transaction((items: CreateChunkInput[]) => {
      for (const input of items) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

        insertStmt.run(
          id,
          input.sourceType,
          input.sourceId,
          input.chunkIndex,
          input.content,
          input.tokenCount ?? null,
          metadataJson,
          now,
          now
        );

        results.push({
          id,
          source_type: input.sourceType,
          source_id: input.sourceId,
          chunk_index: input.chunkIndex,
          content: input.content,
          token_count: input.tokenCount ?? null,
          metadata_json: metadataJson,
          embedding_model: null,
          embedding_status: 'pending',
          created_at: now,
          updated_at: now,
        });
      }
    });

    tx(inputs);
    return results;
  }

  /** 获取指定来源的所有 Chunks */
  getChunksBySource(sourceType: ChunkSourceType, sourceId: string): ChunkRow[] {
    return this.sqlite.prepare(`
      SELECT * FROM chunks
      WHERE source_type = ? AND source_id = ?
      ORDER BY chunk_index ASC
    `).all(sourceType, sourceId) as ChunkRow[];
  }

  /** 获取待处理的 Chunks */
  getPendingChunks(limit: number = 100): ChunkRow[] {
    return this.sqlite.prepare(`
      SELECT * FROM chunks
      WHERE embedding_status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as ChunkRow[];
  }

  /** 更新 Chunk 的 Embedding 状态 */
  updateChunkEmbeddingStatus(
    chunkId: string,
    status: ChunkEmbeddingStatus,
    embeddingModel?: string
  ): void {
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      UPDATE chunks
      SET embedding_status = ?, embedding_model = ?, updated_at = ?
      WHERE id = ?
    `).run(status, embeddingModel ?? null, now, chunkId);
  }

  /** 插入向量 */
  insertEmbedding(chunkId: string, embedding: Float32Array): void {
    if (!this.sqliteVecAvailable) {
      throw new Error('sqlite-vec not available');
    }
    this.sqlite.prepare(`
      INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)
    `).run(chunkId, float32ToBuffer(embedding));
  }

  /** 批量插入向量 */
  insertEmbeddings(items: Array<{ chunkId: string; embedding: Float32Array }>): void {
    if (!this.sqliteVecAvailable) {
      throw new Error('sqlite-vec not available');
    }
    const insertStmt = this.sqlite.prepare(`
      INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)
    `);

    const tx = this.sqlite.transaction((rows: typeof items) => {
      for (const row of rows) {
        insertStmt.run(row.chunkId, float32ToBuffer(row.embedding));
      }
    });

    tx(items);
  }

  /** 向量 KNN 搜索 */
  searchVectors(queryEmbedding: Float32Array, topK: number = 10): VectorSearchResult[] {
    if (!this.sqliteVecAvailable) {
      return [];
    }
    return this.sqlite.prepare(`
      SELECT chunk_id AS chunkId, distance
      FROM vec_chunks
      WHERE embedding MATCH ?
      AND k = ?
    `).all(float32ToBuffer(queryEmbedding), topK) as VectorSearchResult[];
  }

  /** 获取 Chunk 详情 */
  getChunk(chunkId: string): ChunkRow | null {
    const row = this.sqlite.prepare(
      'SELECT * FROM chunks WHERE id = ?'
    ).get(chunkId) as ChunkRow | undefined;
    return row ?? null;
  }

  /** 批量获取 Chunk 详情 */
  getChunks(chunkIds: string[]): ChunkRow[] {
    if (chunkIds.length === 0) return [];
    const placeholders = chunkIds.map(() => '?').join(',');
    return this.sqlite.prepare(`
      SELECT * FROM chunks WHERE id IN (${placeholders})
    `).all(...chunkIds) as ChunkRow[];
  }

  /** 删除指定来源的所有 Chunks 和向量 */
  deleteChunksBySource(sourceType: ChunkSourceType, sourceId: string): void {
    // 先获取要删除的 chunk IDs
    const chunks = this.getChunksBySource(sourceType, sourceId);
    const chunkIds = chunks.map(c => c.id);

    if (chunkIds.length === 0) return;

    // 删除向量（如果可用）
    if (this.sqliteVecAvailable && chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => '?').join(',');
      this.sqlite.prepare(`
        DELETE FROM vec_chunks WHERE chunk_id IN (${placeholders})
      `).run(...chunkIds);
    }

    // 删除 chunks
    this.sqlite.prepare(`
      DELETE FROM chunks WHERE source_type = ? AND source_id = ?
    `).run(sourceType, sourceId);
  }

  /** 获取来源的索引状态 */
  getSourceIndexStatus(sourceType: ChunkSourceType, sourceId: string): {
    totalChunks: number;
    pendingChunks: number;
    doneChunks: number;
    failedChunks: number;
  } {
    const result = this.sqlite.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN embedding_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN embedding_status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN embedding_status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM chunks
      WHERE source_type = ? AND source_id = ?
    `).get(sourceType, sourceId) as {
      total: number;
      pending: number;
      done: number;
      failed: number;
    };

    return {
      totalChunks: result.total ?? 0,
      pendingChunks: result.pending ?? 0,
      doneChunks: result.done ?? 0,
      failedChunks: result.failed ?? 0,
    };
  }
}
