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
