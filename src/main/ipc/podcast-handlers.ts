import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { searchPodcasts } from '../services/podcast-directory-service';
import { resolvePodcastUrl } from '../services/podcast-resolver';
import { loadSettings } from '../services/settings-service';
import type { PodcastSearchQuery } from '../../shared/types';

export function registerPodcastHandlers() {
  const { PODCAST_SEARCH, PODCAST_RESOLVE_URL } = IPC_CHANNELS;

  // 搜索播客目录
  ipcMain.handle(PODCAST_SEARCH, async (_event, query: PodcastSearchQuery) => {
    const settings = loadSettings();
    return searchPodcasts(
      query.query,
      query.type ?? 'show',
      query.limit ?? 20,
      {
        podcastIndexApiKey: settings.podcastIndexApiKey,
        podcastIndexApiSecret: settings.podcastIndexApiSecret,
      },
    );
  });

  // URL 解析为播客 feed
  ipcMain.handle(PODCAST_RESOLVE_URL, async (_event, url: string) => {
    return resolvePodcastUrl(url);
  });
}
