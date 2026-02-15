# iCloud 同步 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过 iCloud Drive 变更日志实现多 Mac 设备间的数据同步

**Architecture:** 本地 SQLite 保持不变，新增 sync 模块负责变更追踪、JSONL 日志推送/拉取、字段级合并。iCloud Drive 目录作为传输层，大文件可选同步。

**Tech Stack:** Electron, better-sqlite3, Drizzle ORM, fs.watch, React, Tailwind CSS, Shadcn/UI

---

## Task 1: 设备标识模块

**Files:**
- Create: `src/main/services/sync/device-identity.ts`
- Test: `tests/sync/device-identity.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/device-identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('device-identity', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('首次调用生成新的 deviceId 并写入文件', () => {
    const { getOrCreateDeviceId } = require('../../src/main/services/sync/device-identity');
    const id = getOrCreateDeviceId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const filePath = path.join(tmpDir, 'z-reader-device.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.deviceId).toBe(id);
  });

  it('再次调用返回相同的 deviceId', () => {
    const { getOrCreateDeviceId } = require('../../src/main/services/sync/device-identity');
    const id1 = getOrCreateDeviceId(tmpDir);
    const id2 = getOrCreateDeviceId(tmpDir);
    expect(id1).toBe(id2);
  });

  it('getDeviceInfo 返回设备名称和 ID', () => {
    const { getOrCreateDeviceId, getDeviceInfo } = require('../../src/main/services/sync/device-identity');
    getOrCreateDeviceId(tmpDir);
    const info = getDeviceInfo(tmpDir);
    expect(info.deviceId).toBeTruthy();
    expect(info.name).toBeTruthy();
    expect(info.platform).toBe('darwin');
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/device-identity.test.ts`
Expected: FAIL - 模块不存在

**Step 3: 实现**

```typescript
// src/main/services/sync/device-identity.ts
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEVICE_FILE = 'z-reader-device.json';

interface DeviceData {
  deviceId: string;
  name: string;
  platform: string;
  createdAt: string;
}

let cachedDeviceId: string | null = null;

export function getOrCreateDeviceId(userDataPath: string): string {
  if (cachedDeviceId) return cachedDeviceId;

  const filePath = path.join(userDataPath, DEVICE_FILE);

  if (fs.existsSync(filePath)) {
    const data: DeviceData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cachedDeviceId = data.deviceId;
    return data.deviceId;
  }

  const deviceId = randomUUID();
  const data: DeviceData = {
    deviceId,
    name: os.hostname(),
    platform: process.platform,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  cachedDeviceId = deviceId;
  return deviceId;
}

export function getDeviceInfo(userDataPath: string): DeviceData {
  const filePath = path.join(userDataPath, DEVICE_FILE);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function _resetCache() {
  cachedDeviceId = null;
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/device-identity.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/device-identity.ts tests/sync/device-identity.test.ts
git commit -m "feat(sync): 设备标识模块"
```

---

## Task 2: iCloud 目录检测与管理

**Files:**
- Create: `src/main/services/sync/icloud-detector.ts`
- Test: `tests/sync/icloud-detector.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/icloud-detector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('icloud-detector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-icloud-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('检测 iCloud 目录不存在时返回 unavailable', () => {
    const { checkICloudAvailability } = require('../../src/main/services/sync/icloud-detector');
    const result = checkICloudAvailability(path.join(tmpDir, 'nonexistent'));
    expect(result.available).toBe(false);
  });

  it('检测 iCloud 目录存在时返回 available', () => {
    const { checkICloudAvailability } = require('../../src/main/services/sync/icloud-detector');
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = checkICloudAvailability(tmpDir);
    expect(result.available).toBe(true);
  });

  it('ensureSyncDirectory 创建完整目录结构', () => {
    const { ensureSyncDirectory } = require('../../src/main/services/sync/icloud-detector');
    const syncDir = path.join(tmpDir, 'iCloud~com~z-reader');
    ensureSyncDirectory(syncDir);
    expect(fs.existsSync(path.join(syncDir, 'devices'))).toBe(true);
    expect(fs.existsSync(path.join(syncDir, 'changelog'))).toBe(true);
    expect(fs.existsSync(path.join(syncDir, 'snapshots'))).toBe(true);
    expect(fs.existsSync(path.join(syncDir, 'files', 'books'))).toBe(true);
    expect(fs.existsSync(path.join(syncDir, 'files', 'podcasts'))).toBe(true);
    expect(fs.existsSync(path.join(syncDir, 'meta.json'))).toBe(true);
  });

  it('getDefaultICloudBasePath 返回 Mobile Documents 路径', () => {
    const { getDefaultICloudBasePath } = require('../../src/main/services/sync/icloud-detector');
    const p = getDefaultICloudBasePath();
    expect(p).toContain('Mobile Documents');
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/icloud-detector.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/icloud-detector.ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SYNC_CONTAINER = 'iCloud~com~z-reader';

export interface ICloudStatus {
  available: boolean;
  path?: string;
}

export function getDefaultICloudBasePath(): string {
  return path.join(os.homedir(), 'Library', 'Mobile Documents');
}

export function getSyncDirectoryPath(icloudBasePath?: string): string {
  const base = icloudBasePath || getDefaultICloudBasePath();
  return path.join(base, SYNC_CONTAINER);
}

export function checkICloudAvailability(mobileDocumentsPath?: string): ICloudStatus {
  const dir = mobileDocumentsPath || getDefaultICloudBasePath();
  try {
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return { available: true, path: dir };
  } catch {
    return { available: false };
  }
}

export function ensureSyncDirectory(syncDirPath: string): void {
  const dirs = [
    syncDirPath,
    path.join(syncDirPath, 'devices'),
    path.join(syncDirPath, 'changelog'),
    path.join(syncDirPath, 'snapshots'),
    path.join(syncDirPath, 'files', 'books'),
    path.join(syncDirPath, 'files', 'podcasts'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const metaPath = path.join(syncDirPath, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString() }, null, 2));
  }
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/icloud-detector.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/icloud-detector.ts tests/sync/icloud-detector.test.ts
git commit -m "feat(sync): iCloud 目录检测与管理"
```

---

## Task 3: 数据库 schema 新增同步表

**Files:**
- Modify: `src/main/db/index.ts`（在 `initTables` 末尾追加）

**Step 1: 写失败测试**

```typescript
// tests/sync/sync-tables.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

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
    const { initSyncTables } = require('../../src/main/services/sync/sync-tables');
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_changelog'").get();
    expect(info).toBeTruthy();
  });

  it('initSyncTables 创建 sync_cursors 表', () => {
    const { initSyncTables } = require('../../src/main/services/sync/sync-tables');
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_cursors'").get();
    expect(info).toBeTruthy();
  });

  it('initSyncTables 创建 sync_conflicts 表', () => {
    const { initSyncTables } = require('../../src/main/services/sync/sync-tables');
    initSyncTables(sqlite);
    const info = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_conflicts'").get();
    expect(info).toBeTruthy();
  });

  it('sync_changelog 支持插入和自增 ID', () => {
    const { initSyncTables } = require('../../src/main/services/sync/sync-tables');
    initSyncTables(sqlite);
    sqlite.prepare(`INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run('dev1', 'articles', 'art1', 'update', '{"readProgress":0.5}', '2026-02-15T10:00:00.000Z');
    const row = sqlite.prepare('SELECT * FROM sync_changelog WHERE id = 1').get() as Record<string, unknown>;
    expect(row.device_id).toBe('dev1');
    expect(row.synced).toBe(0);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/sync-tables.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/sync-tables.ts
import type Database from 'better-sqlite3';

export function initSyncTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_changelog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      changed_fields TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sync_changelog_synced ON sync_changelog(synced);
    CREATE INDEX IF NOT EXISTS idx_sync_changelog_timestamp ON sync_changelog(timestamp);

    CREATE TABLE IF NOT EXISTS sync_cursors (
      device_id TEXT PRIMARY KEY,
      last_file TEXT,
      last_id INTEGER,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      local_value TEXT,
      remote_value TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved);
  `);
}
```

**Step 4: 在 `src/main/db/index.ts` 的 `initTables` 末尾调用**

在 `initTables` 函数末尾（notifications 表创建之后）追加：

```typescript
// Migration: sync 同步表
const { initSyncTables } = require('../services/sync/sync-tables');
initSyncTables(sqlite);
```

**Step 5: 运行测试确认通过**

Run: `npx vitest run tests/sync/sync-tables.test.ts`
Expected: PASS

**Step 6: 提交**

```bash
git add src/main/services/sync/sync-tables.ts src/main/db/index.ts tests/sync/sync-tables.test.ts
git commit -m "feat(sync): 新增同步表 sync_changelog/sync_cursors/sync_conflicts"
```

---

## Task 4: 变更追踪器 (change-tracker)

**Files:**
- Create: `src/main/services/sync/change-tracker.ts`
- Test: `tests/sync/change-tracker.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/change-tracker.test.ts
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
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/change-tracker.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/change-tracker.ts
import type Database from 'better-sqlite3';

const EXCLUDED_TABLES = new Set(['app_tasks', 'notifications', 'downloads', 'sync_changelog', 'sync_cursors', 'sync_conflicts']);

export interface ChangeRecord {
  table: string;
  recordId: string;
  operation: 'insert' | 'update' | 'delete';
  changedFields: Record<string, unknown>;
}

export interface StoredChange {
  id: number;
  deviceId: string;
  table: string;
  recordId: string;
  operation: string;
  changedFields: Record<string, unknown>;
  timestamp: string;
}

export function createChangeTracker(sqlite: Database.Database, deviceId: string) {
  const insertStmt = sqlite.prepare(
    `INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const unsyncedStmt = sqlite.prepare(
    `SELECT id, device_id, table_name, record_id, operation, changed_fields, timestamp
     FROM sync_changelog WHERE synced = 0 ORDER BY id ASC`
  );

  const markSyncedStmt = sqlite.prepare(
    `UPDATE sync_changelog SET synced = 1 WHERE id = ?`
  );

  return {
    trackChange(record: ChangeRecord): void {
      if (EXCLUDED_TABLES.has(record.table)) return;
      insertStmt.run(
        deviceId,
        record.table,
        record.recordId,
        record.operation,
        JSON.stringify(record.changedFields),
        new Date().toISOString(),
      );
    },

    getUnsynced(): StoredChange[] {
      const rows = unsyncedStmt.all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as number,
        deviceId: r.device_id as string,
        table: r.table_name as string,
        recordId: r.record_id as string,
        operation: r.operation as string,
        changedFields: JSON.parse(r.changed_fields as string),
        timestamp: r.timestamp as string,
      }));
    },

    markSynced(ids: number[]): void {
      const tx = sqlite.transaction(() => {
        for (const id of ids) markSyncedStmt.run(id);
      });
      tx();
    },
  };
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/change-tracker.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/change-tracker.ts tests/sync/change-tracker.test.ts
git commit -m "feat(sync): 变更追踪器 change-tracker"
```

---

## Task 5: Changelog 写入器 (changelog-writer)

**Files:**
- Create: `src/main/services/sync/changelog-writer.ts`
- Test: `tests/sync/changelog-writer.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/changelog-writer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { StoredChange } from '../../src/main/services/sync/change-tracker';

describe('changelog-writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-cw-'));
    fs.mkdirSync(path.join(tmpDir, 'changelog', 'device-1'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('写入变更到 JSONL 文件', () => {
    const { createChangelogWriter } = require('../../src/main/services/sync/changelog-writer');
    const writer = createChangelogWriter(tmpDir, 'device-1');
    const changes: StoredChange[] = [{
      id: 1, deviceId: 'device-1', table: 'articles', recordId: 'a1',
      operation: 'update', changedFields: { readProgress: 0.5 },
      timestamp: '2026-02-15T10:00:00.000Z',
    }];
    const written = writer.writeChanges(changes);
    expect(written).toBe(1);

    // 验证文件存在
    const deviceDir = path.join(tmpDir, 'changelog', 'device-1');
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThan(0);

    // 验证内容
    const content = fs.readFileSync(path.join(deviceDir, files[0]), 'utf-8').trim();
    const line = JSON.parse(content);
    expect(line.table).toBe('articles');
    expect(line.recordId).toBe('a1');
  });

  it('多条变更追加到同一个时间片文件', () => {
    const { createChangelogWriter } = require('../../src/main/services/sync/changelog-writer');
    const writer = createChangelogWriter(tmpDir, 'device-1');
    const now = new Date().toISOString();
    writer.writeChanges([
      { id: 1, deviceId: 'device-1', table: 'articles', recordId: 'a1', operation: 'update', changedFields: { readProgress: 0.3 }, timestamp: now },
      { id: 2, deviceId: 'device-1', table: 'articles', recordId: 'a2', operation: 'update', changedFields: { readProgress: 0.7 }, timestamp: now },
    ]);
    const deviceDir = path.join(tmpDir, 'changelog', 'device-1');
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
    const lines = fs.readFileSync(path.join(deviceDir, files[0]), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('空变更列表不创建文件', () => {
    const { createChangelogWriter } = require('../../src/main/services/sync/changelog-writer');
    const writer = createChangelogWriter(tmpDir, 'device-1');
    writer.writeChanges([]);
    const deviceDir = path.join(tmpDir, 'changelog', 'device-1');
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
    expect(files).toHaveLength(0);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/changelog-writer.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/changelog-writer.ts
import fs from 'node:fs';
import path from 'node:path';
import type { StoredChange } from './change-tracker';

function getTimeSliceFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-00-00.jsonl`;
}

export function createChangelogWriter(syncDir: string, deviceId: string) {
  const deviceDir = path.join(syncDir, 'changelog', deviceId);

  return {
    writeChanges(changes: StoredChange[]): number {
      if (changes.length === 0) return 0;

      fs.mkdirSync(deviceDir, { recursive: true });
      const fileName = getTimeSliceFileName();
      const filePath = path.join(deviceDir, fileName);

      const lines = changes.map((c) =>
        JSON.stringify({
          id: c.id,
          deviceId: c.deviceId,
          table: c.table,
          recordId: c.recordId,
          op: c.operation,
          fields: c.changedFields,
          ts: c.timestamp,
        })
      );

      fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
      return changes.length;
    },
  };
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/changelog-writer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/changelog-writer.ts tests/sync/changelog-writer.test.ts
git commit -m "feat(sync): Changelog 写入器"
```

---

## Task 6: Changelog 读取器 (changelog-reader)

**Files:**
- Create: `src/main/services/sync/changelog-reader.ts`
- Test: `tests/sync/changelog-reader.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/changelog-reader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('changelog-reader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-cr-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTestChangelog(deviceId: string, fileName: string, lines: object[]) {
    const dir = path.join(tmpDir, 'changelog', deviceId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  }

  it('列出所有其他设备的 ID', () => {
    const { createChangelogReader } = require('../../src/main/services/sync/changelog-reader');
    writeTestChangelog('dev-a', '2026-02-15T10-00-00.jsonl', []);
    writeTestChangelog('dev-b', '2026-02-15T10-00-00.jsonl', []);
    const reader = createChangelogReader(tmpDir, 'dev-self');
    const devices = reader.listRemoteDevices();
    expect(devices).toContain('dev-a');
    expect(devices).toContain('dev-b');
    expect(devices).not.toContain('dev-self');
  });

  it('读取指定设备的所有变更', () => {
    const { createChangelogReader } = require('../../src/main/services/sync/changelog-reader');
    writeTestChangelog('dev-a', '2026-02-15T10-00-00.jsonl', [
      { id: 1, deviceId: 'dev-a', table: 'articles', recordId: 'a1', op: 'update', fields: { readProgress: 0.5 }, ts: '2026-02-15T10:00:00.000Z' },
      { id: 2, deviceId: 'dev-a', table: 'feeds', recordId: 'f1', op: 'insert', fields: { url: 'https://x.com/rss' }, ts: '2026-02-15T10:01:00.000Z' },
    ]);
    const reader = createChangelogReader(tmpDir, 'dev-self');
    const changes = reader.readChanges('dev-a');
    expect(changes).toHaveLength(2);
    expect(changes[0].table).toBe('articles');
  });

  it('按游标位置跳过已读变更', () => {
    const { createChangelogReader } = require('../../src/main/services/sync/changelog-reader');
    writeTestChangelog('dev-a', '2026-02-15T10-00-00.jsonl', [
      { id: 1, deviceId: 'dev-a', table: 'articles', recordId: 'a1', op: 'update', fields: {}, ts: '2026-02-15T10:00:00.000Z' },
      { id: 2, deviceId: 'dev-a', table: 'articles', recordId: 'a2', op: 'update', fields: {}, ts: '2026-02-15T10:01:00.000Z' },
    ]);
    writeTestChangelog('dev-a', '2026-02-15T11-00-00.jsonl', [
      { id: 3, deviceId: 'dev-a', table: 'articles', recordId: 'a3', op: 'update', fields: {}, ts: '2026-02-15T11:00:00.000Z' },
    ]);
    const reader = createChangelogReader(tmpDir, 'dev-self');
    const changes = reader.readChanges('dev-a', { lastFile: '2026-02-15T10-00-00.jsonl', lastId: 2 });
    expect(changes).toHaveLength(1);
    expect(changes[0].recordId).toBe('a3');
  });

  it('changelog 目录不存在时返回空数组', () => {
    const { createChangelogReader } = require('../../src/main/services/sync/changelog-reader');
    const reader = createChangelogReader(tmpDir, 'dev-self');
    expect(reader.listRemoteDevices()).toEqual([]);
    expect(reader.readChanges('nonexistent')).toEqual([]);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/changelog-reader.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/changelog-reader.ts
import fs from 'node:fs';
import path from 'node:path';

export interface RemoteChange {
  id: number;
  deviceId: string;
  table: string;
  recordId: string;
  operation: string;
  changedFields: Record<string, unknown>;
  timestamp: string;
  sourceFile: string;
}

export interface Cursor {
  lastFile: string;
  lastId: number;
}

export function createChangelogReader(syncDir: string, selfDeviceId: string) {
  const changelogDir = path.join(syncDir, 'changelog');

  return {
    listRemoteDevices(): string[] {
      if (!fs.existsSync(changelogDir)) return [];
      return fs.readdirSync(changelogDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== selfDeviceId)
        .map(d => d.name);
    },

    readChanges(deviceId: string, cursor?: Cursor): RemoteChange[] {
      const deviceDir = path.join(changelogDir, deviceId);
      if (!fs.existsSync(deviceDir)) return [];

      const files = fs.readdirSync(deviceDir)
        .filter(f => f.endsWith('.jsonl'))
        .sort();

      const results: RemoteChange[] = [];

      for (const file of files) {
        // 跳过游标之前的文件
        if (cursor && file < cursor.lastFile) continue;

        const content = fs.readFileSync(path.join(deviceDir, file), 'utf-8').trim();
        if (!content) continue;

        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);

          // 跳过游标同文件中已消费的 ID
          if (cursor && file === cursor.lastFile && parsed.id <= cursor.lastId) continue;

          results.push({
            id: parsed.id,
            deviceId: parsed.deviceId,
            table: parsed.table,
            recordId: parsed.recordId,
            operation: parsed.op,
            changedFields: parsed.fields,
            timestamp: parsed.ts,
            sourceFile: file,
          });
        }
      }

      return results;
    },
  };
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/changelog-reader.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/changelog-reader.ts tests/sync/changelog-reader.test.ts
git commit -m "feat(sync): Changelog 读取器"
```

---

## Task 7: 合并策略 (merge-strategy)

**Files:**
- Create: `src/main/services/sync/merge-strategy.ts`
- Test: `tests/sync/merge-strategy.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/merge-strategy.test.ts
import { describe, it, expect } from 'vitest';

describe('merge-strategy', () => {
  it('readProgress 取最大值', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles', { readProgress: 0.3 }, { readProgress: 0.7 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.readProgress).toBe(0.7);
  });

  it('readProgress 远端更大时采用远端', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles', { readProgress: 0.8 }, { readProgress: 0.5 }, '2026-02-15T10:00:00Z', '2026-02-15T11:00:00Z');
    expect(result.readProgress).toBe(0.8);
  });

  it('readStatus 取优先级更高的值', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles', { readStatus: 'inbox' }, { readStatus: 'archive' }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.readStatus).toBe('archive');
  });

  it('isShortlisted OR 合并', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles', { isShortlisted: 0 }, { isShortlisted: 1 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.isShortlisted).toBe(1);
  });

  it('deletedFlg OR 合并', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles', { deletedFlg: 0 }, { deletedFlg: 1 }, '2026-02-15T10:00:00Z', '2026-02-15T09:00:00Z');
    expect(result.deletedFlg).toBe(1);
  });

  it('普通文本字段 last-write-wins（远端更新）', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('feeds', { title: '本地标题' }, { title: '远端标题' }, '2026-02-15T09:00:00Z', '2026-02-15T10:00:00Z');
    expect(result.title).toBe('远端标题');
  });

  it('普通文本字段 last-write-wins（本地更新）', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('feeds', { title: '本地标题' }, { title: '远端标题' }, '2026-02-15T11:00:00Z', '2026-02-15T10:00:00Z');
    expect(result.title).toBe('本地标题');
  });

  it('混合字段合并', () => {
    const { mergeFields } = require('../../src/main/services/sync/merge-strategy');
    const result = mergeFields('articles',
      { readProgress: 0.3, readStatus: 'later', title: '本地' },
      { readProgress: 0.7, readStatus: 'inbox', title: '远端' },
      '2026-02-15T09:00:00Z', '2026-02-15T10:00:00Z'
    );
    expect(result.readProgress).toBe(0.7);   // 取最大
    expect(result.readStatus).toBe('later');  // 优先级更高
    expect(result.title).toBe('远端');         // last-write-wins
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/merge-strategy.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/merge-strategy.ts

const READ_STATUS_PRIORITY: Record<string, number> = {
  unseen: 0,
  inbox: 1,
  seen: 2,
  later: 3,
  archive: 4,
};

// 取最大值的字段
const MAX_FIELDS = new Set(['readProgress']);

// OR 合并的字段（任一为 1 则为 1）
const OR_FIELDS = new Set(['isShortlisted', 'deletedFlg']);

// 优先级排序的字段
const PRIORITY_FIELDS = new Set(['readStatus']);

export function mergeFields(
  _table: string,
  localFields: Record<string, unknown>,
  remoteFields: Record<string, unknown>,
  localTimestamp: string,
  remoteTimestamp: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(localFields), ...Object.keys(remoteFields)]);

  for (const key of allKeys) {
    const local = localFields[key];
    const remote = remoteFields[key];

    if (!(key in localFields)) {
      result[key] = remote;
    } else if (!(key in remoteFields)) {
      result[key] = local;
    } else if (MAX_FIELDS.has(key)) {
      result[key] = Math.max(Number(local) || 0, Number(remote) || 0);
    } else if (OR_FIELDS.has(key)) {
      result[key] = (local || remote) ? 1 : 0;
    } else if (PRIORITY_FIELDS.has(key)) {
      const localPri = READ_STATUS_PRIORITY[local as string] ?? -1;
      const remotePri = READ_STATUS_PRIORITY[remote as string] ?? -1;
      result[key] = localPri >= remotePri ? local : remote;
    } else {
      // last-write-wins
      result[key] = remoteTimestamp > localTimestamp ? remote : local;
    }
  }

  return result;
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/merge-strategy.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/merge-strategy.ts tests/sync/merge-strategy.test.ts
git commit -m "feat(sync): 字段级合并策略"
```

---

## Task 8: 快照管理器 (snapshot-manager)

**Files:**
- Create: `src/main/services/sync/snapshot-manager.ts`
- Test: `tests/sync/snapshot-manager.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/snapshot-manager.test.ts
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
    // 创建一个简单的 feeds 表用于测试
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
    // 写一个模拟快照
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
    expect(rows[0].title).toBe('本地标题'); // 不覆盖
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
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/snapshot-manager.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/snapshot-manager.ts
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

interface SnapshotData {
  deviceId: string;
  createdAt: string;
  [tableName: string]: unknown;
}

export function createSnapshotManager(sqlite: Database.Database, syncDir: string, deviceId: string) {
  const snapshotsDir = path.join(syncDir, 'snapshots');

  return {
    createSnapshot(tables: string[]): void {
      const snapshot: SnapshotData = {
        deviceId,
        createdAt: new Date().toISOString(),
      };

      for (const table of tables) {
        try {
          const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
          snapshot[table] = rows;
        } catch {
          snapshot[table] = [];
        }
      }

      fs.mkdirSync(snapshotsDir, { recursive: true });
      fs.writeFileSync(
        path.join(snapshotsDir, `latest-${deviceId}.json`),
        JSON.stringify(snapshot, null, 2),
        'utf-8',
      );
    },

    importSnapshot(sourceDeviceId: string, tables: string[]): void {
      const snapshotPath = path.join(snapshotsDir, `latest-${sourceDeviceId}.json`);
      if (!fs.existsSync(snapshotPath)) return;

      const snapshot: SnapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

      for (const table of tables) {
        const rows = snapshot[table] as Record<string, unknown>[] | undefined;
        if (!rows || rows.length === 0) continue;

        for (const row of rows) {
          const id = row.id as string;
          if (!id) continue;

          // 跳过已存在的记录
          const existing = sqlite.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
          if (existing) continue;

          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map(k => row[k]);

          try {
            sqlite.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
          } catch {
            // 跳过插入失败的记录（字段不匹配等）
          }
        }
      }
    },

    findLatestSnapshot(): string | null {
      if (!fs.existsSync(snapshotsDir)) return null;

      const files = fs.readdirSync(snapshotsDir).filter(f => f.startsWith('latest-') && f.endsWith('.json'));
      if (files.length === 0) return null;

      let latestDeviceId: string | null = null;
      let latestTime = '';

      for (const file of files) {
        const content: SnapshotData = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
        if (content.createdAt > latestTime) {
          latestTime = content.createdAt;
          latestDeviceId = content.deviceId;
        }
      }

      return latestDeviceId;
    },
  };
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/snapshot-manager.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/snapshot-manager.ts tests/sync/snapshot-manager.test.ts
git commit -m "feat(sync): 快照管理器"
```

---

## Task 9: 同步引擎 (sync-engine)

**Files:**
- Create: `src/main/services/sync/sync-engine.ts`
- Test: `tests/sync/sync-engine.test.ts`

**Step 1: 写失败测试**

```typescript
// tests/sync/sync-engine.test.ts
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
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
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

  it('getStatus 返回同步状态', () => {
    const { createSyncEngine } = require('../../src/main/services/sync/sync-engine');
    const engine = createSyncEngine({ sqlite, syncDir, deviceId: 'dev-1', syncTables: ['feeds', 'articles'] });
    const status = engine.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.deviceId).toBe('dev-1');
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/sync/sync-engine.test.ts`
Expected: FAIL

**Step 3: 实现**

```typescript
// src/main/services/sync/sync-engine.ts
import type Database from 'better-sqlite3';
import { createChangeTracker } from './change-tracker';
import { createChangelogWriter } from './changelog-writer';
import { createChangelogReader, type Cursor } from './changelog-reader';
import { mergeFields } from './merge-strategy';

export interface SyncEngineConfig {
  sqlite: Database.Database;
  syncDir: string;
  deviceId: string;
  syncTables: string[];
}

export interface SyncStatus {
  enabled: boolean;
  deviceId: string;
  lastSyncAt: string | null;
  remoteDevices: string[];
}

export function createSyncEngine(config: SyncEngineConfig) {
  const { sqlite, syncDir, deviceId, syncTables } = config;
  const tracker = createChangeTracker(sqlite, deviceId);
  const writer = createChangelogWriter(syncDir, deviceId);
  const reader = createChangelogReader(syncDir, deviceId);

  let lastSyncAt: string | null = null;

  // 加载游标
  function getCursor(remoteDeviceId: string): Cursor | undefined {
    const row = sqlite.prepare('SELECT last_file, last_id FROM sync_cursors WHERE device_id = ?').get(remoteDeviceId) as Record<string, unknown> | undefined;
    if (!row || !row.last_file) return undefined;
    return { lastFile: row.last_file as string, lastId: row.last_id as number };
  }

  function saveCursor(remoteDeviceId: string, cursor: Cursor): void {
    sqlite.prepare(
      `INSERT OR REPLACE INTO sync_cursors (device_id, last_file, last_id, updated_at) VALUES (?, ?, ?, ?)`
    ).run(remoteDeviceId, cursor.lastFile, cursor.lastId, new Date().toISOString());
  }

  return {
    push(): number {
      const unsynced = tracker.getUnsynced();
      if (unsynced.length === 0) return 0;
      const count = writer.writeChanges(unsynced);
      tracker.markSynced(unsynced.map(c => c.id));
      return count;
    },

    pull(): void {
      const devices = reader.listRemoteDevices();

      for (const remoteId of devices) {
        const cursor = getCursor(remoteId);
        const changes = reader.readChanges(remoteId, cursor);
        if (changes.length === 0) continue;

        for (const change of changes) {
          if (!syncTables.includes(change.table)) continue;

          if (change.operation === 'insert') {
            // 检查记录是否已存在
            const existing = sqlite.prepare(`SELECT * FROM ${change.table} WHERE id = ?`).get(change.recordId);
            if (!existing) {
              const fields = change.changedFields;
              const keys = Object.keys(fields);
              if (keys.length === 0) continue;
              const placeholders = keys.map(() => '?').join(', ');
              try {
                sqlite.prepare(`INSERT INTO ${change.table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...keys.map(k => fields[k]));
              } catch { /* 跳过 */ }
            }
          } else if (change.operation === 'update') {
            const existing = sqlite.prepare(`SELECT * FROM ${change.table} WHERE id = ?`).get(change.recordId) as Record<string, unknown> | undefined;
            if (!existing) continue;

            // 查找本地对同一记录的最新变更时间
            const localChange = sqlite.prepare(
              `SELECT timestamp FROM sync_changelog WHERE table_name = ? AND record_id = ? AND device_id = ? ORDER BY id DESC LIMIT 1`
            ).get(change.table, change.recordId, deviceId) as Record<string, unknown> | undefined;
            const localTs = (localChange?.timestamp as string) || (existing.updated_at as string) || '';

            const merged = mergeFields(change.table, existing, change.changedFields, localTs, change.timestamp);
            const updateKeys = Object.keys(change.changedFields);
            if (updateKeys.length === 0) continue;

            const sets = updateKeys.map(k => `${k} = ?`).join(', ');
            const values = updateKeys.map(k => merged[k]);
            try {
              sqlite.prepare(`UPDATE ${change.table} SET ${sets} WHERE id = ?`).run(...values, change.recordId);
            } catch { /* 跳过 */ }
          } else if (change.operation === 'delete') {
            try {
              sqlite.prepare(`UPDATE ${change.table} SET deleted_flg = 1 WHERE id = ?`).run(change.recordId);
            } catch { /* 跳过 */ }
          }
        }

        // 更新游标
        const lastChange = changes[changes.length - 1];
        saveCursor(remoteId, { lastFile: lastChange.sourceFile, lastId: lastChange.id });
      }

      lastSyncAt = new Date().toISOString();
    },

    syncNow(): { pushed: number } {
      const pushed = this.push();
      this.pull();
      return { pushed };
    },

    getStatus(): SyncStatus {
      return {
        enabled: true,
        deviceId,
        lastSyncAt,
        remoteDevices: reader.listRemoteDevices(),
      };
    },

    getTracker() {
      return tracker;
    },
  };
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/sync/sync-engine.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/sync/sync-engine.ts tests/sync/sync-engine.test.ts
git commit -m "feat(sync): 同步引擎"
```

---

## Task 10: IPC handlers + Preload + 类型定义

**Files:**
- Create: `src/main/ipc/sync-handlers.ts`
- Modify: `src/main/ipc/index.ts` — 注册 sync handlers
- Modify: `src/shared/ipc-channels.ts` — 新增 SYNC 通道
- Modify: `src/shared/types.ts` — 新增 SyncStatus 类型和 ElectronAPI 扩展
- Modify: `src/preload.ts` — 暴露 sync API
- Modify: `src/main/services/settings-service.ts` — 新增同步设置字段

**Step 1: 在 `src/shared/ipc-channels.ts` 末尾追加同步通道**

在 `NOTIFICATION_UNREAD_COUNT` 之后追加：

```typescript
  // Sync (iCloud 同步)
  SYNC_GET_STATUS: 'sync:getStatus',
  SYNC_ENABLE: 'sync:enable',
  SYNC_DISABLE: 'sync:disable',
  SYNC_NOW: 'sync:now',
  SYNC_GET_DEVICES: 'sync:getDevices',
```

**Step 2: 在 `src/shared/types.ts` 新增同步相关类型**

在文件末尾追加：

```typescript
// ── Sync ──
export interface SyncStatus {
  enabled: boolean;
  deviceId: string;
  lastSyncAt: string | null;
  remoteDevices: string[];
  icloudAvailable: boolean;
}

export interface SyncDevice {
  deviceId: string;
  name: string;
  platform: string;
  lastSeen?: string;
}
```

在 `AppSettings` 接口中新增字段：

```typescript
  // iCloud 同步
  syncEnabled?: boolean;
  syncBooks?: boolean;
  syncPodcasts?: boolean;
```

在 `ElectronAPI` 接口中新增方法：

```typescript
  // Sync
  syncGetStatus: () => Promise<SyncStatus>;
  syncEnable: () => Promise<SyncStatus>;
  syncDisable: () => Promise<void>;
  syncNow: () => Promise<{ pushed: number }>;
  syncGetDevices: () => Promise<SyncDevice[]>;
```

**Step 3: 创建 `src/main/ipc/sync-handlers.ts`**

```typescript
// src/main/ipc/sync-handlers.ts
import { ipcMain } from 'electron';
import { app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { createSyncEngine } from '../services/sync/sync-engine';
import { getOrCreateDeviceId, getDeviceInfo } from '../services/sync/device-identity';
import { checkICloudAvailability, getSyncDirectoryPath, ensureSyncDirectory } from '../services/sync/icloud-detector';
import { loadSettings, updateSettings } from '../services/settings-service';
import type { SyncStatus, SyncDevice } from '../../shared/types';

const SYNC_TABLES = ['feeds', 'articles', 'highlights', 'tags', 'article_tags', 'highlight_tags', 'books', 'views', 'transcripts', 'ai_settings', 'ai_task_logs'];

let engine: ReturnType<typeof createSyncEngine> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

function getEngine() {
  if (engine) return engine;
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  const userDataPath = app.getPath('userData');
  const deviceId = getOrCreateDeviceId(userDataPath);
  const syncDir = getSyncDirectoryPath();
  engine = createSyncEngine({ sqlite, syncDir, deviceId, syncTables: SYNC_TABLES });
  return engine;
}

function startSyncLoop() {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    try { getEngine().syncNow(); } catch { /* 静默失败 */ }
  }, 60_000);
  // 立即同步一次
  try { getEngine().syncNow(); } catch { /* 静默失败 */ }
}

function stopSyncLoop() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  engine = null;
}

export function registerSyncHandlers() {
  ipcMain.handle(IPC_CHANNELS.SYNC_GET_STATUS, async (): Promise<SyncStatus> => {
    const icloud = checkICloudAvailability();
    const settings = loadSettings();
    if (!settings.syncEnabled || !icloud.available) {
      return { enabled: false, deviceId: '', lastSyncAt: null, remoteDevices: [], icloudAvailable: icloud.available };
    }
    const status = getEngine().getStatus();
    return { ...status, icloudAvailable: true };
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_ENABLE, async (): Promise<SyncStatus> => {
    const icloud = checkICloudAvailability();
    if (!icloud.available) throw new Error('iCloud Drive 不可用，请检查是否已登录 iCloud');
    ensureSyncDirectory(getSyncDirectoryPath());
    updateSettings({ syncEnabled: true });
    startSyncLoop();
    const status = getEngine().getStatus();
    return { ...status, icloudAvailable: true };
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_DISABLE, async () => {
    updateSettings({ syncEnabled: false });
    stopSyncLoop();
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_NOW, async () => {
    return getEngine().syncNow();
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_GET_DEVICES, async (): Promise<SyncDevice[]> => {
    const syncDir = getSyncDirectoryPath();
    const fs = await import('node:fs');
    const path = await import('node:path');
    const devicesDir = path.join(syncDir, 'devices');
    if (!fs.existsSync(devicesDir)) return [];
    const files = fs.readdirSync(devicesDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(devicesDir, f), 'utf-8'));
      return { deviceId: data.deviceId, name: data.name, platform: data.platform, lastSeen: data.lastSeen };
    });
  });
}

// 应用启动时自动检测并启动同步
export function initSyncOnStartup() {
  const settings = loadSettings();
  if (settings.syncEnabled) {
    const icloud = checkICloudAvailability();
    if (icloud.available) {
      try { startSyncLoop(); } catch { /* 静默 */ }
    }
  }
}
```

**Step 4: 修改 `src/main/ipc/index.ts` 注册 sync handlers**

在 import 列表中追加：

```typescript
import { registerSyncHandlers } from './sync-handlers';
```

在 `registerAllIpcHandlers` 函数中追加：

```typescript
  registerSyncHandlers();
```

**Step 5: 修改 `src/preload.ts` 暴露 sync API**

在 electronAPI 对象中追加：

```typescript
  // ── Sync ──
  syncGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_STATUS),
  syncEnable: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_ENABLE),
  syncDisable: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_DISABLE),
  syncNow: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_NOW),
  syncGetDevices: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_DEVICES),
```

**Step 6: 提交**

```bash
git add src/main/ipc/sync-handlers.ts src/main/ipc/index.ts src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/services/settings-service.ts
git commit -m "feat(sync): IPC handlers + Preload + 类型定义"
```

---

## Task 11: 偏好设置 UI — 同步面板

**Files:**
- Modify: `src/renderer/components/preferences-layout.ts` — 新增 sync section
- Modify: `src/renderer/components/PreferencesDialog.tsx` — 新增同步设置渲染

**Step 1: 修改 `preferences-layout.ts`**

在 `PrimaryPreferenceSectionId` 类型中追加 `'sync'`：

```typescript
export type PrimaryPreferenceSectionId = 'general' | 'content' | 'asr' | 'ai' | 'sync';
```

在 `SecondaryPreferenceSectionId` 类型中追加 `'sync-general'`：

```typescript
  | 'sync-general';
```

在 `PRIMARY_PREFERENCE_SECTIONS` 数组末尾追加：

```typescript
  { id: 'sync' },
```

在 `getSecondarySectionsForPrimary` 中追加分支（在最后的 return 之前）：

```typescript
  if (primaryId === 'sync') {
    return [{ id: 'sync-general' }];
  }
```

**Step 2: 修改 `PreferencesDialog.tsx` 新增同步设置渲染**

在组件中新增状态：

```typescript
const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
const [syncDevices, setSyncDevices] = useState<SyncDevice[]>([]);
const [syncing, setSyncing] = useState(false);
```

新增加载函数（在 `useEffect` 中调用）：

```typescript
window.electronAPI.syncGetStatus().then(setSyncStatus).catch(() => {});
```

新增渲染函数 `renderSyncSection`：

```typescript
const renderSyncSection = () => {
  const icloudAvailable = syncStatus?.icloudAvailable ?? false;
  const enabled = syncStatus?.enabled ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t('sync.title')}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {icloudAvailable ? t('sync.icloudAvailable') : t('sync.icloudUnavailable')}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={!icloudAvailable}
          onCheckedChange={async (checked) => {
            if (checked) {
              const status = await window.electronAPI.syncEnable();
              setSyncStatus(status);
            } else {
              await window.electronAPI.syncDisable();
              setSyncStatus(prev => prev ? { ...prev, enabled: false } : null);
            }
          }}
        />
      </div>

      {enabled && (
        <>
          {/* 同步状态 */}
          <div className="text-xs text-muted-foreground">
            {syncStatus?.lastSyncAt
              ? `${t('sync.lastSync')}: ${new Date(syncStatus.lastSyncAt).toLocaleString()}`
              : t('sync.neverSynced')}
          </div>

          {/* 同步内容选项 */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">{t('sync.contentTitle')}</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('sync.books')}</span>
              <Switch
                checked={settings.syncBooks ?? false}
                onCheckedChange={(v) => updateField('syncBooks', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('sync.podcasts')}</span>
              <Switch
                checked={settings.syncPodcasts ?? false}
                onCheckedChange={(v) => updateField('syncPodcasts', v)}
              />
            </div>
          </div>

          {/* 立即同步按钮 */}
          <Button
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await window.electronAPI.syncNow();
                const status = await window.electronAPI.syncGetStatus();
                setSyncStatus(status);
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? t('sync.syncing') : t('sync.syncNow')}
          </Button>
        </>
      )}
    </div>
  );
};
```

在 `renderActiveSection` 中追加：

```typescript
if (activeSecondary === 'sync-general') return renderSyncSection();
```

**Step 3: 新增国际化文本**

在 `src/locales/zh.json` 中追加：

```json
"sync.title": "iCloud 同步",
"sync.icloudAvailable": "iCloud Drive 可用",
"sync.icloudUnavailable": "iCloud Drive 不可用，请登录 iCloud",
"sync.lastSync": "最近同步",
"sync.neverSynced": "尚未同步",
"sync.contentTitle": "同步内容",
"sync.books": "电子书文件 (EPUB/PDF)",
"sync.podcasts": "播客音频文件",
"sync.syncNow": "立即同步",
"sync.syncing": "同步中..."
```

在 `src/locales/en.json` 中追加：

```json
"sync.title": "iCloud Sync",
"sync.icloudAvailable": "iCloud Drive available",
"sync.icloudUnavailable": "iCloud Drive unavailable, please sign in to iCloud",
"sync.lastSync": "Last synced",
"sync.neverSynced": "Never synced",
"sync.contentTitle": "Sync Content",
"sync.books": "Book files (EPUB/PDF)",
"sync.podcasts": "Podcast audio files",
"sync.syncNow": "Sync Now",
"sync.syncing": "Syncing..."
```

**Step 4: 运行开发模式验证 UI**

Run: `pnpm start`
Expected: 偏好设置中出现"同步"选项卡，UI 正常渲染

**Step 5: 提交**

```bash
git add src/renderer/components/preferences-layout.ts src/renderer/components/PreferencesDialog.tsx src/locales/zh.json src/locales/en.json
git commit -m "feat(sync): 偏好设置同步面板 UI"
```

---

## Task 12: IPC handler 注入变更追踪

**Files:**
- Modify: `src/main/ipc/feed-handlers.ts`
- Modify: `src/main/ipc/article-handlers.ts`
- Modify: `src/main/ipc/highlight-handlers.ts`
- Modify: `src/main/ipc/tag-handlers.ts`
- Modify: `src/main/ipc/book-handlers.ts`
- Modify: `src/main/ipc/transcript-handlers.ts`

**Step 1: 创建全局 tracker 获取函数**

在 `src/main/ipc/sync-handlers.ts` 中导出：

```typescript
export function getGlobalTracker() {
  if (!engine) return null;
  return engine.getTracker();
}
```

**Step 2: 在每个写操作 handler 末尾追加 trackChange 调用**

模式统一为（以 `feed-handlers.ts` FEED_ADD 为例）：

```typescript
import { getGlobalTracker } from './sync-handlers';

// 在 insert 之后追加：
getGlobalTracker()?.trackChange({ table: 'feeds', recordId: id, operation: 'insert', changedFields: values });
```

**需要注入的操作清单：**

| Handler 文件 | 操作 | 表 | 类型 |
|-------------|------|------|------|
| feed-handlers.ts | FEED_ADD | feeds | insert |
| feed-handlers.ts | FEED_UPDATE | feeds | update |
| feed-handlers.ts | FEED_DELETE | feeds | delete |
| feed-handlers.ts | FEED_TOGGLE_PIN | feeds | update |
| article-handlers.ts | ARTICLE_UPDATE | articles | update |
| article-handlers.ts | ARTICLE_DELETE | articles | delete |
| article-handlers.ts | ARTICLE_BATCH_UPDATE | articles | update (每条) |
| article-handlers.ts | ARTICLE_SAVE_URL | articles | insert |
| article-handlers.ts | ARTICLE_SAVE_TO_LIBRARY | articles | insert |
| article-handlers.ts | ARTICLE_RESTORE | articles | update |
| highlight-handlers.ts | HIGHLIGHT_CREATE | highlights | insert |
| highlight-handlers.ts | HIGHLIGHT_UPDATE | highlights | update |
| highlight-handlers.ts | HIGHLIGHT_DELETE | highlights | delete |
| tag-handlers.ts | TAG_CREATE | tags | insert |
| tag-handlers.ts | TAG_DELETE | tags | delete |
| tag-handlers.ts | ARTICLE_TAG_ADD | article_tags | insert |
| tag-handlers.ts | ARTICLE_TAG_REMOVE | article_tags | delete |
| book-handlers.ts | BOOK_IMPORT | books | insert |
| book-handlers.ts | BOOK_UPDATE | books | update |
| book-handlers.ts | BOOK_DELETE | books | delete |
| transcript-handlers.ts | TRANSCRIPT_FETCH | transcripts | insert |
| transcript-handlers.ts | TRANSCRIPT_UPDATE_SPEAKER | transcripts | update |

**Step 3: 逐文件添加**

每个文件顶部追加 import：

```typescript
import { getGlobalTracker } from './sync-handlers';
```

在每个写操作的返回语句前追加 `getGlobalTracker()?.trackChange(...)` 调用。

**Step 4: 验证**

Run: `pnpm start`
Expected: 操作时 sync_changelog 表有新记录生成

**Step 5: 提交**

```bash
git add src/main/ipc/feed-handlers.ts src/main/ipc/article-handlers.ts src/main/ipc/highlight-handlers.ts src/main/ipc/tag-handlers.ts src/main/ipc/book-handlers.ts src/main/ipc/transcript-handlers.ts src/main/ipc/sync-handlers.ts
git commit -m "feat(sync): IPC handlers 注入变更追踪"
```

---

## Task 13: 启动时自动初始化同步 + changelog 清理

**Files:**
- Modify: `src/main.ts` — 在应用就绪后调用 `initSyncOnStartup`
- Modify: `src/main/ipc/sync-handlers.ts` — 新增 changelog 清理逻辑

**Step 1: 在 `src/main.ts` 的 `app.whenReady()` 中追加**

```typescript
import { initSyncOnStartup } from './main/ipc/sync-handlers';

// 在 createWindow 之后调用
initSyncOnStartup();
```

**Step 2: 在 sync-handlers.ts 中追加定期清理**

在 `startSyncLoop` 中追加每日清理逻辑：过期 30 天的 changelog 文件自动删除。

```typescript
function cleanupOldChangelogs() {
  const syncDir = getSyncDirectoryPath();
  const changelogDir = path.join(syncDir, 'changelog');
  if (!fs.existsSync(changelogDir)) return;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const device of fs.readdirSync(changelogDir, { withFileTypes: true })) {
    if (!device.isDirectory()) continue;
    const deviceDir = path.join(changelogDir, device.name);
    for (const file of fs.readdirSync(deviceDir)) {
      if (file.endsWith('.jsonl') && file.slice(0, 10) < cutoff) {
        fs.unlinkSync(path.join(deviceDir, file));
      }
    }
  }
}
```

**Step 3: 提交**

```bash
git add src/main.ts src/main/ipc/sync-handlers.ts
git commit -m "feat(sync): 启动自动初始化同步 + changelog 清理"
```
