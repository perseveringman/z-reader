import { describe, expect, it } from 'vitest';

import {
  InMemoryGraphSnapshotStore,
  TaskGraphScheduler,
  type AgentTaskGraph,
  type GraphNodeExecutionContext,
  type GraphNodeExecutor,
} from '../src/core-agent';

class StaticExecutor implements GraphNodeExecutor {
  constructor(private readonly handler: (context: GraphNodeExecutionContext) => Promise<{ success: boolean; output?: Record<string, unknown>; error?: string; errorCode?: string }>) {}

  async execute(context: GraphNodeExecutionContext) {
    return this.handler(context);
  }
}

describe('p7 task graph governance', () => {
  it('resume 时检测到图结构漂移应阻止恢复', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();

    const originalGraph: AgentTaskGraph = {
      id: 'graph-p7-structure',
      nodes: [
        { id: 'n1', agent: 'first' },
        { id: 'n2', agent: 'second', dependsOn: ['n1'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'first' || agent === 'second') {
        return new StaticExecutor(async () => ({ success: true, output: { ok: true } }));
      }

      return undefined;
    });

    await scheduler.run(
      originalGraph,
      {
        taskId: 'task-p7-structure',
        sessionId: 'session-p7-structure',
      },
      {
        snapshotStore,
        snapshotId: 'snapshot-p7-structure',
      },
    );

    const snapshot = await snapshotStore.get('snapshot-p7-structure');
    if (!snapshot) {
      throw new Error('snapshot should exist');
    }

    const changedGraph: AgentTaskGraph = {
      id: 'graph-p7-structure',
      nodes: [
        { id: 'n1', agent: 'first' },
        { id: 'n2', agent: 'second' },
      ],
    };

    await expect(
      scheduler.resume(
        changedGraph,
        {
          taskId: 'task-p7-structure',
          sessionId: 'session-p7-structure',
        },
        snapshot,
      ),
    ).rejects.toThrow('Snapshot graph structure mismatch');
  });

  it('按失败模板命中不可重试错误时应立即停止重试', async () => {
    let attempts = 0;

    const graph: AgentTaskGraph = {
      id: 'graph-p7-non-retryable',
      nodes: [{ id: 'n1', agent: 'validator', retry: { maxAttempts: 3 } }],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent !== 'validator') {
        return undefined;
      }

      return new StaticExecutor(async () => {
        attempts += 1;
        return {
          success: false,
          error: 'validation failed',
          errorCode: 'VALIDATION_ERROR',
        };
      });
    });

    const result = await scheduler.run(
      graph,
      {
        taskId: 'task-p7-non-retryable',
        sessionId: 'session-p7-non-retryable',
      },
      {
        failurePolicy: {
          defaultRetryable: true,
          rules: [
            {
              errorCodes: ['VALIDATION_ERROR'],
              retryable: false,
            },
          ],
        },
      },
    );

    expect(result.status).toBe('failed');
    expect(attempts).toBe(1);
    expect(result.nodes[0].attempts).toBe(1);
    expect(result.nodes[0].failureClass).toBe('non_retryable');
  });

  it('按失败模板命中可重试错误时应继续退避重试', async () => {
    let attempts = 0;
    const waits: number[] = [];

    const graph: AgentTaskGraph = {
      id: 'graph-p7-retryable',
      nodes: [{ id: 'n1', agent: 'network', retry: { maxAttempts: 3 } }],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent !== 'network') {
        return undefined;
      }

      return new StaticExecutor(async () => {
        attempts += 1;

        if (attempts < 3) {
          return {
            success: false,
            error: 'temporary network unavailable',
            errorCode: 'NETWORK_TEMP',
          };
        }

        return {
          success: true,
          output: { done: true },
        };
      });
    });

    const result = await scheduler.run(
      graph,
      {
        taskId: 'task-p7-retryable',
        sessionId: 'session-p7-retryable',
      },
      {
        defaultRetry: {
          maxAttempts: 1,
          backoff: {
            baseDelayMs: 5,
            factor: 2,
            jitterMs: 0,
          },
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        failurePolicy: {
          defaultRetryable: false,
          rules: [
            {
              errorCodes: ['NETWORK_TEMP'],
              retryable: true,
            },
          ],
        },
      },
    );

    expect(result.status).toBe('succeeded');
    expect(attempts).toBe(3);
    expect(waits).toEqual([5, 10]);
  });

  it('快照存储支持按策略清理与按任务列出', async () => {
    const store = new InMemoryGraphSnapshotStore();

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

    const task1Before = await store.listByTask('task-1');
    expect(task1Before.map((item) => item.id)).toEqual(['snap-2', 'snap-1']);

    const cleanupResult = await store.cleanup({
      maxSnapshotsPerTask: 1,
      staleBefore: '2026-02-12T09:30:00.000Z',
    });

    expect(cleanupResult.deletedCount).toBe(2);
    expect(cleanupResult.deletedIds.sort()).toEqual(['snap-1', 'snap-3']);

    const task1After = await store.listByTask('task-1');
    expect(task1After.map((item) => item.id)).toEqual(['snap-2']);
  });
});
