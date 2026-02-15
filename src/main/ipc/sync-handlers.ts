// src/main/ipc/sync-handlers.ts
import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { createSyncEngine } from '../services/sync/sync-engine';
import { getOrCreateDeviceId } from '../services/sync/device-identity';
import { checkICloudAvailability, getSyncDirectoryPath, ensureSyncDirectory } from '../services/sync/icloud-detector';
import { loadSettings, updateSettings } from '../services/settings-service';
import type { SyncStatus, SyncDevice } from '../../shared/types';

const SYNC_TABLES = ['feeds', 'articles', 'highlights', 'tags', 'article_tags', 'highlight_tags', 'books', 'views', 'transcripts', 'ai_settings', 'ai_task_logs', 'ai_prompt_presets'];

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

// 清理 30 天前的 changelog 文件
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

function startSyncLoop() {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    try { getEngine().syncNow(); } catch { /* 静默失败 */ }
  }, 60_000);
  // 立即同步一次
  try { getEngine().syncNow(); } catch { /* 静默失败 */ }
  // 启动时清理过期 changelog
  try { cleanupOldChangelogs(); } catch { /* 静默 */ }
}

function stopSyncLoop() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  engine = null;
}

export function getGlobalTracker() {
  if (!engine) return null;
  return engine.getTracker();
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
