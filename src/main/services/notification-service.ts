/**
 * 通知服务
 *
 * 双通道通知：应用内通知中心（持久化）+ 系统级 Notification。
 */

import { BrowserWindow, Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AppNotification, NotificationType } from '../../shared/types';

/** DB 行转换为 AppNotification */
function toNotification(row: typeof schema.notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body ?? undefined,
    articleId: row.articleId ?? undefined,
    read: row.read === 1,
    createdAt: row.createdAt,
  };
}

/**
 * 发送通知（三通道同时触发）：
 * 1. 写入 DB
 * 2. 广播到 renderer (Toast + 通知中心)
 * 3. 发送系统 Notification
 */
export async function sendNotification(opts: {
  type: NotificationType;
  title: string;
  body?: string;
  articleId?: string;
}): Promise<AppNotification> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(schema.notifications).values({
    id,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    articleId: opts.articleId ?? null,
    read: 0,
    createdAt: now,
  });

  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  const notification = toNotification(row);

  // 广播到所有窗口
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.NOTIFICATION_NEW, notification);
    }
  }

  // 系统级通知
  if (Notification.isSupported()) {
    const sysNotification = new Notification({
      title: opts.title,
      body: opts.body ?? '',
    });
    sysNotification.show();
  }

  return notification;
}

/** 查询所有通知 (按时间倒序, 最近 200 条) */
export async function listNotifications(): Promise<AppNotification[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(schema.notifications)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(200);
  return rows.map(toNotification);
}

/** 标记单条已读 */
export async function markRead(id: string): Promise<void> {
  const db = getDatabase();
  await db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.id, id));
}

/** 全部标记已读 */
export async function markAllRead(): Promise<void> {
  const db = getDatabase();
  await db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.read, 0));
}

/** 清空所有通知 */
export async function clearNotifications(): Promise<void> {
  const db = getDatabase();
  await db.delete(schema.notifications);
}

/** 获取未读数量 */
export async function getUnreadCount(): Promise<number> {
  const db = getDatabase();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(eq(schema.notifications.read, 0));
  return result?.count ?? 0;
}
