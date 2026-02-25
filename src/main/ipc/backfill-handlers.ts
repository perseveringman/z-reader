import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { AIDatabase } from '../../ai/providers/db';
import { runBackfill, cancelBackfill, getBackfillStatus } from '../../ai/services/backfill';
import { triggerReindexArticle, triggerCleanupArticle } from './incremental-index-hooks';
import type { RAGBackfillProgress } from '../../shared/types';

export function registerBackfillHandlers() {
  /**
   * RAG_BACKFILL_START — 启动批量回填
   */
  ipcMain.handle(IPC_CHANNELS.RAG_BACKFILL_START, async () => {
    const sqlite = getSqlite();
    if (!sqlite) throw new Error('Database not initialized');

    // 读取批次大小配置
    const aiDb = new AIDatabase(sqlite);
    const settingsRow = aiDb.getSetting('appSettings');
    const batchSize =
      settingsRow && typeof settingsRow === 'object'
        ? (settingsRow as Record<string, unknown>).ragBackfillBatchSize
        : undefined;

    // 广播进度到所有窗口
    const broadcastProgress = (progress: RAGBackfillProgress) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.RAG_BACKFILL_PROGRESS, progress);
        }
      }
    };

    // 异步执行，不等待完成
    runBackfill({
      sqlite,
      batchSize: typeof batchSize === 'number' ? batchSize : 50,
      broadcastProgress,
    }).catch((error) => {
      console.error('Backfill failed:', error);
      broadcastProgress({
        phase: 'done',
        current: 0,
        total: 0,
      });
    });
  });

  /**
   * RAG_BACKFILL_CANCEL — 取消回填
   */
  ipcMain.handle(IPC_CHANNELS.RAG_BACKFILL_CANCEL, async () => {
    cancelBackfill();
  });

  /**
   * RAG_BACKFILL_STATUS — 获取回填状态
   */
  ipcMain.handle(IPC_CHANNELS.RAG_BACKFILL_STATUS, async () => {
    return getBackfillStatus();
  });

  /**
   * RAG_REINDEX — 重新索引指定 source
   */
  ipcMain.handle(IPC_CHANNELS.RAG_REINDEX, async (_event, sourceType: string, sourceId: string) => {
    if (sourceType === 'article') {
      await triggerReindexArticle(sourceId);
    }
  });

  /**
   * RAG_CLEANUP — 清理指定 source 的索引
   */
  ipcMain.handle(IPC_CHANNELS.RAG_CLEANUP, async (_event, sourceType: string, sourceId: string) => {
    if (sourceType === 'article') {
      await triggerCleanupArticle(sourceId);
    }
  });
}
