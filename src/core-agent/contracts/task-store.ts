import type { RiskLevel, StrategyMode, TaskStatus } from './common';

export interface AgentTaskRecord {
  id: string;
  sessionId: string;
  status: TaskStatus;
  strategy: StrategyMode;
  riskLevel: RiskLevel;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskEventRecord {
  id: string;
  taskId: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
}

export interface AgentTaskPatch {
  status?: TaskStatus;
  strategy?: StrategyMode;
  riskLevel?: RiskLevel;
  outputJson?: Record<string, unknown>;
  errorText?: string;
  updatedAt: string;
}

export interface ITaskStore {
  createTask(task: AgentTaskRecord): Promise<void>;
  updateTask(taskId: string, patch: AgentTaskPatch): Promise<void>;
  getTask(taskId: string): Promise<AgentTaskRecord | null>;
  appendEvent(event: AgentTaskEventRecord): Promise<void>;
  listEvents(taskId: string): Promise<AgentTaskEventRecord[]>;
}
