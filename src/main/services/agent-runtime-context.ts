import {
  AgentSnapshotResumeService,
  AuditReplayService,
  InMemoryApprovalQueue,
  InMemoryTraceStore,
  InteractiveApprovalGateway,
  SqliteGraphSnapshotStore,
  SqliteTaskStore,
  SqliteTraceStore,
  type GraphExecutorResolver,
  type GraphNodeExecutor,
} from '../../core-agent';
import { getSqlite } from '../db';

const approvalQueue = new InMemoryApprovalQueue();
let resumeSpecialistResolver: GraphExecutorResolver | undefined;
let resumeSpecialistMap = new Map<string, GraphNodeExecutor>();

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

export function setResumeSpecialists(specialists?: Record<string, GraphNodeExecutor>): void {
  resumeSpecialistMap = new Map<string, GraphNodeExecutor>();

  if (specialists) {
    for (const [name, executor] of Object.entries(specialists)) {
      if (name && executor) {
        resumeSpecialistMap.set(name, executor);
      }
    }
  }

  if (resumeSpecialistMap.size > 0) {
    resumeSpecialistResolver = (agent) => resumeSpecialistMap.get(agent);
  } else {
    resumeSpecialistResolver = undefined;
  }
}

export function setResumeSpecialistResolver(resolver?: GraphExecutorResolver): void {
  resumeSpecialistResolver = resolver;
}

export function listResumeSpecialists(): string[] {
  return Array.from(resumeSpecialistMap.keys()).sort();
}

export function createReplayService(): AuditReplayService {
  return new AuditReplayService(createTaskStore(), createTraceStore());
}

export function createSnapshotResumeService(): AgentSnapshotResumeService {
  return new AgentSnapshotResumeService({
    snapshotStore: createGraphSnapshotStore(),
    taskStore: createTaskStore(),
    specialistResolver: resumeSpecialistResolver,
  });
}

export function createInMemoryTraceStore(): InMemoryTraceStore {
  return new InMemoryTraceStore();
}
