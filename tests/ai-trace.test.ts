import { describe, it, expect } from 'vitest';
import { AITraceCollector } from '../src/ai/services/trace';

describe('AITraceCollector', () => {
  it('记录并输出 trace step', () => {
    const collector = new AITraceCollector('summarize', 'test-task-1');
    collector.addStep({ type: 'llm_call', input: 'prompt...', output: 'result...', durationMs: 500, tokenCount: 150 });
    const trace = collector.finalize();

    expect(trace.taskType).toBe('summarize');
    expect(trace.steps).toHaveLength(1);
    expect(trace.totalTokens).toBe(150);
    expect(trace.totalDurationMs).toBeGreaterThan(0);
  });

  it('累计多步 token', () => {
    const collector = new AITraceCollector('chat', 'test-2');
    collector.addStep({ type: 'llm_call', input: '', output: '', durationMs: 100, tokenCount: 50 });
    collector.addStep({ type: 'tool_call', input: '', output: '', durationMs: 200, tokenCount: 30 });
    const trace = collector.finalize();

    expect(trace.steps).toHaveLength(2);
    expect(trace.totalTokens).toBe(80);
  });
});
