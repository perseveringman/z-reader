export type GraphNodeStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface AgentTaskGraphNode {
  id: string;
  agent: string;
  dependsOn?: string[];
  input?: Record<string, unknown>;
}

export interface AgentTaskGraph {
  id: string;
  nodes: AgentTaskGraphNode[];
}

export interface GraphRunContext {
  taskId: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface GraphNodeExecutionContext extends GraphRunContext {
  node: AgentTaskGraphNode;
  dependencyResults: Record<string, Record<string, unknown> | undefined>;
}

export interface GraphNodeExecutionOutput {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface GraphNodeExecutor {
  execute(context: GraphNodeExecutionContext): Promise<GraphNodeExecutionOutput>;
}

export type GraphExecutorResolver = (agent: string) => GraphNodeExecutor | undefined;

export interface GraphNodeResult {
  nodeId: string;
  status: GraphNodeStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export interface GraphExecutionResult {
  graphId: string;
  status: 'succeeded' | 'failed';
  executionOrder: string[];
  nodes: GraphNodeResult[];
}

export class TaskGraphScheduler {
  constructor(private readonly resolver: GraphExecutorResolver) {}

  async run(graph: AgentTaskGraph, context: GraphRunContext): Promise<GraphExecutionResult> {
    this.validateGraph(graph);

    const results = new Map<string, GraphNodeResult>();
    const executionOrder: string[] = [];

    for (const node of graph.nodes) {
      results.set(node.id, {
        nodeId: node.id,
        status: 'pending',
      });
    }

    let hasPendingNodes = true;
    while (hasPendingNodes) {
      const pendingNodes = graph.nodes.filter((node) => results.get(node.id)?.status === 'pending');
      hasPendingNodes = pendingNodes.length > 0;

      if (!hasPendingNodes) {
        break;
      }

      const runnable = pendingNodes.filter((node) => this.canRunNode(node, results));

      if (runnable.length === 0) {
        let changed = false;
        for (const node of pendingNodes) {
          if (this.hasBlockedDependency(node, results)) {
            results.set(node.id, {
              nodeId: node.id,
              status: 'skipped',
              error: 'Dependency failed',
            });
            changed = true;
          }
        }

        if (!changed) {
          throw new Error('Task graph has unresolved nodes');
        }

        continue;
      }

      for (const node of runnable) {
        const nodeResult = await this.runNode(node, context, results);
        results.set(node.id, nodeResult);
        executionOrder.push(node.id);
      }
    }

    const nodeResults = graph.nodes.map((node) => results.get(node.id) as GraphNodeResult);
    const status = nodeResults.some((node) => node.status === 'failed') ? 'failed' : 'succeeded';

    return {
      graphId: graph.id,
      status,
      executionOrder,
      nodes: nodeResults,
    };
  }

  private async runNode(
    node: AgentTaskGraphNode,
    context: GraphRunContext,
    results: Map<string, GraphNodeResult>,
  ): Promise<GraphNodeResult> {
    const executor = this.resolver(node.agent);
    if (!executor) {
      return {
        nodeId: node.id,
        status: 'failed',
        error: `Specialist not found: ${node.agent}`,
      };
    }

    const dependencyResults: Record<string, Record<string, unknown> | undefined> = {};
    for (const dep of node.dependsOn ?? []) {
      const depResult = results.get(dep);
      dependencyResults[dep] = depResult?.output;
    }

    const execution = await executor.execute({
      ...context,
      node,
      dependencyResults,
    });

    if (!execution.success) {
      return {
        nodeId: node.id,
        status: 'failed',
        error: execution.error ?? 'Node execution failed',
      };
    }

    return {
      nodeId: node.id,
      status: 'succeeded',
      output: execution.output,
    };
  }

  private canRunNode(node: AgentTaskGraphNode, results: Map<string, GraphNodeResult>): boolean {
    const dependsOn = node.dependsOn ?? [];
    return dependsOn.every((id) => results.get(id)?.status === 'succeeded');
  }

  private hasBlockedDependency(node: AgentTaskGraphNode, results: Map<string, GraphNodeResult>): boolean {
    const dependsOn = node.dependsOn ?? [];
    return dependsOn.some((id) => {
      const status = results.get(id)?.status;
      return status === 'failed' || status === 'skipped';
    });
  }

  private validateGraph(graph: AgentTaskGraph): void {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (ids.has(node.id)) {
        throw new Error(`Duplicate node id: ${node.id}`);
      }
      ids.add(node.id);
    }

    for (const node of graph.nodes) {
      for (const dep of node.dependsOn ?? []) {
        if (!ids.has(dep)) {
          throw new Error(`Dependency not found: ${dep}`);
        }
      }
    }

    if (this.hasCycle(graph)) {
      throw new Error('Task graph has cycle');
    }
  }

  private hasCycle(graph: AgentTaskGraph): boolean {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const map = new Map(graph.nodes.map((node) => [node.id, node]));

    const dfs = (id: string): boolean => {
      if (visiting.has(id)) {
        return true;
      }

      if (visited.has(id)) {
        return false;
      }

      visiting.add(id);
      const node = map.get(id);
      for (const dep of node?.dependsOn ?? []) {
        if (dfs(dep)) {
          return true;
        }
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const node of graph.nodes) {
      if (dfs(node.id)) {
        return true;
      }
    }

    return false;
  }
}
