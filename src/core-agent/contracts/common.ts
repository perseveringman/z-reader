export const CORE_AGENT_CONTRACT_VERSION = '2026-02-12';

export type StrategyMode = 'adaptive' | 'react' | 'plan_execute';

export type ForceStrategyMode = Exclude<StrategyMode, 'adaptive'>;

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AgentTaskRequest {
  id: string;
  sessionId: string;
  instruction: string;
  forceMode?: ForceStrategyMode;
  metadata?: Record<string, unknown>;
}

export interface AgentTaskResult {
  taskId: string;
  sessionId: string;
  status: Extract<TaskStatus, 'succeeded' | 'failed' | 'canceled'>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTaskContext {
  request: AgentTaskRequest;
  strategy: StrategyMode;
  riskLevel: RiskLevel;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationSignal {
  complexity: number;
  risk: number;
  contextTokens: number;
  toolCount: number;
}

export interface TraceMetric {
  latencyMs: number;
  tokenIn?: number;
  tokenOut?: number;
  costUsd?: number;
}
