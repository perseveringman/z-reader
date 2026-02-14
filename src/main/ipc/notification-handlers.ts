/**
 * Notification IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  listNotifications,
  markRead,
  markAllRead,
  clearNotifications,
  getUnreadCount,
} from '../services/notification-service';

export function registerNotificationHandlers() {
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_LIST, async () => {
    return listNotifications();
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_READ, async (_event, id: string) => {
    await markRead(id);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_READ_ALL, async () => {
    await markAllRead();
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_CLEAR, async () => {
    await clearNotifications();
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_UNREAD_COUNT, async () => {
    return getUnreadCount();
  });
}
