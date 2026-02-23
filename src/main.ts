import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getDatabase } from './main/db';
import { registerAllIpcHandlers } from './main/ipc';
import { startScheduledFetch, backfillMissingContent } from './main/services/rss-service';
import { startApiServer, stopApiServer } from './main/services/api-server';
import { initSyncOnStartup } from './main/ipc/sync-handlers';

if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.on('ready', () => {
  getDatabase();
  registerAllIpcHandlers();
  startScheduledFetch(15);
  backfillMissingContent().catch(console.error);
  startApiServer();

  // 移除微信图片防盗链 Referer，解决"此图片来自微信公众平台未经允许不可引用"
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.qpic.cn/*', '*://mmbiz.qpic.cn/*'] },
    (details, callback) => {
      delete details.requestHeaders['Referer'];
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  createWindow();

  // 启动 iCloud 同步（如果已启用）
  initSyncOnStartup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopApiServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
