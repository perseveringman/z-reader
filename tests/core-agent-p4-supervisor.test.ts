import { describe, expect, it } from 'vitest';

import {
  SupervisorOrchestrator,
  type AgentTaskGraph,
  type GraphNodeExecutionContext,
  type GraphNodeExecutor,
  SpecialistRegistry,
} from '../src/core-agent';

class SpecialistExecutor implements GraphNodeExecutor {
  constructor(private readonly name: string) {}

  async execute(context: GraphNodeExecutionContext) {
    return {
      success: true,
      output: {
        specialist: this.name,
        nodeId: context.node.id,
      },
    };
  }
}

describe('p4 supervisor orchestrator', () => {
  it('可基于 specialist registry 协作执行', async () => {
    const registry = new SpecialistRegistry();
    registry.register('reader', new SpecialistExecutor('reader'));
    registry.register('writer', new SpecialistExecutor('writer'));

    const graph: AgentTaskGraph = {
      id: 'graph-supervisor-1',
      nodes: [
        { id: 'n1', agent: 'reader' },
        { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
      ],
    };

    const orchestrator = new SupervisorOrchestrator(registry);

    const result = await orchestrator.run(graph, {
      taskId: 'task-supervisor-1',
      sessionId: 'session-supervisor-1',
    });

    expect(result.status).toBe('succeeded');
    expect(result.executionOrder).toEqual(['n1', 'n2']);

    const writer = result.nodes.find((node) => node.nodeId === 'n2');
    expect(writer?.output).toEqual({ specialist: 'writer', nodeId: 'n2' });
  });

  it('缺少 specialist 时应失败', async () => {
    const registry = new SpecialistRegistry();
    registry.register('reader', new SpecialistExecutor('reader'));

    const graph: AgentTaskGraph = {
      id: 'graph-supervisor-2',
      nodes: [
        { id: 'n1', agent: 'reader' },
        { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
      ],
    };

    const orchestrator = new SupervisorOrchestrator(registry);

    const result = await orchestrator.run(graph, {
      taskId: 'task-supervisor-2',
      sessionId: 'session-supervisor-2',
    });

    expect(result.status).toBe('failed');

    const n2 = result.nodes.find((node) => node.nodeId === 'n2');
    expect(n2?.status).toBe('failed');
    expect(String(n2?.error)).toContain('Specialist not found');
  });
});
