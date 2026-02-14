/**
 * 腾讯云语音转写极速版 Provider
 *
 * 同步 HTTP POST — 发送音频二进制数据，直接返回转写结果。
 * 支持 m4a/mp3/wav 等格式，无需 ffmpeg 转码。
 * 最大 100MB / 2 小时。
 *
 * 文档: https://cloud.tencent.com/document/product/1093/52097
 */

import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TranscriptSegment, AppSettings } from '../../../shared/types';
import type { AsrProvider, AsrJobCallbacks, AsrStreamCallbacks } from './asr-provider';

const HOST = 'asr.cloud.tencent.com';

/** 从文件扩展名推断音频格式 */
function guessVoiceFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const supported = ['wav', 'pcm', 'ogg-opus', 'speex', 'silk', 'mp3', 'm4a', 'aac', 'amr'];
  if (ext === 'ogg' || ext === 'opus') return 'ogg-opus';
  if (supported.includes(ext)) return ext;
  return 'mp3'; // 默认
}

/**
 * 构建签名和 URL 共用的查询参数（不含 appid，appid 只在 path 中）
 * 参见: https://cloud.tencent.com/document/product/1093/52097
 */
function buildQueryParams(
  secretId: string,
  engineType: string,
  voiceFormat: string,
  timestamp: number,
): Record<string, string> {
  return {
    convert_num_mode: '1',
    engine_type: engineType,
    filter_dirty: '0',
    filter_modal: '0',
    filter_punc: '0',
    first_channel_only: '1',
    secretid: secretId,
    speaker_diarization: '1',
    timestamp: String(timestamp),
    voice_format: voiceFormat,
    word_info: '0',
  };
}

/** 生成 HMAC-SHA1 签名 */
function generateSignature(
  appId: string,
  secretKey: string,
  params: Record<string, string>,
): string {
  // 按字母顺序排列参数
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

  // 签名原文: POST + host + path + ? + sorted_params
  const signStr = `POST${HOST}/asr/flash/v1/${appId}?${queryString}`;

  const hmac = createHmac('sha1', secretKey);
  hmac.update(signStr);
  return hmac.digest('base64');
}

/** 构建请求 URL — 参数顺序使用字母排序，与签名原文保持一致 */
function buildRequestUrl(
  appId: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return `https://${HOST}/asr/flash/v1/${appId}?${queryString}`;
}

// ==================== Response Types ====================

interface TencentFlashWord {
  word: string;
  start_time: number;
  end_time: number;
}

interface TencentFlashSentence {
  text: string;
  start_time: number;
  end_time: number;
  speaker_id?: number;
  word_list?: TencentFlashWord[];
}

interface TencentFlashResult {
  channel_id: number;
  text: string;
  sentence_list: TencentFlashSentence[];
}

interface TencentFlashResponse {
  code: number;
  message: string;
  request_id: string;
  audio_duration: number;
  flash_result: TencentFlashResult[];
}

// ==================== Provider ====================

export class TencentFlashProvider implements AsrProvider {
  readonly id = 'tencent';
  readonly name = '腾讯云';

  isConfigured(settings: AppSettings): boolean {
    return !!(settings.tencentAsrAppId && settings.tencentAsrSecretId && settings.tencentAsrSecretKey);
  }

  async transcribeFile(
    filePath: string,
    settings: AppSettings,
    callbacks: AsrJobCallbacks,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]> {
    if (!settings.tencentAsrAppId || !settings.tencentAsrSecretId || !settings.tencentAsrSecretKey) {
      throw new Error('未配置腾讯云语音识别凭据');
    }

    if (abortSignal?.aborted) return [];

    // 1. 读取音频文件
    callbacks.onProgress(0.05);
    const audioData = await fs.promises.readFile(filePath);

    if (abortSignal?.aborted) return [];

    // 检查文件大小 (最大 100MB)
    if (audioData.length > 100 * 1024 * 1024) {
      throw new Error('音频文件超过 100MB，超出腾讯云极速版限制');
    }

    // 2. 构建请求
    const voiceFormat = guessVoiceFormat(filePath);
    const engineType = '16k_zh'; // 标准中文（16k_zh_large 为大模型版，需单独计费）
    const timestamp = Math.floor(Date.now() / 1000);

    const queryParams = buildQueryParams(
      settings.tencentAsrSecretId,
      engineType,
      voiceFormat,
      timestamp,
    );

    const signature = generateSignature(
      settings.tencentAsrAppId,
      settings.tencentAsrSecretKey,
      queryParams,
    );

    const url = buildRequestUrl(settings.tencentAsrAppId, queryParams);

    callbacks.onProgress(0.1);

    // 3. 发送请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Host': HOST,
        'Authorization': signature,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(audioData.length),
      },
      body: audioData,
    });

    callbacks.onProgress(0.8);

    if (!response.ok) {
      throw new Error(`腾讯云 ASR HTTP 错误: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as TencentFlashResponse;

    if (result.code !== 0) {
      throw new Error(`腾讯云 ASR 错误 [${result.code}]: ${result.message}`);
    }

    // 4. 解析结果
    const segments = this.parseResponse(result);
    callbacks.onProgress(1);

    return segments;
  }

  async transcribeStream(
    audioBuffer: Buffer,
    settings: AppSettings,
    callbacks: AsrStreamCallbacks,
    _timeOffset = 0,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]> {
    // 腾讯极速版不支持真正的流式，但可以快速处理整个 buffer
    // 先写入临时文件，然后调用 transcribeFile
    const tmpPath = `/tmp/z-reader-tencent-asr-${Date.now()}.wav`;

    try {
      await fs.promises.writeFile(tmpPath, audioBuffer);

      const segments = await this.transcribeFile(
        tmpPath,
        settings,
        {
          onProgress: callbacks.onProgress,
          onError: callbacks.onError,
        },
        abortSignal,
      );

      callbacks.onSegments(segments);
      callbacks.onComplete(segments);
      return segments;
    } finally {
      fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  cancel(): void {
    // HTTP 请求不支持取消（请求通常很快）
  }

  /** 解析腾讯云响应为 TranscriptSegment[] */
  private parseResponse(response: TencentFlashResponse): TranscriptSegment[] {
    if (!response.flash_result?.length) return [];

    const firstChannel = response.flash_result[0];
    if (!firstChannel.sentence_list?.length) return [];

    return firstChannel.sentence_list.map((sentence) => ({
      start: sentence.start_time / 1000,
      end: sentence.end_time / 1000,
      text: sentence.text,
      ...(sentence.speaker_id != null ? { speakerId: sentence.speaker_id } : {}),
    }));
  }
}
