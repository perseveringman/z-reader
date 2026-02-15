import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AIDatabase } from '../src/ai/providers/db';

describe('AIDatabase - Prompt Presets', () => {
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

  it('创建并按 display_order 升序查询提示词', () => {
    aiDb.createPromptPreset({
      title: 'B',
      prompt: 'prompt-b',
      displayOrder: 2,
      targets: ['chat'],
    });
    aiDb.createPromptPreset({
      title: 'A',
      prompt: 'prompt-a',
      displayOrder: 1,
      targets: ['chat'],
    });

    const rows = aiDb.listPromptPresets();
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('A');
    expect(rows[1].title).toBe('B');
    expect(rows[0].icon_key).toBe('message-square');
  });

  it('支持按 target 与 enabledOnly 过滤', () => {
    aiDb.createPromptPreset({
      title: 'chat-enabled',
      prompt: 'p1',
      targets: ['chat'],
      enabled: true,
    });
    aiDb.createPromptPreset({
      title: 'chat-disabled',
      prompt: 'p2',
      targets: ['chat'],
      enabled: false,
    });
    aiDb.createPromptPreset({
      title: 'summarize-only',
      prompt: 'p3',
      targets: ['summarize'],
      enabled: true,
    });

    const chatEnabled = aiDb.listPromptPresets({ target: 'chat', enabledOnly: true });
    expect(chatEnabled).toHaveLength(1);
    expect(chatEnabled[0].title).toBe('chat-enabled');

    const summarizeEnabled = aiDb.listPromptPresets({ target: 'summarize', enabledOnly: true });
    expect(summarizeEnabled).toHaveLength(1);
    expect(summarizeEnabled[0].title).toBe('summarize-only');
  });

  it('支持更新与删除提示词', async () => {
    const created = aiDb.createPromptPreset({
      title: 'before',
      prompt: 'before-prompt',
      targets: ['chat'],
    });

    const beforeUpdatedAt = created.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 10));
    aiDb.updatePromptPreset(created.id, {
      title: 'after',
      prompt: 'after-prompt',
      enabled: false,
      targets: ['chat', 'summarize'],
      iconKey: 'brain',
    });

    const updated = aiDb.getPromptPreset(created.id);
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('after');
    expect(updated!.prompt).toBe('after-prompt');
    expect(updated!.enabled).toBe(0);
    expect(JSON.parse(updated!.targets_json)).toEqual(['chat', 'summarize']);
    expect(updated!.icon_key).toBe('brain');
    expect(updated!.updated_at).not.toBe(beforeUpdatedAt);

    aiDb.deletePromptPreset(created.id);
    expect(aiDb.getPromptPreset(created.id)).toBeNull();
  });

  it('支持批量重排 display_order', () => {
    const p1 = aiDb.createPromptPreset({ title: 'p1', prompt: 'p1', targets: ['chat'], displayOrder: 0 });
    const p2 = aiDb.createPromptPreset({ title: 'p2', prompt: 'p2', targets: ['chat'], displayOrder: 1 });
    const p3 = aiDb.createPromptPreset({ title: 'p3', prompt: 'p3', targets: ['chat'], displayOrder: 2 });

    aiDb.reorderPromptPresets([
      { id: p1.id, displayOrder: 2 },
      { id: p2.id, displayOrder: 0 },
      { id: p3.id, displayOrder: 1 },
    ]);

    const rows = aiDb.listPromptPresets();
    expect(rows.map((r) => r.id)).toEqual([p2.id, p3.id, p1.id]);
  });

  it('内置模板补齐只插入缺失项，不覆盖已有项', () => {
    const builtins = [
      { id: 'builtin-1', title: '内置1', prompt: 'p1', targets: ['chat'], isBuiltin: true, displayOrder: 0 },
      { id: 'builtin-2', title: '内置2', prompt: 'p2', targets: ['chat'], isBuiltin: true, displayOrder: 1 },
    ];

    aiDb.upsertBuiltinPromptPresets(builtins);
    expect(aiDb.listPromptPresets()).toHaveLength(2);

    aiDb.updatePromptPreset('builtin-1', { title: '用户改名' });
    aiDb.deletePromptPreset('builtin-2');
    aiDb.upsertBuiltinPromptPresets(builtins);

    const rows = aiDb.listPromptPresets();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === 'builtin-1')!.title).toBe('用户改名');
    expect(rows.find((r) => r.id === 'builtin-2')!.title).toBe('内置2');
  });
});
