import { ipcMain, dialog, clipboard, nativeImage } from 'electron';
import { writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

const { SHARE_CARD_EXPORT_IMAGE, SHARE_CARD_COPY_CLIPBOARD } = IPC_CHANNELS;

export function registerShareCardHandlers() {
  // 保存图片到磁盘
  ipcMain.handle(SHARE_CARD_EXPORT_IMAGE, async (_event, dataUrl: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (canceled || !filePath) return '';
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    await writeFile(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  });

  // 复制图片到剪贴板
  ipcMain.handle(SHARE_CARD_COPY_CLIPBOARD, async (_event, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(img);
  });
}
