import { describe, expect, it } from 'vitest';

import type { AgentReplayEvent } from '../src/shared/types';
import {
  aggregateResumeAuditByTask,
  buildResumeAuditReport,
  detectResumeAuditAlerts,
  extractResumeAuditEntries,
  filterResumeAuditEntries,
  normalizeTaskIdsInput,
  selectPrimaryTaskId,
  summarizeResumeAuditEntries,
} from '../src/renderer/utils/agent-resume-audit';

describe('p17 resume audit utils', () => {
  it('应解析并去重多 taskId 输入', () => {
    expect(normalizeTaskIdsInput('')).toEqual([]);
    expect(
      normalizeTaskIdsInput(` task-a , task-b
 task-a；task-c ; task-b `),
    ).toEqual(['task-a', 'task-b', 'task-c']);
  });

  it('应支持选取首个 task 作为快照查询目标', () => {
    expect(selectPrimaryTaskId('')).toEqual({
      taskIds: [],
      taskId: null,
      hasMultiple: false,
    });

    expect(selectPrimaryTaskId('task-a, task-b')).toEqual({
      taskIds: ['task-a', 'task-b'],
      taskId: 'task-a',
      hasMultiple: true,
    });
  });

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

  it('应支持筛选、聚合、告警、task排行与摘要导出', () => {
    const entries = [
      {
        id: '1',
        taskId: 'task-a',
        occurredAt: '2026-02-12T10:00:03.000Z',
        mode: 'delegate' as const,
        status: 'failed' as const,
        riskLevel: 'high',
        sideEffectFlag: true,
        specialistHitRate: 0,
        specialistHitCount: 0,
        specialistMissCount: 2,
        missingAgents: ['writer', 'summarizer'],
        pendingNodeIds: ['n2'],
        failedNodeIds: ['n2'],
      },
      {
        id: '2',
        taskId: 'task-a',
        occurredAt: '2026-02-12T10:00:02.000Z',
        mode: 'safe' as const,
        status: 'succeeded' as const,
        riskLevel: 'low',
        sideEffectFlag: false,
        specialistHitRate: 1,
        specialistHitCount: 1,
        specialistMissCount: 0,
        missingAgents: [],
        pendingNodeIds: [],
        failedNodeIds: [],
      },
      {
        id: '3',
        taskId: 'task-b',
        occurredAt: '2026-02-12T10:00:01.000Z',
        mode: 'delegate' as const,
        status: 'succeeded' as const,
        riskLevel: 'medium',
        sideEffectFlag: true,
        specialistHitRate: 0.5,
        specialistHitCount: 1,
        specialistMissCount: 1,
        missingAgents: ['writer'],
        pendingNodeIds: [],
        failedNodeIds: [],
      },
    ];

    const filtered = filterResumeAuditEntries(entries, {
      mode: 'delegate',
      status: 'all',
    });

    expect(filtered).toHaveLength(2);

    const summary = summarizeResumeAuditEntries(filtered);
    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.sideEffectRate).toBe(1);
    expect(summary.avgHitRate).toBe(0.25);
    expect(summary.totalMissCount).toBe(3);
    expect(summary.topMissingAgents).toEqual(['writer', 'summarizer']);

    const taskRanks = aggregateResumeAuditByTask(entries);
    expect(taskRanks[0].taskId).toBe('task-a');
    expect(taskRanks[0].failed).toBe(1);

    const alerts = detectResumeAuditAlerts(filtered, summary);
    expect(alerts.some((item) => item.id === 'missing-specialists')).toBe(true);
    expect(alerts.some((item) => item.id === 'side-effect-failure')).toBe(true);

    const report = buildResumeAuditReport(filtered, summary, alerts);
    expect(report).toContain('Agent 恢复审计摘要');
    expect(report).toContain('总量: 2');
    expect(report).toContain('副作用占比: 100.0%');
    expect(report).toContain('Top Missing Agents: writer, summarizer');
    expect(report).toContain('Top Risk Tasks:');
    expect(report).toContain('告警:');
    expect(report).toContain('[critical] 副作用恢复存在失败');
  });
});
