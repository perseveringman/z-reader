import { describe, expect, it } from 'vitest';

import type { SqliteClientLike } from '../src/core-agent';
import { AgentRuntime, AdaptiveStrategyRouter, InMemoryTraceStore, NoopExecutor, NoopPlanner, SqliteTraceStore } from '../src/core-agent';

type TraceRow = {
  id: string;
  task_id: string;
  span: string;
  kind: string;
  latency_ms: number;
  token_in: number | null;
  token_out: number | null;
  cost_usd: number | null;
  payload_json: string;
  created_at: string;
};

class FakeTraceStatement {
  constructor(
    private readonly sql: string,
    private readonly rows: TraceRow[],
  ) {}

  run(params: Record<string, unknown> = {}): void {
    if (!this.sql.includes('INSERT INTO agent_traces')) {
      return;
    }

    this.rows.push({
      id: String(params.id),
      task_id: String(params.taskId),
      span: String(params.span),
      kind: String(params.kind),
      latency_ms: Number(params.latencyMs ?? 0),
      token_in: params.tokenIn === null ? null : Number(params.tokenIn),
      token_out: params.tokenOut === null ? null : Number(params.tokenOut),
      cost_usd: params.costUsd === null ? null : Number(params.costUsd),
      payload_json: String(params.payloadJson),
      created_at: String(params.createdAt),
    });
  }

  get(): Record<string, unknown> | undefined {
    return undefined;
  }

  all(params: Record<string, unknown> = {}): Array<Record<string, unknown>> {
    if (!this.sql.includes('FROM agent_traces')) {
      return [];
    }

    return this.rows
      .filter((row) => row.task_id === String(params.taskId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

class FakeTraceSqliteClient implements SqliteClientLike {
  private readonly rows: TraceRow[] = [];

  exec(sql: string): void {
    void sql;
  }

  prepare(sql: string): FakeTraceStatement {
    return new FakeTraceStatement(sql, this.rows);
  }
}

describe('core-agent trace store', () => {
  it('SqliteTraceStore 支持 append/query', async () => {
    const store = new SqliteTraceStore(new FakeTraceSqliteClient());

    await store.append({
      id: 't-1',
      taskId: 'task-1',
      span: 'planner.start',
      kind: 'planner',
      metric: { latencyMs: 10, tokenIn: 20, tokenOut: 30 },
      payload: { a: 1 },
      createdAt: '2026-02-12T13:40:00.000Z',
    });

    await store.append({
      id: 't-2',
      taskId: 'task-1',
      span: 'executor.done',
      kind: 'executor',
      metric: { latencyMs: 3 },
      payload: { b: 2 },
      createdAt: '2026-02-12T13:40:01.000Z',
    });

    const rows = await store.query({ taskId: 'task-1', limit: 10 });

    expect(rows).toHaveLength(2);
    expect(rows[0].span).toBe('executor.done');
  });

  it('AgentRuntime 可写入 trace（可选）', async () => {
    const traceStore = new InMemoryTraceStore();

    const runtime = new AgentRuntime(
      new AdaptiveStrategyRouter(),
      new NoopPlanner(),
      new NoopExecutor(),
      undefined,
      undefined,
      traceStore,
    );

    await runtime.run({
      id: 'task-trace-runtime',
      sessionId: 'session-trace-runtime',
      instruction: '输出 hello',
    });

    const rows = await traceStore.query({ taskId: 'task-trace-runtime', limit: 20 });
    const spans = rows.map((row) => row.span);

    expect(spans).toContain('runtime.queued');
    expect(spans).toContain('runtime.running');
    expect(spans).toContain('runtime.completed');
  });
});
