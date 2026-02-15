import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkICloudAvailability, ensureSyncDirectory, getDefaultICloudBasePath } from '../../src/main/services/sync/icloud-detector';

describe('icloud-detector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-icloud-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('检测 iCloud 目录不存在时返回 unavailable', () => {
    const result = checkICloudAvailability(path.join(tmpDir, 'nonexistent'));
    expect(result.available).toBe(false);
  });

  it('检测 iCloud 目录存在时返回 available', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = checkICloudAvailability(tmpDir);
    expect(result.available).toBe(true);
  });

  it('ensureSyncDirectory 创建完整目录结构', () => {
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
    const p = getDefaultICloudBasePath();
    expect(p).toContain('Mobile Documents');
  });
});
