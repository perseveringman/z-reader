import { describe, expect, it } from 'vitest';

import type { SqliteClientLike } from '../src/core-agent';
import { SqliteMemoryStore } from '../src/core-agent';

type MemoryRow = {
  id: string;
  scope: 'session' | 'long_term';
  namespace: string;
  key: string;
  value_json: string;
  created_at: string;
  updated_at: string;
};

class FakeMemoryStatement {
  constructor(
    private readonly sql: string,
    private readonly rows: Map<string, MemoryRow>,
  ) {}

  run(params: Record<string, unknown> = {}): void {
    if (this.sql.includes('INSERT INTO agent_memories')) {
      const id = String(params.id);
      this.rows.set(id, {
        id,
        scope: String(params.scope) as MemoryRow['scope'],
        namespace: String(params.namespace),
        key: String(params.key),
        value_json: String(params.valueJson),
        created_at: String(params.createdAt),
        updated_at: String(params.updatedAt),
      });
      return;
    }

    if (this.sql.includes('UPDATE agent_memories')) {
      const row = this.rows.get(String(params.id));
      if (!row) {
        return;
      }

      row.value_json = String(params.valueJson);
      row.updated_at = String(params.updatedAt);
      return;
    }

    if (this.sql.includes('DELETE FROM agent_memories')) {
      for (const [id, row] of this.rows.entries()) {
        if (row.namespace === String(params.namespace) && row.key === String(params.key)) {
          this.rows.delete(id);
        }
      }
    }
  }

  get(params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
    if (!this.sql.includes('FROM agent_memories')) {
      return undefined;
    }

    for (const row of this.rows.values()) {
      if (
        row.scope === String(params.scope) &&
        row.namespace === String(params.namespace) &&
        row.key === String(params.key)
      ) {
        return row;
      }
    }

    return undefined;
  }

  all(params: Record<string, unknown> = {}): Array<Record<string, unknown>> {
    if (!this.sql.includes('FROM agent_memories')) {
      return [];
    }

    return Array.from(this.rows.values())
      .filter((row) => {
        const namespaceMatched = row.namespace === String(params.namespace);
        const scopeMatched = !params.scope || row.scope === String(params.scope);
        const keyMatched = !params.key || row.key === String(params.key);
        return namespaceMatched && scopeMatched && keyMatched;
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

class FakeMemorySqliteClient implements SqliteClientLike {
  private readonly rows = new Map<string, MemoryRow>();

  exec(sql: string): void {
    void sql;
  }

  prepare(sql: string): FakeMemoryStatement {
    return new FakeMemoryStatement(sql, this.rows);
  }
}

describe('core-agent sqlite memory store', () => {
  it('支持 upsert 与 query', async () => {
    const store = new SqliteMemoryStore(new FakeMemorySqliteClient());

    await store.upsert({
      id: 'm-1',
      scope: 'session',
      namespace: 'agent.default',
      key: 'k1',
      value: { value: 'v1' },
      createdAt: '2026-02-12T13:30:00.000Z',
      updatedAt: '2026-02-12T13:30:00.000Z',
    });

    await store.upsert({
      id: 'm-1',
      scope: 'session',
      namespace: 'agent.default',
      key: 'k1',
      value: { value: 'v2' },
      createdAt: '2026-02-12T13:30:00.000Z',
      updatedAt: '2026-02-12T13:31:00.000Z',
    });

    const rows = await store.query({
      scope: 'session',
      namespace: 'agent.default',
      key: 'k1',
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toEqual({ value: 'v2' });
  });

  it('支持 delete(namespace, key)', async () => {
    const store = new SqliteMemoryStore(new FakeMemorySqliteClient());

    await store.upsert({
      id: 'm-2',
      scope: 'long_term',
      namespace: 'agent.default',
      key: 'k2',
      value: { value: 'v2' },
      createdAt: '2026-02-12T13:30:00.000Z',
      updatedAt: '2026-02-12T13:30:00.000Z',
    });

    await store.delete('agent.default', 'k2');

    const rows = await store.query({
      namespace: 'agent.default',
      key: 'k2',
    });

    expect(rows).toHaveLength(0);
  });
});
