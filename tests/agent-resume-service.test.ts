import { describe, expect, it } from 'vitest';

import {
  AgentSnapshotResumeService,
  InMemoryGraphSnapshotStore,
  type AgentTaskEventRecord,
  type AgentTaskPatch,
  type AgentTaskRecord,
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

describe('p9 agent snapshot resume service', () => {
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

  it('确认后应执行恢复并写入回放事件', async () => {
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
      confirmed: true,
    });

    expect(execute.success).toBe(true);
    expect(execute.result?.status).toBe('succeeded');
    expect(execute.replayTaskId).toBe('task-resume-ok');

    const events = await taskStore.listEvents('task-resume-ok');
    expect(events.some((event) => event.eventType === 'graph.resume.executed')).toBe(true);
  });
});
