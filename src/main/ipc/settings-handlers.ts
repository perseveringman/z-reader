import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { loadSettings, updateSettings } from '../services/settings-service';
import type { AppSettings } from '../../shared/types';

export function registerSettingsHandlers() {
  const { SETTINGS_GET, SETTINGS_SET } = IPC_CHANNELS;

  ipcMain.handle(SETTINGS_GET, async () => {
    return loadSettings();
  });

  ipcMain.handle(SETTINGS_SET, async (_event, partial: Partial<AppSettings>) => {
    return updateSettings(partial);
  });
}
