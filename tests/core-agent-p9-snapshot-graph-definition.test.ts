import { describe, expect, it } from 'vitest';

import {
  InMemoryGraphSnapshotStore,
  TaskGraphScheduler,
  buildGraphFromSnapshot,
  type AgentTaskGraph,
} from '../src/core-agent';

describe('p9 snapshot graph definition', () => {
  it('快照应持久化图定义并可重建', async () => {
    const snapshotStore = new InMemoryGraphSnapshotStore();
    let stop = false;

    const graph: AgentTaskGraph = {
      id: 'graph-p9-definition',
      nodes: [
        { id: 'n1', agent: 'reader' },
        { id: 'n2', agent: 'writer', dependsOn: ['n1'] },
      ],
    };

    const scheduler = new TaskGraphScheduler((agent) => {
      if (agent === 'reader') {
        return {
          execute: async () => {
            stop = true;
            return { success: true, output: { ok: 'reader' } };
          },
        };
      }

      if (agent === 'writer') {
        return {
          execute: async () => ({ success: true, output: { ok: 'writer' } }),
        };
      }

      return undefined;
    });

    const canceled = await scheduler.run(
      graph,
      {
        taskId: 'task-p9-definition',
        sessionId: 'session-p9-definition',
      },
      {
        shouldCancel: () => stop,
        snapshotStore,
        snapshotId: 'snapshot-p9-definition',
      },
    );

    expect(canceled.status).toBe('canceled');

    const snapshot = await snapshotStore.get('snapshot-p9-definition');
    expect(snapshot?.graphDefinition?.id).toBe('graph-p9-definition');
    expect(snapshot?.graphDefinition?.nodes.map((node) => node.id)).toEqual(['n1', 'n2']);

    if (!snapshot) {
      throw new Error('snapshot should exist');
    }

    const rebuilt = buildGraphFromSnapshot(snapshot);
    expect(rebuilt?.id).toBe('graph-p9-definition');
    expect(rebuilt?.nodes[1].dependsOn).toEqual(['n1']);
  });
});
