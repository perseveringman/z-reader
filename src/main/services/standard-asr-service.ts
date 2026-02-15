/**
 * 后台 ASR 转写服务
 *
 * 通过 ASR Provider 抽象层对播客/视频进行后台转写。
 * 转写源解析、视频抽轨、临时下载等由统一 source service 负责。
 *
 * 流程: 解析转写源 → Provider.transcribeFile() → 保存结果 → 通知
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { loadSettings } from './settings-service';
import { updateTask } from './task-service';
import { sendNotification } from './notification-service';
import { getActiveProvider, isAsrConfigured } from './asr/index';
import { cleanupTranscriptionTempPaths, prepareTranscriptionAudio } from './transcription-source-service';

/** 活跃任务的取消控制 */
const activeControls = new Map<string, { cancelled: boolean; abortSignal: { aborted: boolean } }>();

/**
 * 执行后台 ASR 转写任务
 * 由 app-task-handlers 的执行器调度调用
 */
export async function runStandardAsr(taskId: string, articleId: string): Promise<void> {
  const db = getDatabase();
  const control = { cancelled: false, abortSignal: { aborted: false } };
  activeControls.set(taskId, control);
  let sourceCleanupPaths: string[] = [];

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
    if (!article) {
      throw new Error('文章不存在');
    }

    // 3. 更新任务为 running
    await updateTask(taskId, { status: 'running', detail: '准备转写源文件...' });

    if (control.cancelled) return;

    // 4. 统一解析音频输入（播客/视频共用）
    const prepared = await prepareTranscriptionAudio({ articleId, mode: 'background' });
    sourceCleanupPaths = prepared.cleanupPaths;

    if (control.cancelled) return;

    // 5. 使用 Provider 进行转写
    await updateTask(taskId, { detail: `正在使用 ${provider.name} 转写...`, progress: 0.05 });

    const allSegments = await provider.transcribeFile(
      prepared.filePath,
      settings,
      {
        onProgress: (progress) => {
          // 将 provider 进度映射到 5%~95%
          const mapped = 0.05 + progress * 0.9;
          updateTask(taskId, {
            progress: Math.min(mapped, 0.95),
            detail: `转写中 (${Math.round(progress * 100)}%)...`,
          }).catch((err) => {
            console.error('[BackgroundASR] 更新任务进度失败:', err);
          });
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
    if (sourceCleanupPaths.length > 0) {
      await cleanupTranscriptionTempPaths(sourceCleanupPaths);
    }
    activeControls.delete(taskId);
  }
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
