/**
 * ASR (语音识别) IPC 处理器
 *
 * 处理播客音频的实时流式语音识别。
 * 通过 ASR Provider 抽象层连接音频管道和具体的 ASR 服务。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { loadSettings } from '../services/settings-service';
import { processAudio, cleanupTempDir } from '../services/audio-pipeline';
import { getActiveProvider, isAsrConfigured } from '../services/asr/index';
import type { TranscriptSegment } from '../../shared/types';

/** 正在进行的 ASR 任务跟踪 */
const activeTasks = new Map<string, { abortSignal: { aborted: boolean }; tempDir?: string }>();

/** 向所有窗口发送 IPC 事件 */
function broadcast(channel: string, data: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

export function registerAsrHandlers() {
  // ==================== asr:start ====================
  ipcMain.handle(IPC_CHANNELS.ASR_START, async (_event, articleId: string) => {
    // 检查是否有正在进行的任务
    if (activeTasks.has(articleId)) {
      throw new Error('该音频已在转写中');
    }

    const abortSignal = { aborted: false };
    activeTasks.set(articleId, { abortSignal });

    // 异步执行转写（不阻塞 IPC 响应）
    runTranscription(articleId, abortSignal).catch((err) => {
      console.error('[ASR] 转写失败:', err);
      broadcast(IPC_CHANNELS.ASR_ERROR, {
        articleId,
        error: err instanceof Error ? err.message : String(err),
      });
    }).finally(() => {
      activeTasks.delete(articleId);
    });
  });

  // ==================== asr:cancel ====================
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL, async (_event, articleId: string) => {
    const task = activeTasks.get(articleId);
    if (task) {
      task.abortSignal.aborted = true;
      // 清理临时文件
      if (task.tempDir) {
        await cleanupTempDir(task.tempDir);
      }
      activeTasks.delete(articleId);
    }
  });
}

/**
 * 执行完整的转写流程（实时模式）
 */
async function runTranscription(articleId: string, abortSignal: { aborted: boolean }) {
  const db = getDatabase();

  // 1. 加载设置，获取 Provider
  const settings = loadSettings();
  const provider = getActiveProvider(settings);

  if (!provider) {
    throw new Error('未找到可用的语音识别服务');
  }

  if (!isAsrConfigured(settings)) {
    throw new Error(`未配置 ${provider.name} 语音识别凭据，请在设置中配置`);
  }

  // 2. 查找已下载的音频文件
  const [download] = await db.select().from(schema.downloads)
    .where(and(
      eq(schema.downloads.articleId, articleId),
      eq(schema.downloads.status, 'ready'),
    ));

  if (!download?.filePath) {
    throw new Error('未找到已下载的音频文件，请先下载音频');
  }

  // 验证文件存在
  try {
    await fs.promises.access(download.filePath, fs.constants.R_OK);
  } catch {
    throw new Error('已下载的音频文件不存在或无法读取');
  }

  if (abortSignal.aborted) return;

  // 3. 转写音频
  broadcast(IPC_CHANNELS.ASR_PROGRESS, {
    articleId,
    chunkIndex: 0,
    totalChunks: 1,
    chunkProgress: 0,
    overallProgress: 0,
  });

  let allSegments: TranscriptSegment[] = [];

  if (provider.supportsRawAudio) {
    // ---- 直接使用原始文件（腾讯云等原生支持多格式的 Provider） ----
    allSegments = await provider.transcribeFile(
      download.filePath,
      settings,
      {
        onProgress: (progress) => {
          broadcast(IPC_CHANNELS.ASR_PROGRESS, {
            articleId,
            chunkIndex: 0,
            totalChunks: 1,
            chunkProgress: progress,
            overallProgress: progress,
          });
        },
        onError: (error) => {
          console.error('[ASR] 转写错误:', error);
        },
      },
      abortSignal,
    );
  } else {
    // ---- 需要 pipeline 转码 + 分块（火山引擎等需要 16kHz PCM WAV 的 Provider） ----
    const pipeline = await processAudio(download.filePath);

    // 保存临时目录引用，供取消时清理
    const task = activeTasks.get(articleId);
    if (task) task.tempDir = pipeline.tempDir;

    if (abortSignal.aborted) {
      await cleanupTempDir(pipeline.tempDir);
      return;
    }

    const { chunks } = pipeline;

    for (let i = 0; i < chunks.length; i++) {
      if (abortSignal.aborted) break;

      const chunk = chunks[i];
      const audioBuffer = await fs.promises.readFile(chunk.filePath);

      const chunkSegments = await provider.transcribeStream(
        audioBuffer,
        settings,
        {
          onProgress: (chunkProgress) => {
            const overallProgress = (i + chunkProgress) / chunks.length;
            broadcast(IPC_CHANNELS.ASR_PROGRESS, {
              articleId,
              chunkIndex: i,
              totalChunks: chunks.length,
              chunkProgress,
              overallProgress,
            });
          },
          onSegments: (segments) => {
            // 发送实时 segment 更新
            broadcast(IPC_CHANNELS.ASR_SEGMENT, {
              articleId,
              segments: [...allSegments, ...segments],
            });
          },
          onComplete: () => { /* 由外层处理 */ },
          onError: (error) => {
            console.error(`[ASR] Chunk ${i} 错误:`, error);
          },
        },
        chunk.startTime,
        abortSignal,
      );

      allSegments = [...allSegments, ...chunkSegments];
    }

    // 清理临时文件
    await cleanupTempDir(pipeline.tempDir);
  }

  if (abortSignal.aborted) return;

  // 4. 保存转写结果到数据库
  if (allSegments.length > 0) {
    // 先删除已有的转写记录（支持重新转写）
    await db.delete(schema.transcripts)
      .where(eq(schema.transcripts.articleId, articleId));

    const transcriptId = randomUUID();
    const now = new Date().toISOString();
    await db.insert(schema.transcripts).values({
      id: transcriptId,
      articleId,
      segments: JSON.stringify(allSegments),
      language: 'zh-CN',
      createdAt: now,
    });
  }

  // 5. 发送完成事件
  broadcast(IPC_CHANNELS.ASR_COMPLETE, {
    articleId,
    segments: allSegments,
  });
}
