import { Innertube, Platform } from 'youtubei.js';
import type { TranscriptSegment } from '../../shared/types';
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
 * 获取 YouTube 视频流媒体直链 URL
 * 使用 cookie 认证的 Innertube 实例调用 /player 端点
 */
export async function getVideoStreamUrl(videoId: string): Promise<{ url: string; mimeType: string } | null> {
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
      formats?: Array<{ url?: string; signatureCipher?: string; mimeType?: string; qualityLabel?: string }>;
      adaptiveFormats?: Array<{ url?: string; signatureCipher?: string; mimeType?: string; qualityLabel?: string }>;
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

    const allFormats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptiveFormats ?? []),
    ];

    if (allFormats.length === 0) return null;

    // 优先 muxed MP4（音视频合一），其次 adaptive 视频 MP4
    const muxedMp4 = (streamingData.formats ?? []).filter(f => f.mimeType?.startsWith('video/mp4'));
    const adaptiveVideo = (streamingData.adaptiveFormats ?? []).filter(f => f.mimeType?.startsWith('video/mp4'));
    const bestFormat = muxedMp4.length > 0
      ? muxedMp4[muxedMp4.length - 1]
      : adaptiveVideo.length > 0
        ? adaptiveVideo[0]
        : allFormats[0];

    // 解密 URL
    let url = bestFormat.url;
    if (!url && bestFormat.signatureCipher && player) {
      url = await player.decipher(undefined, bestFormat.signatureCipher, undefined, new Map());
    } else if (url && player) {
      url = await player.decipher(url, undefined, undefined, new Map());
    }

    if (!url) return null;

    return { url, mimeType: bestFormat.mimeType ?? 'video/mp4' };
  } catch (err) {
    console.error('[YouTube Stream] 获取视频流失败:', err);
    return null;
  }
}
