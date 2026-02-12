import type { RiskLevel } from '../contracts';
import type { ITaskStore } from '../contracts/task-store';
import {
  buildGraphFromSnapshot,
  TaskGraphScheduler,
  type GraphExecutionResult,
  type GraphExecutorResolver,
  type GraphNodeExecutor,
  type GraphExecutionSnapshot,
  type GraphNodeExecutionOutput,
  type GraphNodeStatus,
  type GraphSnapshotStore,
} from './task-graph';

export type AgentResumeMode = 'safe' | 'delegate';

export interface AgentSnapshotResumePreviewInput {
  snapshotId: string;
  mode?: AgentResumeMode;
}

export interface AgentSnapshotResumePreviewResult {
  mode: AgentResumeMode;
  snapshotId: string;
  taskId: string;
  sessionId: string;
  graphId: string;
  snapshotStatus: GraphExecutionSnapshot['status'];
  pendingNodeIds: string[];
  failedNodeIds: string[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  canResume: boolean;
  reason?: string;
}

export interface AgentSnapshotResumeExecuteInput {
  snapshotId: string;
  confirmed: boolean;
  mode?: AgentResumeMode;
  maxParallel?: number;
}

export interface AgentSnapshotResumeExecuteResult {
  success: boolean;
  message: string;
  mode: AgentResumeMode;
  replayTaskId?: string;
  result?: GraphExecutionResult;
}

export interface AgentResumeSpecialistAudit {
  requestedAgents: string[];
  resolvedAgents: string[];
  missingAgents: string[];
  totalRequests: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

export interface AgentResumeNodeSummary {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface AgentResumeAuditPayload {
  snapshotId: string;
  graphId: string;
  mode: AgentResumeMode;
  resolverSource: 'safe-runtime' | 'delegate-resolver';
  sideEffectFlag: boolean;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  pendingNodeIds: string[];
  failedNodeIds: string[];
  status: GraphExecutionSnapshot['status'];
  executionOrder: string[];
  nodeSummary: AgentResumeNodeSummary;
  specialist: AgentResumeSpecialistAudit;
  error?: string;
}

export interface AgentSnapshotResumeServiceDeps {
  snapshotStore: GraphSnapshotStore;
  taskStore?: ITaskStore;
  specialistResolver?: GraphExecutorResolver;
}

const CANCEL_SKIP_ERRORS = new Set(['Graph canceled', 'Graph timeout']);

interface ResolverAuditState {
  requested: Set<string>;
  resolved: Set<string>;
  missing: Set<string>;
  totalRequests: number;
  hitCount: number;
  missCount: number;
}

interface ResolverAuditOutput {
  resolver: GraphExecutorResolver;
  summarize: () => AgentResumeSpecialistAudit;
}

export class AgentSnapshotResumeService {
  constructor(private readonly deps: AgentSnapshotResumeServiceDeps) {}

  async preview(input: AgentSnapshotResumePreviewInput): Promise<AgentSnapshotResumePreviewResult> {
    const mode = input.mode ?? 'safe';
    const snapshot = await this.deps.snapshotStore.get(input.snapshotId);
    if (!snapshot) {
      return {
        mode,
        snapshotId: input.snapshotId,
        taskId: '',
        sessionId: '',
        graphId: '',
        snapshotStatus: 'failed',
        pendingNodeIds: [],
        failedNodeIds: [],
        riskLevel: 'low',
        requiresConfirmation: mode === 'delegate',
        canResume: false,
        reason: '快照不存在',
      };
    }

    const pendingNodeIds = snapshot.nodes
      .filter((node) => node.status === 'pending' || (node.status === 'skipped' && CANCEL_SKIP_ERRORS.has(node.error ?? '')))
      .map((node) => node.nodeId);

    const failedNodeIds = snapshot.nodes.filter((node) => node.status === 'failed').map((node) => node.nodeId);

    const hasGraphDefinition = Boolean(buildGraphFromSnapshot(snapshot));
    const statusAllowed = snapshot.status === 'canceled' || snapshot.status === 'failed';

    let canResume = true;
    let reason: string | undefined;

    if (!statusAllowed) {
      canResume = false;
      reason = `当前快照状态不可恢复：${snapshot.status}`;
    } else if (!hasGraphDefinition) {
      canResume = false;
      reason = '快照缺少图定义，无法恢复';
    } else if (pendingNodeIds.length === 0) {
      canResume = false;
      reason = '没有待恢复节点';
    }

    const riskLevel = this.computeRiskLevel({
      pendingCount: pendingNodeIds.length,
      failedCount: failedNodeIds.length,
      mode,
    });
    const requiresConfirmation = mode === 'delegate' || riskLevel === 'high' || riskLevel === 'critical';

    return {
      mode,
      snapshotId: snapshot.id,
      taskId: snapshot.taskId,
      sessionId: snapshot.sessionId,
      graphId: snapshot.graphId,
      snapshotStatus: snapshot.status,
      pendingNodeIds,
      failedNodeIds,
      riskLevel,
      requiresConfirmation,
      canResume,
      reason,
    };
  }

  async execute(input: AgentSnapshotResumeExecuteInput): Promise<AgentSnapshotResumeExecuteResult> {
    const mode = input.mode ?? 'safe';
    const snapshot = await this.deps.snapshotStore.get(input.snapshotId);
    if (!snapshot) {
      return {
        success: false,
        message: '快照不存在',
        mode,
      };
    }

    const preview = await this.preview({ snapshotId: input.snapshotId, mode });
    if (!preview.canResume) {
      return {
        success: false,
        message: preview.reason ?? '快照当前不可恢复',
        mode,
        replayTaskId: snapshot.taskId,
      };
    }

    if (preview.requiresConfirmation && !input.confirmed) {
      return {
        success: false,
        message: '当前恢复模式需要人工确认',
        mode,
        replayTaskId: snapshot.taskId,
      };
    }

    const graph = buildGraphFromSnapshot(snapshot);
    if (!graph) {
      return {
        success: false,
        message: '快照缺少图定义，无法恢复',
        mode,
        replayTaskId: snapshot.taskId,
      };
    }

    const resolverAudit = this.createResolverWithAudit(mode);
    const scheduler = new TaskGraphScheduler(resolverAudit.resolver);

    try {
      const result = await scheduler.resume(
        graph,
        {
          taskId: snapshot.taskId,
          sessionId: snapshot.sessionId,
        },
        snapshot,
        {
          snapshotStore: this.deps.snapshotStore,
          snapshotId: snapshot.id,
          maxParallel: input.maxParallel,
        },
      );

      await this.appendResumeEvent(
        snapshot.taskId,
        this.buildAuditPayload({
          snapshot,
          preview,
          mode,
          status: result.status,
          executionOrder: result.executionOrder,
          nodeSummary: this.summarizeNodeStatuses(result.nodes.map((node) => node.status)),
          specialist: resolverAudit.summarize(),
        }),
      );

      const success = result.status === 'succeeded';

      return {
        success,
        message: success ? '恢复执行完成' : `恢复执行结束，状态：${result.status}`,
        mode,
        replayTaskId: snapshot.taskId,
        result,
      };
    } catch (error) {
      await this.appendResumeEvent(
        snapshot.taskId,
        this.buildAuditPayload({
          snapshot,
          preview,
          mode,
          status: 'failed',
          executionOrder: [],
          nodeSummary: this.summarizeNodeStatuses(snapshot.nodes.map((node) => node.status)),
          specialist: resolverAudit.summarize(),
          error: error instanceof Error ? error.message : '恢复执行失败',
        }),
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : '恢复执行失败',
        mode,
        replayTaskId: snapshot.taskId,
      };
    }
  }

  private computeRiskLevel(input: { pendingCount: number; failedCount: number; mode: AgentResumeMode }): RiskLevel {
    if (input.mode === 'delegate') {
      if (input.pendingCount >= 3 || input.failedCount > 0) {
        return 'high';
      }

      return 'medium';
    }

    if (input.pendingCount >= 5 || input.failedCount > 0) {
      return 'high';
    }

    if (input.pendingCount >= 3) {
      return 'medium';
    }

    return 'low';
  }

  private createResolverWithAudit(mode: AgentResumeMode): ResolverAuditOutput {
    const state: ResolverAuditState = {
      requested: new Set<string>(),
      resolved: new Set<string>(),
      missing: new Set<string>(),
      totalRequests: 0,
      hitCount: 0,
      missCount: 0,
    };

    const resolve = mode === 'delegate'
      ? (agent: string) => this.deps.specialistResolver?.(agent)
      : (agent: string) => this.createSafeExecutor(agent);

    const resolver: GraphExecutorResolver = (agent) => {
      state.totalRequests += 1;
      state.requested.add(agent);

      const executor = resolve(agent);
      if (executor) {
        state.hitCount += 1;
        state.resolved.add(agent);
      } else {
        state.missCount += 1;
        state.missing.add(agent);
      }

      return executor;
    };

    return {
      resolver,
      summarize: () => {
        const hitRate = state.totalRequests > 0 ? Number((state.hitCount / state.totalRequests).toFixed(4)) : 0;

        return {
          requestedAgents: Array.from(state.requested).sort(),
          resolvedAgents: Array.from(state.resolved).sort(),
          missingAgents: Array.from(state.missing).sort(),
          totalRequests: state.totalRequests,
          hitCount: state.hitCount,
          missCount: state.missCount,
          hitRate,
        };
      },
    };
  }

  private buildAuditPayload(input: {
    snapshot: GraphExecutionSnapshot;
    preview: AgentSnapshotResumePreviewResult;
    mode: AgentResumeMode;
    status: GraphExecutionSnapshot['status'];
    executionOrder: string[];
    nodeSummary: AgentResumeNodeSummary;
    specialist: AgentResumeSpecialistAudit;
    error?: string;
  }): AgentResumeAuditPayload {
    return {
      snapshotId: input.snapshot.id,
      graphId: input.snapshot.graphId,
      mode: input.mode,
      resolverSource: input.mode === 'delegate' ? 'delegate-resolver' : 'safe-runtime',
      sideEffectFlag: input.mode === 'delegate',
      riskLevel: input.preview.riskLevel,
      requiresConfirmation: input.preview.requiresConfirmation,
      pendingNodeIds: input.preview.pendingNodeIds,
      failedNodeIds: input.preview.failedNodeIds,
      status: input.status,
      executionOrder: input.executionOrder,
      nodeSummary: input.nodeSummary,
      specialist: input.specialist,
      error: input.error,
    };
  }

  private summarizeNodeStatuses(statuses: GraphNodeStatus[]): AgentResumeNodeSummary {
    const summary: AgentResumeNodeSummary = {
      total: statuses.length,
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    for (const status of statuses) {
      summary[status] += 1;
    }

    return summary;
  }

  private createSafeExecutor(agent: string): GraphNodeExecutor {
    return {
      execute: async (context) => {
        const output: GraphNodeExecutionOutput = {
          success: true,
          output: {
            resumed: true,
            mode: 'safe-recovery',
            agent,
            nodeId: context.node.id,
          },
        };

        return output;
      },
    };
  }

  private async appendResumeEvent(taskId: string, payloadJson: AgentResumeAuditPayload): Promise<void> {
    if (!this.deps.taskStore) {
      return;
    }

    const now = new Date().toISOString();
    await this.deps.taskStore.appendEvent({
      id: `${taskId}:resume:${Date.now()}`,
      taskId,
      eventType: 'graph.resume.executed',
      payloadJson,
      occurredAt: now,
    });
  }
}
