import { describe, expect, it } from 'vitest';

import type { AgentTaskContext, ToolExecutionRequest } from '../src/core-agent/contracts';
import {
  ConfigurablePolicyEngine,
  normalizeAgentPolicyConfig,
  mergeAgentPolicyConfig,
} from '../src/core-agent';

const toolRequest: ToolExecutionRequest = {
  toolName: 'tool.shell.exec',
  args: {
    cmd: 'ls',
  },
};

const context: AgentTaskContext = {
  request: {
    id: 'task-p3-policy',
    sessionId: 'session-p3-policy',
    instruction: '执行策略测试',
  },
  strategy: 'react',
  riskLevel: 'low',
  createdAt: '2026-02-12T14:00:00.000Z',
};

describe('p3 configurable policy', () => {
  it('支持工具级强制审批和风险覆盖', async () => {
    const config = normalizeAgentPolicyConfig({
      approvalRiskThreshold: 'critical',
      toolRules: [
        {
          toolName: 'tool.shell.exec',
          overrideRiskLevel: 'high',
          forceApproval: true,
        },
      ],
    });

    const engine = new ConfigurablePolicyEngine(config);

    const decision = await engine.evaluateToolCall(toolRequest, context, {
      name: 'tool.shell.exec',
      description: 'shell',
      schema: { inputJsonSchema: {} },
      declaredRisk: 'low',
      requiredPermissions: ['shell:exec'],
      timeoutMs: 1000,
    });

    expect(decision.allow).toBe(true);
    expect(decision.riskLevel).toBe('high');
    expect(decision.requiresApproval).toBe(true);
  });

  it('支持阻断规则', async () => {
    const config = normalizeAgentPolicyConfig({
      blockedRiskLevels: ['critical'],
      toolRules: [
        {
          toolName: 'tool.shell.exec',
          blocked: true,
        },
      ],
    });

    const engine = new ConfigurablePolicyEngine(config);

    const decision = await engine.evaluateToolCall(toolRequest, context, {
      name: 'tool.shell.exec',
      description: 'shell',
      schema: { inputJsonSchema: {} },
      declaredRisk: 'medium',
      requiredPermissions: ['shell:exec'],
      timeoutMs: 1000,
    });

    expect(decision.allow).toBe(false);
    expect(decision.requiresApproval).toBe(false);
  });

  it('支持配置增量合并', () => {
    const current = normalizeAgentPolicyConfig({
      approvalRiskThreshold: 'high',
      blockedRiskLevels: ['critical'],
      toolRules: [{ toolName: 'tool.a', blocked: true }],
    });

    const next = mergeAgentPolicyConfig(current, {
      approvalRiskThreshold: 'medium',
      toolRules: [{ toolName: 'tool.b', forceApproval: true }],
    });

    expect(next.approvalRiskThreshold).toBe('medium');
    expect(next.blockedRiskLevels).toEqual(['critical']);
    expect(next.toolRules).toHaveLength(1);
    expect(next.toolRules[0].toolName).toBe('tool.b');
  });
});
