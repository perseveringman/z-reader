import { describe, expect, it } from 'vitest';

import {
  AuditReplayService,
  InMemoryTraceStore,
  SqliteTaskStore,
  type SqliteClientLike,
} from '../src/core-agent';

type TaskRow = {
  id: string;
  session_id: string;
  status: string;
  strategy: string;
  risk_level: string;
  input_json: string;
  output_json: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  task_id: string;
  event_type: string;
  payload_json: string;
  occurred_at: string;
};

class FakeTaskStatement {
  constructor(
    private readonly sql: string,
    private readonly tasks: Map<string, TaskRow>,
    private readonly events: EventRow[],
  ) {}

  run(params: Record<string, unknown> = {}): void {
    if (this.sql.includes('INSERT INTO agent_tasks')) {
      this.tasks.set(String(params.id), {
        id: String(params.id),
        session_id: String(params.sessionId),
        status: String(params.status),
        strategy: String(params.strategy),
        risk_level: String(params.riskLevel),
        input_json: String(params.inputJson),
        output_json: params.outputJson === null ? null : String(params.outputJson),
        error_text: params.errorText === null ? null : String(params.errorText),
        created_at: String(params.createdAt),
        updated_at: String(params.updatedAt),
      });
      return;
    }

    if (this.sql.includes('UPDATE agent_tasks')) {
      const row = this.tasks.get(String(params.taskId));
      if (!row) {
        return;
      }

      row.status = String(params.status);
      row.strategy = String(params.strategy);
      row.risk_level = String(params.riskLevel);
      row.output_json = params.outputJson === null ? null : String(params.outputJson);
      row.error_text = params.errorText === null ? null : String(params.errorText);
      row.updated_at = String(params.updatedAt);
      return;
    }

    if (this.sql.includes('INSERT INTO agent_task_events')) {
      this.events.push({
        id: String(params.id),
        task_id: String(params.taskId),
        event_type: String(params.eventType),
        payload_json: String(params.payloadJson),
        occurred_at: String(params.occurredAt),
      });
    }
  }

  get(params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
    if (this.sql.includes('FROM agent_tasks')) {
      return this.tasks.get(String(params.taskId));
    }

    return undefined;
  }

  all(params: Record<string, unknown> = {}): Array<Record<string, unknown>> {
    if (this.sql.includes('FROM agent_task_events')) {
      return this.events.filter((item) => item.task_id === String(params.taskId));
    }

    return [];
  }
}

class FakeTaskSqliteClient implements SqliteClientLike {
  private readonly tasks = new Map<string, TaskRow>();
  private readonly events: EventRow[] = [];

  exec(sql: string): void {
    void sql;
  }

  prepare(sql: string): FakeTaskStatement {
    return new FakeTaskStatement(sql, this.tasks, this.events);
  }
}

describe('p3 audit replay service', () => {
  it('可聚合 task/events/traces', async () => {
    const taskStore = new SqliteTaskStore(new FakeTaskSqliteClient());
    const traceStore = new InMemoryTraceStore();
    const service = new AuditReplayService(taskStore, traceStore);

    await taskStore.createTask({
      id: 'task-p3-replay',
      sessionId: 'session-p3-replay',
      status: 'running',
      strategy: 'react',
      riskLevel: 'medium',
      inputJson: { instruction: 'test' },
      createdAt: '2026-02-12T14:10:00.000Z',
      updatedAt: '2026-02-12T14:10:00.000Z',
    });

    await taskStore.appendEvent({
      id: 'ev-1',
      taskId: 'task-p3-replay',
      eventType: 'TaskRunning',
      payloadJson: { a: 1 },
      occurredAt: '2026-02-12T14:10:01.000Z',
    });

    await traceStore.append({
      id: 'tr-1',
      taskId: 'task-p3-replay',
      span: 'runtime.running',
      kind: 'system',
      metric: { latencyMs: 10 },
      payload: { b: 2 },
      createdAt: '2026-02-12T14:10:01.000Z',
    });

    const replay = await service.getTaskReplay('task-p3-replay');

    expect(replay.task?.id).toBe('task-p3-replay');
    expect(replay.events).toHaveLength(1);
    expect(replay.traces).toHaveLength(1);
  });
});
