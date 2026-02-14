/**
 * Volcengine SeedASR 2.0 流式语音识别服务
 *
 * 使用 WebSocket 二进制协议与火山引擎 bigmodel_async 端点通信。
 * 参考文档: https://www.volcengine.com/docs/6561/1354869
 */

import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { TranscriptSegment } from '../../shared/types';

// ==================== 二进制协议常量 ====================

const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE = 0b0001; // 4 bytes

// Message types (4 bits)
const MSG_FULL_CLIENT_REQUEST = 0b0001;
const MSG_AUDIO_ONLY = 0b0010;
const MSG_FULL_SERVER_RESPONSE = 0b1001;
const MSG_ERROR_RESPONSE = 0b1111;

// Message type specific flags (4 bits)
const FLAG_NORMAL = 0b0000;
const FLAG_LAST_AUDIO = 0b0010;

// Serialization (4 bits)
const SERIAL_JSON = 0b0001;
const SERIAL_NONE = 0b0000;

// Compression (4 bits)
const COMPRESS_NONE = 0b0000;
const COMPRESS_GZIP = 0b0001;

// ==================== 协议编解码 ====================

/** 构建 4 字节二进制协议头 */
function buildHeader(
  msgType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  const header = Buffer.alloc(4);
  header[0] = ((PROTOCOL_VERSION & 0x0f) << 4) | (HEADER_SIZE & 0x0f);
  header[1] = ((msgType & 0x0f) << 4) | (flags & 0x0f);
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  header[3] = 0; // reserved
  return header;
}

/** 构建 Full Client Request 消息 (使用 Gzip 压缩) */
function buildFullClientRequest(config: object): Buffer {
  const header = buildHeader(MSG_FULL_CLIENT_REQUEST, FLAG_NORMAL, SERIAL_JSON, COMPRESS_GZIP);
  const jsonBuf = Buffer.from(JSON.stringify(config), 'utf-8');
  const payload = gzipSync(jsonBuf);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, sizeBuf, payload]);
}

/** 构建 Audio Only Request 消息 (使用 Gzip 压缩) */
function buildAudioRequest(audioData: Buffer, isLast: boolean): Buffer {
  const flags = isLast ? FLAG_LAST_AUDIO : FLAG_NORMAL;
  const header = buildHeader(MSG_AUDIO_ONLY, flags, SERIAL_NONE, COMPRESS_GZIP);
  const payload = gzipSync(audioData);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, sizeBuf, payload]);
}

/** 解析服务端响应 */
function parseServerResponse(data: Buffer): {
  type: 'response' | 'error';
  payload?: VolcAsrResponse;
  errorCode?: number;
  errorMessage?: string;
} {
  if (data.length < 4) {
    return { type: 'error', errorCode: -1, errorMessage: 'Response too short' };
  }

  const msgType = (data[1] >> 4) & 0x0f;
  const serialization = (data[2] >> 4) & 0x0f;

  if (msgType === MSG_ERROR_RESPONSE) {
    // Error: header(4) + error_code(4) + error_msg_size(4) + error_msg
    const errorCode = data.length >= 8 ? data.readUInt32BE(4) : -1;
    let errorMessage = 'Unknown error';
    if (data.length >= 12) {
      const msgSize = data.readUInt32BE(8);
      if (data.length >= 12 + msgSize) {
        errorMessage = data.subarray(12, 12 + msgSize).toString('utf-8');
      }
    }
    return { type: 'error', errorCode, errorMessage };
  }

  if (msgType === MSG_FULL_SERVER_RESPONSE) {
    // 服务端响应格式: header(4) + [sequence(4)] + payload_size(4) + payload
    // sequence 字段是否存在取决于 flags:
    //   0b0000 = 无 sequence
    //   0b0001 = 有 sequence (正序列号)
    //   0b0011 = 有 sequence (末尾/负序列号)
    const flags = data[1] & 0x0f;
    const compression = data[2] & 0x0f;
    const hasSequence = (flags & 0b0001) !== 0;
    let offset = 4; // 跳过 header

    if (hasSequence) {
      offset += 4; // 跳过 sequence
    }

    if (data.length < offset + 4) {
      return { type: 'error', errorCode: -1, errorMessage: `Response too short for payload_size (len=${data.length}, offset=${offset})` };
    }
    const payloadSize = data.readUInt32BE(offset);
    offset += 4;

    if (data.length < offset + payloadSize) {
      return { type: 'error', errorCode: -1, errorMessage: `Response payload truncated (need=${offset + payloadSize}, got=${data.length})` };
    }
    let payloadBuf = data.subarray(offset, offset + payloadSize);

    // 解压 Gzip
    if (compression === COMPRESS_GZIP) {
      try {
        payloadBuf = gunzipSync(payloadBuf);
      } catch (err) {
        return { type: 'error', errorCode: -1, errorMessage: `Gzip decompress error: ${err}` };
      }
    }

    if (serialization === SERIAL_JSON) {
      try {
        const payload = JSON.parse(payloadBuf.toString('utf-8')) as VolcAsrResponse;
        return { type: 'response', payload };
      } catch (err) {
        return { type: 'error', errorCode: -1, errorMessage: `JSON parse error: ${err}` };
      }
    }
    return { type: 'error', errorCode: -1, errorMessage: `Unsupported serialization: ${serialization}` };
  }

  // 未知消息类型，忽略
  return { type: 'response' };
}

// ==================== Volcengine 响应类型 ====================

interface VolcAsrUtterance {
  text: string;
  start_time: number; // ms
  end_time: number;   // ms
  definite: boolean;
  words?: { text: string; start_time: number; end_time: number }[];
}

interface VolcAsrResponse {
  audio_info?: { duration: number };
  result?: {
    text: string;
    utterances?: VolcAsrUtterance[];
  };
}

// ==================== ASR 转写控制 ====================

export interface AsrCallbacks {
  /** 每次收到新的识别结果时调用（累积的 segments） */
  onSegments: (segments: TranscriptSegment[]) => void;
  /** 转写完成 */
  onComplete: (segments: TranscriptSegment[]) => void;
  /** 转写出错 */
  onError: (error: string) => void;
  /** 音频发送进度 (0-1) */
  onProgress: (progress: number) => void;
}

export interface AsrOptions {
  appKey: string;
  accessKey: string;
  language?: string;
  /** 发包间隔(ms)，默认 200ms(实时速度)。后台转写建议设为 10~20ms 以加速。 */
  sendIntervalMs?: number;
}

/**
 * 将一个音频 chunk 文件发送到火山引擎 ASR 并收集 segments。
 * 返回的 segments 的时间戳会加上 timeOffset（秒）。
 */
export function transcribeAudioChunk(
  audioBuffer: Buffer,
  options: AsrOptions,
  callbacks: AsrCallbacks,
  timeOffset: number = 0,
  abortSignal?: { aborted: boolean },
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const connectId = randomUUID();
    const wsUrl = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

    const ws = new WebSocket(wsUrl, {
      headers: {
        'X-Api-App-Key': options.appKey,
        'X-Api-Access-Key': options.accessKey,
        'X-Api-Resource-Id': 'volc.seedasr.sauc.duration',
        'X-Api-Connect-Id': connectId,
      },
    });

    let accumulatedSegments: TranscriptSegment[] = [];
    let resolved = false;

    const cleanup = () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const finish = (segments: TranscriptSegment[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(segments);
    };

    const fail = (msg: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      callbacks.onError(msg);
      reject(new Error(msg));
    };

    ws.on('open', () => {
      // 1. 发送配置请求
      const config = {
        user: {
          uid: 'z-reader-user',
        },
        audio: {
          format: 'wav',
          codec: 'raw',
          rate: 16000,
          bits: 16,
          channel: 1,
          language: options.language || 'zh-CN',
        },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          enable_ddc: false,
          show_utterances: true,
          result_type: 'full',
        },
      };

      ws.send(buildFullClientRequest(config));

      // 2. 分包发送音频数据
      // 注意: WAV 头会随首包发送，因为 config 中 format:'wav' 告知服务端期望完整 WAV 格式
      const PACKET_SIZE = 6400; // ~200ms for 16kHz 16bit mono
      const interval = options.sendIntervalMs ?? 200;
      const totalPackets = Math.ceil(audioBuffer.length / PACKET_SIZE);
      let packetIndex = 0;

      const sendNextPacket = () => {
        if (abortSignal?.aborted) {
          fail('转写已取消');
          return;
        }

        if (packetIndex >= totalPackets) return;

        const start = packetIndex * PACKET_SIZE;
        const end = Math.min(start + PACKET_SIZE, audioBuffer.length);
        const chunk = audioBuffer.subarray(start, end);
        const isLast = packetIndex === totalPackets - 1;

        ws.send(buildAudioRequest(chunk, isLast));

        packetIndex++;
        callbacks.onProgress(packetIndex / totalPackets);

        if (!isLast) {
          setTimeout(sendNextPacket, interval);
        }
      };

      // 开始发送
      sendNextPacket();
    });

    ws.on('message', (data: Buffer) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const result = parseServerResponse(buf);

      if (result.type === 'error') {
        fail(`ASR 错误 [${result.errorCode}]: ${result.errorMessage}`);
        return;
      }

      if (result.payload?.result?.utterances) {
        accumulatedSegments = result.payload.result.utterances
          .filter((u) => u.definite)
          .map((u) => ({
            start: u.start_time / 1000 + timeOffset,
            end: u.end_time / 1000 + timeOffset,
            text: u.text,
          }));
        callbacks.onSegments(accumulatedSegments);
      }
    });

    ws.on('close', (_code, _reason) => {
      if (!resolved) {
        // 连接正常关闭 = 转写完成
        finish(accumulatedSegments);
      }
    });

    ws.on('error', (err) => {
      fail(`WebSocket 连接错误: ${err.message}`);
    });

    // 超时保护 — 根据音频大小动态计算:
    // 发送时间 + 服务端处理余量(5分钟) + 最低保底(10分钟)
    const estimatedPackets = Math.ceil(audioBuffer.length / 6400);
    const estimatedSendTime = estimatedPackets * (options.sendIntervalMs ?? 200);
    const timeoutMs = Math.max(estimatedSendTime + 5 * 60 * 1000, 10 * 60 * 1000);
    setTimeout(() => {
      if (!resolved) {
        fail(`转写超时（${Math.round(timeoutMs / 60000)}分钟）`);
      }
    }, timeoutMs);
  });
}
