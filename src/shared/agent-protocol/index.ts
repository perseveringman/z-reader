import type { AgentTaskRequest, AgentTaskResult, StrategyMode, TaskStatus } from '../../core-agent/contracts';

export type AgentProtocolEventType =
  | 'TaskQueued'
  | 'TaskRunning'
  | 'TaskWaitingApproval'
  | 'TaskSucceeded'
  | 'TaskFailed'
  | 'TaskCanceled';

export interface AgentProtocolTaskEnvelope {
  request: AgentTaskRequest;
  requestedAt: string;
}

export interface AgentProtocolTaskUpdate {
  taskId: string;
  sessionId: string;
  status: TaskStatus;
  strategy: StrategyMode;
  timestamp: string;
}

export interface AgentProtocolTaskComplete {
  result: AgentTaskResult;
  finishedAt: string;
}
