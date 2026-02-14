/**
 * 后台 ASR 转写服务
 *
 * 通过 ASR Provider 抽象层对播客音频进行后台转写。
 * 如果音频尚未下载，会自动触发下载并等待完成后再开始转写。
 *
 * 流程: 检查/下载音频 → Provider.transcribeFile() → 保存结果 → 通知
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { loadSettings } from './settings-service';
import { updateTask } from './task-service';
import { sendNotification } from './notification-service';
import { startDownload } from './download-service';
import { getActiveProvider, isAsrConfigured } from './asr/index';

/** 活跃任务的取消控制 */
const activeControls = new Map<string, { cancelled: boolean; abortSignal: { aborted: boolean } }>();

const DOWNLOAD_POLL_INTERVAL = 2_000; // 2 秒
const DOWNLOAD_TIMEOUT = 10 * 60 * 1000; // 10 分钟下载超时

/**
 * 执行后台 ASR 转写任务
 * 由 app-task-handlers 的执行器调度调用
 */
export async function runStandardAsr(taskId: string, articleId: string): Promise<void> {
  const db = getDatabase();
  const control = { cancelled: false, abortSignal: { aborted: false } };
  activeControls.set(taskId, control);

  try {
    // 1. 加载设置，获取 Provider
    const settings = loadSettings();
    const provider = getActiveProvider(settings);

    if (!provider) {
      throw new Error('未找到可用的语音识别服务');
    }

    if (!isAsrConfigured(settings)) {
      throw new Error(`未配置 ${provider.name} 语音识别凭据`);
    }

    // 2. 获取文章信息
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId));
    if (!article?.audioUrl) {
      throw new Error('文章没有音频 URL');
    }

    // 3. 更新任务为 running
    await updateTask(taskId, { status: 'running', detail: '检查音频文件...' });

    if (control.cancelled) return;

    // 4. 获取已下载的音频文件，或自动下载
    const filePath = await ensureAudioDownloaded(articleId, taskId, control);

    if (control.cancelled) return;

    // 5. 使用 Provider 进行转写
    await updateTask(taskId, { detail: `正在使用 ${provider.name} 转写...`, progress: 0.05 });

    const allSegments = await provider.transcribeFile(
      filePath,
      settings,
      {
        onProgress: (progress) => {
          // 将 provider 进度映射到 5%~95%
          const mapped = 0.05 + progress * 0.9;
          updateTask(taskId, {
            progress: Math.min(mapped, 0.95),
            detail: `转写中 (${Math.round(progress * 100)}%)...`,
          }).catch(() => {});
        },
        onError: (error) => {
          console.error(`[BackgroundASR] Provider 错误:`, error);
        },
      },
      control.abortSignal,
    );

    if (control.cancelled) return;

    // 6. 保存转写结果到数据库
    if (allSegments.length > 0) {
      await db.delete(schema.transcripts).where(eq(schema.transcripts.articleId, articleId));

      const now = new Date().toISOString();
      await db.insert(schema.transcripts).values({
        id: randomUUID(),
        articleId,
        segments: JSON.stringify(allSegments),
        language: 'zh-CN',
        createdAt: now,
      });
    }

    // 7. 更新任务完成
    await updateTask(taskId, {
      status: 'completed',
      progress: 1,
      detail: `识别完成，共 ${allSegments.length} 条语句`,
    });

    // 8. 发送通知
    const title = article.title ? `转写完成: ${article.title}` : '转写完成';
    await sendNotification({
      type: 'success',
      title,
      body: `共识别 ${allSegments.length} 条语句`,
      articleId,
    });

  } catch (err) {
    activeControls.delete(taskId);
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[BackgroundASR] 转写失败:', errorMsg);

    await updateTask(taskId, {
      status: 'failed',
      error: errorMsg,
      detail: '转写失败',
    });

    // 获取文章标题用于通知
    try {
      const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId));
      const title = article?.title ? `转写失败: ${article.title}` : '转写失败';
      await sendNotification({
        type: 'error',
        title,
        body: errorMsg,
        articleId,
      });
    } catch {
      await sendNotification({ type: 'error', title: '转写失败', body: errorMsg });
    }
  } finally {
    activeControls.delete(taskId);
  }
}

/**
 * 确保音频已下载到本地。
 * 如果已有 ready 的下载记录则直接返回路径，否则触发下载并等待完成。
 */
async function ensureAudioDownloaded(
  articleId: string,
  taskId: string,
  control: { cancelled: boolean },
): Promise<string> {
  const db = getDatabase();

  // 检查是否已有下载完成的记录
  const [existing] = await db.select()
    .from(schema.downloads)
    .where(and(
      eq(schema.downloads.articleId, articleId),
      eq(schema.downloads.status, 'ready'),
    ));

  if (existing?.filePath) {
    try {
      await fs.promises.access(existing.filePath, fs.constants.R_OK);
      return existing.filePath;
    } catch {
      // 文件不存在，需要重新下载
    }
  }

  // 触发下载
  await updateTask(taskId, { detail: '正在下载音频...', progress: 0.02 });
  await startDownload(articleId);

  // 轮询等待下载完成
  const startTime = Date.now();

  while (!control.cancelled) {
    if (Date.now() - startTime > DOWNLOAD_TIMEOUT) {
      throw new Error('音频下载超时（10分钟）');
    }

    await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_POLL_INTERVAL));

    if (control.cancelled) throw new Error('任务已取消');

    const [dl] = await db.select()
      .from(schema.downloads)
      .where(eq(schema.downloads.articleId, articleId));

    if (dl?.status === 'ready' && dl.filePath) {
      try {
        await fs.promises.access(dl.filePath, fs.constants.R_OK);
        return dl.filePath;
      } catch {
        throw new Error('下载的音频文件无法读取');
      }
    }

    if (dl?.status === 'failed') {
      throw new Error('音频下载失败');
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    await updateTask(taskId, {
      detail: `正在下载音频... (${elapsed}s)`,
      progress: Math.min(0.02 + (elapsed / 600) * 0.03, 0.05),
    });
  }

  throw new Error('任务已取消');
}

/** 取消指定任务 */
export function cancelStandardAsrPolling(taskId: string) {
  const control = activeControls.get(taskId);
  if (control) {
    control.cancelled = true;
    control.abortSignal.aborted = true;
    activeControls.delete(taskId);
  }
}
