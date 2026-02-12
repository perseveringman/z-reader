import type { ITraceStore, TraceQuery, TraceRecord } from '../../contracts';
import type { SqliteClientLike } from '../task';

interface SqliteStatement {
  run(params?: Record<string, unknown>): unknown;
  all(params?: Record<string, unknown>): Array<Record<string, unknown>>;
}

interface SqliteTraceRow {
  id: string;
  task_id: string;
  span: string;
  kind: 'planner' | 'executor' | 'tool' | 'policy' | 'llm' | 'system';
  latency_ms: number;
  token_in: number | null;
  token_out: number | null;
  cost_usd: number | null;
  payload_json: string;
  created_at: string;
}

export class SqliteTraceStore implements ITraceStore {
  private readonly insertStmt: SqliteStatement;
  private readonly queryStmt: SqliteStatement;

  constructor(private readonly sqlite: SqliteClientLike) {
    this.initTables();

    this.insertStmt = this.sqlite.prepare(`
      INSERT INTO agent_traces (
        id, task_id, span, kind, latency_ms, token_in, token_out, cost_usd, payload_json, created_at
      ) VALUES (
        @id, @taskId, @span, @kind, @latencyMs, @tokenIn, @tokenOut, @costUsd, @payloadJson, @createdAt
      )
    `);

    this.queryStmt = this.sqlite.prepare(`
      SELECT id, task_id, span, kind, latency_ms, token_in, token_out, cost_usd, payload_json, created_at
      FROM agent_traces
      WHERE task_id = @taskId
      ORDER BY created_at DESC
      LIMIT @limit
    `);
  }

  async append(record: TraceRecord): Promise<void> {
    this.insertStmt.run({
      id: record.id,
      taskId: record.taskId,
      span: record.span,
      kind: record.kind,
      latencyMs: record.metric.latencyMs,
      tokenIn: record.metric.tokenIn ?? null,
      tokenOut: record.metric.tokenOut ?? null,
      costUsd: record.metric.costUsd ?? null,
      payloadJson: JSON.stringify(record.payload ?? {}),
      createdAt: record.createdAt,
    });
  }

  async query(query: TraceQuery): Promise<TraceRecord[]> {
    const rows = this.queryStmt.all({
      taskId: query.taskId,
      limit: Math.max(1, query.limit ?? 100),
    }) as SqliteTraceRow[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      span: row.span,
      kind: row.kind,
      metric: {
        latencyMs: row.latency_ms,
        tokenIn: row.token_in ?? undefined,
        tokenOut: row.token_out ?? undefined,
        costUsd: row.cost_usd ?? undefined,
      },
      payload: this.parseJson(row.payload_json),
      createdAt: row.created_at,
    }));
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
      CREATE TABLE IF NOT EXISTS agent_traces (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        span TEXT NOT NULL,
        kind TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        token_in INTEGER,
        token_out INTEGER,
        cost_usd REAL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_traces_task_id ON agent_traces(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_traces_created_at ON agent_traces(created_at);
    `);
  }
}
