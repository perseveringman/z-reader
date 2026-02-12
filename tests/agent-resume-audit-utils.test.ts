import { describe, expect, it } from 'vitest';

import type { AgentReplayEvent } from '../src/shared/types';
import { extractResumeAuditEntries } from '../src/renderer/utils/agent-resume-audit';

describe('p13 resume audit utils', () => {
  it('应仅提取并解析 graph.resume.executed 事件', () => {
    const events: AgentReplayEvent[] = [
      {
        id: 'ev-ignore',
        taskId: 'task-1',
        eventType: 'TaskRunning',
        payloadJson: {},
        occurredAt: '2026-02-12T10:00:00.000Z',
      },
      {
        id: 'ev-resume-ok',
        taskId: 'task-1',
        eventType: 'graph.resume.executed',
        payloadJson: {
          mode: 'safe',
          status: 'succeeded',
          riskLevel: 'medium',
          sideEffectFlag: false,
          specialist: {
            hitRate: 1,
            hitCount: 2,
            missCount: 0,
            missingAgents: [],
          },
          pendingNodeIds: ['n2', 'n3'],
          failedNodeIds: [],
        },
        occurredAt: '2026-02-12T10:00:02.000Z',
      },
      {
        id: 'ev-resume-fail',
        taskId: 'task-1',
        eventType: 'graph.resume.executed',
        payloadJson: {
          mode: 'delegate',
          status: 'failed',
          riskLevel: 'high',
          specialist: {
            hitRate: 0,
            hitCount: 0,
            missCount: 1,
            missingAgents: ['writer'],
          },
          pendingNodeIds: ['n2'],
          failedNodeIds: ['n2'],
        },
        occurredAt: '2026-02-12T10:00:03.000Z',
      },
      {
        id: 'ev-resume-invalid',
        taskId: 'task-1',
        eventType: 'graph.resume.executed',
        payloadJson: {
          mode: 'invalid',
          status: 'invalid',
        },
        occurredAt: '2026-02-12T10:00:04.000Z',
      },
    ];

    const entries = extractResumeAuditEntries(events);

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('ev-resume-fail');
    expect(entries[0].mode).toBe('delegate');
    expect(entries[0].status).toBe('failed');
    expect(entries[0].sideEffectFlag).toBe(true);
    expect(entries[0].specialistMissCount).toBe(1);
    expect(entries[0].missingAgents).toEqual(['writer']);

    expect(entries[1].id).toBe('ev-resume-ok');
    expect(entries[1].mode).toBe('safe');
    expect(entries[1].specialistHitRate).toBe(1);
    expect(entries[1].pendingNodeIds).toEqual(['n2', 'n3']);
  });
});
