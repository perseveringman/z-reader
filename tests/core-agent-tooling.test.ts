import { describe, expect, it } from 'vitest';

import type { AgentTaskContext, ITool, ToolExecutionRequest } from '../src/core-agent/contracts';
import {
  InMemoryToolRegistry,
  PolicyAwareExecutor,
  StaticApprovalGateway,
  ThresholdPolicyEngine,
  ToolPermissionSandbox,
} from '../src/core-agent';

const buildContext = (): AgentTaskContext => ({
  request: {
    id: 'task-tooling',
    sessionId: 'session-tooling',
    instruction: '执行工具调用',
  },
  strategy: 'react',
  riskLevel: 'medium',
  createdAt: new Date().toISOString(),
});

class DemoTool implements ITool {
  readonly definition = {
    name: 'demo.echo',
    description: '回显参数',
    schema: {
      inputJsonSchema: {
        type: 'object',
      },
    },
    declaredRisk: 'high' as const,
    requiredPermissions: ['tool:demo:execute'],
    timeoutMs: 1000,
  };

  async execute(
    request: ToolExecutionRequest,
    context: AgentTaskContext,
  ): Promise<{ success: boolean; output: unknown; elapsedMs: number }> {
    void context;

    return {
      success: true,
      output: {
        echoed: request.args,
      },
      elapsedMs: 1,
    };
  }
}

describe('core-agent tooling and policy', () => {
  it('ToolRegistry 支持注册与查询', () => {
    const registry = new InMemoryToolRegistry();
    const tool = new DemoTool();

    registry.register(tool);

    expect(registry.get('demo.echo')).toBe(tool);
    expect(registry.list().map((item) => item.name)).toContain('demo.echo');
  });

  it('高风险工具在审批拒绝时应中断执行', async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(new DemoTool());

    const sandbox = new ToolPermissionSandbox(registry, {
      deniedPermissions: [],
    });
    const policy = new ThresholdPolicyEngine({
      approvalRiskThreshold: 'high',
    });
    const approval = new StaticApprovalGateway({
      approved: false,
      reviewer: 'tester',
    });

    const executor = new PolicyAwareExecutor(registry, sandbox, policy, approval);

    const result = await executor.execute(
      {
        taskId: 'task-tooling',
        mode: 'react',
        steps: [
          {
            id: 'tool-step',
            title: '执行 demo 工具',
            action: 'tool',
            input: {
              toolName: 'demo.echo',
              args: {
                value: 1,
              },
            },
          },
        ],
      },
      buildContext(),
    );

    expect(result.status).toBe('canceled');
    expect(result.error).toContain('Approval rejected');
  });

  it('高风险工具在审批通过时可继续执行', async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(new DemoTool());

    const sandbox = new ToolPermissionSandbox(registry, {
      deniedPermissions: [],
    });
    const policy = new ThresholdPolicyEngine({
      approvalRiskThreshold: 'high',
    });
    const approval = new StaticApprovalGateway({
      approved: true,
      reviewer: 'tester',
    });

    const executor = new PolicyAwareExecutor(registry, sandbox, policy, approval);

    const result = await executor.execute(
      {
        taskId: 'task-tooling',
        mode: 'react',
        steps: [
          {
            id: 'tool-step',
            title: '执行 demo 工具',
            action: 'tool',
            input: {
              toolName: 'demo.echo',
              args: {
                value: 1,
              },
            },
          },
          {
            id: 'respond-step',
            title: '返回结果',
            action: 'respond',
            input: {
              text: 'done',
            },
          },
        ],
      },
      buildContext(),
    );

    expect(result.status).toBe('succeeded');
    expect(result.metadata?.stepCount).toBe(2);
  });
});
