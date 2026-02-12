import type {
  AgentTaskGraph,
  GraphExecutionResult,
  GraphNodeExecutor,
  GraphRunContext,
  GraphRunOptions,
} from './task-graph';
import { TaskGraphScheduler } from './task-graph';

export class SpecialistRegistry {
  private readonly specialists = new Map<string, GraphNodeExecutor>();

  register(name: string, executor: GraphNodeExecutor): void {
    this.specialists.set(name, executor);
  }

  get(name: string): GraphNodeExecutor | undefined {
    return this.specialists.get(name);
  }

  list(): string[] {
    return Array.from(this.specialists.keys()).sort();
  }
}

export class SupervisorOrchestrator {
  private readonly scheduler: TaskGraphScheduler;

  constructor(private readonly registry: SpecialistRegistry) {
    this.scheduler = new TaskGraphScheduler((agent) => this.registry.get(agent));
  }

  async run(graph: AgentTaskGraph, context: GraphRunContext, options?: GraphRunOptions): Promise<GraphExecutionResult> {
    return this.scheduler.run(graph, context, options);
  }
}
