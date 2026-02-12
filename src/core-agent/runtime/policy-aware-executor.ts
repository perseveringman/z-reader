import type {
  AgentTaskContext,
  AgentTaskResult,
  ApprovalRequest,
  ExecutionPlan,
  IApprovalGateway,
  IExecutor,
  IPolicyEngine,
  IToolRegistry,
  IToolSandbox,
  PlanStep,
  ToolExecutionRequest,
} from '../contracts';

export class PolicyAwareExecutor implements IExecutor {
  constructor(
    private readonly registry: IToolRegistry,
    private readonly sandbox: IToolSandbox,
    private readonly policyEngine: IPolicyEngine,
    private readonly approvalGateway: IApprovalGateway,
  ) {}

  async execute(plan: ExecutionPlan, context: AgentTaskContext): Promise<AgentTaskResult> {
    let finalOutput = '';

    for (const step of plan.steps) {
      const stepResult = await this.executeStep(step, context);

      if (stepResult.status !== 'succeeded') {
        return {
          taskId: plan.taskId,
          sessionId: context.request.sessionId,
          status: stepResult.status,
          error: stepResult.error,
          metadata: {
            failedStep: step.id,
          },
        };
      }

      if (stepResult.outputText) {
        finalOutput = stepResult.outputText;
      }
    }

    return {
      taskId: plan.taskId,
      sessionId: context.request.sessionId,
      status: 'succeeded',
      output: finalOutput,
      metadata: {
        strategy: context.strategy,
        stepCount: plan.steps.length,
      },
    };
  }

  private async executeStep(
    step: PlanStep,
    context: AgentTaskContext,
  ): Promise<{ status: 'succeeded' | 'failed' | 'canceled'; error?: string; outputText?: string }> {
    if (step.action === 'tool') {
      return this.executeToolStep(step, context);
    }

    if (step.action === 'respond') {
      const text = typeof step.input?.text === 'string' ? step.input.text : '';
      return {
        status: 'succeeded',
        outputText: text,
      };
    }

    return {
      status: 'succeeded',
    };
  }

  private async executeToolStep(
    step: PlanStep,
    context: AgentTaskContext,
  ): Promise<{ status: 'succeeded' | 'failed' | 'canceled'; error?: string }> {
    const parsed = this.parseToolInput(step.input);
    if (!parsed) {
      return {
        status: 'failed',
        error: `Invalid tool step input: ${step.id}`,
      };
    }

    const tool = this.registry.get(parsed.toolName);
    if (!tool) {
      return {
        status: 'failed',
        error: `Tool not found: ${parsed.toolName}`,
      };
    }

    const sandboxDecision = await this.sandbox.authorize(parsed, context);
    if (!sandboxDecision.allowed) {
      return {
        status: 'canceled',
        error: sandboxDecision.reason ?? `Tool sandbox denied: ${parsed.toolName}`,
      };
    }

    const policyDecision = await this.policyEngine.evaluateToolCall(parsed, context, tool.definition);
    if (!policyDecision.allow) {
      return {
        status: 'canceled',
        error: policyDecision.reason ?? `Policy denied: ${parsed.toolName}`,
      };
    }

    if (policyDecision.requiresApproval) {
      const approvalRequest: ApprovalRequest = {
        taskId: context.request.id,
        reason: policyDecision.reason ?? `Approval required for tool: ${parsed.toolName}`,
        riskLevel: policyDecision.riskLevel,
        operation: parsed.toolName,
        payload: parsed.args,
      };

      const approvalDecision = await this.approvalGateway.requestApproval(approvalRequest);
      if (!approvalDecision.approved) {
        return {
          status: 'canceled',
          error: `Approval rejected for tool: ${parsed.toolName}`,
        };
      }
    }

    const toolResult = await tool.execute(parsed, context);
    if (!toolResult.success) {
      return {
        status: 'failed',
        error: toolResult.error ?? `Tool execution failed: ${parsed.toolName}`,
      };
    }

    return {
      status: 'succeeded',
    };
  }

  private parseToolInput(input?: Record<string, unknown>): ToolExecutionRequest | null {
    if (!input) {
      return null;
    }

    const toolName = input.toolName;
    const args = input.args;

    if (typeof toolName !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) {
      return null;
    }

    return {
      toolName,
      args: args as Record<string, unknown>,
      timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined,
    };
  }
}
