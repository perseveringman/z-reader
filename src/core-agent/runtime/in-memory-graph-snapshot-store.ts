import type {
  GraphExecutionSnapshot,
  GraphSnapshotCleanupPolicy,
  GraphSnapshotCleanupResult,
  GraphSnapshotStore,
} from './task-graph';

export class InMemoryGraphSnapshotStore implements GraphSnapshotStore {
  private readonly rows = new Map<string, GraphExecutionSnapshot>();

  async save(snapshot: GraphExecutionSnapshot): Promise<void> {
    this.rows.set(snapshot.id, this.cloneSnapshot(snapshot));
  }

  async get(id: string): Promise<GraphExecutionSnapshot | null> {
    const row = this.rows.get(id);
    if (!row) {
      return null;
    }

    return this.cloneSnapshot(row);
  }

  async listByTask(taskId: string): Promise<GraphExecutionSnapshot[]> {
    return Array.from(this.rows.values())
      .filter((snapshot) => snapshot.taskId === taskId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((snapshot) => this.cloneSnapshot(snapshot));
  }

  async cleanup(policy: GraphSnapshotCleanupPolicy): Promise<GraphSnapshotCleanupResult> {
    const deletable = new Set<string>();
    const staleBeforeEpoch = this.toEpoch(policy.staleBefore);

    const ordered = Array.from(this.rows.values()).sort((left, right) => {
      const taskCompared = left.taskId.localeCompare(right.taskId);
      if (taskCompared !== 0) {
        return taskCompared;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

    if (staleBeforeEpoch !== undefined) {
      for (const snapshot of ordered) {
        const updatedAtEpoch = this.toEpoch(snapshot.updatedAt);
        if (updatedAtEpoch !== undefined && updatedAtEpoch < staleBeforeEpoch) {
          deletable.add(snapshot.id);
        }
      }
    }

    if (policy.maxSnapshotsPerTask !== undefined && policy.maxSnapshotsPerTask >= 0) {
      const seenByTask = new Map<string, number>();

      for (const snapshot of ordered) {
        if (deletable.has(snapshot.id)) {
          continue;
        }

        const seen = seenByTask.get(snapshot.taskId) ?? 0;
        if (seen >= policy.maxSnapshotsPerTask) {
          deletable.add(snapshot.id);
          continue;
        }

        seenByTask.set(snapshot.taskId, seen + 1);
      }
    }

    for (const id of deletable) {
      this.rows.delete(id);
    }

    return {
      deletedCount: deletable.size,
      deletedIds: Array.from(deletable),
    };
  }

  private cloneSnapshot(snapshot: GraphExecutionSnapshot): GraphExecutionSnapshot {
    return {
      ...snapshot,
      executionOrder: [...snapshot.executionOrder],
      nodes: snapshot.nodes.map((node) => ({ ...node })),
    };
  }

  private toEpoch(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const epoch = Date.parse(value);
    return Number.isNaN(epoch) ? undefined : epoch;
  }
}
