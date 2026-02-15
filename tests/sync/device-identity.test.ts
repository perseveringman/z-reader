import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getOrCreateDeviceId, getDeviceInfo, _resetCache } from '../../src/main/services/sync/device-identity';

describe('device-identity', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-reader-test-'));
    _resetCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('首次调用生成新的 deviceId 并写入文件', () => {
    const id = getOrCreateDeviceId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const filePath = path.join(tmpDir, 'z-reader-device.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.deviceId).toBe(id);
  });

  it('再次调用返回相同的 deviceId', () => {
    const id1 = getOrCreateDeviceId(tmpDir);
    const id2 = getOrCreateDeviceId(tmpDir);
    expect(id1).toBe(id2);
  });

  it('getDeviceInfo 返回设备名称和 ID', () => {
    getOrCreateDeviceId(tmpDir);
    const info = getDeviceInfo(tmpDir);
    expect(info.deviceId).toBeTruthy();
    expect(info.name).toBeTruthy();
    expect(info.platform).toBe('darwin');
  });
});
