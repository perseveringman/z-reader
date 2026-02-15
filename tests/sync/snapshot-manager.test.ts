import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initSyncTables } from '../../src/main/services/sync/sync-tables';

describe('snapshot-manager', () => {
  let tmpDir: string;
  let syncDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-snap-'));
    syncDir = path.join(tmpDir, 'sync');
    fs.mkdirSync(path.join(syncDir, 'snapshots'), { recursive: true });
    sqlite = new Database(path.join(tmpDir, 'test.db'));
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec(`
      CREATE TABLE feeds (id TEXT PRIMARY KEY, url TEXT, title TEXT, created_at TEXT, updated_at TEXT, deleted_flg INTEGER DEFAULT 0);
      CREATE TABLE articles (id TEXT PRIMARY KEY, feed_id TEXT, title TEXT, read_progress REAL DEFAULT 0, created_at TEXT, updated_at TEXT, deleted_flg INTEGER DEFAULT 0);
    `);
    initSyncTables(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('生成快照文件', () => {
    const { createSnapshotManager } = require('../../src/main/services/sync/snapshot-manager');
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO feeds VALUES (?, ?, ?, ?, ?, ?)').run('f1', 'https://x.com/rss', 'Test', now, now, 0);
    const manager = createSnapshotManager(sqlite, syncDir, 'device-1');
    manager.createSnapshot(['feeds', 'articles']);
    const snapshotPath = path.join(syncDir, 'snapshots', 'latest-device-1.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    expect(snapshot.feeds).toHaveLength(1);
    expect(snapshot.feeds[0].id).toBe('f1');
  });

  it('导入快照到本地数据库', () => {
    const { createSnapshotManager } = require('../../src/main/services/sync/snapshot-manager');
    const snapshot = {
      deviceId: 'dev-other',
      createdAt: new Date().toISOString(),
      feeds: [{ id: 'f2', url: 'https://y.com/rss', title: 'Remote', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_flg: 0 }],
      articles: [],
    };
    fs.writeFileSync(path.join(syncDir, 'snapshots', 'latest-dev-other.json'), JSON.stringify(snapshot));
    const manager = createSnapshotManager(sqlite, syncDir, 'device-1');
    manager.importSnapshot('dev-other', ['feeds', 'articles']);
    const rows = sqlite.prepare('SELECT * FROM feeds WHERE id = ?').all('f2') as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Remote');
  });

  it('导入快照跳过已存在的记录', () => {
    const { createSnapshotManager } = require('../../src/main/services/sync/snapshot-manager');
    const now = new Date().toISOString();
    sqlite.prepare('INSERT INTO feeds VALUES (?, ?, ?, ?, ?, ?)').run('f1', 'https://x.com/rss', '本地标题', now, now, 0);
    const snapshot = {
      deviceId: 'dev-other', createdAt: now,
      feeds: [{ id: 'f1', url: 'https://x.com/rss', title: '远端标题', created_at: now, updated_at: now, deleted_flg: 0 }],
      articles: [],
    };
    fs.writeFileSync(path.join(syncDir, 'snapshots', 'latest-dev-other.json'), JSON.stringify(snapshot));
    const manager = createSnapshotManager(sqlite, syncDir, 'device-1');
    manager.importSnapshot('dev-other', ['feeds', 'articles']);
    const rows = sqlite.prepare('SELECT title FROM feeds WHERE id = ?').all('f1') as Record<string, unknown>[];
    expect(rows[0].title).toBe('本地标题');
  });

  it('findLatestSnapshot 找到最新快照', () => {
    const { createSnapshotManager } = require('../../src/main/services/sync/snapshot-manager');
    const s1 = { deviceId: 'a', createdAt: '2026-02-14T00:00:00Z', feeds: [], articles: [] };
    const s2 = { deviceId: 'b', createdAt: '2026-02-15T00:00:00Z', feeds: [], articles: [] };
    fs.writeFileSync(path.join(syncDir, 'snapshots', 'latest-a.json'), JSON.stringify(s1));
    fs.writeFileSync(path.join(syncDir, 'snapshots', 'latest-b.json'), JSON.stringify(s2));
    const manager = createSnapshotManager(sqlite, syncDir, 'device-new');
    const latest = manager.findLatestSnapshot();
    expect(latest).toBe('b');
  });
});
