import {
  AuditReplayService,
  InMemoryApprovalQueue,
  InMemoryTraceStore,
  InteractiveApprovalGateway,
  SqliteGraphSnapshotStore,
  SqliteTaskStore,
  SqliteTraceStore,
} from '../../core-agent';
import { getSqlite } from '../db';

const approvalQueue = new InMemoryApprovalQueue();

function getSqliteOrThrow() {
  const sqlite = getSqlite();
  if (!sqlite) {
    throw new Error('Database is not initialized');
  }

  return sqlite;
}

export function getAgentApprovalQueue(): InMemoryApprovalQueue {
  return approvalQueue;
}

export function createInteractiveApprovalGateway(): InteractiveApprovalGateway {
  return new InteractiveApprovalGateway(approvalQueue);
}

export function createTaskStore() {
  return new SqliteTaskStore(getSqliteOrThrow());
}

export function createTraceStore() {
  return new SqliteTraceStore(getSqliteOrThrow());
}

export function createGraphSnapshotStore() {
  return new SqliteGraphSnapshotStore(getSqliteOrThrow());
}

export function createReplayService(): AuditReplayService {
  return new AuditReplayService(createTaskStore(), createTraceStore());
}

export function createInMemoryTraceStore(): InMemoryTraceStore {
  return new InMemoryTraceStore();
}
