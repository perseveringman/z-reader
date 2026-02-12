import type {
  AgentTaskContext,
  IPolicyEngine,
  PolicyDecision,
  RiskLevel,
  ToolDefinition,
  ToolExecutionRequest,
} from '../contracts';
import type { AgentPolicyConfig, AgentToolPolicyRule } from './policy-config';

const RISK_RANK: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class ConfigurablePolicyEngine implements IPolicyEngine {
  constructor(private readonly config: AgentPolicyConfig) {}

  async evaluateToolCall(
    request: ToolExecutionRequest,
    context: AgentTaskContext,
    toolDefinition?: ToolDefinition,
  ): Promise<PolicyDecision> {
    void context;

    const matchedRule = this.findToolRule(request.toolName);
    const riskLevel = matchedRule?.overrideRiskLevel ?? toolDefinition?.declaredRisk ?? 'medium';

    if (matchedRule?.blocked || this.config.blockedRiskLevels.includes(riskLevel)) {
      return {
        allow: false,
        riskLevel,
        requiresApproval: false,
        reason: `Blocked by policy: ${request.toolName}`,
      };
    }

    if (matchedRule?.forceApproval) {
      return {
        allow: true,
        riskLevel,
        requiresApproval: true,
        reason: `Approval required by tool rule: ${request.toolName}`,
      };
    }

    return {
      allow: true,
      riskLevel,
      requiresApproval: RISK_RANK[riskLevel] >= RISK_RANK[this.config.approvalRiskThreshold],
      reason: `Policy evaluated for tool: ${request.toolName}`,
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

  private findToolRule(toolName: string): AgentToolPolicyRule | undefined {
    return this.config.toolRules.find((rule) => rule.toolName === toolName);
  }
}
