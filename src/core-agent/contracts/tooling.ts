import type { AgentTaskContext, RiskLevel } from './common';

export interface ToolSchema {
  inputJsonSchema: Record<string, unknown>;
  outputJsonSchema?: Record<string, unknown>;
}

export interface ToolExecutionRequest {
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  elapsedMs: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: ToolSchema;
  declaredRisk: RiskLevel;
  requiredPermissions: string[];
  timeoutMs: number;
}

export interface ITool {
  readonly definition: ToolDefinition;
  execute(request: ToolExecutionRequest, context: AgentTaskContext): Promise<ToolExecutionResult>;
}

export interface IToolRegistry {
  register(tool: ITool): void;
  get(name: string): ITool | undefined;
  list(): ToolDefinition[];
}

export interface ToolSandboxDecision {
  allowed: boolean;
  reason?: string;
}

export interface IToolSandbox {
  authorize(request: ToolExecutionRequest, context: AgentTaskContext): Promise<ToolSandboxDecision>;
}
