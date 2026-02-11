import { Innertube } from 'youtubei.js';
import type { TranscriptSegment } from '../../shared/types';

let innertubeClient: Innertube | null = null;

async function getClient(): Promise<Innertube> {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create();
  }
  return innertubeClient;
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
        const startMs = (seg as Record<string, unknown>).start_ms;
        const endMs = (seg as Record<string, unknown>).end_ms;
        const snippet = (seg as Record<string, unknown>).snippet as { text?: string } | undefined;
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
