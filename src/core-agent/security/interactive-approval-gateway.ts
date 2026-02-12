import type { ApprovalDecision, ApprovalRequest, IApprovalGateway } from '../contracts';
import type { InMemoryApprovalQueue } from './approval-queue';

export class InteractiveApprovalGateway implements IApprovalGateway {
  constructor(private readonly queue: InMemoryApprovalQueue) {}

  async requestApproval(input: ApprovalRequest): Promise<ApprovalDecision> {
    return this.queue.enqueue(input);
  }
}
