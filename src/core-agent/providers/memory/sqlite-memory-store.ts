import type { IMemoryStore, MemoryQuery, MemoryRecord } from '../../contracts';
import type { SqliteClientLike } from '../task';

interface SqliteStatement {
  run(params?: Record<string, unknown>): unknown;
  get(params?: Record<string, unknown>): Record<string, unknown> | undefined;
  all(params?: Record<string, unknown>): Array<Record<string, unknown>>;
}

interface SqliteMemoryRow {
  id: string;
  scope: 'session' | 'long_term';
  namespace: string;
  key: string;
  value_json: string;
  created_at: string;
  updated_at: string;
}

export class SqliteMemoryStore implements IMemoryStore {
  private readonly selectByIdStmt: SqliteStatement;
  private readonly insertStmt: SqliteStatement;
  private readonly updateStmt: SqliteStatement;
  private readonly queryStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;

  constructor(private readonly sqlite: SqliteClientLike) {
    this.initTables();

    this.selectByIdStmt = this.sqlite.prepare(`
      SELECT id, scope, namespace, key, value_json, created_at, updated_at
      FROM agent_memories
      WHERE id = @id
      LIMIT 1
    `);

    this.insertStmt = this.sqlite.prepare(`
      INSERT INTO agent_memories (
        id, scope, namespace, key, value_json, created_at, updated_at
      ) VALUES (
        @id, @scope, @namespace, @key, @valueJson, @createdAt, @updatedAt
      )
    `);

    this.updateStmt = this.sqlite.prepare(`
      UPDATE agent_memories
      SET
        scope = @scope,
        namespace = @namespace,
        key = @key,
        value_json = @valueJson,
        updated_at = @updatedAt
      WHERE id = @id
    `);

    this.queryStmt = this.sqlite.prepare(`
      SELECT id, scope, namespace, key, value_json, created_at, updated_at
      FROM agent_memories
      WHERE namespace = @namespace
        AND (@scope IS NULL OR scope = @scope)
        AND (@key IS NULL OR key = @key)
      ORDER BY updated_at DESC
      LIMIT @limit
    `);

    this.deleteStmt = this.sqlite.prepare(`
      DELETE FROM agent_memories
      WHERE namespace = @namespace AND key = @key
    `);
  }

  async upsert(record: MemoryRecord): Promise<void> {
    const existing = this.selectByIdStmt.get({ id: record.id }) as SqliteMemoryRow | undefined;

    if (!existing) {
      this.insertStmt.run({
        id: record.id,
        scope: record.scope,
        namespace: record.namespace,
        key: record.key,
        valueJson: JSON.stringify(record.value ?? {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
      return;
    }

    this.updateStmt.run({
      id: record.id,
      scope: record.scope,
      namespace: record.namespace,
      key: record.key,
      valueJson: JSON.stringify(record.value ?? {}),
      updatedAt: record.updatedAt,
    });
  }

  async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    const rows = this.queryStmt.all({
      namespace: query.namespace,
      scope: query.scope ?? null,
      key: query.key ?? null,
      limit: Math.max(1, query.limit ?? 100),
    }) as SqliteMemoryRow[];

    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      namespace: row.namespace,
      key: row.key,
      value: this.parseJson(row.value_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.deleteStmt.run({ namespace, key });
  }

  private parseJson(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }

    return {};
  }

  private initTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_memories_namespace ON agent_memories(namespace);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(scope);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_namespace_key ON agent_memories(namespace, key);
    `);
  }
}
