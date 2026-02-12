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

export interface RetryBackoffOptions {
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

export interface GraphFailureRule {
  retryable: boolean;
  errorCodes?: string[];
  messageIncludes?: string[];
  agents?: string[];
  nodeIds?: string[];
}

export interface GraphFailurePolicyTemplate {
  defaultRetryable?: boolean;
  rules?: GraphFailureRule[];
}

export interface GraphSnapshotCleanupPolicy {
  maxSnapshotsPerTask?: number;
  staleBefore?: string;
}

export interface GraphSnapshotCleanupResult {
  deletedCount: number;
  deletedIds: string[];
}

export interface GraphRunOptions {
  maxParallel?: number;
  timeoutMs?: number;
  shouldCancel?: () => boolean;
  defaultRetry?: {
    maxAttempts: number;
    backoff?: RetryBackoffOptions;
  };
  sleep?: (ms: number) => Promise<void>;
  snapshotStore?: GraphSnapshotStore;
  snapshotId?: string;
  failurePolicy?: GraphFailurePolicyTemplate;
}

export interface GraphNodeExecutionContext extends GraphRunContext {
  node: AgentTaskGraphNode;
  dependencyResults: Record<string, Record<string, unknown> | undefined>;
}

export interface GraphNodeExecutionOutput {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
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

export type GraphFailureClass = 'retryable' | 'non_retryable';

export interface GraphNodeResult {
  nodeId: string;
  status: GraphNodeStatus;
  output?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  attempts?: number;
  compensation?: GraphNodeCompensationResult;
  failureClass?: GraphFailureClass;
}

export interface GraphExecutionResult {
  graphId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  executionOrder: string[];
  nodes: GraphNodeResult[];
}

export type GraphSnapshotStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export interface GraphExecutionSnapshot {
  id: string;
  graphId: string;
  graphSignature?: string;
  graphDefinition?: AgentTaskGraph;
  taskId: string;
  sessionId: string;
  status: GraphSnapshotStatus;
  executionOrder: string[];
  nodes: GraphNodeResult[];
  createdAt: string;
  updatedAt: string;
}

export interface GraphSnapshotStore {
  save(snapshot: GraphExecutionSnapshot): Promise<void>;
  get(id: string): Promise<GraphExecutionSnapshot | null>;
  listByTask(taskId: string): Promise<GraphExecutionSnapshot[]>;
  cleanup(policy: GraphSnapshotCleanupPolicy): Promise<GraphSnapshotCleanupResult>;
}

interface InternalNodeResult extends GraphNodeResult {
  terminalReason?: 'timeout';
}

interface InternalRunState {
  results: Map<string, GraphNodeResult>;
  executionOrder: string[];
  createdAt: string;
}

interface NormalizedGraphRunOptions {
  maxParallel: number;
  timeoutMs: number;
  shouldCancel: () => boolean;
  defaultRetry: {
    maxAttempts: number;
    backoff: Required<RetryBackoffOptions>;
  };
  sleep: (ms: number) => Promise<void>;
  snapshotStore?: GraphSnapshotStore;
  snapshotId?: string;
  failurePolicy: {
    defaultRetryable: boolean;
    rules: GraphFailureRule[];
  };
}

interface GraphFailureSignal {
  error: string;
  errorCode?: string;
  node: AgentTaskGraphNode;
}

const defaultSleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

function cloneGraph(graph: AgentTaskGraph): AgentTaskGraph {
  return {
    id: graph.id,
    nodes: graph.nodes.map((node) => ({
      ...node,
      dependsOn: node.dependsOn ? [...node.dependsOn] : undefined,
      input: node.input ? { ...node.input } : undefined,
      retry: node.retry ? { ...node.retry } : undefined,
    })),
  };
}

export function buildGraphFromSnapshot(snapshot: GraphExecutionSnapshot): AgentTaskGraph | null {
  if (!snapshot.graphDefinition) {
    return null;
  }

  return cloneGraph(snapshot.graphDefinition);
}

export class TaskGraphScheduler {
  constructor(private readonly resolver: GraphExecutorResolver) {}

  async run(graph: AgentTaskGraph, context: GraphRunContext, options: GraphRunOptions = {}): Promise<GraphExecutionResult> {
    this.validateGraph(graph);

    const state: InternalRunState = {
      results: new Map<string, GraphNodeResult>(),
      executionOrder: [],
      createdAt: new Date().toISOString(),
    };

    for (const node of graph.nodes) {
      state.results.set(node.id, {
        nodeId: node.id,
        status: 'pending',
      });
    }

    return this.runInternal(graph, context, state, options);
  }

  async resume(
    graph: AgentTaskGraph,
    context: GraphRunContext,
    snapshot: GraphExecutionSnapshot,
    options: GraphRunOptions = {},
  ): Promise<GraphExecutionResult> {
    this.validateGraph(graph);
    this.assertSnapshotCompatible(graph, context, snapshot);

    const state: InternalRunState = {
      results: new Map<string, GraphNodeResult>(),
      executionOrder: [...snapshot.executionOrder],
      createdAt: snapshot.createdAt,
    };

    const snapshotMap = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));

    for (const node of graph.nodes) {
      const snapshotNode = snapshotMap.get(node.id);
      if (!snapshotNode) {
        state.results.set(node.id, {
          nodeId: node.id,
          status: 'pending',
        });
        continue;
      }

      const shouldRecoverAsPending =
        snapshot.status === 'canceled' &&
        snapshotNode.status === 'skipped' &&
        (snapshotNode.error === 'Graph canceled' || snapshotNode.error === 'Graph timeout');

      state.results.set(node.id, shouldRecoverAsPending ? { nodeId: node.id, status: 'pending' } : snapshotNode);
    }

    return this.runInternal(graph, context, state, {
      ...options,
      snapshotId: options.snapshotId ?? snapshot.id,
    });
  }

  private async runInternal(
    graph: AgentTaskGraph,
    context: GraphRunContext,
    state: InternalRunState,
    options: GraphRunOptions,
  ): Promise<GraphExecutionResult> {
    const normalizedOptions = this.normalizeOptions(options);
    const deadlineAt = normalizedOptions.timeoutMs ? Date.now() + normalizedOptions.timeoutMs : undefined;

    await this.persistSnapshot(graph, context, state, normalizedOptions, 'running');

    let hasPendingNodes = true;
    while (hasPendingNodes) {
      const pendingNodes = graph.nodes.filter((node) => state.results.get(node.id)?.status === 'pending');
      hasPendingNodes = pendingNodes.length > 0;

      if (!hasPendingNodes) {
        break;
      }

      if (this.isCanceled(normalizedOptions, deadlineAt)) {
        this.markPendingAsSkipped(pendingNodes, state.results, this.getCancelReason(normalizedOptions, deadlineAt));
        await this.persistSnapshot(graph, context, state, normalizedOptions, 'canceled');
        return this.buildResult(graph, state.executionOrder, state.results, 'canceled');
      }

      const runnable = pendingNodes.filter((node) => this.canRunNode(node, state.results));

      if (runnable.length === 0) {
        let changed = false;
        for (const node of pendingNodes) {
          if (this.hasBlockedDependency(node, state.results)) {
            state.results.set(node.id, {
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

        await this.persistSnapshot(graph, context, state, normalizedOptions, 'running');
        continue;
      }

      for (let index = 0; index < runnable.length; index += normalizedOptions.maxParallel) {
        const batch = runnable.slice(index, index + normalizedOptions.maxParallel);
        const batchResults = await Promise.all(
          batch.map((node) => this.runNode(node, context, state.results, normalizedOptions, deadlineAt)),
        );

        for (let resultIndex = 0; resultIndex < batchResults.length; resultIndex += 1) {
          const node = batch[resultIndex];
          const nodeResult = batchResults[resultIndex];

          state.results.set(node.id, nodeResult);
          state.executionOrder.push(node.id);

          if (nodeResult.terminalReason === 'timeout') {
            const remainPending = graph.nodes.filter((item) => state.results.get(item.id)?.status === 'pending');
            this.markPendingAsSkipped(remainPending, state.results, 'Graph timeout');
            await this.persistSnapshot(graph, context, state, normalizedOptions, 'canceled');
            return this.buildResult(graph, state.executionOrder, state.results, 'canceled');
          }
        }

        await this.persistSnapshot(graph, context, state, normalizedOptions, 'running');

        if (this.isCanceled(normalizedOptions, deadlineAt)) {
          const remainPending = graph.nodes.filter((item) => state.results.get(item.id)?.status === 'pending');
          this.markPendingAsSkipped(remainPending, state.results, this.getCancelReason(normalizedOptions, deadlineAt));
          await this.persistSnapshot(graph, context, state, normalizedOptions, 'canceled');
          return this.buildResult(graph, state.executionOrder, state.results, 'canceled');
        }
      }
    }

    const status = graph.nodes.some((node) => state.results.get(node.id)?.status === 'failed') ? 'failed' : 'succeeded';
    await this.persistSnapshot(graph, context, state, normalizedOptions, status);
    return this.buildResult(graph, state.executionOrder, state.results, status);
  }

  private async runNode(
    node: AgentTaskGraphNode,
    context: GraphRunContext,
    results: Map<string, GraphNodeResult>,
    options: NormalizedGraphRunOptions,
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
        failureClass: 'non_retryable',
      };
    }

    const maxAttempts = Math.max(1, node.retry?.maxAttempts ?? options.defaultRetry.maxAttempts);
    let attempts = 0;
    let lastError = 'Node execution failed';
    let lastErrorCode: string | undefined;
    let lastFailureClass: GraphFailureClass = options.failurePolicy.defaultRetryable ? 'retryable' : 'non_retryable';

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
        lastErrorCode = execution.errorCode;
        lastFailureClass = this.classifyFailure(
          {
            error: lastError,
            errorCode: execution.errorCode,
            node,
          },
          options.failurePolicy,
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'Graph timeout') {
          return {
            nodeId: node.id,
            status: 'failed',
            error: 'Graph timeout',
            attempts,
            terminalReason: 'timeout',
            failureClass: 'non_retryable',
          };
        }

        const normalizedError = this.normalizeError(error);
        lastError = normalizedError.message;
        lastErrorCode = normalizedError.code;
        lastFailureClass = this.classifyFailure(
          {
            error: lastError,
            errorCode: lastErrorCode,
            node,
          },
          options.failurePolicy,
        );
      }

      if (lastFailureClass === 'non_retryable') {
        break;
      }

      if (attempts < maxAttempts) {
        const waitMs = this.computeBackoffDelay(attempts, options.defaultRetry.backoff);
        await options.sleep(waitMs);
      }
    }

    const compensation = await this.runCompensation(node, context, dependencyResults, deadlineAt);

    return {
      nodeId: node.id,
      status: 'failed',
      error: lastError,
      errorCode: lastErrorCode,
      attempts,
      compensation,
      failureClass: lastFailureClass,
    };
  }

  private normalizeError(error: unknown): { message: string; code?: string } {
    if (error instanceof Error) {
      const withCode = error as Error & { code?: unknown };
      return {
        message: error.message,
        code: typeof withCode.code === 'string' ? withCode.code : undefined,
      };
    }

    if (error && typeof error === 'object') {
      const maybe = error as { message?: unknown; code?: unknown };
      return {
        message: typeof maybe.message === 'string' ? maybe.message : 'Node execution failed',
        code: typeof maybe.code === 'string' ? maybe.code : undefined,
      };
    }

    return {
      message: 'Node execution failed',
    };
  }

  private classifyFailure(
    signal: GraphFailureSignal,
    policy: NormalizedGraphRunOptions['failurePolicy'],
  ): GraphFailureClass {
    for (const rule of policy.rules) {
      if (this.matchFailureRule(rule, signal)) {
        return rule.retryable ? 'retryable' : 'non_retryable';
      }
    }

    return policy.defaultRetryable ? 'retryable' : 'non_retryable';
  }

  private matchFailureRule(rule: GraphFailureRule, signal: GraphFailureSignal): boolean {
    if (rule.nodeIds?.length && !rule.nodeIds.includes(signal.node.id)) {
      return false;
    }

    if (rule.agents?.length && !rule.agents.includes(signal.node.agent)) {
      return false;
    }

    if (rule.errorCodes?.length) {
      if (!signal.errorCode || !rule.errorCodes.includes(signal.errorCode)) {
        return false;
      }
    }

    if (rule.messageIncludes?.length) {
      const message = signal.error.toLowerCase();
      const matched = rule.messageIncludes.some((token) => message.includes(token.toLowerCase()));
      if (!matched) {
        return false;
      }
    }

    return true;
  }

  private computeBackoffDelay(attempt: number, backoff: Required<RetryBackoffOptions>): number {
    const exponent = Math.max(0, attempt - 1);
    const raw = backoff.baseDelayMs * backoff.factor ** exponent;
    const withMax = Math.min(raw, backoff.maxDelayMs);

    if (backoff.jitterMs <= 0) {
      return Math.round(withMax);
    }

    const jitter = Math.random() * backoff.jitterMs;
    return Math.round(withMax + jitter);
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

  private normalizeOptions(options: GraphRunOptions): NormalizedGraphRunOptions {
    return {
      maxParallel: Math.max(1, options.maxParallel ?? 1),
      timeoutMs: Math.max(0, options.timeoutMs ?? 0),
      shouldCancel: options.shouldCancel ?? (() => false),
      defaultRetry: {
        maxAttempts: Math.max(1, options.defaultRetry?.maxAttempts ?? 1),
        backoff: {
          baseDelayMs: Math.max(0, options.defaultRetry?.backoff?.baseDelayMs ?? 0),
          factor: Math.max(1, options.defaultRetry?.backoff?.factor ?? 2),
          maxDelayMs: Math.max(0, options.defaultRetry?.backoff?.maxDelayMs ?? Number.MAX_SAFE_INTEGER),
          jitterMs: Math.max(0, options.defaultRetry?.backoff?.jitterMs ?? 0),
        },
      },
      sleep: options.sleep ?? defaultSleep,
      snapshotStore: options.snapshotStore,
      snapshotId: options.snapshotId,
      failurePolicy: {
        defaultRetryable: options.failurePolicy?.defaultRetryable ?? true,
        rules: [...(options.failurePolicy?.rules ?? [])],
      },
    };
  }

  private isCanceled(options: NormalizedGraphRunOptions, deadlineAt?: number): boolean {
    if (options.shouldCancel()) {
      return true;
    }

    if (!deadlineAt) {
      return false;
    }

    return Date.now() > deadlineAt;
  }

  private getCancelReason(options: NormalizedGraphRunOptions, deadlineAt?: number): string {
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

  private async persistSnapshot(
    graph: AgentTaskGraph,
    context: GraphRunContext,
    state: InternalRunState,
    options: NormalizedGraphRunOptions,
    status: GraphSnapshotStatus,
  ): Promise<void> {
    if (!options.snapshotStore) {
      return;
    }

    const snapshotId = options.snapshotId ?? `${context.taskId}:${graph.id}`;
    const now = new Date().toISOString();

    await options.snapshotStore.save({
      id: snapshotId,
      graphId: graph.id,
      graphSignature: this.computeGraphSignature(graph),
      graphDefinition: cloneGraph(graph),
      taskId: context.taskId,
      sessionId: context.sessionId,
      status,
      executionOrder: [...state.executionOrder],
      nodes: graph.nodes.map((node) => {
        const value = state.results.get(node.id);
        return value
          ? { ...value }
          : {
              nodeId: node.id,
              status: 'pending',
            };
      }),
      createdAt: state.createdAt,
      updatedAt: now,
    });
  }

  private computeGraphSignature(graph: AgentTaskGraph): string {
    const normalizedNodes = graph.nodes
      .map((node) => ({
        id: node.id,
        agent: node.agent,
        dependsOn: [...(node.dependsOn ?? [])].sort(),
        retryMaxAttempts: node.retry?.maxAttempts ?? null,
        compensationAgent: node.compensationAgent ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

    return JSON.stringify({
      graphId: graph.id,
      nodes: normalizedNodes,
    });
  }

  private assertSnapshotCompatible(graph: AgentTaskGraph, context: GraphRunContext, snapshot: GraphExecutionSnapshot): void {
    if (snapshot.graphId !== graph.id) {
      throw new Error('Snapshot graphId mismatch');
    }

    if (snapshot.taskId !== context.taskId) {
      throw new Error('Snapshot taskId mismatch');
    }

    if (snapshot.sessionId !== context.sessionId) {
      throw new Error('Snapshot sessionId mismatch');
    }

    const currentSignature = this.computeGraphSignature(graph);

    if (snapshot.graphSignature) {
      if (snapshot.graphSignature !== currentSignature) {
        throw new Error('Snapshot graph structure mismatch');
      }
      return;
    }

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const snapshotNodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));

    if (nodeIds.size !== snapshotNodeIds.size) {
      throw new Error('Snapshot graph structure mismatch');
    }

    for (const id of nodeIds) {
      if (!snapshotNodeIds.has(id)) {
        throw new Error('Snapshot graph structure mismatch');
      }
    }
  }
}
