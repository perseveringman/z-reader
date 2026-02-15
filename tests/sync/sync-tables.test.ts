import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initSyncTables } from '../../src/main/services/sync/sync-tables';

describe('sync tables', () => {
  let tmpDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-db-'));
    sqlite = new Database(path.join(tmpDir, 'test.db'));
    sqlite.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initSyncTables 创建 sync_changelog 表', () => {
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_changelog'").get();
    expect(info).toBeTruthy();
  });

  it('initSyncTables 创建 sync_cursors 表', () => {
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_cursors'").get();
    expect(info).toBeTruthy();
  });

  it('initSyncTables 创建 sync_conflicts 表', () => {
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_conflicts'").get();
    expect(info).toBeTruthy();
  });

  it('sync_changelog 支持插入和自增 ID', () => {
    initSyncTables(sqlite);
    sqlite.prepare(`INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run('dev1', 'articles', 'art1', 'update', '{"readProgress":0.5}', '2026-02-15T10:00:00.000Z');
    const row = sqlite.prepare('SELECT * FROM sync_changelog WHERE id = 1').get() as Record<string, unknown>;
    expect(row.device_id).toBe('dev1');
    expect(row.synced).toBe(0);
  });
});
