import { describe, expect, it } from 'vitest';

import { createZReaderResumeSpecialists } from '../src/business-adapters/zreader-agent';

describe('p11 zreader resume specialists', () => {
  it('应暴露可注册 specialist 集合并可执行', async () => {
    const specialists = createZReaderResumeSpecialists();
    const names = Object.keys(specialists).sort();

    expect(names).toEqual(['reader', 'summarizer', 'writer']);

    const writer = specialists.writer;
    const result = await writer.execute({
      taskId: 'task-zreader-specialist',
      sessionId: 'session-zreader-specialist',
      node: {
        id: 'node-writer',
        agent: 'writer',
      },
      dependencyResults: {
        reader: { content: 'hello' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output?.specialist).toBe('writer');
    expect(result.output?.adapter).toBe('zreader');
  });
});
