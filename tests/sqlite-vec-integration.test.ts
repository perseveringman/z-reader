import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

describe('sqlite-vec integration', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqliteVec.load(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('should load sqlite-vec extension and report version', () => {
    const result = sqlite.prepare('SELECT vec_version()').get() as Record<string, string>;
    expect(result).toBeDefined();
    const version = Object.values(result)[0];
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('should create vec0 virtual table', () => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE test_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[4]
      );
    `);

    const tables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='test_vec'"
    ).get() as { name: string } | undefined;
    expect(tables).toBeDefined();
    expect(tables!.name).toBe('test_vec');
  });

  it('should insert and query vectors with KNN', () => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE test_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[4]
      );
    `);

    // Insert vectors
    const insertStmt = sqlite.prepare(
      'INSERT INTO test_vec(id, embedding) VALUES (?, ?)'
    );

    const vec1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const vec2 = new Float32Array([0.0, 1.0, 0.0, 0.0]);
    const vec3 = new Float32Array([0.9, 0.1, 0.0, 0.0]);

    insertStmt.run('vec-1', vec1.buffer);
    insertStmt.run('vec-2', vec2.buffer);
    insertStmt.run('vec-3', vec3.buffer);

    // KNN query: find vectors closest to [1, 0, 0, 0]
    const queryVec = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const results = sqlite.prepare(`
      SELECT id, distance
      FROM test_vec
      WHERE embedding MATCH ?
      AND k = 3
    `).all(queryVec.buffer) as Array<{ id: string; distance: number }>;

    expect(results).toHaveLength(3);
    // Closest should be vec-1 (exact match, distance 0)
    expect(results[0].id).toBe('vec-1');
    expect(results[0].distance).toBeCloseTo(0, 5);
    // Second closest should be vec-3 (very similar)
    expect(results[1].id).toBe('vec-3');
    expect(results[1].distance).toBeLessThan(results[2].distance);
  });

  it('should support 2048-dimensional vectors (doubao-embedding-vision)', () => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE test_highd USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[2048]
      );
    `);

    // Create a 2048-dim vector
    const vec = new Float32Array(2048);
    vec[0] = 1.0;
    vec[1] = 0.5;

    sqlite.prepare(
      'INSERT INTO test_highd(id, embedding) VALUES (?, ?)'
    ).run('hd-1', vec.buffer);

    const queryVec = new Float32Array(2048);
    queryVec[0] = 1.0;
    queryVec[1] = 0.5;

    const results = sqlite.prepare(`
      SELECT id, distance
      FROM test_highd
      WHERE embedding MATCH ?
      AND k = 1
    `).all(queryVec.buffer) as Array<{ id: string; distance: number }>;

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('hd-1');
    expect(results[0].distance).toBeCloseTo(0, 5);
  });

  it('should handle batch inserts in a transaction', () => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE test_batch USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[4]
      );
    `);

    const insertStmt = sqlite.prepare(
      'INSERT INTO test_batch(id, embedding) VALUES (?, ?)'
    );

    const tx = sqlite.transaction((items: Array<{ id: string; vec: Float32Array }>) => {
      for (const item of items) {
        insertStmt.run(item.id, item.vec.buffer);
      }
    });

    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `batch-${i}`,
      vec: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
    }));

    tx(items);

    // Verify all were inserted
    const queryVec = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const results = sqlite.prepare(`
      SELECT id, distance
      FROM test_batch
      WHERE embedding MATCH ?
      AND k = 100
    `).all(queryVec.buffer) as Array<{ id: string; distance: number }>;

    expect(results).toHaveLength(100);
  });

  it('should gracefully handle extension load failure', () => {
    // Verify that without loading the extension, vec functions don't exist
    const plainDb = new Database(':memory:');
    expect(() => {
      plainDb.prepare('SELECT vec_version()').get();
    }).toThrow();
    plainDb.close();
  });
});
