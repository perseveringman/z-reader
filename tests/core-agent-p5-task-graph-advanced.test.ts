import { describe, expect, it } from 'vitest';

import {
  InMemoryGraphSnapshotStore,
  TaskGraphScheduler,
  type AgentTaskGraph,
  type GraphNodeExecutionContext,
  type GraphNodeExecutor,
} from '../src/core-agent';

class DelayedExecutor implements GraphNodeExecutor {
  constructor(
    private readonly delayMs: number,
    private readonly output: Record<string, unknown>,
  ) {}

  async execute(context: GraphNodeExecutionContext) {
    void context;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    return {
      success: true,
      output: this.output,
    };
  }
}

describe('p5 task graph advanced scheduling', () => {
  it('同层无依赖节点支持并行执行', async () => {
    const graph: AgentTaskGraph = {
      id: 'graph-p5-parallel',
      nodes: [
        { id: 'n1', agent: 'a' },
        { id: 'n2', agent: 'b' },
        { id: 'n3', agent: 'c', dependsOn: ['n1', 'n2'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'a') return new DelayedExecutor(80, { ok: 'a' });
      if (agent === 'b') return new DelayedExecutor(80, { ok: 'b' });
      if (agent === 'c') return new DelayedExecutor(10, { ok: 'c' });
      return undefined;
    });

    const startedAt = Date.now();
    const result = await scheduler.run(
      graph,
      {
        taskId: 'task-p5-parallel',
        sessionId: 'session-p5-parallel',
      },
      {
        maxParallel: 2,
      },
    );
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).toBe('succeeded');
    expect(result.executionOrder[2]).toBe('n3');
    expect(elapsedMs).toBeLessThan(150);
  });

  it('失败节点支持重试backoff与补偿', async () => {
    const attempts = new Map<string, number>();
    const waits: number[] = [];
    let compensationCalled = 0;

    const graph: AgentTaskGraph = {
      id: 'graph-p5-retry',
      nodes: [
        {
          id: 'n1',
          agent: 'flaky',
          retry: { maxAttempts: 3 },
        },
        {
          id: 'n2',
          agent: 'always-fail',
          retry: { maxAttempts: 2 },
          compensationAgent: 'compensator',
        },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'flaky') {
        return {
          execute: async () => {
            const current = (attempts.get('flaky') ?? 0) + 1;
            attempts.set('flaky', current);

            if (current < 3) {
              return { success: false, error: 'retry me' };
            }

            return { success: true, output: { attempts: current } };
          },
        };
      }

      if (agent === 'always-fail') {
        return {
          execute: async () => {
            const current = (attempts.get('always-fail') ?? 0) + 1;
            attempts.set('always-fail', current);
            return { success: false, error: 'failed forever' };
          },
        };
      }

      if (agent === 'compensator') {
        return {
          execute: async () => {
            compensationCalled += 1;
            return { success: true, output: { compensated: true } };
          },
        };
      }

      return undefined;
    });

    const result = await scheduler.run(
      graph,
      {
        taskId: 'task-p5-retry',
        sessionId: 'session-p5-retry',
      },
      {
        maxParallel: 2,
        defaultRetry: {
          maxAttempts: 1,
          backoff: {
            baseDelayMs: 10,
            factor: 2,
            jitterMs: 0,
          },
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );

    expect(result.status).toBe('failed');
    expect(attempts.get('flaky')).toBe(3);
    expect(attempts.get('always-fail')).toBe(2);
    expect(compensationCalled).toBe(1);
    expect(waits.sort((left, right) => left - right)).toEqual([10, 10, 20]);

    const n1 = result.nodes.find((node) => node.nodeId === 'n1');
    const n2 = result.nodes.find((node) => node.nodeId === 'n2');

    expect(n1?.status).toBe('succeeded');
    expect(n1?.attempts).toBe(3);

    expect(n2?.status).toBe('failed');
    expect(n2?.attempts).toBe(2);
    expect(n2?.compensation?.status).toBe('succeeded');
  });

  it('支持超时与取消控制', async () => {
    const graph: AgentTaskGraph = {
      id: 'graph-p5-timeout-cancel',
      nodes: [{ id: 'n1', agent: 'slow' }],
    };

    const slowScheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'slow') {
        return new DelayedExecutor(120, { ok: true });
      }

      return undefined;
    });

    const timeoutResult = await slowScheduler.run(
      graph,
      {
        taskId: 'task-p5-timeout',
        sessionId: 'session-p5-timeout',
      },
      {
        timeoutMs: 50,
      },
    );

    expect(timeoutResult.status).toBe('canceled');

    const canceledScheduler = new TaskGraphScheduler(() => new DelayedExecutor(1, { ok: true }));
    const canceledResult = await canceledScheduler.run(
      graph,
      {
        taskId: 'task-p5-cancel',
        sessionId: 'session-p5-cancel',
      },
      {
        shouldCancel: () => true,
      },
    );

    expect(canceledResult.status).toBe('canceled');
    expect(canceledResult.nodes[0].status).toBe('skipped');
  });

  it('支持快照持久化与恢复执行', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    let shouldStop = false;

    const graph: AgentTaskGraph = {
      id: 'graph-p5-resume',
      nodes: [
        { id: 'n1', agent: 'first' },
        { id: 'n2', agent: 'second', dependsOn: ['n1'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'first') {
        return {
          execute: async () => {
            shouldStop = true;
            return { success: true, output: { ok: 1 } };
          },
        };
      }

      if (agent === 'second') {
        return {
          execute: async () => ({ success: true, output: { ok: 2 } }),
        };
      }

      return undefined;
    });

    const canceled = await scheduler.run(
      graph,
      {
        taskId: 'task-p5-resume',
        sessionId: 'session-p5-resume',
      },
      {
        maxParallel: 1,
        shouldCancel: () => shouldStop,
        snapshotStore,
        snapshotId: 'snapshot-p5-resume',
      },
    );

    expect(canceled.status).toBe('canceled');

    const snapshot = await snapshotStore.get('snapshot-p5-resume');
    expect(snapshot?.status).toBe('canceled');

    shouldStop = false;

    if (!snapshot) {
      throw new Error('snapshot should exist');
    }

    const resumed = await scheduler.resume(
      graph,
      {
        taskId: 'task-p5-resume',
        sessionId: 'session-p5-resume',
      },
      snapshot,
      {
        maxParallel: 1,
        snapshotStore,
        snapshotId: 'snapshot-p5-resume',
      },
    );

    expect(resumed.status).toBe('succeeded');
    expect(resumed.executionOrder).toEqual(['n1', 'n2']);
  });
});
