import type { SqliteClientLike } from './sqlite-task-store';
import type {
  GraphExecutionSnapshot,
  GraphSnapshotCleanupPolicy,
  GraphSnapshotCleanupResult,
  GraphSnapshotStore,
} from '../../runtime';

interface SqliteStatement {
  run(params?: Record<string, unknown>): unknown;
  get(params?: Record<string, unknown>): Record<string, unknown> | undefined;
  all(params?: Record<string, unknown>): Array<Record<string, unknown>>;
}

interface SqliteSnapshotRow {
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
}

export class SqliteGraphSnapshotStore implements GraphSnapshotStore {
  private readonly selectStmt: SqliteStatement;
  private readonly insertStmt: SqliteStatement;
  private readonly updateStmt: SqliteStatement;
  private readonly listByTaskStmt: SqliteStatement;
  private readonly listAllStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;

  constructor(private readonly sqlite: SqliteClientLike) {
    this.initTables();

    this.selectStmt = this.sqlite.prepare(`
      SELECT id, graph_id, graph_signature, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      FROM agent_graph_snapshots
      WHERE id = @id
      LIMIT 1
    `);

    this.insertStmt = this.sqlite.prepare(`
      INSERT INTO agent_graph_snapshots (
        id, graph_id, graph_signature, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      ) VALUES (
        @id, @graphId, @graphSignature, @taskId, @sessionId, @status, @executionOrderJson, @nodesJson, @createdAt, @updatedAt
      )
    `);

    this.updateStmt = this.sqlite.prepare(`
      UPDATE agent_graph_snapshots
      SET
        graph_signature = @graphSignature,
        status = @status,
        execution_order_json = @executionOrderJson,
        nodes_json = @nodesJson,
        updated_at = @updatedAt
      WHERE id = @id
    `);

    this.listByTaskStmt = this.sqlite.prepare(`
      SELECT id, graph_id, graph_signature, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      FROM agent_graph_snapshots
      WHERE task_id = @taskId
      ORDER BY updated_at DESC
    `);

    this.listAllStmt = this.sqlite.prepare(`
      SELECT id, graph_id, graph_signature, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      FROM agent_graph_snapshots
      ORDER BY task_id ASC, updated_at DESC
    `);

    this.deleteStmt = this.sqlite.prepare(`
      DELETE FROM agent_graph_snapshots
      WHERE id = @id
    `);
  }

  async save(snapshot: GraphExecutionSnapshot): Promise<void> {
    const exists = this.selectStmt.get({ id: snapshot.id }) as SqliteSnapshotRow | undefined;

    if (!exists) {
      this.insertStmt.run({
        id: snapshot.id,
        graphId: snapshot.graphId,
        graphSignature: snapshot.graphSignature ?? null,
        taskId: snapshot.taskId,
        sessionId: snapshot.sessionId,
        status: snapshot.status,
        executionOrderJson: JSON.stringify(snapshot.executionOrder),
        nodesJson: JSON.stringify(snapshot.nodes),
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      });
      return;
    }

    this.updateStmt.run({
      id: snapshot.id,
      graphSignature: snapshot.graphSignature ?? null,
      status: snapshot.status,
      executionOrderJson: JSON.stringify(snapshot.executionOrder),
      nodesJson: JSON.stringify(snapshot.nodes),
      updatedAt: snapshot.updatedAt,
    });
  }

  async get(id: string): Promise<GraphExecutionSnapshot | null> {
    const row = this.selectStmt.get({ id }) as SqliteSnapshotRow | undefined;
    if (!row) {
      return null;
    }

    return this.mapRow(row);
  }

  async listByTask(taskId: string): Promise<GraphExecutionSnapshot[]> {
    const rows = this.listByTaskStmt.all({ taskId }) as SqliteSnapshotRow[];
    return rows.map((row) => this.mapRow(row));
  }

  async cleanup(policy: GraphSnapshotCleanupPolicy): Promise<GraphSnapshotCleanupResult> {
    const rows = this.listAllStmt.all() as SqliteSnapshotRow[];
    const staleBeforeEpoch = this.toEpoch(policy.staleBefore);
    const deletable = new Set<string>();

    if (staleBeforeEpoch !== undefined) {
      for (const row of rows) {
        const updatedAtEpoch = this.toEpoch(row.updated_at);
        if (updatedAtEpoch !== undefined && updatedAtEpoch < staleBeforeEpoch) {
          deletable.add(row.id);
        }
      }
    }

    if (policy.maxSnapshotsPerTask !== undefined && policy.maxSnapshotsPerTask >= 0) {
      const seenByTask = new Map<string, number>();

      for (const row of rows) {
        if (deletable.has(row.id)) {
          continue;
        }

        const seen = seenByTask.get(row.task_id) ?? 0;
        if (seen >= policy.maxSnapshotsPerTask) {
          deletable.add(row.id);
          continue;
        }

        seenByTask.set(row.task_id, seen + 1);
      }
    }

    for (const id of deletable) {
      this.deleteStmt.run({ id });
    }

    return {
      deletedCount: deletable.size,
      deletedIds: Array.from(deletable),
    };
  }

  private mapRow(row: SqliteSnapshotRow): GraphExecutionSnapshot {
    return {
      id: row.id,
      graphId: row.graph_id,
      graphSignature: row.graph_signature ?? undefined,
      taskId: row.task_id,
      sessionId: row.session_id,
      status: row.status,
      executionOrder: this.parseArray(row.execution_order_json),
      nodes: this.parseNodes(row.nodes_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string');
      }
    } catch {
      return [];
    }

    return [];
  }

  private parseNodes(value: string): GraphExecutionSnapshot['nodes'] {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({ ...(item as Record<string, unknown>) })) as GraphExecutionSnapshot['nodes'];
      }
    } catch {
      return [];
    }

    return [];
  }

  private initTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_graph_snapshots (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        graph_signature TEXT,
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        execution_order_json TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_graph_snapshots_task_id ON agent_graph_snapshots(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_graph_snapshots_graph_id ON agent_graph_snapshots(graph_id);
    `);

    try {
      this.sqlite.exec('ALTER TABLE agent_graph_snapshots ADD COLUMN graph_signature TEXT');
    } catch {
      // Column already exists
    }
  }

  private toEpoch(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const epoch = Date.parse(value);
    return Number.isNaN(epoch) ? undefined : epoch;
  }
}
