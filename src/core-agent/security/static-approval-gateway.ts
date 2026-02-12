import type { ApprovalDecision, ApprovalRequest, IApprovalGateway } from '../contracts';

export interface StaticApprovalDecisionInput {
  approved: boolean;
  reviewer?: string;
  comment?: string;
}

export class StaticApprovalGateway implements IApprovalGateway {
  constructor(private readonly decision: StaticApprovalDecisionInput) {}

  async requestApproval(input: ApprovalRequest): Promise<ApprovalDecision> {
    return {
      approved: this.decision.approved,
      reviewer: this.decision.reviewer,
      comment: this.decision.comment ?? input.reason,
      decidedAt: new Date().toISOString(),
    };
  }
}
