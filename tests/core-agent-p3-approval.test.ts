import { describe, expect, it } from 'vitest';

import { InMemoryApprovalQueue, InteractiveApprovalGateway } from '../src/core-agent';

describe('p3 interactive approval gateway', () => {
  it('可挂起审批并由外部决策通过', async () => {
    const queue = new InMemoryApprovalQueue();
    const gateway = new InteractiveApprovalGateway(queue);

    const pending = gateway.requestApproval({
      taskId: 'task-p3-approval',
      reason: '需要审批',
      riskLevel: 'high',
      operation: 'tool.shell.exec',
      payload: { cmd: 'rm -rf /tmp/demo' },
    });

    const list = queue.listPending();
    expect(list).toHaveLength(1);
    expect(list[0].request.taskId).toBe('task-p3-approval');

    const accepted = queue.decide(list[0].id, {
      approved: true,
      reviewer: 'alice',
      comment: 'ok',
    });

    expect(accepted).toBe(true);

    const decision = await pending;
    expect(decision.approved).toBe(true);
    expect(decision.reviewer).toBe('alice');
  });

  it('不存在的审批单返回 false', () => {
    const queue = new InMemoryApprovalQueue();
    const accepted = queue.decide('not-exist', {
      approved: true,
    });

    expect(accepted).toBe(false);
  });
});
