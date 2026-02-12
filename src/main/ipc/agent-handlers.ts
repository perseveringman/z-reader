import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type {
  AgentApprovalDecisionInput,
  AgentPendingApproval,
  AgentPolicyConfig,
  AgentPolicyConfigPatch,
  AgentReplayBundle,
} from '../../shared/types';
import { getAgentApprovalQueue, createReplayService } from '../services/agent-runtime-context';
import { getAgentPolicyConfig, setAgentPolicyConfig } from '../services/agent-policy-service';

export function registerAgentHandlers() {
  const {
    AGENT_APPROVAL_LIST,
    AGENT_APPROVAL_DECIDE,
    AGENT_REPLAY_GET,
    AGENT_POLICY_GET,
    AGENT_POLICY_SET,
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
}
