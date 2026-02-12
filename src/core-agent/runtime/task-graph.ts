export type GraphNodeStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface AgentTaskGraphNode {
  id: string;
  agent: string;
  dependsOn?: string[];
  input?: Record<string, unknown>;
  retry?: {
    maxAttempts: number;
  };
  compensationAgent?: string;
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

export interface GraphRunOptions {
  maxParallel?: number;
  timeoutMs?: number;
  shouldCancel?: () => boolean;
  defaultRetry?: {
    maxAttempts: number;
  };
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

export interface GraphNodeCompensationResult {
  status: 'succeeded' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
}

export interface GraphNodeResult {
  nodeId: string;
  status: GraphNodeStatus;
  output?: Record<string, unknown>;
  error?: string;
  attempts?: number;
  compensation?: GraphNodeCompensationResult;
}

export interface GraphExecutionResult {
  graphId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  executionOrder: string[];
  nodes: GraphNodeResult[];
}

interface InternalNodeResult extends GraphNodeResult {
  terminalReason?: 'timeout';
}

export class TaskGraphScheduler {
  constructor(private readonly resolver: GraphExecutorResolver) {}

  async run(graph: AgentTaskGraph, context: GraphRunContext, options: GraphRunOptions = {}): Promise<GraphExecutionResult> {
    this.validateGraph(graph);

    const normalizedOptions = this.normalizeOptions(options);
    const deadlineAt = normalizedOptions.timeoutMs ? Date.now() + normalizedOptions.timeoutMs : undefined;

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

      if (this.isCanceled(normalizedOptions, deadlineAt)) {
        this.markPendingAsSkipped(pendingNodes, results, this.getCancelReason(normalizedOptions, deadlineAt));
        return this.buildResult(graph, executionOrder, results, 'canceled');
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

      for (let index = 0; index < runnable.length; index += normalizedOptions.maxParallel) {
        const batch = runnable.slice(index, index + normalizedOptions.maxParallel);
        const batchResults = await Promise.all(
          batch.map((node) => this.runNode(node, context, results, normalizedOptions, deadlineAt)),
        );

        for (let resultIndex = 0; resultIndex < batchResults.length; resultIndex += 1) {
          const node = batch[resultIndex];
          const nodeResult = batchResults[resultIndex];

          results.set(node.id, nodeResult);
          executionOrder.push(node.id);

          if (nodeResult.terminalReason === 'timeout') {
            const remainPending = graph.nodes.filter((item) => results.get(item.id)?.status === 'pending');
            this.markPendingAsSkipped(remainPending, results, 'Graph timeout');
            return this.buildResult(graph, executionOrder, results, 'canceled');
          }
        }

        if (this.isCanceled(normalizedOptions, deadlineAt)) {
          const remainPending = graph.nodes.filter((item) => results.get(item.id)?.status === 'pending');
          this.markPendingAsSkipped(remainPending, results, this.getCancelReason(normalizedOptions, deadlineAt));
          return this.buildResult(graph, executionOrder, results, 'canceled');
        }
      }
    }

    const status = graph.nodes.some((node) => results.get(node.id)?.status === 'failed') ? 'failed' : 'succeeded';
    return this.buildResult(graph, executionOrder, results, status);
  }

  private async runNode(
    node: AgentTaskGraphNode,
    context: GraphRunContext,
    results: Map<string, GraphNodeResult>,
    options: Required<GraphRunOptions>,
    deadlineAt?: number,
  ): Promise<InternalNodeResult> {
    const dependencyResults: Record<string, Record<string, unknown> | undefined> = {};
    for (const dep of node.dependsOn ?? []) {
      const depResult = results.get(dep);
      dependencyResults[dep] = depResult?.output;
    }

    const executor = this.resolver(node.agent);
    if (!executor) {
      return {
        nodeId: node.id,
        status: 'failed',
        error: `Specialist not found: ${node.agent}`,
        attempts: 1,
      };
    }

    const maxAttempts = Math.max(1, node.retry?.maxAttempts ?? options.defaultRetry.maxAttempts);
    let attempts = 0;
    let lastError = 'Node execution failed';

    while (attempts < maxAttempts) {
      attempts += 1;

      try {
        const execution = await this.executeWithTimeout(
          executor.execute({
            ...context,
            node,
            dependencyResults,
          }),
          deadlineAt,
        );

        if (execution.success) {
          return {
            nodeId: node.id,
            status: 'succeeded',
            output: execution.output,
            attempts,
          };
        }

        lastError = execution.error ?? 'Node execution failed';
      } catch (error) {
        if (error instanceof Error && error.message === 'Graph timeout') {
          return {
            nodeId: node.id,
            status: 'failed',
            error: 'Graph timeout',
            attempts,
            terminalReason: 'timeout',
          };
        }

        lastError = error instanceof Error ? error.message : 'Node execution failed';
      }
    }

    const compensation = await this.runCompensation(node, context, dependencyResults, deadlineAt);

    return {
      nodeId: node.id,
      status: 'failed',
      error: lastError,
      attempts,
      compensation,
    };
  }

  private async runCompensation(
    node: AgentTaskGraphNode,
    context: GraphRunContext,
    dependencyResults: Record<string, Record<string, unknown> | undefined>,
    deadlineAt?: number,
  ): Promise<GraphNodeCompensationResult | undefined> {
    if (!node.compensationAgent) {
      return undefined;
    }

    const executor = this.resolver(node.compensationAgent);
    if (!executor) {
      return {
        status: 'failed',
        error: `Compensation specialist not found: ${node.compensationAgent}`,
      };
    }

    try {
      const result = await this.executeWithTimeout(
        executor.execute({
          ...context,
          node,
          dependencyResults,
        }),
        deadlineAt,
      );

      if (!result.success) {
        return {
          status: 'failed',
          error: result.error ?? 'Compensation failed',
        };
      }

      return {
        status: 'succeeded',
        output: result.output,
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Compensation failed',
      };
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, deadlineAt?: number): Promise<T> {
    if (!deadlineAt) {
      return promise;
    }

    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error('Graph timeout');
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Graph timeout'));
      }, remainingMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
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

  private normalizeOptions(options: GraphRunOptions): Required<GraphRunOptions> {
    return {
      maxParallel: Math.max(1, options.maxParallel ?? 1),
      timeoutMs: options.timeoutMs ?? 0,
      shouldCancel: options.shouldCancel ?? (() => false),
      defaultRetry: {
        maxAttempts: Math.max(1, options.defaultRetry?.maxAttempts ?? 1),
      },
    };
  }

  private isCanceled(options: Required<GraphRunOptions>, deadlineAt?: number): boolean {
    if (options.shouldCancel()) {
      return true;
    }

    if (!deadlineAt) {
      return false;
    }

    return Date.now() > deadlineAt;
  }

  private getCancelReason(options: Required<GraphRunOptions>, deadlineAt?: number): string {
    if (options.shouldCancel()) {
      return 'Graph canceled';
    }

    if (deadlineAt && Date.now() > deadlineAt) {
      return 'Graph timeout';
    }

    return 'Graph canceled';
  }

  private markPendingAsSkipped(
    pendingNodes: AgentTaskGraphNode[],
    results: Map<string, GraphNodeResult>,
    reason: string,
  ): void {
    for (const node of pendingNodes) {
      results.set(node.id, {
        nodeId: node.id,
        status: 'skipped',
        error: reason,
      });
    }
  }

  private buildResult(
    graph: AgentTaskGraph,
    executionOrder: string[],
    results: Map<string, GraphNodeResult>,
    status: 'succeeded' | 'failed' | 'canceled',
  ): GraphExecutionResult {
    return {
      graphId: graph.id,
      status,
      executionOrder,
      nodes: graph.nodes.map((node) => results.get(node.id) as GraphNodeResult),
    };
  }
}
