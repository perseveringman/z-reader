import type {
  AgentTaskContext,
  AgentTaskRequest,
  AgentTaskResult,
  ClassificationSignal,
  StrategyMode,
} from './common';

export interface PlanStep {
  id: string;
  title: string;
  action: 'think' | 'tool' | 'respond' | 'approval';
  input?: Record<string, unknown>;
}

export interface ExecutionPlan {
  taskId: string;
  mode: StrategyMode;
  steps: PlanStep[];
  rationale?: string;
}

export interface PlanExecutionSnapshot {
  taskId: string;
  stepId: string;
  state: 'planned' | 'running' | 'succeeded' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  updatedAt: string;
}

export interface IStrategyRouter {
  classify(request: AgentTaskRequest): Promise<ClassificationSignal>;
  chooseMode(request: AgentTaskRequest, signal: ClassificationSignal): Promise<StrategyMode>;
}

export interface IPlanner {
  createPlan(context: AgentTaskContext): Promise<ExecutionPlan>;
}

export interface IExecutor {
  execute(plan: ExecutionPlan, context: AgentTaskContext): Promise<AgentTaskResult>;
}
