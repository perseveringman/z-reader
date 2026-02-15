import fs from 'node:fs';
import path from 'node:path';
import type { StoredChange } from './change-tracker';

function getTimeSliceFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-00-00.jsonl`;
}

export function createChangelogWriter(syncDir: string, deviceId: string) {
  const deviceDir = path.join(syncDir, 'changelog', deviceId);

  return {
    writeChanges(changes: StoredChange[]): number {
      if (changes.length === 0) return 0;

      fs.mkdirSync(deviceDir, { recursive: true });
      const fileName = getTimeSliceFileName();
      const filePath = path.join(deviceDir, fileName);

      const lines = changes.map((c) =>
        JSON.stringify({
          id: c.id,
          deviceId: c.deviceId,
          table: c.table,
          recordId: c.recordId,
          op: c.operation,
          fields: c.changedFields,
          ts: c.timestamp,
        })
      );

      fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
      return changes.length;
    },
  };
}
