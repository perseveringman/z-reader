import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type {
  AgentApprovalDecisionInput,
  AgentGraphSnapshotItem,
  AgentPendingApproval,
  AgentPolicyConfig,
  AgentPolicyConfigPatch,
  AgentReplayBundle,
  AgentResumeExecuteInput,
  AgentResumeExecuteResult,
  AgentResumePreviewInput,
  AgentResumePreviewResult,
  AgentSnapshotCleanupInput,
  AgentSnapshotCleanupResult,
  AgentSnapshotListQuery,
} from '../../shared/types';
import {
  createGraphSnapshotStore,
  createReplayService,
  createSnapshotResumeService,
  getAgentApprovalQueue,
} from '../services/agent-runtime-context';
import { getAgentPolicyConfig, setAgentPolicyConfig } from '../services/agent-policy-service';

export function registerAgentHandlers() {
  const {
    AGENT_APPROVAL_LIST,
    AGENT_APPROVAL_DECIDE,
    AGENT_REPLAY_GET,
    AGENT_POLICY_GET,
    AGENT_POLICY_SET,
    AGENT_SNAPSHOT_LIST,
    AGENT_SNAPSHOT_CLEANUP,
    AGENT_RESUME_PREVIEW,
    AGENT_RESUME_EXECUTE,
  } = IPC_CHANNELS;

  ipcMain.handle(AGENT_APPROVAL_LIST, async (): Promise<AgentPendingApproval[]> => {
    return getAgentApprovalQueue().listPending().map((item) => ({
      id: item.id,
      taskId: item.request.taskId,
      riskLevel: item.request.riskLevel,
      operation: item.request.operation,
      reason: item.request.reason,
      payload: item.request.payload,
      createdAt: item.createdAt,
    }));
  });

  ipcMain.handle(AGENT_APPROVAL_DECIDE, async (_event, input: AgentApprovalDecisionInput): Promise<boolean> => {
    return getAgentApprovalQueue().decide(input.id, {
      approved: input.approved,
      reviewer: input.reviewer,
      comment: input.comment,
    });
  });

  ipcMain.handle(AGENT_REPLAY_GET, async (_event, taskId: string): Promise<AgentReplayBundle> => {
    const replay = await createReplayService().getTaskReplay(taskId);

    return {
      task: replay.task
        ? {
            ...replay.task,
          }
        : null,
      events: replay.events,
      traces: replay.traces,
    };
  });

  ipcMain.handle(AGENT_POLICY_GET, async (): Promise<AgentPolicyConfig> => {
    return getAgentPolicyConfig();
  });

  ipcMain.handle(AGENT_POLICY_SET, async (_event, patch: AgentPolicyConfigPatch): Promise<AgentPolicyConfig> => {
    return setAgentPolicyConfig(patch);
  });

  ipcMain.handle(AGENT_SNAPSHOT_LIST, async (_event, query: AgentSnapshotListQuery): Promise<AgentGraphSnapshotItem[]> => {
    const taskId = query?.taskId?.trim();
    if (!taskId) {
      return [];
    }

    const snapshots = await createGraphSnapshotStore().listByTask(taskId);
    return snapshots.map((snapshot) => ({
      id: snapshot.id,
      graphId: snapshot.graphId,
      graphSignature: snapshot.graphSignature,
      taskId: snapshot.taskId,
      sessionId: snapshot.sessionId,
      status: snapshot.status,
      executionOrder: snapshot.executionOrder,
      nodeCount: snapshot.nodes.length,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    }));
  });

  ipcMain.handle(
    AGENT_SNAPSHOT_CLEANUP,
    async (_event, input: AgentSnapshotCleanupInput): Promise<AgentSnapshotCleanupResult> => {
      const normalizedMax =
        typeof input?.maxSnapshotsPerTask === 'number' && Number.isFinite(input.maxSnapshotsPerTask)
          ? Math.max(0, Math.floor(input.maxSnapshotsPerTask))
          : undefined;

      const normalizedStaleBefore =
        typeof input?.staleBefore === 'string' && input.staleBefore.trim().length > 0
          ? input.staleBefore
          : undefined;

      return createGraphSnapshotStore().cleanup({
        maxSnapshotsPerTask: normalizedMax,
        staleBefore: normalizedStaleBefore,
      });
    },
  );

  ipcMain.handle(AGENT_RESUME_PREVIEW, async (_event, input: AgentResumePreviewInput): Promise<AgentResumePreviewResult> => {
    const mode = input?.mode === 'delegate' ? 'delegate' : 'safe';

    return createSnapshotResumeService().preview({
      snapshotId: input?.snapshotId ?? '',
      mode,
    });
  });

  ipcMain.handle(AGENT_RESUME_EXECUTE, async (_event, input: AgentResumeExecuteInput): Promise<AgentResumeExecuteResult> => {
    const mode = input?.mode === 'delegate' ? 'delegate' : 'safe';

    return createSnapshotResumeService().execute({
      snapshotId: input?.snapshotId ?? '',
      mode,
      confirmed: Boolean(input?.confirmed),
      maxParallel:
        typeof input?.maxParallel === 'number' && Number.isFinite(input.maxParallel)
          ? Math.max(1, Math.floor(input.maxParallel))
          : undefined,
    });
  });
}
