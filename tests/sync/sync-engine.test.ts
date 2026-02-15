import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initSyncTables } from '../../src/main/services/sync/sync-tables';

describe('sync-engine', () => {
  let tmpDir: string;
  let syncDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-engine-'));
    syncDir = path.join(tmpDir, 'sync');
    fs.mkdirSync(path.join(syncDir, 'changelog'), { recursive: true });
    fs.mkdirSync(path.join(syncDir, 'snapshots'), { recursive: true });
    fs.mkdirSync(path.join(syncDir, 'devices'), { recursive: true });
    sqlite = new Database(path.join(tmpDir, 'test.db'));
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec(`
      CREATE TABLE feeds (id TEXT PRIMARY KEY, url TEXT, title TEXT, created_at TEXT, updated_at TEXT, deleted_flg INTEGER DEFAULT 0);
      CREATE TABLE articles (id TEXT PRIMARY KEY, feed_id TEXT, title TEXT, read_progress REAL DEFAULT 0, read_status TEXT DEFAULT 'inbox', is_shortlisted INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, deleted_flg INTEGER DEFAULT 0);
    `);
    initSyncTables(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('push 将未同步的变更写入 iCloud 目录', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    // 手动插入一条未同步变更
    sqlite.prepare(`INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run('dev-1', 'articles', 'a1', 'update', '{"readProgress":0.5}', '2026-02-15T10:00:00Z');

    const pushed = engine.push();
    expect(pushed).toBe(1);

    // 验证文件写入
    const deviceDir = path.join(syncDir, 'changelog', 'dev-1');
    const files = fs.readdirSync(deviceDir).filter((f: string) => f.endsWith('.jsonl'));
    expect(files.length).toBe(1);
  });

  it('pull 读取远端变更并合并到本地', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    // 本地先有一条 article
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('a1', 'f1', '标题', 0.2, 'inbox', 0, now, now, 0);

    // 模拟远端设备的变更日志
    const remoteDir = path.join(syncDir, 'changelog', 'dev-2');
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.writeFileSync(path.join(remoteDir, '2026-02-15T10-00-00.jsonl'),
      JSON.stringify({ id: 1, deviceId: 'dev-2', table: 'articles', recordId: 'a1', op: 'update', fields: { read_progress: 0.8 }, ts: '2026-02-15T10:00:00Z' }) + '\n'
    );

    engine.pull();

    // 验证本地数据已合并
    const row = sqlite.prepare('SELECT read_progress FROM articles WHERE id = ?').get('a1') as Record<string, unknown>;
    expect(row.read_progress).toBe(0.8); // 取最大值
  });

  it('pull 对不存在的远端 insert 记录创建本地记录', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    const remoteDir = path.join(syncDir, 'changelog', 'dev-2');
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.writeFileSync(path.join(remoteDir, '2026-02-15T10-00-00.jsonl'),
      JSON.stringify({ id: 1, deviceId: 'dev-2', table: 'feeds', recordId: 'f1', op: 'insert', fields: { id: 'f1', url: 'https://x.com/rss', title: 'Remote Feed', created_at: '2026-02-15T10:00:00Z', updated_at: '2026-02-15T10:00:00Z', deleted_flg: 0 }, ts: '2026-02-15T10:00:00Z' }) + '\n'
    );

    engine.pull();

    const row = sqlite.prepare('SELECT title FROM feeds WHERE id = ?').get('f1') as Record<string, unknown>;
    expect(row.title).toBe('Remote Feed');
  });

  it('pull 处理 delete 操作设置 deleted_flg', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    // 本地先有一条 feed
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO feeds VALUES (?, ?, ?, ?, ?, ?)').run('f1', 'https://x.com/rss', '标题', now, now, 0);

    // 模拟远端删除
    const remoteDir = path.join(syncDir, 'changelog', 'dev-2');
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.writeFileSync(path.join(remoteDir, '2026-02-15T10-00-00.jsonl'),
      JSON.stringify({ id: 1, deviceId: 'dev-2', table: 'feeds', recordId: 'f1', op: 'delete', fields: {}, ts: '2026-02-15T10:00:00Z' }) + '\n'
    );

    engine.pull();

    const row = sqlite.prepare('SELECT deleted_flg FROM feeds WHERE id = ?').get('f1') as Record<string, unknown>;
    expect(row.deleted_flg).toBe(1);
  });

  it('pull 跳过不在 syncTables 中的表', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds'] }); // 只同步 feeds

    const remoteDir = path.join(syncDir, 'changelog', 'dev-2');
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.writeFileSync(path.join(remoteDir, '2026-02-15T10-00-00.jsonl'),
      JSON.stringify({ id: 1, deviceId: 'dev-2', table: 'articles', recordId: 'a1', op: 'insert', fields: { id: 'a1', feed_id: 'f1', title: '远端文章' }, ts: '2026-02-15T10:00:00Z' }) + '\n'
    );

    engine.pull();

    // articles 不在 syncTables 中，不应插入
    const row = sqlite.prepare('SELECT * FROM articles WHERE id = ?').get('a1');
    expect(row).toBeUndefined();
  });

  it('syncNow 同时执行 push 和 pull', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    // 插入一条未同步变更
    sqlite.prepare(`INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run('dev-1', 'articles', 'a1', 'update', '{"readProgress":0.5}', '2026-02-15T10:00:00Z');

    const result = engine.syncNow();
    expect(result.pushed).toBe(1);
  });

  it('getStatus 返回同步状态', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });
    const status = engine.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.deviceId).toBe('dev-1');
    expect(status.lastSyncAt).toBeNull();
    expect(Array.isArray(status.remoteDevices)).toBe(true);
  });

  it('push 无变更时返回 0', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });
    expect(engine.push()).toBe(0);
  });

  it('pull 后游标正确保存，再次 pull 不重复处理', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });

    // 本地先有一条 article
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('a1', 'f1', '标题', 0.2, 'inbox', 0, now, now, 0);

    // 模拟远端变更
    const remoteDir = path.join(syncDir, 'changelog', 'dev-2');
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.writeFileSync(path.join(remoteDir, '2026-02-15T10-00-00.jsonl'),
      JSON.stringify({ id: 1, deviceId: 'dev-2', table: 'articles', recordId: 'a1', op: 'update', fields: { read_progress: 0.8 }, ts: '2026-02-15T10:00:00Z' }) + '\n'
    );

    engine.pull();

    // 验证游标已保存
    const cursor = sqlite.prepare('SELECT * FROM sync_cursors WHERE device_id = ?').get('dev-2') as Record<string, unknown>;
    expect(cursor).toBeDefined();
    expect(cursor.last_file).toBe('2026-02-15T10-00-00.jsonl');
    expect(cursor.last_id).toBe(1);

    // 修改本地数据以验证再次 pull 不会覆盖
    sqlite.prepare('UPDATE articles SET read_progress = 0.9 WHERE id = ?').run('a1');
    engine.pull();
    const row = sqlite.prepare('SELECT read_progress FROM articles WHERE id = ?').get('a1') as Record<string, unknown>;
    expect(row.read_progress).toBe(0.9); // 不应被再次覆盖为 0.8
  });
});
