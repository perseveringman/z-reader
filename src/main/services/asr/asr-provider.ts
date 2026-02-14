/**
 * ASR Provider 抽象层
 *
 * 为不同语音识别服务（火山引擎、腾讯云等）提供统一接口，
 * 支持后台文件转写和实时流式转写两种模式。
 */

import type { TranscriptSegment, AppSettings } from '../../../shared/types';

// ==================== Provider Interface ====================

export interface AsrProvider {
  /** 唯一标识，如 'volcengine' | 'tencent' */
  readonly id: string;
  /** 显示名称 */
  readonly name: string;

  /** 检查凭据是否已配置 */
  isConfigured(settings: AppSettings): boolean;

  /**
   * 后台文件转写 — 读取本地音频文件并返回转写结果。
   * 具体实现可能涉及格式转换、分块、上传等逻辑。
   */
  transcribeFile(
    filePath: string,
    settings: AppSettings,
    callbacks: AsrJobCallbacks,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]>;

  /**
   * 实时流式转写 — 将已转码的音频 buffer 流式发送。
   * 部分 Provider 不支持真正的流式（如腾讯极速版），
   * 此时等同于 transcribeFile 的快速处理。
   */
  transcribeStream(
    audioBuffer: Buffer,
    settings: AppSettings,
    callbacks: AsrStreamCallbacks,
    timeOffset?: number,
    abortSignal?: { aborted: boolean },
  ): Promise<TranscriptSegment[]>;
}

// ==================== Callback Types ====================

/** 后台文件转写回调 */
export interface AsrJobCallbacks {
  /** 总体进度 (0-1) */
  onProgress: (progress: number) => void;
  /** 转写出错（非致命，可能继续） */
  onError: (error: string) => void;
}

/** 实时流式转写回调 */
export interface AsrStreamCallbacks {
  /** 当前已识别的 segments（累积） */
  onSegments: (segments: TranscriptSegment[]) => void;
  /** 转写完成 */
  onComplete: (segments: TranscriptSegment[]) => void;
  /** 转写出错 */
  onError: (error: string) => void;
  /** 音频发送进度 (0-1) */
  onProgress: (progress: number) => void;
}

// ==================== Provider Registry ====================

const providers = new Map<string, AsrProvider>();

/** 注册一个 ASR Provider */
export function registerProvider(provider: AsrProvider): void {
  providers.set(provider.id, provider);
}

/** 获取所有已注册的 Provider */
export function getAllProviders(): AsrProvider[] {
  return Array.from(providers.values());
}

/** 根据 ID 获取 Provider */
export function getProviderById(id: string): AsrProvider | undefined {
  return providers.get(id);
}

/** 根据当前设置获取活跃的 Provider */
export function getActiveProvider(settings: AppSettings): AsrProvider | undefined {
  const id = settings.asrProvider || 'volcengine';
  return providers.get(id);
}

/** 检查当前活跃 Provider 是否已配置凭据 */
export function isAsrConfigured(settings: AppSettings): boolean {
  const provider = getActiveProvider(settings);
  return provider ? provider.isConfigured(settings) : false;
}
