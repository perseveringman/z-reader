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

          const existing = sqlite.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
          if (existing) continue;

          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map(k => row[k]);

          try {
            sqlite.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
          } catch {
            // 跳过插入失败的记录
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
