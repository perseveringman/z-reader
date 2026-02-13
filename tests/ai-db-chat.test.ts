import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AIDatabase } from '../src/ai/providers/db';
import type { ChatSessionRow } from '../src/ai/providers/db';

describe('AIDatabase - Chat Session', () => {
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

  // ==================== createChatSession ====================

  it('创建不关联文章的 Chat 会话', () => {
    const session = aiDb.createChatSession();
    expect(session.id).toBeDefined();
    expect(session.title).toBeNull();
    expect(session.article_id).toBeNull();
    expect(session.messages_json).toBe('[]');
    expect(session.created_at).toBeDefined();
    expect(session.updated_at).toBeDefined();
  });

  it('创建关联文章的 Chat 会话', () => {
    const session = aiDb.createChatSession('article-123');
    expect(session.article_id).toBe('article-123');
    expect(session.messages_json).toBe('[]');
  });

  it('创建的会话可以通过 getChatSession 获取', () => {
    const session = aiDb.createChatSession();
    const fetched = aiDb.getChatSession(session.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(session.id);
    expect(fetched!.messages_json).toBe('[]');
  });

  // ==================== getChatSession ====================

  it('获取不存在的 Chat 会话返回 null', () => {
    const result = aiDb.getChatSession('nonexistent-id');
    expect(result).toBeNull();
  });

  // ==================== updateChatSession ====================

  it('更新 Chat 会话标题', () => {
    const session = aiDb.createChatSession();
    aiDb.updateChatSession(session.id, { title: '测试标题' });
    const updated = aiDb.getChatSession(session.id);
    expect(updated!.title).toBe('测试标题');
  });

  it('更新 Chat 会话消息', () => {
    const session = aiDb.createChatSession();
    const messages = JSON.stringify([
      { role: 'user', content: '你好', timestamp: new Date().toISOString() },
    ]);
    aiDb.updateChatSession(session.id, { messagesJson: messages });
    const updated = aiDb.getChatSession(session.id);
    expect(updated!.messages_json).toBe(messages);
  });

  it('同时更新标题和消息', () => {
    const session = aiDb.createChatSession();
    const messages = JSON.stringify([
      { role: 'user', content: '测试', timestamp: new Date().toISOString() },
    ]);
    aiDb.updateChatSession(session.id, { title: '新标题', messagesJson: messages });
    const updated = aiDb.getChatSession(session.id);
    expect(updated!.title).toBe('新标题');
    expect(updated!.messages_json).toBe(messages);
  });

  it('更新会话后 updated_at 发生变化', async () => {
    const session = aiDb.createChatSession();
    const originalUpdatedAt = session.updated_at;
    // 等待一小段时间以确保时间戳不同
    await new Promise((resolve) => setTimeout(resolve, 10));
    aiDb.updateChatSession(session.id, { title: '更新标题' });
    const updated = aiDb.getChatSession(session.id);
    expect(updated!.updated_at).not.toBe(originalUpdatedAt);
  });

  it('空更新不修改数据', () => {
    const session = aiDb.createChatSession();
    aiDb.updateChatSession(session.id, {});
    const fetched = aiDb.getChatSession(session.id);
    expect(fetched!.title).toBeNull();
    expect(fetched!.messages_json).toBe('[]');
    // updated_at 不应被修改，因为没有任何字段变更
    expect(fetched!.updated_at).toBe(session.updated_at);
  });

  // ==================== listChatSessions ====================

  it('列出 Chat 会话（按 updated_at 降序）', async () => {
    const s1 = aiDb.createChatSession();
    const s2 = aiDb.createChatSession();
    // 等待一小段时间以确保 updated_at 不同
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 更新 s1 使其 updated_at 更新
    aiDb.updateChatSession(s1.id, { title: '更新后的' });

    const list = aiDb.listChatSessions();
    expect(list.length).toBe(2);
    // s1 最近更新，应排在前面
    expect(list[0].id).toBe(s1.id);
    expect(list[1].id).toBe(s2.id);
  });

  it('限制返回数量', () => {
    for (let i = 0; i < 10; i++) {
      aiDb.createChatSession();
    }
    const list = aiDb.listChatSessions(3);
    expect(list.length).toBe(3);
  });

  it('默认限制返回 50 条', () => {
    for (let i = 0; i < 5; i++) {
      aiDb.createChatSession();
    }
    const list = aiDb.listChatSessions();
    expect(list.length).toBe(5);
  });

  // ==================== deleteChatSession ====================

  it('删除 Chat 会话', () => {
    const session = aiDb.createChatSession();
    aiDb.deleteChatSession(session.id);
    const result = aiDb.getChatSession(session.id);
    expect(result).toBeNull();
  });

  it('删除不存在的会话不报错', () => {
    expect(() => aiDb.deleteChatSession('nonexistent-id')).not.toThrow();
  });

  it('删除后列表中不再包含该会话', () => {
    const s1 = aiDb.createChatSession();
    const s2 = aiDb.createChatSession();
    aiDb.deleteChatSession(s1.id);
    const list = aiDb.listChatSessions();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(s2.id);
  });

  // ==================== getTaskLog ====================

  it('获取单条任务日志详情', () => {
    const log = aiDb.insertTaskLog({
      taskType: 'summarize',
      status: 'completed',
      inputJson: '{"articleId":"1"}',
      outputJson: '{"summary":"test"}',
      tracesJson: '{"steps":[]}',
      tokenCount: 100,
      costUsd: 0.001,
      errorText: null,
    });

    const detail = aiDb.getTaskLog(log.id);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(log.id);
    expect(detail!.task_type).toBe('summarize');
    expect(detail!.input_json).toBe('{"articleId":"1"}');
    expect(detail!.output_json).toBe('{"summary":"test"}');
    expect(detail!.traces_json).toBe('{"steps":[]}');
    expect(detail!.token_count).toBe(100);
  });

  it('获取不存在的任务日志返回 null', () => {
    const result = aiDb.getTaskLog('nonexistent-id');
    expect(result).toBeNull();
  });

  // ==================== 类型检查 ====================

  it('ChatSessionRow 类型与数据库字段匹配', () => {
    const session = aiDb.createChatSession('art-1');
    // 验证所有字段都可以正常访问且类型正确
    const row: ChatSessionRow = session;
    expect(typeof row.id).toBe('string');
    expect(row.title === null || typeof row.title === 'string').toBe(true);
    expect(row.article_id === null || typeof row.article_id === 'string').toBe(true);
    expect(typeof row.messages_json).toBe('string');
    expect(typeof row.created_at).toBe('string');
    expect(typeof row.updated_at).toBe('string');
  });
});
