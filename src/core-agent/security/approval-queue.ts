import { randomUUID } from 'node:crypto';
import type { ApprovalDecision, ApprovalRequest } from '../contracts';

export interface ApprovalQueueDecisionInput {
  approved: boolean;
  reviewer?: string;
  comment?: string;
}

export interface PendingApprovalItem {
  id: string;
  request: ApprovalRequest;
  createdAt: string;
}

interface PendingApprovalState {
  id: string;
  request: ApprovalRequest;
  createdAt: string;
  resolve: (decision: ApprovalDecision) => void;
}

export class InMemoryApprovalQueue {
  private readonly pending = new Map<string, PendingApprovalState>();

  enqueue(request: ApprovalRequest): Promise<ApprovalDecision> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    return new Promise<ApprovalDecision>((resolve) => {
      this.pending.set(id, {
        id,
        request,
        createdAt,
        resolve,
      });
    });
  }

  listPending(): PendingApprovalItem[] {
    return Array.from(this.pending.values())
      .map((item) => ({
        id: item.id,
        request: item.request,
        createdAt: item.createdAt,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  decide(id: string, input: ApprovalQueueDecisionInput): boolean {
    const item = this.pending.get(id);
    if (!item) {
      return false;
    }

    this.pending.delete(id);
    item.resolve({
      approved: input.approved,
      reviewer: input.reviewer,
      comment: input.comment,
      decidedAt: new Date().toISOString(),
    });

    return true;
  }
}
