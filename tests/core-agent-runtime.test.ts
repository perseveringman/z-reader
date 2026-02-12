import { describe, expect, it } from 'vitest';

import { AdaptiveStrategyRouter, AgentRuntime, InMemoryEventBus, NoopExecutor, NoopPlanner } from '../src/core-agent';

describe('core-agent runtime minimal flow', () => {
  it('默认按复杂度自适应选择 react', async () => {
    const router = new AdaptiveStrategyRouter();
    const signal = await router.classify({
      id: 'task-simple',
      sessionId: 'session-1',
      instruction: '总结这段文本',
    });

    const mode = await router.chooseMode(
      {
        id: 'task-simple',
        sessionId: 'session-1',
        instruction: '总结这段文本',
      },
      signal,
    );

    expect(mode).toBe('react');
  });

  it('支持 force_mode 强制策略', async () => {
    const router = new AdaptiveStrategyRouter();
    const signal = await router.classify({
      id: 'task-forced',
      sessionId: 'session-2',
      instruction: '请一步一步生成并执行多阶段方案',
      forceMode: 'plan_execute',
    });

    const mode = await router.chooseMode(
      {
        id: 'task-forced',
        sessionId: 'session-2',
        instruction: '请一步一步生成并执行多阶段方案',
        forceMode: 'plan_execute',
      },
      signal,
    );

    expect(mode).toBe('plan_execute');
  });

  it('runtime 触发核心任务事件', async () => {
    const eventBus = new InMemoryEventBus();
    const events: string[] = [];

    eventBus.subscribe('TaskQueued', (event) => {
      events.push(event.type);
    });
    eventBus.subscribe('TaskRunning', (event) => {
      events.push(event.type);
    });
    eventBus.subscribe('TaskSucceeded', (event) => {
      events.push(event.type);
    });

    const runtime = new AgentRuntime(new AdaptiveStrategyRouter(), new NoopPlanner(), new NoopExecutor(), eventBus);

    const result = await runtime.run({
      id: 'task-runtime',
      sessionId: 'session-3',
      instruction: '输出 hello',
    });

    expect(result.status).toBe('succeeded');
    expect(events).toEqual(['TaskQueued', 'TaskRunning', 'TaskSucceeded']);
  });
});
