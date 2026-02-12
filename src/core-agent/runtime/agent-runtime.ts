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
  ITraceStore,
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
    private readonly traceStore?: ITraceStore,
  ) {}

  async run(request: AgentTaskRequest): Promise<AgentTaskResult> {
    const startedAt = Date.now();
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

    await this.appendTrace(request, 'runtime.queued', {
      latencyMs: 0,
    });

    const classifyStartedAt = Date.now();
    const signal = await this.router.classify(request);
    const strategy = await this.router.chooseMode(request, signal);
    const riskLevel = this.estimateRisk(signal.risk);

    await this.appendTrace(request, 'runtime.classified', {
      latencyMs: Date.now() - classifyStartedAt,
    }, {
      strategy,
      signal,
    });

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

    await this.appendTrace(request, 'runtime.running', {
      latencyMs: Date.now() - startedAt,
    }, {
      strategy,
      riskLevel,
    });

    const planStartedAt = Date.now();
    const plan = await this.planner.createPlan(context);
    await this.appendTrace(request, 'runtime.planned', {
      latencyMs: Date.now() - planStartedAt,
    }, {
      stepCount: plan.steps.length,
      mode: plan.mode,
    });

    const executeStartedAt = Date.now();
    const result = await this.executor.execute(plan, context);
    await this.appendTrace(request, 'runtime.executed', {
      latencyMs: Date.now() - executeStartedAt,
    }, {
      status: result.status,
    });

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

    await this.appendTrace(request, 'runtime.completed', {
      latencyMs: Date.now() - startedAt,
    }, {
      status: result.status,
      strategy,
    });

    return result;
  }

  private async appendTrace(
    request: AgentTaskRequest,
    span: string,
    metric: { latencyMs: number; tokenIn?: number; tokenOut?: number; costUsd?: number },
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.traceStore?.append({
      id: randomUUID(),
      taskId: request.id,
      span,
      kind: 'system',
      metric,
      payload,
      createdAt: nowIso(),
    });
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
