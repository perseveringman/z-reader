import type {
  AgentTaskContext,
  IPolicyEngine,
  PolicyDecision,
  ToolDefinition,
  ToolExecutionRequest,
} from '../contracts';

export class AllowAllPolicyEngine implements IPolicyEngine {
  async evaluateToolCall(
    request: ToolExecutionRequest,
    context: AgentTaskContext,
    toolDefinition?: ToolDefinition,
  ): Promise<PolicyDecision> {
    void request;
    void context;
    void toolDefinition;

    return {
      allow: true,
      riskLevel: 'low',
      requiresApproval: false,
    };
  }

  async evaluatePrompt(prompt: string, context: AgentTaskContext): Promise<PolicyDecision> {
    void prompt;
    void context;

    return {
      allow: true,
      riskLevel: 'low',
      requiresApproval: false,
    };
  }
}
