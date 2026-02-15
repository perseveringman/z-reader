import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initSyncTables } from '../../src/main/services/sync/sync-tables';

describe('change-tracker', () => {
  let tmpDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-ct-'));
    sqlite = new Database(path.join(tmpDir, 'test.db'));
    sqlite.pragma('journal_mode = WAL');
    initSyncTables(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('trackChange 插入一条变更记录', () => {
    const { createChangeTracker } = require('../../src/main/services/sync/change-tracker');
    const tracker = createChangeTracker(sqlite, 'device-1');
    tracker.trackChange({
      table: 'articles',
      recordId: 'art-1',
      operation: 'update',
      changedFields: { readProgress: 0.5 },
    });
    const rows = sqlite.prepare('SELECT * FROM sync_changelog').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].table_name).toBe('articles');
    expect(rows[0].record_id).toBe('art-1');
    expect(rows[0].operation).toBe('update');
    expect(JSON.parse(rows[0].changed_fields as string)).toEqual({ readProgress: 0.5 });
    expect(rows[0].synced).toBe(0);
  });

  it('trackChange 对 insert 操作记录全部字段', () => {
    const { createChangeTracker } = require('../../src/main/services/sync/change-tracker');
    const tracker = createChangeTracker(sqlite, 'device-1');
    tracker.trackChange({
      table: 'feeds',
      recordId: 'feed-1',
      operation: 'insert',
      changedFields: { url: 'https://example.com/rss', title: 'Test' },
    });
    const rows = sqlite.prepare('SELECT * FROM sync_changelog').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe('insert');
  });

  it('getUnsynced 返回未推送的变更', () => {
    const { createChangeTracker } = require('../../src/main/services/sync/change-tracker');
    const tracker = createChangeTracker(sqlite, 'device-1');
    tracker.trackChange({ table: 'articles', recordId: 'a1', operation: 'update', changedFields: { readProgress: 0.3 } });
    tracker.trackChange({ table: 'articles', recordId: 'a2', operation: 'update', changedFields: { readProgress: 0.7 } });
    const unsynced = tracker.getUnsynced();
    expect(unsynced).toHaveLength(2);
  });

  it('markSynced 将变更标记为已推送', () => {
    const { createChangeTracker } = require('../../src/main/services/sync/change-tracker');
    const tracker = createChangeTracker(sqlite, 'device-1');
    tracker.trackChange({ table: 'articles', recordId: 'a1', operation: 'update', changedFields: { readProgress: 0.3 } });
    const unsynced = tracker.getUnsynced();
    tracker.markSynced(unsynced.map((r: { id: number }) => r.id));
    expect(tracker.getUnsynced()).toHaveLength(0);
  });

  it('不追踪排除的表 (app_tasks, notifications, downloads)', () => {
    const { createChangeTracker } = require('../../src/main/services/sync/change-tracker');
    const tracker = createChangeTracker(sqlite, 'device-1');
    tracker.trackChange({ table: 'app_tasks', recordId: 'at1', operation: 'insert', changedFields: {} });
    tracker.trackChange({ table: 'notifications', recordId: 'n1', operation: 'insert', changedFields: {} });
    tracker.trackChange({ table: 'downloads', recordId: 'd1', operation: 'insert', changedFields: {} });
    expect(tracker.getUnsynced()).toHaveLength(0);
  });
});
