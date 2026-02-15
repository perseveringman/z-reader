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
