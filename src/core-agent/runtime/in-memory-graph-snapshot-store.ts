import type { GraphExecutionSnapshot, GraphSnapshotStore } from './task-graph';

export class InMemoryGraphSnapshotStore implements GraphSnapshotStore {
  private readonly rows = new Map<string, GraphExecutionSnapshot>();

  async save(snapshot: GraphExecutionSnapshot): Promise<void> {
    this.rows.set(snapshot.id, {
      ...snapshot,
      executionOrder: [...snapshot.executionOrder],
      nodes: snapshot.nodes.map((node) => ({ ...node })),
    });
  }

  async get(id: string): Promise<GraphExecutionSnapshot | null> {
    const row = this.rows.get(id);
    if (!row) {
      return null;
    }

    return {
      ...row,
      executionOrder: [...row.executionOrder],
      nodes: row.nodes.map((node) => ({ ...node })),
    };
  }
}
