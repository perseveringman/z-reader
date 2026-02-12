import { describe, expect, it } from 'vitest';

import type { SqliteClientLike } from '../src/core-agent';
import { AgentRuntime, AdaptiveStrategyRouter, NoopExecutor, NoopPlanner, SqliteTaskStore } from '../src/core-agent';

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

class FakeSqliteStatement {
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
      return this.events
        .filter((item) => item.task_id === String(params.taskId))
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    }

    return [];
  }
}

class FakeSqliteClient implements SqliteClientLike {
  private readonly tasks = new Map<string, TaskRow>();
  private readonly events: EventRow[] = [];

  exec(sql: string): void {
    void sql;
  }

  prepare(sql: string): FakeSqliteStatement {
    return new FakeSqliteStatement(sql, this.tasks, this.events);
  }
}

describe('core-agent sqlite task store', () => {
  it('可持久化任务与事件', async () => {
    const sqlite = new FakeSqliteClient();
    const taskStore = new SqliteTaskStore(sqlite);

    await taskStore.createTask({
      id: 'task-db-1',
      sessionId: 'session-db-1',
      status: 'queued',
      strategy: 'adaptive',
      riskLevel: 'low',
      inputJson: { instruction: 'demo' },
      createdAt: '2026-02-12T13:06:00.000Z',
      updatedAt: '2026-02-12T13:06:00.000Z',
    });

    await taskStore.appendEvent({
      id: 'event-1',
      taskId: 'task-db-1',
      eventType: 'TaskQueued',
      payloadJson: { a: 1 },
      occurredAt: '2026-02-12T13:06:01.000Z',
    });

    const task = await taskStore.getTask('task-db-1');
    const events = await taskStore.listEvents('task-db-1');

    expect(task?.id).toBe('task-db-1');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('TaskQueued');
  });

  it('AgentRuntime 执行后会落任务事件', async () => {
    const sqlite = new FakeSqliteClient();
    const taskStore = new SqliteTaskStore(sqlite);

    const runtime = new AgentRuntime(
      new AdaptiveStrategyRouter(),
      new NoopPlanner(),
      new NoopExecutor(),
      undefined,
      taskStore,
    );

    const result = await runtime.run({
      id: 'task-db-runtime',
      sessionId: 'session-db-runtime',
      instruction: '输出 hello',
    });

    const task = await taskStore.getTask('task-db-runtime');
    const events = await taskStore.listEvents('task-db-runtime');

    expect(result.status).toBe('succeeded');
    expect(task?.status).toBe('succeeded');
    expect(events.map((item) => item.eventType)).toEqual(['TaskQueued', 'TaskRunning', 'TaskSucceeded']);
  });
});
