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

export interface AgentSnapshotResumeServiceDeps {
  snapshotStore: GraphSnapshotStore;
  taskStore?: ITaskStore;
  specialistResolver?: GraphExecutorResolver;
}

const CANCEL_SKIP_ERRORS = new Set(['Graph canceled', 'Graph timeout']);

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

    const scheduler = new TaskGraphScheduler(this.createResolver(mode));

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

      await this.appendResumeEvent(snapshot.taskId, {
        snapshotId: snapshot.id,
        graphId: snapshot.graphId,
        mode,
        riskLevel: preview.riskLevel,
        status: result.status,
        executionOrder: result.executionOrder,
      });

      const success = result.status === 'succeeded';

      return {
        success,
        message: success ? '恢复执行完成' : `恢复执行结束，状态：${result.status}`,
        mode,
        replayTaskId: snapshot.taskId,
        result,
      };
    } catch (error) {
      await this.appendResumeEvent(snapshot.taskId, {
        snapshotId: snapshot.id,
        graphId: snapshot.graphId,
        mode,
        riskLevel: preview.riskLevel,
        status: 'failed',
        error: error instanceof Error ? error.message : '恢复执行失败',
      });

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

  private createResolver(mode: AgentResumeMode): GraphExecutorResolver {
    if (mode === 'delegate') {
      return (agent) => this.deps.specialistResolver?.(agent);
    }

    return (agent) => this.createSafeExecutor(agent);
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

  private async appendResumeEvent(taskId: string, payloadJson: Record<string, unknown>): Promise<void> {
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
