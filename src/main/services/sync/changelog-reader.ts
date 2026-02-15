import fs from 'node:fs';
import path from 'node:path';

export interface RemoteChange {
  id: number;
  deviceId: string;
  table: string;
  recordId: string;
  operation: string;
  changedFields: Record<string, unknown>;
  timestamp: string;
  sourceFile: string;
}

export interface Cursor {
  lastFile: string;
  lastId: number;
}

export function createChangelogReader(syncDir: string, selfDeviceId: string) {
  const changelogDir = path.join(syncDir, 'changelog');

  return {
    listRemoteDevices(): string[] {
      if (!fs.existsSync(changelogDir)) return [];
      return fs.readdirSync(changelogDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== selfDeviceId)
        .map(d => d.name);
    },

    readChanges(deviceId: string, cursor?: Cursor): RemoteChange[] {
      const deviceDir = path.join(changelogDir, deviceId);
      if (!fs.existsSync(deviceDir)) return [];

      const files = fs.readdirSync(deviceDir)
        .filter(f => f.endsWith('.jsonl'))
        .sort();

      const results: RemoteChange[] = [];

      for (const file of files) {
        if (cursor && file < cursor.lastFile) continue;

        const content = fs.readFileSync(path.join(deviceDir, file), 'utf-8').trim();
        if (!content) continue;

        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);

          if (cursor && file === cursor.lastFile && parsed.id <= cursor.lastId) continue;

          results.push({
            id: parsed.id,
            deviceId: parsed.deviceId,
            table: parsed.table,
            recordId: parsed.recordId,
            operation: parsed.op,
            changedFields: parsed.fields,
            timestamp: parsed.ts,
            sourceFile: file,
          });
        }
      }

      return results;
    },
  };
}
