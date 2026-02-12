import { describe, expect, it } from 'vitest';

import type { SqliteClientLike } from '../src/core-agent';
import { SqliteGraphSnapshotStore } from '../src/core-agent';

type SnapshotRow = {
  id: string;
  graph_id: string;
  graph_signature: string | null;
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
        graph_signature: params.graphSignature == null ? null : String(params.graphSignature),
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
      row.graph_signature = params.graphSignature == null ? null : String(params.graphSignature);
      return;
    }

    if (this.sql.includes('DELETE FROM agent_graph_snapshots')) {
      this.rows.delete(String(params.id));
    }
  }

  get(params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
    if (!this.sql.includes('FROM agent_graph_snapshots')) {
      return undefined;
    }

    if (this.sql.includes('WHERE id = @id')) {
      return this.rows.get(String(params.id));
    }

    return undefined;
  }

  all(params: Record<string, unknown> = {}): Array<Record<string, unknown>> {
    if (!this.sql.includes('FROM agent_graph_snapshots')) {
      return [];
    }

    if (this.sql.includes('WHERE task_id = @taskId')) {
      const taskId = String(params.taskId);
      return Array.from(this.rows.values())
        .filter((row) => row.task_id === taskId)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    }

    return Array.from(this.rows.values()).sort((left, right) => {
      const taskCompared = left.task_id.localeCompare(right.task_id);
      if (taskCompared !== 0) {
        return taskCompared;
      }

      return right.updated_at.localeCompare(left.updated_at);
    });
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
      graphSignature: 'sig-1',
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
      graphSignature: 'sig-1',
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
    expect(snapshot?.graphSignature).toBe('sig-1');
    expect(snapshot?.executionOrder).toEqual(['n1', 'n2']);
    expect(snapshot?.nodes).toHaveLength(2);
  });

  it('支持按 task 列表与清理策略', async () => {
    const store = new SqliteGraphSnapshotStore(new FakeSnapshotSqliteClient());

    await store.save({
      id: 'snap-1',
      graphId: 'graph-1',
      graphSignature: 'sig-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      status: 'running',
      executionOrder: ['n1'],
      nodes: [{ nodeId: 'n1', status: 'running' }],
      createdAt: '2026-02-12T10:00:00.000Z',
      updatedAt: '2026-02-12T10:00:00.000Z',
    });

    await store.save({
      id: 'snap-2',
      graphId: 'graph-1',
      graphSignature: 'sig-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      status: 'succeeded',
      executionOrder: ['n1', 'n2'],
      nodes: [
        { nodeId: 'n1', status: 'succeeded' },
        { nodeId: 'n2', status: 'succeeded' },
      ],
      createdAt: '2026-02-12T10:00:00.000Z',
      updatedAt: '2026-02-12T10:01:00.000Z',
    });

    await store.save({
      id: 'snap-3',
      graphId: 'graph-2',
      graphSignature: 'sig-2',
      taskId: 'task-2',
      sessionId: 'session-2',
      status: 'failed',
      executionOrder: ['m1'],
      nodes: [{ nodeId: 'm1', status: 'failed' }],
      createdAt: '2026-02-12T09:00:00.000Z',
      updatedAt: '2026-02-12T09:00:00.000Z',
    });

    const task1Rows = await store.listByTask('task-1');
    expect(task1Rows.map((item) => item.id)).toEqual(['snap-2', 'snap-1']);

    const cleanupResult = await store.cleanup({
      maxSnapshotsPerTask: 1,
      staleBefore: '2026-02-12T09:30:00.000Z',
    });

    expect(cleanupResult.deletedCount).toBe(2);
    expect(cleanupResult.deletedIds.sort()).toEqual(['snap-1', 'snap-3']);

    const existsSnap1 = await store.get('snap-1');
    const existsSnap2 = await store.get('snap-2');
    const existsSnap3 = await store.get('snap-3');

    expect(existsSnap1).toBeNull();
    expect(existsSnap2?.id).toBe('snap-2');
    expect(existsSnap3).toBeNull();
  });
});
