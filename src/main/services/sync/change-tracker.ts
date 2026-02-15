import type Database from 'better-sqlite3';

const EXCLUDED_TABLES = new Set(['app_tasks', 'notifications', 'downloads', 'sync_changelog', 'sync_cursors', 'sync_conflicts']);

export interface ChangeRecord {
  table: string;
  recordId: string;
  operation: 'insert' | 'update' | 'delete';
  changedFields: Record<string, unknown>;
}

export interface StoredChange {
  id: number;
  deviceId: string;
  table: string;
  recordId: string;
  operation: string;
  changedFields: Record<string, unknown>;
  timestamp: string;
}

export function createChangeTracker(sqlite: Database.Database, deviceId: string) {
  const insertStmt = sqlite.prepare(
    `INSERT INTO sync_changelog (device_id, table_name, record_id, operation, changed_fields, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const unsyncedStmt = sqlite.prepare(
    `SELECT id, device_id, table_name, record_id, operation, changed_fields, timestamp
     FROM sync_changelog WHERE synced = 0 ORDER BY id ASC`
  );

  const markSyncedStmt = sqlite.prepare(
    `UPDATE sync_changelog SET synced = 1 WHERE id = ?`
  );

  return {
    trackChange(record: ChangeRecord): void {
      if (EXCLUDED_TABLES.has(record.table)) return;
      insertStmt.run(
        deviceId,
        record.table,
        record.recordId,
        record.operation,
        JSON.stringify(record.changedFields),
        new Date().toISOString(),
      );
    },

    getUnsynced(): StoredChange[] {
      const rows = unsyncedStmt.all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as number,
        deviceId: r.device_id as string,
        table: r.table_name as string,
        recordId: r.record_id as string,
        operation: r.operation as string,
        changedFields: JSON.parse(r.changed_fields as string),
        timestamp: r.timestamp as string,
      }));
    },

    markSynced(ids: number[]): void {
      const tx = sqlite.transaction(() => {
        for (const id of ids) markSyncedStmt.run(id);
      });
      tx();
    },
  };
}
