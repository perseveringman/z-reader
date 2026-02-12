import type {
  AgentTaskContext,
  IPolicyEngine,
  PolicyDecision,
  RiskLevel,
  ToolDefinition,
  ToolExecutionRequest,
} from '../contracts';

const RISK_RANK: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface ThresholdPolicyEngineOptions {
  approvalRiskThreshold: RiskLevel;
  blockedRiskLevels?: RiskLevel[];
}

export class ThresholdPolicyEngine implements IPolicyEngine {
  constructor(private readonly options: ThresholdPolicyEngineOptions) {}

  async evaluateToolCall(
    request: ToolExecutionRequest,
    context: AgentTaskContext,
    toolDefinition?: ToolDefinition,
  ): Promise<PolicyDecision> {
    void request;
    void context;

    const riskLevel = toolDefinition?.declaredRisk ?? 'medium';
    const blocked = (this.options.blockedRiskLevels ?? []).includes(riskLevel);

    if (blocked) {
      return {
        allow: false,
        riskLevel,
        requiresApproval: false,
        reason: `Blocked by policy for risk level: ${riskLevel}`,
      };
    }

    return {
      allow: true,
      riskLevel,
      requiresApproval: RISK_RANK[riskLevel] >= RISK_RANK[this.options.approvalRiskThreshold],
      reason: `Policy evaluated risk: ${riskLevel}`,
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
