import type { AgentTaskEventRecord, AgentTaskRecord, ITaskStore, ITraceStore, TraceRecord } from '../contracts';

export interface AgentAuditReplay {
  task: AgentTaskRecord | null;
  events: AgentTaskEventRecord[];
  traces: TraceRecord[];
}

export class AuditReplayService {
  constructor(
    private readonly taskStore: ITaskStore,
    private readonly traceStore: ITraceStore,
  ) {}

  async getTaskReplay(taskId: string): Promise<AgentAuditReplay> {
    const [task, events, traces] = await Promise.all([
      this.taskStore.getTask(taskId),
      this.taskStore.listEvents(taskId),
      this.traceStore.query({ taskId, limit: 500 }),
    ]);

    return {
      task,
      events,
      traces,
    };
  }
}
