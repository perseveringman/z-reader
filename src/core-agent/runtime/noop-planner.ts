import type { AgentTaskContext, ExecutionPlan, IPlanner } from '../contracts';

export class NoopPlanner implements IPlanner {
  async createPlan(context: AgentTaskContext): Promise<ExecutionPlan> {
    return {
      taskId: context.request.id,
      mode: context.strategy,
      rationale: 'MVP 默认规划器：生成单步回应计划',
      steps: [
        {
          id: `${context.request.id}-respond`,
          title: '生成最终回应',
          action: 'respond',
          input: {
            instruction: context.request.instruction,
          },
        },
      ],
    };
  }
}
