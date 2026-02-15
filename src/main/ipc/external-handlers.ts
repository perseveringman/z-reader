import { ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

export function registerExternalHandlers() {
  ipcMain.handle(IPC_CHANNELS.EXTERNAL_OPEN_URL, async (_event, rawUrl: string) => {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      return false;
    }

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      await shell.openExternal(parsed.toString());
      return true;
    } catch {
      return false;
    }
  });
}
