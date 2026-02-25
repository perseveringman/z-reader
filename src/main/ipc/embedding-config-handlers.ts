import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSqlite } from '../db';
import { AIDatabase } from '../../ai/providers/db';
import type { EmbeddingConfig } from '../../shared/types';

const EMBEDDING_CONFIG_KEY = 'embeddingConfig';

export function registerEmbeddingConfigHandlers() {
  /**
   * EMBEDDING_CONFIG_GET — 获取 Embedding 独立配置
   */
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_CONFIG_GET, async () => {
    const sqlite = getSqlite();
    if (!sqlite) return null;

    const aiDb = new AIDatabase(sqlite);
    const saved = aiDb.getSetting(EMBEDDING_CONFIG_KEY);
    return saved as EmbeddingConfig | null;
  });

  /**
   * EMBEDDING_CONFIG_SET — 保存 Embedding 独立配置
   */
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_CONFIG_SET, async (_event, config: EmbeddingConfig) => {
    const sqlite = getSqlite();
    if (!sqlite) throw new Error('Database not initialized');

    const aiDb = new AIDatabase(sqlite);
    aiDb.setSetting(EMBEDDING_CONFIG_KEY, config);
  });
}
