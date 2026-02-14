/**
 * App Task IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { createTask, cancelTask, listTasks } from '../services/task-service';
import { runStandardAsr, cancelStandardAsrPolling } from '../services/standard-asr-service';
import type { CreateAppTaskInput } from '../../shared/types';

export function registerAppTaskHandlers() {
  ipcMain.handle(IPC_CHANNELS.APP_TASK_CREATE, async (_event, input: CreateAppTaskInput) => {
    const task = await createTask(input);

    // 根据任务类型启动对应的执行器
    if (input.type === 'asr-standard') {
      // 异步启动，不阻塞 IPC 返回
      runStandardAsr(task.id, task.articleId!).catch((err) => {
        console.error('[AppTask] asr-standard executor failed:', err);
      });
    }

    return task;
  });

  ipcMain.handle(IPC_CHANNELS.APP_TASK_CANCEL, async (_event, taskId: string) => {
    // 停止标准版 ASR 轮询（如果是该类型的任务）
    cancelStandardAsrPolling(taskId);
    await cancelTask(taskId);
  });

  ipcMain.handle(IPC_CHANNELS.APP_TASK_LIST, async () => {
    return listTasks();
  });
}
