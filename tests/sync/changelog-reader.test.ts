import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createChangelogReader } from '../../src/main/services/sync/changelog-reader';

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
    writeTestChangelog('dev-a', '2026-02-15T10-00-00.jsonl', []);
    writeTestChangelog('dev-b', '2026-02-15T10-00-00.jsonl', []);
    const reader = createChangelogReader(tmpDir, 'dev-self');
    const devices = reader.listRemoteDevices();
    expect(devices).toContain('dev-a');
    expect(devices).toContain('dev-b');
    expect(devices).not.toContain('dev-self');
  });

  it('读取指定设备的所有变更', () => {
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
    const reader = createChangelogReader(tmpDir, 'dev-self');
    expect(reader.listRemoteDevices()).toEqual([]);
    expect(reader.readChanges('nonexistent')).toEqual([]);
  });
});
