import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AIDatabase } from '../src/ai/providers/db';

describe('AIDatabase', () => {
  let sqlite: Database.Database;
  let aiDb: AIDatabase;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    aiDb = new AIDatabase(sqlite);
    aiDb.initTables();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('保存和读取 AI 设置', () => {
    aiDb.setSetting('apiKey', 'test-key-123');
    expect(aiDb.getSetting('apiKey')).toBe('test-key-123');
  });

  it('读取不存在的设置返回 null', () => {
    expect(aiDb.getSetting('nonexistent')).toBeNull();
  });

  it('更新已有设置', () => {
    aiDb.setSetting('apiKey', 'old-key');
    aiDb.setSetting('apiKey', 'new-key');
    expect(aiDb.getSetting('apiKey')).toBe('new-key');
  });

  it('插入和查询任务日志', () => {
    const log = aiDb.insertTaskLog({
      taskType: 'summarize',
      status: 'completed',
      inputJson: '{"articleId":"1"}',
      outputJson: '{"summary":"test"}',
      tokenCount: 100,
      costUsd: 0.001,
    });

    expect(log.id).toBeDefined();
    expect(log.task_type).toBe('summarize');

    const logs = aiDb.listTaskLogs(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].token_count).toBe(100);
  });

  it('查询最近 N 条任务日志', () => {
    for (let i = 0; i < 5; i++) {
      aiDb.insertTaskLog({
        taskType: `task-${i}`,
        status: 'completed',
        inputJson: '{}',
        outputJson: '{}',
        tokenCount: i * 10,
        costUsd: 0,
      });
    }

    const logs = aiDb.listTaskLogs(3);
    expect(logs).toHaveLength(3);
  });
});
