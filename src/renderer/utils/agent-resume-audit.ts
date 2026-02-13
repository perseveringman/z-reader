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

export function buildResumeAuditReport(entries: ResumeAuditEntry[], summary?: ResumeAuditSummary): string {
  const resolvedSummary = summary ?? summarizeResumeAuditEntries(entries);
  const latest = entries[0];

  const lines = [
    'Agent 恢复审计摘要',
    `总量: ${resolvedSummary.total}`,
    `成功率: ${(resolvedSummary.successRate * 100).toFixed(1)}%`,
    `副作用占比: ${(resolvedSummary.sideEffectRate * 100).toFixed(1)}%`,
    `平均命中率: ${(resolvedSummary.avgHitRate * 100).toFixed(1)}%`,
    `hit/miss: ${resolvedSummary.totalHitCount}/${resolvedSummary.totalMissCount}`,
    `Top Missing Agents: ${resolvedSummary.topMissingAgents.join(', ') || '(none)'}`,
    latest ? `最近一次: ${latest.mode}/${latest.status} @ ${latest.occurredAt}` : '最近一次: (none)',
  ];

  return lines.join('\n');
}
