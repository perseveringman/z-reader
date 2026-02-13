import type { AgentReplayEvent } from '../../shared/types';

export interface ResumeAuditEntry {
  id: string;
  taskId: string;
  occurredAt: string;
  mode: 'safe' | 'delegate';
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  riskLevel: string;
  sideEffectFlag: boolean;
  specialistHitRate: number;
  specialistHitCount: number;
  specialistMissCount: number;
  missingAgents: string[];
  pendingNodeIds: string[];
  failedNodeIds: string[];
}

export type ResumeAuditModeFilter = 'all' | ResumeAuditEntry['mode'];
export type ResumeAuditStatusFilter = 'all' | ResumeAuditEntry['status'];

export interface ResumeAuditFilter {
  mode?: ResumeAuditModeFilter;
  status?: ResumeAuditStatusFilter;
}

export interface ResumeAuditSummary {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  canceled: number;
  successRate: number;
  sideEffectCount: number;
  sideEffectRate: number;
  avgHitRate: number;
  totalHitCount: number;
  totalMissCount: number;
  topMissingAgents: string[];
}

export type ResumeAuditAlertLevel = 'info' | 'warning' | 'critical';

export interface ResumeAuditAlert {
  id: string;
  level: ResumeAuditAlertLevel;
  title: string;
  detail: string;
}

export interface ResumeAuditTaskAggregate {
  taskId: string;
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  avgHitRate: number;
  sideEffectFailures: number;
  lastOccurredAt: string;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

function asMode(value: unknown): 'safe' | 'delegate' | null {
  if (value === 'safe' || value === 'delegate') {
    return value;
  }

  return null;
}

function asStatus(value: unknown): 'running' | 'succeeded' | 'failed' | 'canceled' | null {
  if (value === 'running' || value === 'succeeded' || value === 'failed' || value === 'canceled') {
    return value;
  }

  return null;
}

export function normalizeTaskIdsInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,;，；]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export interface PrimaryTaskSelection {
  taskIds: string[];
  taskId: string | null;
  hasMultiple: boolean;
}

export function selectPrimaryTaskId(input: string): PrimaryTaskSelection {
  const taskIds = normalizeTaskIdsInput(input);
  return {
    taskIds,
    taskId: taskIds.length > 0 ? taskIds[0] : null,
    hasMultiple: taskIds.length > 1,
  };
}

export function extractResumeAuditEntries(events: AgentReplayEvent[]): ResumeAuditEntry[] {
  const entries: ResumeAuditEntry[] = [];

  for (const event of events) {
    if (event.eventType !== 'graph.resume.executed') {
      continue;
    }

    const mode = asMode(event.payloadJson?.mode);
    const status = asStatus(event.payloadJson?.status);

    if (!mode || !status) {
      continue;
    }

    const specialistRaw =
      event.payloadJson?.specialist && typeof event.payloadJson.specialist === 'object'
        ? (event.payloadJson.specialist as Record<string, unknown>)
        : {};

    entries.push({
      id: event.id,
      taskId: event.taskId,
      occurredAt: event.occurredAt,
      mode,
      status,
      riskLevel: typeof event.payloadJson?.riskLevel === 'string' ? event.payloadJson.riskLevel : 'unknown',
      sideEffectFlag: asBoolean(event.payloadJson?.sideEffectFlag, mode === 'delegate'),
      specialistHitRate: asNumber(specialistRaw.hitRate, 0),
      specialistHitCount: asNumber(specialistRaw.hitCount, 0),
      specialistMissCount: asNumber(specialistRaw.missCount, 0),
      missingAgents: asStringArray(specialistRaw.missingAgents),
      pendingNodeIds: asStringArray(event.payloadJson?.pendingNodeIds),
      failedNodeIds: asStringArray(event.payloadJson?.failedNodeIds),
    });
  }

  return entries.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function filterResumeAuditEntries(entries: ResumeAuditEntry[], filter: ResumeAuditFilter = {}): ResumeAuditEntry[] {
  const mode = filter.mode ?? 'all';
  const status = filter.status ?? 'all';

  return entries.filter((entry) => {
    if (mode !== 'all' && entry.mode !== mode) {
      return false;
    }

    if (status !== 'all' && entry.status !== status) {
      return false;
    }

    return true;
  });
}

export function summarizeResumeAuditEntries(entries: ResumeAuditEntry[]): ResumeAuditSummary {
  if (entries.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      running: 0,
      canceled: 0,
      successRate: 0,
      sideEffectCount: 0,
      sideEffectRate: 0,
      avgHitRate: 0,
      totalHitCount: 0,
      totalMissCount: 0,
      topMissingAgents: [],
    };
  }

  const missingAgentCounter = new Map<string, number>();
  let succeeded = 0;
  let failed = 0;
  let running = 0;
  let canceled = 0;
  let sideEffectCount = 0;
  let hitRateSum = 0;
  let totalHitCount = 0;
  let totalMissCount = 0;

  for (const entry of entries) {
    if (entry.status === 'succeeded') succeeded += 1;
    if (entry.status === 'failed') failed += 1;
    if (entry.status === 'running') running += 1;
    if (entry.status === 'canceled') canceled += 1;
    if (entry.sideEffectFlag) sideEffectCount += 1;

    hitRateSum += entry.specialistHitRate;
    totalHitCount += entry.specialistHitCount;
    totalMissCount += entry.specialistMissCount;

    for (const agent of entry.missingAgents) {
      missingAgentCounter.set(agent, (missingAgentCounter.get(agent) ?? 0) + 1);
    }
  }

  const topMissingAgents = Array.from(missingAgentCounter.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([agent]) => agent);

  return {
    total: entries.length,
    succeeded,
    failed,
    running,
    canceled,
    successRate: succeeded / entries.length,
    sideEffectCount,
    sideEffectRate: sideEffectCount / entries.length,
    avgHitRate: hitRateSum / entries.length,
    totalHitCount,
    totalMissCount,
    topMissingAgents,
  };
}

export function detectResumeAuditAlerts(
  entries: ResumeAuditEntry[],
  summary: ResumeAuditSummary = summarizeResumeAuditEntries(entries),
): ResumeAuditAlert[] {
  if (entries.length === 0) {
    return [];
  }

  const alerts: ResumeAuditAlert[] = [];

  if (summary.total >= 3 && summary.successRate < 0.5) {
    alerts.push({
      id: 'low-success-rate',
      level: 'critical',
      title: '恢复成功率偏低',
      detail: `当前成功率 ${(summary.successRate * 100).toFixed(1)}%，建议优先排查失败节点与依赖。`,
    });
  }

  if (summary.total >= 3 && summary.avgHitRate < 0.6) {
    alerts.push({
      id: 'low-hit-rate',
      level: 'warning',
      title: 'specialist 命中率偏低',
      detail: `平均命中率 ${(summary.avgHitRate * 100).toFixed(1)}%，存在执行器配置缺口风险。`,
    });
  }

  if (summary.topMissingAgents.length > 0) {
    alerts.push({
      id: 'missing-specialists',
      level: 'warning',
      title: '存在缺失 specialist',
      detail: `高频缺失：${summary.topMissingAgents.join(', ')}。`,
    });
  }

  const sideEffectFailures = entries.filter((entry) => entry.sideEffectFlag && entry.status === 'failed').length;
  if (sideEffectFailures > 0) {
    alerts.push({
      id: 'side-effect-failure',
      level: 'critical',
      title: '副作用恢复存在失败',
      detail: `检测到 ${sideEffectFailures} 条 delegate 失败记录，请谨慎重试并先完成预检。`,
    });
  }

  const latest = entries[0];
  if (latest && latest.status === 'failed') {
    alerts.push({
      id: 'latest-failed',
      level: 'info',
      title: '最近一次恢复失败',
      detail: `最近失败模式：${latest.mode}，建议优先检查该 task 的回放明细。`,
    });
  }

  return alerts;
}

export function aggregateResumeAuditByTask(entries: ResumeAuditEntry[]): ResumeAuditTaskAggregate[] {
  const grouped = new Map<string, ResumeAuditTaskAggregate>();

  for (const entry of entries) {
    const existed = grouped.get(entry.taskId);
    if (!existed) {
      grouped.set(entry.taskId, {
        taskId: entry.taskId,
        total: 1,
        succeeded: entry.status === 'succeeded' ? 1 : 0,
        failed: entry.status === 'failed' ? 1 : 0,
        successRate: 0,
        avgHitRate: entry.specialistHitRate,
        sideEffectFailures: entry.sideEffectFlag && entry.status === 'failed' ? 1 : 0,
        lastOccurredAt: entry.occurredAt,
      });
      continue;
    }

    existed.total += 1;
    if (entry.status === 'succeeded') existed.succeeded += 1;
    if (entry.status === 'failed') existed.failed += 1;
    if (entry.sideEffectFlag && entry.status === 'failed') existed.sideEffectFailures += 1;
    existed.avgHitRate += entry.specialistHitRate;

    if (Date.parse(entry.occurredAt) > Date.parse(existed.lastOccurredAt)) {
      existed.lastOccurredAt = entry.occurredAt;
    }
  }

  const aggregates = Array.from(grouped.values()).map((item) => ({
    ...item,
    successRate: item.total > 0 ? item.succeeded / item.total : 0,
    avgHitRate: item.total > 0 ? item.avgHitRate / item.total : 0,
  }));

  return aggregates.sort((a, b) => {
    if (b.failed !== a.failed) {
      return b.failed - a.failed;
    }

    if (a.successRate !== b.successRate) {
      return a.successRate - b.successRate;
    }

    if (a.avgHitRate !== b.avgHitRate) {
      return a.avgHitRate - b.avgHitRate;
    }

    return a.taskId.localeCompare(b.taskId);
  });
}

export function buildResumeAuditReport(
  entries: ResumeAuditEntry[],
  summary?: ResumeAuditSummary,
  alerts?: ResumeAuditAlert[],
): string {
  const resolvedSummary = summary ?? summarizeResumeAuditEntries(entries);
  const resolvedAlerts = alerts ?? detectResumeAuditAlerts(entries, resolvedSummary);
  const latest = entries[0];
  const topRiskTasks = aggregateResumeAuditByTask(entries)
    .slice(0, 3)
    .map((item) => `${item.taskId}(f=${item.failed},sr=${(item.successRate * 100).toFixed(0)}%)`);

  const lines = [
    'Agent 恢复审计摘要',
    `总量: ${resolvedSummary.total}`,
    `成功率: ${(resolvedSummary.successRate * 100).toFixed(1)}%`,
    `副作用占比: ${(resolvedSummary.sideEffectRate * 100).toFixed(1)}%`,
    `平均命中率: ${(resolvedSummary.avgHitRate * 100).toFixed(1)}%`,
    `hit/miss: ${resolvedSummary.totalHitCount}/${resolvedSummary.totalMissCount}`,
    `Top Missing Agents: ${resolvedSummary.topMissingAgents.join(', ') || '(none)'}`,
    `Top Risk Tasks: ${topRiskTasks.join(', ') || '(none)'}`,
    latest ? `最近一次: ${latest.mode}/${latest.status} @ ${latest.occurredAt}` : '最近一次: (none)',
  ];

  if (resolvedAlerts.length > 0) {
    lines.push('告警:');
    for (const alert of resolvedAlerts) {
      lines.push(`- [${alert.level}] ${alert.title}: ${alert.detail}`);
    }
  } else {
    lines.push('告警: (none)');
  }

  return lines.join('\n');
}
