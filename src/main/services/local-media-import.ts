import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MediaType } from '../../shared/types';

const execFileAsync = promisify(execFile);

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath = 'ffmpeg';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffmpegPath = require('ffmpeg-static') as string;
} catch {
  ffmpegPath = 'ffmpeg';
}

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv']);

export type LocalMediaType = Extract<MediaType, 'podcast' | 'video'>;

export function detectLocalMediaTypeFromExtension(rawExt: string): LocalMediaType | null {
  const ext = rawExt.toLowerCase().startsWith('.') ? rawExt.toLowerCase() : `.${rawExt.toLowerCase()}`;
  if (AUDIO_EXTENSIONS.has(ext)) return 'podcast';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

export function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

function inferAudioMime(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.aac') return 'audio/aac';
  if (ext === '.ogg') return 'audio/ogg';
  return null;
}

export function inferMediaMimeFromPath(filePath: string): string | null {
  const audio = inferAudioMime(filePath);
  if (audio) return audio;

  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  return null;
}

interface BuildImportedMediaArticleInput {
  id: string;
  title: string;
  filePath: string;
  mediaType: LocalMediaType;
  fileSize: number;
  duration: number | null;
  now: string;
}

export function buildImportedMediaArticle({
  id,
  title,
  filePath,
  mediaType,
  fileSize,
  duration,
  now,
}: BuildImportedMediaArticleInput) {
  const base = {
    id,
    feedId: null,
    guid: null,
    title,
    author: null,
    summary: null,
    content: null,
    contentText: null,
    thumbnail: null,
    wordCount: 0,
    readingTime: 0,
    language: null,
    publishedAt: null,
    savedAt: now,
    readStatus: 'inbox' as const,
    readProgress: 0,
    isShortlisted: 0,
    source: 'library' as const,
    domain: null,
    mediaType,
    videoId: null,
    duration,
    audioUrl: null as string | null,
    audioMime: null as string | null,
    audioBytes: null as number | null,
    audioDuration: null as number | null,
    episodeNumber: null,
    seasonNumber: null,
    createdAt: now,
    updatedAt: now,
    deletedFlg: 0,
    url: null as string | null,
  };

  if (mediaType === 'podcast') {
    return {
      ...base,
      audioUrl: toFileUrl(filePath),
      audioMime: inferAudioMime(filePath),
      audioBytes: fileSize,
      audioDuration: duration,
    };
  }

  return {
    ...base,
    url: toFileUrl(filePath),
  };
}

export async function detectMediaDurationInSeconds(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync(ffmpegPath, [
      '-i', filePath,
      '-f', 'null', '-',
    ], { timeout: 30_000 }).catch((e) => ({ stdout: '', stderr: (e as { stderr?: string }).stderr || '' }));

    const output = stderr || '';
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    if ([h, m, s].some((v) => Number.isNaN(v))) return null;
    return h * 3600 + m * 60 + s;
  } catch {
    return null;
  }
}

export function inferTitleFromFilePath(filePath: string): string {
  const ext = extname(filePath);
  return basename(filePath, ext);
}
