import { randomUUID } from 'node:crypto';
import type {
  AgentTaskContext,
  AgentTaskRequest,
  AgentTaskResult,
  IEventBus,
  IExecutor,
  IPlanner,
  IStrategyRouter,
  ITaskStore,
  RiskLevel,
  TaskStatus,
} from '../contracts';

const nowIso = (): string => new Date().toISOString();

export class AgentRuntime {
  constructor(
    private readonly router: IStrategyRouter,
    private readonly planner: IPlanner,
    private readonly executor: IExecutor,
    private readonly eventBus?: IEventBus,
    private readonly taskStore?: ITaskStore,
  ) {}

  async run(request: AgentTaskRequest): Promise<AgentTaskResult> {
    const queuedAt = nowIso();

    await this.taskStore?.createTask({
      id: request.id,
      sessionId: request.sessionId,
      status: 'queued',
      strategy: request.forceMode ?? 'adaptive',
      riskLevel: 'low',
      inputJson: {
        instruction: request.instruction,
        metadata: request.metadata ?? {},
      },
      createdAt: queuedAt,
      updatedAt: queuedAt,
    });

    await this.emitEvent('TaskQueued', request, {
      instruction: request.instruction,
    });

    const signal = await this.router.classify(request);
    const strategy = await this.router.chooseMode(request, signal);
    const riskLevel = this.estimateRisk(signal.risk);

    const context: AgentTaskContext = {
      request,
      strategy,
      riskLevel,
      createdAt: nowIso(),
      metadata: {
        signal,
      },
    };

    await this.taskStore?.updateTask(request.id, {
      status: 'running',
      strategy,
      riskLevel,
      updatedAt: nowIso(),
    });

    await this.emitEvent('TaskRunning', request, {
      strategy,
      signal,
    });

    const plan = await this.planner.createPlan(context);
    const result = await this.executor.execute(plan, context);

    const finalEventType = this.mapStatusToEvent(result.status);
    await this.taskStore?.updateTask(request.id, {
      status: result.status,
      strategy,
      riskLevel,
      outputJson: result.output
        ? {
            text: result.output,
            metadata: result.metadata ?? {},
          }
        : undefined,
      errorText: result.error,
      updatedAt: nowIso(),
    });

    await this.emitEvent(finalEventType, request, {
      status: result.status,
      error: result.error,
    });

    return result;
  }

  private async emitEvent(type: string, request: AgentTaskRequest, payload: Record<string, unknown>): Promise<void> {
    const timestamp = nowIso();

    await this.taskStore?.appendEvent({
      id: randomUUID(),
      taskId: request.id,
      eventType: type,
      payloadJson: payload,
      occurredAt: timestamp,
    });

    await this.eventBus?.publish({
      type,
      taskId: request.id,
      sessionId: request.sessionId,
      payload,
      timestamp,
    });
  }

  private mapStatusToEvent(status: TaskStatus): string {
    if (status === 'succeeded') {
      return 'TaskSucceeded';
    }

    if (status === 'canceled') {
      return 'TaskCanceled';
    }

    if (status === 'waiting_approval') {
      return 'TaskWaitingApproval';
    }

    return 'TaskFailed';
  }

  private estimateRisk(score: number): RiskLevel {
    if (score >= 0.85) {
      return 'critical';
    }

    if (score >= 0.65) {
      return 'high';
    }

    if (score >= 0.35) {
      return 'medium';
    }

    return 'low';
  }
}
