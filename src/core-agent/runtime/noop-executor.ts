import type { AgentTaskContext, AgentTaskResult, ExecutionPlan, IExecutor } from '../contracts';

export class NoopExecutor implements IExecutor {
  async execute(plan: ExecutionPlan, context: AgentTaskContext): Promise<AgentTaskResult> {
    return {
      taskId: plan.taskId,
      sessionId: context.request.sessionId,
      status: 'succeeded',
      output: 'MVP executor executed plan successfully.',
      metadata: {
        strategy: context.strategy,
        stepCount: plan.steps.length,
      },
    };
  }
}
