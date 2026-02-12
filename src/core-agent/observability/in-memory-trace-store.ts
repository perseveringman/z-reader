import type { ITraceStore, TraceQuery, TraceRecord } from '../contracts';

export class InMemoryTraceStore implements ITraceStore {
  private readonly rows: TraceRecord[] = [];

  async append(record: TraceRecord): Promise<void> {
    this.rows.push(record);
  }

  async query(query: TraceQuery): Promise<TraceRecord[]> {
    const limit = Math.max(1, query.limit ?? 100);

    return this.rows
      .filter((row) => row.taskId === query.taskId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}
