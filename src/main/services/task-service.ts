/**
 * 通用任务服务
 *
 * 管理应用级后台任务的创建、更新、查询和广播。
 * 所有后台任务（ASR 标准版、下载等）统一在此注册和跟踪。
 */

import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AppTask, AppTaskStatus, CreateAppTaskInput } from '../../shared/types';

/** 向所有窗口广播任务更新 */
function broadcastTaskUpdated(task: AppTask) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.APP_TASK_UPDATED, task);
    }
  }
}

/** DB 行转换为 AppTask */
function toAppTask(row: typeof schema.appTasks.$inferSelect): AppTask {
  return {
    id: row.id,
    type: row.type,
    articleId: row.articleId ?? undefined,
    status: row.status as AppTask['status'],
    progress: row.progress ?? 0,
    title: row.title,
    detail: row.detail ?? undefined,
    meta: row.meta ? JSON.parse(row.meta) : undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建任务 */
export async function createTask(input: CreateAppTaskInput): Promise<AppTask> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(schema.appTasks).values({
    id,
    type: input.type,
    articleId: input.articleId ?? null,
    status: 'pending',
    progress: 0,
    title: input.title,
    detail: null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    error: null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(schema.appTasks).where(eq(schema.appTasks.id, id));
  const task = toAppTask(row);
  broadcastTaskUpdated(task);
  return task;
}

/** 更新任务状态/进度 (内部使用) */
export async function updateTask(
  taskId: string,
  updates: {
    status?: AppTaskStatus;
    progress?: number;
    detail?: string;
    meta?: Record<string, unknown>;
    error?: string;
  },
): Promise<AppTask> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.progress !== undefined) setValues.progress = updates.progress;
  if (updates.detail !== undefined) setValues.detail = updates.detail;
  if (updates.meta !== undefined) setValues.meta = JSON.stringify(updates.meta);
  if (updates.error !== undefined) setValues.error = updates.error;

  await db.update(schema.appTasks).set(setValues).where(eq(schema.appTasks.id, taskId));

  const [row] = await db.select().from(schema.appTasks).where(eq(schema.appTasks.id, taskId));
  const task = toAppTask(row);
  broadcastTaskUpdated(task);
  return task;
}

/** 查询所有任务 (按创建时间倒序) */
export async function listTasks(): Promise<AppTask[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(schema.appTasks)
    .orderBy(desc(schema.appTasks.createdAt))
    .limit(100);
  return rows.map(toAppTask);
}

/** 取消任务 — 仅更新状态，具体中断逻辑由执行器实现 */
export async function cancelTask(taskId: string): Promise<AppTask> {
  return updateTask(taskId, { status: 'cancelled' });
}
