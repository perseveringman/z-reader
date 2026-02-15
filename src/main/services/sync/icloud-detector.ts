import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 使用 iCloud Drive 公共目录（com~apple~CloudDocs）下的 Z-Reader 子目录
// 注：iCloud~ 容器需要 Apple 开发者签名，Electron 应用使用公共 iCloud Drive 目录
const SYNC_FOLDER = 'Z-Reader';

export interface ICloudStatus {
  available: boolean;
  path?: string;
}

export function getDefaultICloudBasePath(): string {
  return path.join(os.homedir(), 'Library', 'Mobile Documents');
}

export function getSyncDirectoryPath(icloudBasePath?: string): string {
  const base = icloudBasePath || getDefaultICloudBasePath();
  return path.join(base, 'com~apple~CloudDocs', SYNC_FOLDER);
}

export function checkICloudAvailability(mobileDocumentsPath?: string): ICloudStatus {
  const dir = mobileDocumentsPath || getDefaultICloudBasePath();
  try {
    // 只检查可读性，Mobile Documents 目录本身在 macOS 上是只读的
    // 实际写入发生在容器子目录中（由 ensureSyncDirectory 创建）
    fs.accessSync(dir, fs.constants.R_OK);
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
