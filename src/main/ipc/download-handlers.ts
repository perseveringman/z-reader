import { ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  startDownload,
  cancelDownload,
  listDownloads,
  getDownloadStatus,
  getDownloadDir,
} from '../services/download-service';

export function registerDownloadHandlers() {
  const { DOWNLOAD_START, DOWNLOAD_CANCEL, DOWNLOAD_LIST, DOWNLOAD_STATUS, DOWNLOAD_OPEN_DIR } = IPC_CHANNELS;

  ipcMain.handle(DOWNLOAD_START, async (_event, articleId: string) => {
    return startDownload(articleId);
  });

  ipcMain.handle(DOWNLOAD_CANCEL, async (_event, downloadId: string) => {
    return cancelDownload(downloadId);
  });

  ipcMain.handle(DOWNLOAD_LIST, async () => {
    return listDownloads();
  });

  ipcMain.handle(DOWNLOAD_STATUS, async (_event, downloadId: string) => {
    return getDownloadStatus(downloadId);
  });

  ipcMain.handle(DOWNLOAD_OPEN_DIR, async () => {
    const dir = getDownloadDir();
    await shell.openPath(dir);
  });
}
