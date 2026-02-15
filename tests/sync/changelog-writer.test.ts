import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { StoredChange } from '../../src/main/services/sync/change-tracker';
import { createChangelogWriter } from '../../src/main/services/sync/changelog-writer';

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
    const writer = createChangelogWriter(tmpDir, 'device-1');
    const changes: StoredChange[] = [{
      id: 1, deviceId: 'device-1', table: 'articles', recordId: 'a1',
      operation: 'update', changedFields: { readProgress: 0.5 },
      timestamp: '2026-02-15T10:00:00.000Z',
    }];
    const written = writer.writeChanges(changes);
    expect(written).toBe(1);

    const deviceDir = path.join(tmpDir, 'changelog', 'device-1');
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThan(0);

    const content = fs.readFileSync(path.join(deviceDir, files[0]), 'utf-8').trim();
    const line = JSON.parse(content);
    expect(line.table).toBe('articles');
    expect(line.recordId).toBe('a1');
  });

  it('多条变更追加到同一个时间片文件', () => {
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
    const writer = createChangelogWriter(tmpDir, 'device-1');
    writer.writeChanges([]);
    const deviceDir = path.join(tmpDir, 'changelog', 'device-1');
    const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.jsonl'));
    expect(files).toHaveLength(0);
  });
});
