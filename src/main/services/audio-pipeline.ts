/**
 * 音频处理管道
 *
 * 使用 ffmpeg-static 进行音频格式转换和分块处理，
 * 确保音频符合火山引擎 ASR API 要求（16kHz, 16bit, mono WAV）。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

// ffmpeg-static 提供的 ffmpeg 二进制路径
// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static') as string;
} catch {
  ffmpegPath = 'ffmpeg'; // fallback to system ffmpeg
}

/** ffprobe 路径 (与 ffmpeg 同目录) — ffmpeg-static 不含 ffprobe，会自动回退到 ffmpeg 方式检测时长 */
function getFfprobePath(): string {
  if (ffmpegPath === 'ffmpeg') return 'ffprobe';
  const dir = path.dirname(ffmpegPath);
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(dir, `ffprobe${ext}`);
}

// ==================== 公共接口 ====================

export interface AudioChunkInfo {
  /** 转换后的 WAV 文件路径 */
  filePath: string;
  /** chunk 在原始音频中的起始时间（秒） */
  startTime: number;
  /** chunk 时长（秒） */
  duration: number;
}

export interface AudioPipelineResult {
  /** 分块信息列表 */
  chunks: AudioChunkInfo[];
  /** 原始音频总时长（秒） */
  totalDuration: number;
  /** 临时目录路径（调用方负责清理） */
  tempDir: string;
}

/** 每个 chunk 的最大时长（秒），30 分钟 */
const MAX_CHUNK_DURATION = 1800;

/**
 * 处理音频文件：
 * 1. 检测格式和时长
 * 2. 转换为 16kHz mono WAV (PCM s16le)
 * 3. 如果超过 30 分钟则分块
 *
 * @param inputPath 输入音频文件路径
 * @returns 分块信息和临时目录
 */
export async function processAudio(inputPath: string): Promise<AudioPipelineResult> {
  // 创建临时目录
  const tempDir = path.join(os.tmpdir(), `z-reader-asr-${randomUUID()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    // 获取音频时长
    const totalDuration = await getAudioDuration(inputPath);

    if (totalDuration <= 0) {
      throw new Error('无法检测音频时长，文件可能已损坏');
    }

    // 如果总时长不超过 MAX_CHUNK_DURATION，直接转换整个文件
    if (totalDuration <= MAX_CHUNK_DURATION) {
      const outputPath = path.join(tempDir, 'chunk_0.wav');
      await convertToWav(inputPath, outputPath);
      return {
        chunks: [{
          filePath: outputPath,
          startTime: 0,
          duration: totalDuration,
        }],
        totalDuration,
        tempDir,
      };
    }

    // 否则分块处理
    const numChunks = Math.ceil(totalDuration / MAX_CHUNK_DURATION);
    const chunks: AudioChunkInfo[] = [];

    for (let i = 0; i < numChunks; i++) {
      const startTime = i * MAX_CHUNK_DURATION;
      const chunkDuration = Math.min(MAX_CHUNK_DURATION, totalDuration - startTime);
      const outputPath = path.join(tempDir, `chunk_${i}.wav`);

      await convertToWav(inputPath, outputPath, startTime, chunkDuration);

      chunks.push({
        filePath: outputPath,
        startTime,
        duration: chunkDuration,
      });
    }

    return { chunks, totalDuration, tempDir };
  } catch (err) {
    // 出错时清理临时目录
    await cleanupTempDir(tempDir);
    throw err;
  }
}

/**
 * 清理临时目录
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

// ==================== 内部函数 ====================

/**
 * 获取音频文件时长（秒）
 */
async function getAudioDuration(filePath: string): Promise<number> {
  const ffprobePath = getFfprobePath();

  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch {
    // ffprobe 不可用时，尝试用 ffmpeg 获取
    try {
      const { stderr } = await execFileAsync(ffmpegPath, [
        '-i', filePath,
        '-f', 'null', '-',
      ], { timeout: 30000 }).catch((e) => ({ stdout: '', stderr: (e as { stderr?: string }).stderr || '' }));
      // 从 stderr 解析 Duration: HH:MM:SS.ms
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
      }
    } catch {
      // ignore
    }
    return 0;
  }
}

/**
 * 将音频转换为 16kHz 16bit 单声道 WAV
 */
async function convertToWav(
  inputPath: string,
  outputPath: string,
  startTime?: number,
  duration?: number,
): Promise<void> {
  const args: string[] = [];

  // 跳转到指定位置（放在输入前可以加速 seek）
  if (startTime != null && startTime > 0) {
    args.push('-ss', String(startTime));
  }

  args.push('-i', inputPath);

  // 限制时长
  if (duration != null) {
    args.push('-t', String(duration));
  }

  // 输出格式：16kHz, 16bit, mono, PCM WAV
  args.push(
    '-ar', '16000',
    '-ac', '1',
    '-acodec', 'pcm_s16le',
    '-f', 'wav',
    '-y', // 覆盖输出
    outputPath,
  );

  await execFileAsync(ffmpegPath, args, { timeout: 600000 }); // 10 分钟超时
}
