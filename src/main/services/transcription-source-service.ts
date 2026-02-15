import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { getDatabase, schema } from '../db';
import { startDownload } from './download-service';
import { getVideoStreamUrl } from './youtube-service';

const execFileAsync = promisify(execFile);

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath = 'ffmpeg';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffmpegPath = require('ffmpeg-static') as string;
} catch {
  ffmpegPath = 'ffmpeg';
}

export type TranscriptionSourceDescriptor =
  | { kind: 'local-audio-file'; filePath: string }
  | { kind: 'local-video-file'; filePath: string; requiresExtraction: true }
  | { kind: 'downloaded-audio-file'; filePath: string }
  | { kind: 'remote-audio-url'; audioUrl: string }
  | { kind: 'youtube-video'; videoId: string };

interface ResolveDescriptorInput {
  article: {
    mediaType?: string | null;
    audioUrl?: string | null;
    url?: string | null;
    videoId?: string | null;
  };
  downloadedAudioFilePath?: string | null;
}

interface ResolveAudioOptions {
  articleId: string;
  /**
   * realtime: keep podcast current behavior (require ready local/downloaded audio)
   * background: allow temporary remote download / youtube audio fetch
   */
  mode: 'realtime' | 'background';
}

interface MaterializeOptions {
  mode: 'realtime' | 'background';
}

export interface PreparedTranscriptionAudio {
  filePath: string;
  sourceKind: TranscriptionSourceDescriptor['kind'];
  cleanupPaths: string[];
}

const DOWNLOAD_POLL_INTERVAL = 2_000;
const DOWNLOAD_TIMEOUT = 10 * 60 * 1000;

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export function toLocalFilePathFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('file://')) {
    try {
      return fileURLToPath(value);
    } catch {
      return null;
    }
  }

  if (path.isAbsolute(value)) return value;
  return null;
}

export function resolveTranscriptionSourceDescriptor({
  article,
  downloadedAudioFilePath,
}: ResolveDescriptorInput): TranscriptionSourceDescriptor | null {
  const localAudioPath = toLocalFilePathFromUrl(article.audioUrl);
  if (localAudioPath) {
    return { kind: 'local-audio-file', filePath: localAudioPath };
  }

  if (downloadedAudioFilePath) {
    return { kind: 'downloaded-audio-file', filePath: downloadedAudioFilePath };
  }

  const localVideoPath = article.mediaType === 'video'
    ? toLocalFilePathFromUrl(article.url)
    : null;
  if (localVideoPath) {
    return { kind: 'local-video-file', filePath: localVideoPath, requiresExtraction: true };
  }

  if (isHttpUrl(article.audioUrl)) {
    return { kind: 'remote-audio-url', audioUrl: article.audioUrl };
  }

  if (article.mediaType === 'video' && article.videoId) {
    return { kind: 'youtube-video', videoId: article.videoId };
  }

  return null;
}

async function fileReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForDownloadReady(articleId: string): Promise<string> {
  const db = getDatabase();
  const startTime = Date.now();

  for (;;) {
    if (Date.now() - startTime > DOWNLOAD_TIMEOUT) {
      throw new Error('音频下载超时（10分钟）');
    }

    const [dl] = await db.select()
      .from(schema.downloads)
      .where(eq(schema.downloads.articleId, articleId));

    if (dl?.status === 'ready' && dl.filePath) {
      if (await fileReadable(dl.filePath)) return dl.filePath;
      throw new Error('下载的音频文件无法读取');
    }

    if (dl?.status === 'failed') {
      throw new Error('音频下载失败');
    }

    await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_POLL_INTERVAL));
  }
}

function guessExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    if (ext) return ext;
  } catch {
    // ignore
  }
  return '.mp3';
}

async function downloadToTemp(url: string): Promise<{ filePath: string; cleanupPaths: string[] }> {
  const tempDir = path.join(os.tmpdir(), `z-reader-asr-src-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const ext = guessExtensionFromUrl(url);
  const filePath = path.join(tempDir, `source${ext}`);

  const response = await fetch(url, { headers: { 'User-Agent': 'Z-Reader/1.0' } });
  if (!response.ok || !response.body) {
    throw new Error(`下载音频失败: HTTP ${response.status}`);
  }

  const writer = createWriteStream(filePath);
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    writer.write(Buffer.from(value));
  }
  writer.end();

  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return { filePath, cleanupPaths: [tempDir] };
}

async function extractAudioFromVideo(videoPath: string): Promise<{ filePath: string; cleanupPaths: string[] }> {
  const tempDir = path.join(os.tmpdir(), `z-reader-asr-video-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const output = path.join(tempDir, 'audio.wav');

  await execFileAsync(ffmpegPath, [
    '-i', videoPath,
    '-vn',
    '-ar', '16000',
    '-ac', '1',
    '-acodec', 'pcm_s16le',
    '-f', 'wav',
    '-y',
    output,
  ], { timeout: 10 * 60 * 1000 });

  return { filePath: output, cleanupPaths: [tempDir] };
}

async function materializeDescriptor(
  descriptor: TranscriptionSourceDescriptor,
  opts: MaterializeOptions,
): Promise<PreparedTranscriptionAudio> {
  switch (descriptor.kind) {
    case 'local-audio-file':
    case 'downloaded-audio-file':
      return { filePath: descriptor.filePath, sourceKind: descriptor.kind, cleanupPaths: [] };
    case 'local-video-file': {
      const extracted = await extractAudioFromVideo(descriptor.filePath);
      return { ...extracted, sourceKind: descriptor.kind };
    }
    case 'remote-audio-url': {
      if (opts.mode !== 'background') {
        throw new Error('未找到可转写的本地音频文件，请先下载音频');
      }
      const downloaded = await downloadToTemp(descriptor.audioUrl);
      return { ...downloaded, sourceKind: descriptor.kind };
    }
    case 'youtube-video': {
      if (opts.mode !== 'background') {
        throw new Error('实时转写不支持直接处理在线视频，请使用后台转写');
      }
      const stream = await getVideoStreamUrl(descriptor.videoId);
      const audioUrl = stream?.bestAudio?.url;
      if (!audioUrl) {
        throw new Error('无法获取视频音轨');
      }
      const downloaded = await downloadToTemp(audioUrl);
      return { ...downloaded, sourceKind: descriptor.kind };
    }
    default:
      throw new Error('未知转写源类型');
  }
}

export async function cleanupTranscriptionTempPaths(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await rm(p, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

/**
 * Unified entry for podcast + video transcription source resolution/materialization.
 */
export async function prepareTranscriptionAudio({
  articleId,
  mode,
}: ResolveAudioOptions): Promise<PreparedTranscriptionAudio> {
  const db = getDatabase();
  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId));
  if (!article) {
    throw new Error('文章不存在');
  }

  let downloadedAudioFilePath: string | null = null;
  const [download] = await db.select().from(schema.downloads)
    .where(and(
      eq(schema.downloads.articleId, articleId),
      eq(schema.downloads.status, 'ready'),
    ));
  if (download?.filePath && await fileReadable(download.filePath)) {
    downloadedAudioFilePath = download.filePath;
  }

  let descriptor = resolveTranscriptionSourceDescriptor({
    article: {
      mediaType: article.mediaType,
      audioUrl: article.audioUrl,
      url: article.url,
      videoId: article.videoId,
    },
    downloadedAudioFilePath,
  });

  // Background mode: remote audio can leverage existing download service first.
  if (!descriptor && mode === 'background' && article.audioUrl) {
    await startDownload(articleId);
    const filePath = await waitForDownloadReady(articleId);
    descriptor = { kind: 'downloaded-audio-file', filePath };
  }

  if (!descriptor) {
    throw new Error('未找到可用的转写源');
  }

  const prepared = await materializeDescriptor(descriptor, { mode });

  if (!(await fileReadable(prepared.filePath))) {
    await cleanupTranscriptionTempPaths(prepared.cleanupPaths);
    throw new Error('转写源文件无法读取');
  }

  return prepared;
}
