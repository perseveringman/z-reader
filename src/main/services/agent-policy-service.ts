import type { AgentPolicyConfig, AgentPolicyConfigPatch } from '../../shared/types';
import { loadSettings, updateSettings } from './settings-service';
import {
  DEFAULT_AGENT_POLICY_CONFIG,
  mergeAgentPolicyConfig,
  normalizeAgentPolicyConfig,
} from '../../core-agent/security/policy-config';

export function getAgentPolicyConfig(): AgentPolicyConfig {
  const settings = loadSettings();
  return normalizeAgentPolicyConfig(settings.agentPolicy ?? DEFAULT_AGENT_POLICY_CONFIG);
}

export function setAgentPolicyConfig(patch: AgentPolicyConfigPatch): AgentPolicyConfig {
  const current = getAgentPolicyConfig();
  const merged = mergeAgentPolicyConfig(current, patch);

  updateSettings({
    agentPolicy: merged,
  });

  return merged;
}
