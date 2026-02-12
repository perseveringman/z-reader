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
