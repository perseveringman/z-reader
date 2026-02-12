import type { SqliteClientLike } from './sqlite-task-store';
import type { GraphExecutionSnapshot, GraphSnapshotStore } from '../../runtime';

interface SqliteStatement {
  run(params?: Record<string, unknown>): unknown;
  get(params?: Record<string, unknown>): Record<string, unknown> | undefined;
}

interface SqliteSnapshotRow {
  id: string;
  graph_id: string;
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

  constructor(private readonly sqlite: SqliteClientLike) {
    this.initTables();

    this.selectStmt = this.sqlite.prepare(`
      SELECT id, graph_id, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      FROM agent_graph_snapshots
      WHERE id = @id
      LIMIT 1
    `);

    this.insertStmt = this.sqlite.prepare(`
      INSERT INTO agent_graph_snapshots (
        id, graph_id, task_id, session_id, status, execution_order_json, nodes_json, created_at, updated_at
      ) VALUES (
        @id, @graphId, @taskId, @sessionId, @status, @executionOrderJson, @nodesJson, @createdAt, @updatedAt
      )
    `);

    this.updateStmt = this.sqlite.prepare(`
      UPDATE agent_graph_snapshots
      SET
        status = @status,
        execution_order_json = @executionOrderJson,
        nodes_json = @nodesJson,
        updated_at = @updatedAt
      WHERE id = @id
    `);
  }

  async save(snapshot: GraphExecutionSnapshot): Promise<void> {
    const exists = this.selectStmt.get({ id: snapshot.id }) as SqliteSnapshotRow | undefined;

    if (!exists) {
      this.insertStmt.run({
        id: snapshot.id,
        graphId: snapshot.graphId,
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

    return {
      id: row.id,
      graphId: row.graph_id,
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
  }
}
