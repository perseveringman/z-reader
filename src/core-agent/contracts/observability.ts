import type { AgentTaskContext, TraceMetric } from './common';

export interface AgentDomainEvent<TPayload = Record<string, unknown>> {
  type: string;
  taskId?: string;
  sessionId?: string;
  payload: TPayload;
  timestamp: string;
}

export interface TraceRecord {
  id: string;
  taskId: string;
  span: string;
  kind: 'planner' | 'executor' | 'tool' | 'policy' | 'llm' | 'system';
  metric: TraceMetric;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface TraceQuery {
  taskId: string;
  limit?: number;
}

export type EventHandler<TPayload = Record<string, unknown>> = (
  event: AgentDomainEvent<TPayload>,
  context?: AgentTaskContext,
) => void | Promise<void>;

export interface IEventBus {
  publish<TPayload = Record<string, unknown>>(event: AgentDomainEvent<TPayload>): Promise<void>;
  subscribe(type: string, handler: EventHandler): () => void;
}

export interface ITraceStore {
  append(record: TraceRecord): Promise<void>;
  query(query: TraceQuery): Promise<TraceRecord[]>;
}
