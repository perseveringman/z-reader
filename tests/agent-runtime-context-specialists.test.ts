import { describe, expect, it } from 'vitest';

import type { GraphNodeExecutor } from '../src/core-agent';
import {
  listResumeSpecialists,
  setResumeSpecialists,
} from '../src/main/services/agent-runtime-context';

class StaticExecutor implements GraphNodeExecutor {
  async execute() {
    return {
      success: true,
      output: { ok: true },
    };
  }
}

describe('p11 runtime context specialists registry', () => {
  it('支持注册与查询恢复 specialist 列表', () => {
    setResumeSpecialists({
      writer: new StaticExecutor(),
      reader: new StaticExecutor(),
    });

    expect(listResumeSpecialists()).toEqual(['reader', 'writer']);

    setResumeSpecialists();
    expect(listResumeSpecialists()).toEqual([]);
  });
});
