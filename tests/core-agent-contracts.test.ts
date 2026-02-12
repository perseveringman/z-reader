import { describe, expect, it } from 'vitest';

import {
  CORE_AGENT_CONTRACT_VERSION,
  type AgentTaskRequest,
  type IApprovalGateway,
  type IBusinessCapabilityProvider,
  type IEventBus,
  type IExecutor,
  type IMemoryStore,
  type IPlanner,
  type IPolicyEngine,
  type IStrategyRouter,
  type ITool,
  type IToolRegistry,
  type IToolSandbox,
  type ITraceStore,
  type IVectorStore,
  type IRetriever,
} from '../src/core-agent/contracts';

describe('core-agent contracts', () => {
  it('暴露核心接口契约', () => {
    type ContractChecklist = {
      router: IStrategyRouter;
      planner: IPlanner;
      executor: IExecutor;
      memory: IMemoryStore;
      vector: IVectorStore;
      retriever: IRetriever;
      tool: ITool;
      toolRegistry: IToolRegistry;
      toolSandbox: IToolSandbox;
      policy: IPolicyEngine;
      approval: IApprovalGateway;
      trace: ITraceStore;
      events: IEventBus;
      businessProvider: IBusinessCapabilityProvider;
    };

    const requestShape: AgentTaskRequest = {
      id: 'task-1',
      sessionId: 'session-1',
      instruction: '请总结输入内容',
      metadata: {},
    };

    expect(CORE_AGENT_CONTRACT_VERSION).toBe('2026-02-12');
    expect(requestShape.id).toBe('task-1');
    expect(requestShape.sessionId).toBe('session-1');
    expect(requestShape.instruction).toContain('总结');

    const marker: ContractChecklist | null = null;
    expect(marker).toBeNull();
  });
});
