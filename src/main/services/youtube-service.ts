import { Innertube, Platform } from 'youtubei.js';
import type { TranscriptSegment, VideoFormat, VideoStreamData } from '../../shared/types';
import { getStoredCookies } from './youtube-auth';
import vm from 'node:vm';

// 注册自定义 JS 评估器，用于解密 YouTube 视频流 URL
// youtubei.js 默认不内置解释器，需要外部提供
Platform.shim.eval = (data, env) => {
  const properties: string[] = [];

  if (env.n) {
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const script = `(function() { ${data.output}\nreturn { ${properties.join(', ')} }; })()`;
  return vm.runInNewContext(script, {});
};

let innertubeClient: Innertube | null = null;

async function getClient(): Promise<Innertube> {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create({
      generate_session_locally: true,
      retrieve_player: true,
    });
  }
  return innertubeClient;
}

// 缓存已认证的 Innertube 实例和对应的 cookie
let authedClient: Innertube | null = null;
let authedCookie: string | null = null;

/**
 * 获取带 cookie 认证的 Innertube 实例
 * cookie 变更时重建实例
 */
async function getAuthedClient(cookie: string): Promise<Innertube> {
  if (authedClient && authedCookie === cookie) {
    return authedClient;
  }
  authedClient = await Innertube.create({
    cookie,
    generate_session_locally: true,
    retrieve_player: true,
  });
  authedCookie = cookie;
  return authedClient;
}

/**
 * 判断是否为 YouTube 域名
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * 解析 YouTube 频道 URL 为 RSS feed 地址
 * 支持: /@username, /channel/UCxxx, /c/name
 */
export async function resolveYouTubeChannelFeed(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const html = await response.text();

    // 方法1: 从 meta 标签提取 channel_id
    const metaMatch = html.match(/<meta\s+itemprop="channelId"\s+content="([^"]+)"/);
    if (metaMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${metaMatch[1]}`;
    }

    // 方法2: 从页面内容提取 channel_id
    const canonicalMatch = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (canonicalMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${canonicalMatch[1]}`;
    }

    // 方法3: 从 RSS link 标签直接获取
    const rssMatch = html.match(/<link[^>]+type="application\/rss\+xml"[^>]+href="([^"]+)"/);
    if (rssMatch) {
      return rssMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 获取 YouTube 视频字幕
 * 优先手动上传字幕，其次自动生成字幕
 */
export async function fetchTranscript(videoId: string): Promise<{ segments: TranscriptSegment[]; language: string | null } | null> {
  try {
    const client = await getClient();
    const info = await client.getInfo(videoId);
    const transcriptInfo = await info.getTranscript();

    const body = transcriptInfo?.transcript?.content?.body;
    if (!body?.initial_segments) {
      return null;
    }

    const segments: TranscriptSegment[] = [];
    for (const seg of body.initial_segments) {
      if (seg.type === 'TranscriptSegment') {
        const startMs = (seg as unknown as Record<string, unknown>).start_ms;
        const endMs = (seg as unknown as Record<string, unknown>).end_ms;
        const snippet = (seg as unknown as Record<string, unknown>).snippet as { text?: string } | undefined;
        const start = Number(startMs) / 1000;
        const end = Number(endMs) / 1000;
        const text = snippet?.text ?? '';
        if (text) {
          segments.push({ start, end, text });
        }
      }
    }

    return segments.length > 0 ? { segments, language: null } : null;
  } catch (err) {
    console.error('获取字幕失败:', err);
    return null;
  }
}

/**
 * 获取 YouTube 视频所有可用流媒体格式
 * 返回所有视频格式列表 + 最佳音频流，供前端选择清晰度
 */
export async function getVideoStreamUrl(videoId: string): Promise<VideoStreamData | null> {
  const cookie = await getStoredCookies();
  if (!cookie) {
    console.error('[YouTube Stream] 未登录，无法获取视频流');
    return null;
  }

  try {
    console.log(`[YouTube Stream] 使用 cookie 认证获取 ${videoId}`);
    const client = await getAuthedClient(cookie);
    const player = client.session.player;

    const response = await client.actions.execute('/player', {
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: {
        contentPlaybackContext: {
          vis: 0,
          splay: false,
          lactMilliseconds: '-1',
          signatureTimestamp: player?.signature_timestamp,
        },
      },
    });

    const data = response.data as Record<string, unknown>;
    const playability = data.playabilityStatus as { status?: string; reason?: string } | undefined;
    const streamingData = data.streamingData as {
      formats?: Array<{
        itag?: number; url?: string; signatureCipher?: string; mimeType?: string;
        qualityLabel?: string; width?: number; height?: number; bitrate?: number;
      }>;
      adaptiveFormats?: Array<{
        itag?: number; url?: string; signatureCipher?: string; mimeType?: string;
        qualityLabel?: string; width?: number; height?: number; bitrate?: number;
      }>;
    } | undefined;

    console.log(`[YouTube Stream] 响应:`, {
      status: playability?.status,
      reason: playability?.reason,
      formats: streamingData?.formats?.length ?? 0,
      adaptive: streamingData?.adaptiveFormats?.length ?? 0,
    });

    if (playability?.status !== 'OK' || !streamingData) {
      return null;
    }

    // 辅助函数：解密单个 format 的 URL
    const decipherUrl = async (fmt: { url?: string; signatureCipher?: string }): Promise<string | null> => {
      let url = fmt.url;
      if (!url && fmt.signatureCipher && player) {
        url = await player.decipher(undefined, fmt.signatureCipher, undefined, new Map());
      } else if (url && player) {
        url = await player.decipher(url, undefined, undefined, new Map());
      }
      return url ?? null;
    };

    // 收集所有视频格式
    const videoFormats: VideoFormat[] = [];

    // muxed formats（音视频合一，通常最高 720p）
    for (const fmt of streamingData.formats ?? []) {
      if (!fmt.mimeType?.startsWith('video/')) continue;
      const url = await decipherUrl(fmt);
      if (!url) continue;
      videoFormats.push({
        itag: fmt.itag ?? 0,
        qualityLabel: fmt.qualityLabel ?? `${fmt.height ?? 0}p`,
        width: fmt.width ?? 0,
        height: fmt.height ?? 0,
        url,
        mimeType: fmt.mimeType,
        bitrate: fmt.bitrate ?? 0,
        hasAudio: true,
        hasVideo: true,
      });
    }

    // adaptive video formats（纯视频，可到 4K）
    for (const fmt of streamingData.adaptiveFormats ?? []) {
      if (!fmt.mimeType?.startsWith('video/')) continue;
      const url = await decipherUrl(fmt);
      if (!url) continue;
      videoFormats.push({
        itag: fmt.itag ?? 0,
        qualityLabel: fmt.qualityLabel ?? `${fmt.height ?? 0}p`,
        width: fmt.width ?? 0,
        height: fmt.height ?? 0,
        url,
        mimeType: fmt.mimeType,
        bitrate: fmt.bitrate ?? 0,
        hasAudio: false,
        hasVideo: true,
      });
    }

    if (videoFormats.length === 0) return null;

    // 按 height 降序排列，同 qualityLabel 取 bitrate 最高的
    videoFormats.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
    const seen = new Set<string>();
    const dedupedFormats = videoFormats.filter(f => {
      if (seen.has(f.qualityLabel)) return false;
      seen.add(f.qualityLabel);
      return true;
    });

    // 找最佳音频流（audio/mp4，最高 bitrate）
    let bestAudio: VideoFormat | null = null;
    for (const fmt of streamingData.adaptiveFormats ?? []) {
      if (!fmt.mimeType?.startsWith('audio/mp4')) continue;
      const url = await decipherUrl(fmt);
      if (!url) continue;
      const audioFmt: VideoFormat = {
        itag: fmt.itag ?? 0,
        qualityLabel: '',
        width: 0,
        height: 0,
        url,
        mimeType: fmt.mimeType,
        bitrate: fmt.bitrate ?? 0,
        hasAudio: true,
        hasVideo: false,
      };
      if (!bestAudio || audioFmt.bitrate > bestAudio.bitrate) {
        bestAudio = audioFmt;
      }
    }

    console.log(`[YouTube Stream] 可用格式: ${dedupedFormats.map(f => f.qualityLabel).join(', ')}，最佳音频: ${bestAudio ? bestAudio.bitrate + 'bps' : '无'}`);

    return { formats: dedupedFormats, bestAudio };
  } catch (err) {
    console.error('[YouTube Stream] 获取视频流失败:', err);
    return null;
  }
}
