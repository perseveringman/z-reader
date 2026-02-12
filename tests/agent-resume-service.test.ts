import { describe, expect, it } from 'vitest';

import {
  AgentSnapshotResumeService,
  InMemoryGraphSnapshotStore,
  type AgentResumeAuditPayload,
  type AgentTaskEventRecord,
  type AgentTaskPatch,
  type AgentTaskRecord,
  type GraphNodeExecutionContext,
  type GraphNodeExecutor,
  type ITaskStore,
} from '../src/core-agent';

class FakeTaskStore implements ITaskStore {
  public readonly events: AgentTaskEventRecord[] = [];

  async createTask(task: AgentTaskRecord): Promise<void> {
    void task;
  }

  async updateTask(taskId: string, patch: AgentTaskPatch): Promise<void> {
    void taskId;
    void patch;
  }

  async getTask(taskId: string): Promise<AgentTaskRecord | null> {
    void taskId;
    return null;
  }

  async appendEvent(event: AgentTaskEventRecord): Promise<void> {
    this.events.push(event);
  }

  async listEvents(taskId: string): Promise<AgentTaskEventRecord[]> {
    return this.events.filter((event) => event.taskId === taskId);
  }
}

class DelegateExecutor implements GraphNodeExecutor {
  constructor(private readonly name: string) {}

  async execute(context: GraphNodeExecutionContext) {
    return {
      success: true,
      output: {
        resumed: true,
        mode: 'delegate',
        specialist: this.name,
        nodeId: context.node.id,
      },
    };
  }
}

function getResumeAuditPayload(events: AgentTaskEventRecord[]): AgentResumeAuditPayload {
  const event = events.find((item) => item.eventType === 'graph.resume.executed');
  if (!event) {
    throw new Error('resume event not found');
  }

  return event.payloadJson as AgentResumeAuditPayload;
}

describe('p12 agent snapshot resume service audit', () => {
  it('高风险恢复在未确认时应拒绝执行', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    const taskStore = new FakeTaskStore();

    await snapshotStore.save({
      id: 'resume-snapshot-high',
      graphId: 'graph-resume-high',
      graphDefinition: {
        id: 'graph-resume-high',
        nodes: [
          { id: 'n1', agent: 'a' },
          { id: 'n2', agent: 'b', dependsOn: ['n1'] },
          { id: 'n3', agent: 'c', dependsOn: ['n2'] },
          { id: 'n4', agent: 'd', dependsOn: ['n3'] },
          { id: 'n5', agent: 'e', dependsOn: ['n4'] },
          { id: 'n6', agent: 'f', dependsOn: ['n5'] },
        ],
      },
      taskId: 'task-resume-high',
      sessionId: 'session-resume-high',
      status: 'canceled',
      executionOrder: [],
      nodes: [
        { nodeId: 'n1', status: 'pending' },
        { nodeId: 'n2', status: 'pending' },
        { nodeId: 'n3', status: 'pending' },
        { nodeId: 'n4', status: 'pending' },
        { nodeId: 'n5', status: 'pending' },
        { nodeId: 'n6', status: 'pending' },
      ],
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:00:00.000Z',
    });

    const service = new AgentSnapshotResumeService({
      snapshotStore,
      taskStore,
    });

    const preview = await service.preview({ snapshotId: 'resume-snapshot-high' });
    expect(preview.riskLevel).toBe('high');
    expect(preview.canResume).toBe(true);

    const execute = await service.execute({
      snapshotId: 'resume-snapshot-high',
      confirmed: false,
    });

    expect(execute.success).toBe(false);
    expect(execute.message).toContain('需要人工确认');
  });

  it('safe 模式确认后应执行恢复并写入结构化审计事件', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    const taskStore = new FakeTaskStore();

    await snapshotStore.save({
      id: 'resume-snapshot-ok',
      graphId: 'graph-resume-ok',
      graphDefinition: {
        id: 'graph-resume-ok',
        nodes: [
          { id: 'n1', agent: 'reader' },
          { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
        ],
      },
      taskId: 'task-resume-ok',
      sessionId: 'session-resume-ok',
      status: 'canceled',
      executionOrder: ['n1'],
      nodes: [
        { nodeId: 'n1', status: 'succeeded', output: { done: true } },
        { nodeId: 'n2', status: 'skipped', error: 'Graph canceled' },
      ],
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:01:00.000Z',
    });

    const service = new AgentSnapshotResumeService({
      snapshotStore,
      taskStore,
    });

    const execute = await service.execute({
      snapshotId: 'resume-snapshot-ok',
      mode: 'safe',
      confirmed: true,
    });

    expect(execute.success).toBe(true);
    expect(execute.mode).toBe('safe');
    expect(execute.result?.status).toBe('succeeded');
    expect(execute.replayTaskId).toBe('task-resume-ok');

    const events = await taskStore.listEvents('task-resume-ok');
    const payload = getResumeAuditPayload(events);

    expect(payload.mode).toBe('safe');
    expect(payload.sideEffectFlag).toBe(false);
    expect(payload.resolverSource).toBe('safe-runtime');
    expect(payload.status).toBe('succeeded');
    expect(payload.nodeSummary.total).toBe(2);
    expect(payload.specialist.hitCount).toBe(1);
    expect(payload.specialist.hitRate).toBe(1);
    expect(payload.specialist.missingAgents).toEqual([]);
  });

  it('delegate 模式可注入 specialist resolver 执行并记录命中率', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    const taskStore = new FakeTaskStore();

    await snapshotStore.save({
      id: 'resume-snapshot-delegate',
      graphId: 'graph-resume-delegate',
      graphDefinition: {
        id: 'graph-resume-delegate',
        nodes: [
          { id: 'n1', agent: 'reader' },
          { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
        ],
      },
      taskId: 'task-resume-delegate',
      sessionId: 'session-resume-delegate',
      status: 'canceled',
      executionOrder: ['n1'],
      nodes: [
        { nodeId: 'n1', status: 'succeeded', output: { done: true } },
        { nodeId: 'n2', status: 'skipped', error: 'Graph canceled' },
      ],
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:01:00.000Z',
    });

    const service = new AgentSnapshotResumeService({
      snapshotStore,
      taskStore,
      specialistResolver: (agent) => {
        if (agent === 'reader') return new DelegateExecutor('reader');
        if (agent === 'writer') return new DelegateExecutor('writer');
        return undefined;
      },
    });

    const preview = await service.preview({
      snapshotId: 'resume-snapshot-delegate',
      mode: 'delegate',
    });

    expect(preview.mode).toBe('delegate');
    expect(preview.requiresConfirmation).toBe(true);

    const execute = await service.execute({
      snapshotId: 'resume-snapshot-delegate',
      mode: 'delegate',
      confirmed: true,
    });

    expect(execute.success).toBe(true);
    expect(execute.mode).toBe('delegate');
    expect(execute.result?.status).toBe('succeeded');

    const resumedNode = execute.result?.nodes.find((node) => node.nodeId === 'n2');
    expect(resumedNode?.output?.mode).toBe('delegate');

    const events = await taskStore.listEvents('task-resume-delegate');
    const payload = getResumeAuditPayload(events);

    expect(payload.mode).toBe('delegate');
    expect(payload.sideEffectFlag).toBe(true);
    expect(payload.resolverSource).toBe('delegate-resolver');
    expect(payload.specialist.requestedAgents).toEqual(['writer']);
    expect(payload.specialist.resolvedAgents).toEqual(['writer']);
    expect(payload.specialist.missingAgents).toEqual([]);
    expect(payload.specialist.hitRate).toBe(1);
  });

  it('delegate 模式缺失 specialist 时应失败并记录 miss 统计', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    const taskStore = new FakeTaskStore();

    await snapshotStore.save({
      id: 'resume-snapshot-delegate-fail',
      graphId: 'graph-resume-delegate-fail',
      graphDefinition: {
        id: 'graph-resume-delegate-fail',
        nodes: [{ id: 'n1', agent: 'missing-specialist' }],
      },
      taskId: 'task-resume-delegate-fail',
      sessionId: 'session-resume-delegate-fail',
      status: 'canceled',
      executionOrder: [],
      nodes: [{ nodeId: 'n1', status: 'pending' }],
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:01:00.000Z',
    });

    const service = new AgentSnapshotResumeService({
      snapshotStore,
      taskStore,
      specialistResolver: () => undefined,
    });

    const execute = await service.execute({
      snapshotId: 'resume-snapshot-delegate-fail',
      mode: 'delegate',
      confirmed: true,
    });

    expect(execute.success).toBe(false);
    expect(execute.result?.status).toBe('failed');

    const events = await taskStore.listEvents('task-resume-delegate-fail');
    const payload = getResumeAuditPayload(events);

    expect(payload.status).toBe('failed');
    expect(payload.error).toBeUndefined();
    expect(payload.specialist.requestedAgents).toEqual(['missing-specialist']);
    expect(payload.specialist.missingAgents).toEqual(['missing-specialist']);
    expect(payload.specialist.hitRate).toBe(0);
    expect(payload.sideEffectFlag).toBe(true);
  });
});
