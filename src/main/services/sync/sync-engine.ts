// src/main/services/sync/sync-engine.ts
// 同步引擎：组合变更追踪、日志写入/读取、合并策略，提供 push/pull/syncNow 接口

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

  // 从 sync_cursors 表加载指定远端设备的读取游标
  function getCursor(remoteDeviceId: string): Cursor | undefined {
    const row = sqlite.prepare(
      'SELECT last_file, last_id FROM sync_cursors WHERE device_id = ?'
    ).get(remoteDeviceId) as Record<string, unknown> | undefined;
    if (!row || !row.last_file) return undefined;
    return { lastFile: row.last_file as string, lastId: row.last_id as number };
  }

  // 保存游标到 sync_cursors 表
  function saveCursor(remoteDeviceId: string, cursor: Cursor): void {
    sqlite.prepare(
      `INSERT OR REPLACE INTO sync_cursors (device_id, last_file, last_id, updated_at) VALUES (?, ?, ?, ?)`
    ).run(remoteDeviceId, cursor.lastFile, cursor.lastId, new Date().toISOString());
  }

  return {
    /**
     * 将本地未同步的变更推送到 iCloud 同步目录
     * @returns 推送的变更条数
     */
    push(): number {
      const unsynced = tracker.getUnsynced();
      if (unsynced.length === 0) return 0;
      const count = writer.writeChanges(unsynced);
      tracker.markSynced(unsynced.map(c => c.id));
      return count;
    },

    /**
     * 从 iCloud 同步目录拉取远端设备的变更并合并到本地数据库
     */
    pull(): void {
      const devices = reader.listRemoteDevices();

      for (const remoteId of devices) {
        const cursor = getCursor(remoteId);
        const changes = reader.readChanges(remoteId, cursor);
        if (changes.length === 0) continue;

        for (const change of changes) {
          // 跳过不在同步表列表中的变更
          if (!syncTables.includes(change.table)) continue;

          if (change.operation === 'insert') {
            // 插入操作：仅在本地不存在该记录时插入
            const existing = sqlite.prepare(
              `SELECT * FROM ${change.table} WHERE id = ?`
            ).get(change.recordId);
            if (!existing) {
              const fields = change.changedFields;
              const keys = Object.keys(fields);
              if (keys.length === 0) continue;
              const placeholders = keys.map(() => '?').join(', ');
              try {
                sqlite.prepare(
                  `INSERT INTO ${change.table} (${keys.join(', ')}) VALUES (${placeholders})`
                ).run(...keys.map(k => fields[k]));
              } catch {
                // 插入失败时跳过（例如字段不匹配）
              }
            }
          } else if (change.operation === 'update') {
            // 更新操作：合并远端字段到本地记录
            const existing = sqlite.prepare(
              `SELECT * FROM ${change.table} WHERE id = ?`
            ).get(change.recordId) as Record<string, unknown> | undefined;
            if (!existing) continue;

            // 查找本地对同一记录的最新变更时间戳，用于 LWW 策略
            const localChange = sqlite.prepare(
              `SELECT timestamp FROM sync_changelog WHERE table_name = ? AND record_id = ? AND device_id = ? ORDER BY id DESC LIMIT 1`
            ).get(change.table, change.recordId, deviceId) as Record<string, unknown> | undefined;
            const localTs = (localChange?.timestamp as string) || (existing.updated_at as string) || '';

            const merged = mergeFields(
              change.table,
              existing,
              change.changedFields,
              localTs,
              change.timestamp,
            );

            const updateKeys = Object.keys(change.changedFields);
            if (updateKeys.length === 0) continue;

            const sets = updateKeys.map(k => `${k} = ?`).join(', ');
            const values = updateKeys.map(k => merged[k]);
            try {
              sqlite.prepare(
                `UPDATE ${change.table} SET ${sets} WHERE id = ?`
              ).run(...values, change.recordId);
            } catch {
              // 更新失败时跳过
            }
          } else if (change.operation === 'delete') {
            // 删除操作：软删除，设置 deleted_flg = 1
            try {
              sqlite.prepare(
                `UPDATE ${change.table} SET deleted_flg = 1 WHERE id = ?`
              ).run(change.recordId);
            } catch {
              // 删除失败时跳过
            }
          }
        }

        // 更新游标，记录已处理到的位置
        const lastChange = changes[changes.length - 1];
        saveCursor(remoteId, { lastFile: lastChange.sourceFile, lastId: lastChange.id });
      }

      lastSyncAt = new Date().toISOString();
    },

    /**
     * 执行一次完整同步：先 push 再 pull
     * @returns 推送的变更条数
     */
    syncNow(): { pushed: number } {
      const pushed = this.push();
      this.pull();
      return { pushed };
    },

    /**
     * 获取当前同步状态
     */
    getStatus(): SyncStatus {
      return {
        enabled: true,
        deviceId,
        lastSyncAt,
        remoteDevices: reader.listRemoteDevices(),
      };
    },

    /**
     * 获取变更追踪器实例，供外部模块使用
     */
    getTracker() {
      return tracker;
    },
  };
}
