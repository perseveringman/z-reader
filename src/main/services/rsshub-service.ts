/**
 * RSSHub 路由缓存管理服务
 * - 从 RSSHub 实例拉取路由数据（兼容新版 /api/namespace 和旧版 /api/routes）
 * - 缓存路由数据到内存
 * - 提供分类查询、模糊搜索、URL 拼接
 */

import { RSSHubCategory, RSSHubNamespace, RSSHubRoute } from '../../shared/types';
import { loadSettings, updateSettings } from './settings-service';

// 内存缓存
let routeCache: Record<string, RSSHubNamespace> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟缓存

/**
 * 获取用户配置的 RSSHub 实例地址
 */
export async function getRSSHubBaseUrl(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.rsshubBaseUrl || null;
}

/**
 * 设置 RSSHub 实例地址
 */
export async function setRSSHubBaseUrl(baseUrl: string): Promise<void> {
  await updateSettings({ rsshubBaseUrl: baseUrl.replace(/\/+$/, '') });
  // 清除缓存，下次查询时重新拉取
  routeCache = null;
  cacheTimestamp = 0;
}

/**
 * 从 RSSHub 实例拉取路由数据
 * 兼容新版（/api/namespace）和旧版（/api/routes）API
 */
async function fetchRoutes(baseUrl: string): Promise<Record<string, RSSHubNamespace>> {
  // 先尝试新版 API（/api/namespace）
  const newRes = await fetch(`${baseUrl}/api/namespace`);
  if (newRes.ok) {
    const json = await newRes.json();
    // 新版直接返回 { nsKey: { name, routes, url, categories, ... } }
    return json;
  }

  // 回退到旧版 API（/api/routes）
  const oldRes = await fetch(`${baseUrl}/api/routes`);
  if (!oldRes.ok) {
    throw new Error(`RSSHub API 请求失败: ${oldRes.status}`);
  }
  const oldJson = await oldRes.json();
  // 旧版返回 { data: { namespace: { routes: {...} } } }
  return oldJson.data || {};
}

/**
 * 获取路由缓存，过期则重新拉取
 */
export async function getRouteCache(): Promise<Record<string, RSSHubNamespace> | null> {
  const baseUrl = await getRSSHubBaseUrl();
  if (!baseUrl) return null;

  const now = Date.now();
  if (routeCache && (now - cacheTimestamp) < CACHE_TTL) {
    return routeCache;
  }

  try {
    routeCache = await fetchRoutes(baseUrl);
    cacheTimestamp = now;
    return routeCache;
  } catch (err) {
    console.error('拉取 RSSHub 路由失败:', err);
    // 如果有旧缓存，继续使用
    if (routeCache) return routeCache;
    return null;
  }
}

/**
 * 获取所有分类及其站点数量
 */
export async function getCategories(): Promise<RSSHubCategory[]> {
  const routes = await getRouteCache();
  if (!routes) return [];

  const categoryMap = new Map<string, number>();

  for (const ns of Object.values(routes)) {
    for (const route of Object.values(ns.routes || {})) {
      const cats = route.categories || [];
      for (const cat of cats) {
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
      }
    }
  }

  return Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 获取指定分类下的路由（不传分类则返回全部）
 */
export async function getRoutesByCategory(
  category?: string,
): Promise<Record<string, RSSHubNamespace>> {
  const routes = await getRouteCache();
  if (!routes) return {};
  if (!category) return routes;

  const filtered: Record<string, RSSHubNamespace> = {};
  for (const [nsKey, ns] of Object.entries(routes)) {
    const matchedRoutes: Record<string, RSSHubRoute> = {};
    for (const [routeKey, route] of Object.entries(ns.routes || {})) {
      if (route.categories?.includes(category)) {
        matchedRoutes[routeKey] = route;
      }
    }
    if (Object.keys(matchedRoutes).length > 0) {
      filtered[nsKey] = { ...ns, routes: matchedRoutes };
    }
  }
  return filtered;
}

/**
 * 模糊搜索路由（匹配站点名、路由名、分类名）
 */
export async function searchRoutes(query: string): Promise<Record<string, RSSHubNamespace>> {
  const routes = await getRouteCache();
  if (!routes) return {};

  const q = query.toLowerCase();
  const filtered: Record<string, RSSHubNamespace> = {};

  for (const [nsKey, ns] of Object.entries(routes)) {
    // 命名空间级别匹配
    const nsMatch = ns.name?.toLowerCase().includes(q) ||
      nsKey.toLowerCase().includes(q) ||
      ns.url?.toLowerCase().includes(q);

    if (nsMatch) {
      // 整个命名空间匹配，全部包含
      filtered[nsKey] = ns;
      continue;
    }

    // 路由级别匹配
    const matchedRoutes: Record<string, RSSHubRoute> = {};
    for (const [routeKey, route] of Object.entries(ns.routes || {})) {
      const routeMatch = route.name?.toLowerCase().includes(q) ||
        route.description?.toLowerCase().includes(q) ||
        route.categories?.some(c => c.toLowerCase().includes(q));

      if (routeMatch) {
        matchedRoutes[routeKey] = route;
      }
    }
    if (Object.keys(matchedRoutes).length > 0) {
      filtered[nsKey] = { ...ns, routes: matchedRoutes };
    }
  }

  return filtered;
}

/**
 * 根据域名在 RSSHub 路由中查找匹配的命名空间
 */
export async function findRoutesByDomain(domain: string): Promise<Record<string, RSSHubNamespace>> {
  const routes = await getRouteCache();
  if (!routes) return {};

  const d = domain.toLowerCase().replace(/^www\./, '');
  const filtered: Record<string, RSSHubNamespace> = {};

  for (const [nsKey, ns] of Object.entries(routes)) {
    const nsUrl = ns.url?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    if (nsKey.toLowerCase() === d || nsUrl === d || nsUrl?.includes(d)) {
      filtered[nsKey] = ns;
    }
  }

  return filtered;
}

/**
 * 拼接完整的 RSSHub 订阅 URL
 */
export async function buildFeedUrl(path: string): Promise<string | null> {
  const baseUrl = await getRSSHubBaseUrl();
  if (!baseUrl) return null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
