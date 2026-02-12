import type { RiskLevel } from '../contracts';

export interface AgentToolPolicyRule {
  toolName: string;
  blocked?: boolean;
  overrideRiskLevel?: RiskLevel;
  forceApproval?: boolean;
}

export interface AgentPolicyConfig {
  approvalRiskThreshold: RiskLevel;
  blockedRiskLevels: RiskLevel[];
  toolRules: AgentToolPolicyRule[];
}

export interface AgentPolicyConfigPatch {
  approvalRiskThreshold?: RiskLevel;
  blockedRiskLevels?: RiskLevel[];
  toolRules?: AgentToolPolicyRule[];
}

export const DEFAULT_AGENT_POLICY_CONFIG: AgentPolicyConfig = {
  approvalRiskThreshold: 'high',
  blockedRiskLevels: [],
  toolRules: [],
};

export function normalizeAgentPolicyConfig(config?: AgentPolicyConfigPatch): AgentPolicyConfig {
  if (!config) {
    return { ...DEFAULT_AGENT_POLICY_CONFIG, toolRules: [] };
  }

  return {
    approvalRiskThreshold: config.approvalRiskThreshold ?? DEFAULT_AGENT_POLICY_CONFIG.approvalRiskThreshold,
    blockedRiskLevels: Array.from(new Set(config.blockedRiskLevels ?? DEFAULT_AGENT_POLICY_CONFIG.blockedRiskLevels)),
    toolRules: [...(config.toolRules ?? DEFAULT_AGENT_POLICY_CONFIG.toolRules)],
  };
}

export function mergeAgentPolicyConfig(
  current: AgentPolicyConfig,
  patch: AgentPolicyConfigPatch,
): AgentPolicyConfig {
  return normalizeAgentPolicyConfig({
    approvalRiskThreshold: patch.approvalRiskThreshold ?? current.approvalRiskThreshold,
    blockedRiskLevels: patch.blockedRiskLevels ?? current.blockedRiskLevels,
    toolRules: patch.toolRules ?? current.toolRules,
  });
}
