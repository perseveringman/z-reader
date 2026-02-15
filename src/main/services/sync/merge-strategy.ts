const READ_STATUS_PRIORITY: Record<string, number> = {
  unseen: 0,
  inbox: 1,
  seen: 2,
  later: 3,
  archive: 4,
};

const MAX_FIELDS = new Set(['readProgress']);
const OR_FIELDS = new Set(['isShortlisted', 'deletedFlg']);
const PRIORITY_FIELDS = new Set(['readStatus']);

export function mergeFields(
  _table: string,
  localFields: Record<string, unknown>,
  remoteFields: Record<string, unknown>,
  localTimestamp: string,
  remoteTimestamp: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(localFields), ...Object.keys(remoteFields)]);

  for (const key of allKeys) {
    const local = localFields[key];
    const remote = remoteFields[key];

    if (!(key in localFields)) {
      result[key] = remote;
    } else if (!(key in remoteFields)) {
      result[key] = local;
    } else if (MAX_FIELDS.has(key)) {
      result[key] = Math.max(Number(local) || 0, Number(remote) || 0);
    } else if (OR_FIELDS.has(key)) {
      result[key] = (local || remote) ? 1 : 0;
    } else if (PRIORITY_FIELDS.has(key)) {
      const localPri = READ_STATUS_PRIORITY[local as string] ?? -1;
      const remotePri = READ_STATUS_PRIORITY[remote as string] ?? -1;
      result[key] = localPri >= remotePri ? local : remote;
    } else {
      // last-write-wins
      result[key] = remoteTimestamp > localTimestamp ? remote : local;
    }
  }

  return result;
}
