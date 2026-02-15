import { Innertube, Platform } from 'youtubei.js';
import type { TranscriptSegment, VideoFormat, VideoStreamData } from '../../shared/types';
import { getStoredCookies, exportCookieFile, cleanupCookieFile } from './youtube-auth';
import vm from 'node:vm';
import { execFile } from 'node:child_process';

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
 * 判断是否为 YouTube 域名（含 youtu.be 短链）
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * 从 YouTube URL 中提取视频 ID
 * 支持: youtube.com/watch?v=xxx, youtu.be/xxx, m.youtube.com/watch?v=xxx,
 *       youtube.com/shorts/xxx, youtube.com/embed/xxx
 * 返回 videoId 或 null
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    // youtube.com 系列
    if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(hostname)) {
      // /watch?v=VIDEO_ID
      const v = parsed.searchParams.get('v');
      if (v) return v;

      // /shorts/VIDEO_ID, /embed/VIDEO_ID, /live/VIDEO_ID
      const pathMatch = parsed.pathname.match(/^\/(shorts|embed|live)\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) return pathMatch[2];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 通过 YouTube oEmbed API 获取视频元数据（标题、作者），
 * 再通过 Innertube 获取视频时长。
 * 无需 API key，无需 JS 渲染
 */
export async function fetchYouTubeVideoMeta(videoId: string): Promise<{
  title: string;
  author: string | null;
  duration: number | null; // 秒
} | null> {
  try {
    // 1. oEmbed 获取标题和作者（轻量、可靠）
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Z-Reader/1.0',
      },
    });
    if (!response.ok) return null;

    const data = await response.json() as {
      title?: string;
      author_name?: string;
    };

    // 2. Innertube 获取视频时长（无需认证）
    let duration: number | null = null;
    try {
      const client = await getClient();
      const info = await client.getBasicInfo(videoId);
      const lengthSeconds = info.basic_info?.duration;
      if (lengthSeconds && lengthSeconds > 0) {
        duration = lengthSeconds;
      }
    } catch {
      // 时长获取失败不影响其余元数据
    }

    return {
      title: data.title ?? videoId,
      author: data.author_name ?? null,
      duration,
    };
  } catch {
    return null;
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
 * 使用 yt-dlp 获取 YouTube 视频字幕
 * 优先手动字幕，其次自动生成字幕；格式使用 json3 解析
 */
export async function fetchTranscript(videoId: string): Promise<{ segments: TranscriptSegment[]; language: string | null } | null> {
  let cookieFile: string | null = null;
  try {
    // 导出 cookie 文件供 yt-dlp 使用
    cookieFile = await exportCookieFile();

    // 用 yt-dlp --dump-json 获取视频元数据（含字幕 URL）
    const args = ['--dump-json', '--skip-download'];
    if (cookieFile) {
      args.push('--cookies', cookieFile);
    }
    args.push(`https://www.youtube.com/watch?v=${videoId}`);

    const metadata = await new Promise<Record<string, unknown>>((resolve, reject) => {
      execFile('yt-dlp', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout) as Record<string, unknown>);
        } catch (e) {
          reject(e);
        }
      });
    });

    const subtitles = metadata.subtitles as Record<string, Array<{ ext: string; url: string }>> | undefined;
    const autoCaptions = metadata.automatic_captions as Record<string, Array<{ ext: string; url: string }>> | undefined;

    // 语言优先级：en > zh-Hans > zh > 第一个可用语言
    const langPriority = ['en', 'zh-Hans', 'zh'];

    // 查找字幕 URL：优先手动字幕，其次自动字幕
    let subUrl: string | null = null;
    let language: string | null = null;

    for (const source of [subtitles, autoCaptions]) {
      if (!source) continue;
      // 按优先级查找
      for (const lang of langPriority) {
        const formats = source[lang];
        if (!formats) continue;
        const json3 = formats.find(f => f.ext === 'json3');
        if (json3) {
          subUrl = json3.url;
          language = lang;
          break;
        }
      }
      if (subUrl) break;
      // 没找到优先语言，取第一个有 json3 的语言
      for (const [lang, formats] of Object.entries(source)) {
        const json3 = formats.find(f => f.ext === 'json3');
        if (json3) {
          subUrl = json3.url;
          language = lang;
          break;
        }
      }
      if (subUrl) break;
    }

    if (!subUrl) {
      console.log(`[YouTube Transcript] 视频 ${videoId} 无可用字幕`);
      return null;
    }

    console.log(`[YouTube Transcript] 下载字幕: ${language}`);

    // 下载 json3 格式字幕
    const res = await fetch(subUrl);
    if (!res.ok) {
      console.error(`[YouTube Transcript] 下载字幕失败: ${res.status}`);
      return null;
    }

    const json3Data = await res.json() as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };

    if (!json3Data.events) return null;

    // 解析 json3 events 为 TranscriptSegment
    const segments: TranscriptSegment[] = [];
    for (const event of json3Data.events) {
      if (!event.segs || event.tStartMs == null) continue;
      const text = event.segs.map(s => s.utf8 ?? '').join('').trim();
      if (!text || text === '\n') continue;
      const start = event.tStartMs / 1000;
      const end = (event.tStartMs + (event.dDurationMs ?? 0)) / 1000;
      segments.push({ start, end, text });
    }

    return segments.length > 0 ? { segments, language } : null;
  } catch (err) {
    console.error('获取字幕失败:', err);
    return null;
  } finally {
    await cleanupCookieFile();
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
