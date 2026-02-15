import type Database from 'better-sqlite3';

export function initSyncTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_changelog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      changed_fields TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sync_changelog_synced ON sync_changelog(synced);
    CREATE INDEX IF NOT EXISTS idx_sync_changelog_timestamp ON sync_changelog(timestamp);

    CREATE TABLE IF NOT EXISTS sync_cursors (
      device_id TEXT PRIMARY KEY,
      last_file TEXT,
      last_id INTEGER,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      local_value TEXT,
      remote_value TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved);
  `);
}
