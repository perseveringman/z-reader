import { describe, expect, it } from 'vitest';

import type { SqliteClientLike } from '../src/core-agent';
import { SqliteGraphSnapshotStore } from '../src/core-agent';

type SnapshotRow = {
  id: string;
  graph_id: string;
  task_id: string;
  session_id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  execution_order_json: string;
  nodes_json: string;
  created_at: string;
  updated_at: string;
};

class FakeSnapshotStatement {
  constructor(
    private readonly sql: string,
    private readonly rows: Map<string, SnapshotRow>,
  ) {}

  run(params: Record<string, unknown> = {}): void {
    if (this.sql.includes('INSERT INTO agent_graph_snapshots')) {
      const id = String(params.id);
      this.rows.set(id, {
        id,
        graph_id: String(params.graphId),
        task_id: String(params.taskId),
        session_id: String(params.sessionId),
        status: String(params.status) as SnapshotRow['status'],
        execution_order_json: String(params.executionOrderJson),
        nodes_json: String(params.nodesJson),
        created_at: String(params.createdAt),
        updated_at: String(params.updatedAt),
      });
      return;
    }

    if (this.sql.includes('UPDATE agent_graph_snapshots')) {
      const row = this.rows.get(String(params.id));
      if (!row) {
        return;
      }

      row.status = String(params.status) as SnapshotRow['status'];
      row.execution_order_json = String(params.executionOrderJson);
      row.nodes_json = String(params.nodesJson);
      row.updated_at = String(params.updatedAt);
    }
  }

  get(params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
    if (!this.sql.includes('FROM agent_graph_snapshots')) {
      return undefined;
    }

    return this.rows.get(String(params.id));
  }

  all(): Array<Record<string, unknown>> {
    return [];
  }
}

class FakeSnapshotSqliteClient implements SqliteClientLike {
  private readonly rows = new Map<string, SnapshotRow>();

  exec(sql: string): void {
    void sql;
  }

  prepare(sql: string): FakeSnapshotStatement {
    return new FakeSnapshotStatement(sql, this.rows);
  }
}

describe('p6 sqlite graph snapshot store', () => {
  it('支持 save/get 与覆盖更新', async () => {
    const store = new SqliteGraphSnapshotStore(new FakeSnapshotSqliteClient());

    await store.save({
      id: 'snap-1',
      graphId: 'graph-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      status: 'running',
      executionOrder: ['n1'],
      nodes: [{ nodeId: 'n1', status: 'succeeded' }],
      createdAt: '2026-02-12T16:00:00.000Z',
      updatedAt: '2026-02-12T16:00:00.000Z',
    });

    await store.save({
      id: 'snap-1',
      graphId: 'graph-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      status: 'succeeded',
      executionOrder: ['n1', 'n2'],
      nodes: [
        { nodeId: 'n1', status: 'succeeded' },
        { nodeId: 'n2', status: 'succeeded' },
      ],
      createdAt: '2026-02-12T16:00:00.000Z',
      updatedAt: '2026-02-12T16:00:01.000Z',
    });

    const snapshot = await store.get('snap-1');

    expect(snapshot?.status).toBe('succeeded');
    expect(snapshot?.executionOrder).toEqual(['n1', 'n2']);
    expect(snapshot?.nodes).toHaveLength(2);
  });
});
