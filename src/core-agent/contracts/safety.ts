import type { AgentTaskContext, RiskLevel } from './common';
import type { ToolExecutionRequest, ToolDefinition } from './tooling';

export interface PolicyDecision {
  allow: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reason?: string;
}

export interface ApprovalRequest {
  taskId: string;
  reason: string;
  riskLevel: RiskLevel;
  operation: string;
  payload?: Record<string, unknown>;
}

export interface ApprovalDecision {
  approved: boolean;
  reviewer?: string;
  comment?: string;
  decidedAt: string;
}

export interface IPolicyEngine {
  evaluateToolCall(
    request: ToolExecutionRequest,
    context: AgentTaskContext,
    toolDefinition?: ToolDefinition,
  ): Promise<PolicyDecision>;
  evaluatePrompt(prompt: string, context: AgentTaskContext): Promise<PolicyDecision>;
}

export interface IApprovalGateway {
  requestApproval(input: ApprovalRequest): Promise<ApprovalDecision>;
}
