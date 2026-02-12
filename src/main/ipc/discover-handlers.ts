import { ipcMain } from 'electron';
import { eq } from 'drizzle-orm';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getDatabase, schema } from '../db';
import {
  getCategories,
  getRoutesByCategory,
  searchRoutes,
  findRoutesByDomain,
  getRSSHubBaseUrl,
  setRSSHubBaseUrl,
  buildFeedUrl,
} from '../services/rsshub-service';
import { discoverFeeds } from '../services/rss-discovery';
import { searchPodcasts } from '../services/podcast-directory-service';
import { loadSettings } from '../services/settings-service';
import type { DiscoverSearchQuery, DiscoverSearchResult, DiscoverPreviewResult } from '../../shared/types';
import RSSParser from 'rss-parser';

const rssParser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Z-Reader/1.0',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
});

/**
 * 判断输入是否为 URL
 */
function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function registerDiscoverHandlers() {
  const {
    DISCOVER_SEARCH,
    DISCOVER_RSSHUB_CATEGORIES,
    DISCOVER_RSSHUB_ROUTES,
    DISCOVER_PREVIEW,
    DISCOVER_RSSHUB_CONFIG,
  } = IPC_CHANNELS;

  // 统一搜索
  ipcMain.handle(DISCOVER_SEARCH, async (_event, query: DiscoverSearchQuery) => {
    const results: DiscoverSearchResult[] = [];
    const q = query.query.trim();
    if (!q) return results;

    if (isUrl(q)) {
      // URL 输入：自动发现 RSS
      try {
        const discovered = await discoverFeeds(q);
        for (const feed of discovered) {
          results.push({
            type: 'rss',
            title: feed.title || feed.url,
            description: `通过 RSS 自动发现 (${feed.type.toUpperCase()})`,
            image: null,
            feedUrl: feed.url,
            website: q,
          });
        }
      } catch {
        // 网页解析失败，忽略
      }

      // 同时尝试匹配 RSSHub 路由
      try {
        const domain = new URL(q).hostname;
        const matched = await findRoutesByDomain(domain);
        for (const [nsKey, ns] of Object.entries(matched)) {
          for (const [, route] of Object.entries(ns.routes || {})) {
            results.push({
              type: 'rsshub',
              title: `${ns.name || nsKey} - ${route.name}`,
              description: route.description || null,
              image: null,
              feedUrl: null,
              website: ns.url || null,
              rsshubPath: route.example || Object.keys(ns.routes)[0],
              rsshubParams: route.parameters || undefined,
            });
          }
        }
      } catch {
        // 域名解析失败，忽略
      }
    } else {
      // 关键词搜索：并行查询 iTunes + RSSHub
      const [podcastResults, rsshubResults] = await Promise.all([
        // iTunes 播客搜索
        (async () => {
          try {
            const settings = loadSettings();
            return await searchPodcasts(q, 'show', 10, {
              podcastIndexApiKey: settings.podcastIndexApiKey,
              podcastIndexApiSecret: settings.podcastIndexApiSecret,
            });
          } catch {
            return [];
          }
        })(),
        // RSSHub 路由搜索
        (async () => {
          try {
            return await searchRoutes(q);
          } catch {
            return {};
          }
        })(),
      ]);

      // 添加播客结果
      for (const podcast of podcastResults) {
        results.push({
          type: 'podcast',
          title: podcast.title,
          description: podcast.author,
          image: podcast.image,
          feedUrl: podcast.feedUrl,
          website: podcast.website,
        });
      }

      // 添加 RSSHub 路由结果
      for (const [nsKey, ns] of Object.entries(rsshubResults)) {
        for (const [, route] of Object.entries(ns.routes || {})) {
          results.push({
            type: 'rsshub',
            title: `${ns.name || nsKey} - ${route.name}`,
            description: route.description || null,
            image: null,
            feedUrl: null,
            website: ns.url || null,
            rsshubPath: route.example || undefined,
            rsshubParams: route.parameters || undefined,
          });
        }
      }
    }

    return results;
  });

  // 获取 RSSHub 分类列表
  ipcMain.handle(DISCOVER_RSSHUB_CATEGORIES, async () => {
    return getCategories();
  });

  // 获取指定分类下的路由
  ipcMain.handle(DISCOVER_RSSHUB_ROUTES, async (_event, category?: string) => {
    return getRoutesByCategory(category);
  });

  // 预览订阅源
  ipcMain.handle(DISCOVER_PREVIEW, async (_event, feedUrl: string) => {
    // 如果是 RSSHub 路径，先拼接完整 URL
    let url = feedUrl;
    if (feedUrl.startsWith('/')) {
      const fullUrl = await buildFeedUrl(feedUrl);
      if (!fullUrl) throw new Error('请先配置 RSSHub 实例地址');
      url = fullUrl;
    }

    const feed = await rssParser.parseURL(url);

    // 检查是否已订阅
    const db = getDatabase();
    const existing = await db.select().from(schema.feeds)
      .where(eq(schema.feeds.url, url));
    const alreadySubscribed = existing.length > 0 && existing[0].deletedFlg === 0;

    const result: DiscoverPreviewResult = {
      title: feed.title || null,
      description: feed.description || null,
      favicon: feed.image?.url || null,
      feedUrl: url,
      feedType: 'rss',
      articles: (feed.items || []).slice(0, 5).map(item => ({
        title: item.title || null,
        url: item.link || null,
        publishedAt: item.pubDate || item.isoDate || null,
      })),
      alreadySubscribed,
    };

    return result;
  });

  // 获取/设置 RSSHub 配置
  ipcMain.handle(DISCOVER_RSSHUB_CONFIG, async (_event, baseUrl?: string) => {
    if (baseUrl !== undefined) {
      if (baseUrl) {
        await setRSSHubBaseUrl(baseUrl);
      }
    }
    const current = await getRSSHubBaseUrl();
    return { baseUrl: current };
  });
}
