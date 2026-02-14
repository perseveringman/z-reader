/**
 * 火山引擎 ASR Provider
 *
 * 封装现有的 volc-asr-service (WebSocket 流式) + audio-pipeline (ffmpeg 转码分块)。
 */

import * as fs from 'node:fs';
import type { TranscriptSegment, AppSettings } from '../../../shared/types';
import type { AsrProvider, AsrJobCallbacks, AsrStreamCallbacks } from './asr-provider';
import { transcribeAudioChunk } from '../volc-asr-service';
import { processAudio, cleanupTempDir } from '../audio-pipeline';

export class VolcengineProvider implements AsrProvider {
  readonly id = 'volcengine';
  readonly name = '火山引擎';

  isConfigured(settings: AppSettings): boolean {
    return !!(settings.volcAsrAppKey && settings.volcAsrAccessKey);
  }

  async transcribeFile(
    filePath: string,
    settings: AppSettings,
    callbacks: AsrJobCallbacks,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]> {
    if (!settings.volcAsrAppKey || !settings.volcAsrAccessKey) {
      throw new Error('未配置火山引擎语音识别凭据');
    }

    // 1. 音频处理管道（格式转换 + 分块）
    callbacks.onProgress(0.02);
    const pipeline = await processAudio(filePath);

    try {
      if (abortSignal?.aborted) return [];

      const { chunks } = pipeline;
      let allSegments: TranscriptSegment[] = [];

      // 2. 逐块发送到 ASR
      for (let i = 0; i < chunks.length; i++) {
        if (abortSignal?.aborted) break;

        const chunk = chunks[i];
        const audioBuffer = await fs.promises.readFile(chunk.filePath);

        const chunkSegments = await transcribeAudioChunk(
          audioBuffer,
          {
            appKey: settings.volcAsrAppKey,
            accessKey: settings.volcAsrAccessKey,
            sendIntervalMs: 20, // 后台加速发送
          },
          {
            onProgress: (chunkProgress) => {
              const overall = 0.05 + ((i + chunkProgress) / chunks.length) * 0.9;
              callbacks.onProgress(Math.min(overall, 0.95));
            },
            onSegments: () => {},
            onComplete: () => {},
            onError: (error) => {
              callbacks.onError(`Chunk ${i} 错误: ${error}`);
            },
          },
          chunk.startTime,
          abortSignal,
        );

        allSegments = [...allSegments, ...chunkSegments];
      }

      return allSegments;
    } finally {
      await cleanupTempDir(pipeline.tempDir);
    }
  }

  async transcribeStream(
    audioBuffer: Buffer,
    settings: AppSettings,
    callbacks: AsrStreamCallbacks,
    timeOffset = 0,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]> {
    if (!settings.volcAsrAppKey || !settings.volcAsrAccessKey) {
      throw new Error('未配置火山引擎语音识别凭据');
    }

    return transcribeAudioChunk(
      audioBuffer,
      {
        appKey: settings.volcAsrAppKey,
        accessKey: settings.volcAsrAccessKey,
      },
      {
        onProgress: callbacks.onProgress,
        onSegments: callbacks.onSegments,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
      },
      timeOffset,
      abortSignal,
    );
  }

  cancel(): void {
    // 取消通过 abortSignal 控制，无需额外实现
  }
}
