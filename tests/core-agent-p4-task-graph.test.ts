import { describe, expect, it } from 'vitest';

import {
  TaskGraphScheduler,
  type AgentTaskGraph,
  type GraphNodeExecutionContext,
  type GraphNodeExecutor,
} from '../src/core-agent';

class DemoExecutor implements GraphNodeExecutor {
  constructor(
    private readonly succeed: boolean,
    private readonly output: Record<string, unknown> = {},
  ) {}

  async execute(context: GraphNodeExecutionContext) {
    void context;
    if (!this.succeed) {
      return {
        success: false,
        error: 'node failed',
      };
    }

    return {
      success: true,
      output: this.output,
    };
  }
}

describe('p4 task graph scheduler', () => {
  it('可按依赖顺序执行 DAG', async () => {
    const graph: AgentTaskGraph = {
      id: 'graph-1',
      nodes: [
        { id: 'n1', agent: 'reader' },
        { id: 'n2', agent: 'summarizer', dependsOn: ['n1'] },
        { id: 'n3', agent: 'publisher', dependsOn: ['n2'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'reader') return new DemoExecutor(true, { step: 1 });
      if (agent === 'summarizer') return new DemoExecutor(true, { step: 2 });
      if (agent === 'publisher') return new DemoExecutor(true, { step: 3 });
      return undefined;
    });

    const result = await scheduler.run(graph, {
      taskId: 'task-graph-1',
      sessionId: 'session-graph-1',
    });

    expect(result.status).toBe('succeeded');
    expect(result.executionOrder).toEqual(['n1', 'n2', 'n3']);
    expect(result.nodes.every((node) => node.status === 'succeeded')).toBe(true);
  });

  it('节点失败时依赖节点会被跳过', async () => {
    const graph: AgentTaskGraph = {
      id: 'graph-2',
      nodes: [
        { id: 'n1', agent: 'reader' },
        { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'reader') return new DemoExecutor(false);
      if (agent === 'writer') return new DemoExecutor(true);
      return undefined;
    });

    const result = await scheduler.run(graph, {
      taskId: 'task-graph-2',
      sessionId: 'session-graph-2',
    });

    expect(result.status).toBe('failed');

    const n1 = result.nodes.find((node) => node.nodeId === 'n1');
    const n2 = result.nodes.find((node) => node.nodeId === 'n2');

    expect(n1?.status).toBe('failed');
    expect(n2?.status).toBe('skipped');
  });

  it('循环依赖应直接报错', async () => {
    const graph: AgentTaskGraph = {
      id: 'graph-cycle',
      nodes: [
        { id: 'n1', agent: 'a', dependsOn: ['n2'] },
        { id: 'n2', agent: 'b', dependsOn: ['n1'] },
      ],
    };

    const scheduler = new TaskGraphScheduler(() => new DemoExecutor(true));

    await expect(
      scheduler.run(graph, {
        taskId: 'task-graph-cycle',
        sessionId: 'session-graph-cycle',
      }),
    ).rejects.toThrow('Task graph has cycle');
  });
});
