import { useState, useEffect, useCallback } from 'react';
import { Loader2, Flame } from 'lucide-react';
import type { RSSHubNamespace } from '../../../shared/types';

interface PopularSitesProps {
  onSelectSite: (nsKey: string, ns: RSSHubNamespace) => void;
}

// 热门站点列表（按热度排序）
const POPULAR_SITE_KEYS = [
  'xiaohongshu',
  'twitter',
  'instagram',
  'telegram',
  'youtube',
  'bilibili',
  'weibo',
  'xiaoyuzhou',
  'pixiv',
  'pornhub',
  'github',
  'sspai',
  'jike',
  'zhihu',
  'v2ex',
];

// 站点中文名映射（补充 API 可能缺失的中文名）
const SITE_NAMES: Record<string, string> = {
  xiaohongshu: '小红书',
  twitter: 'X (Twitter)',
  instagram: 'Instagram',
  telegram: 'Telegram',
  youtube: 'YouTube',
  bilibili: '哔哩哔哩 bilibili',
  weibo: '微博',
  xiaoyuzhou: '小宇宙',
  pixiv: 'pixiv',
  pornhub: 'PornHub',
  github: 'GitHub',
  sspai: '少数派 sspai',
  jike: '即刻',
  zhihu: '知乎',
  v2ex: 'V2EX',
};

export function PopularSites({ onSelectSite }: PopularSitesProps) {
  const [allRoutes, setAllRoutes] = useState<Record<string, RSSHubNamespace> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.discoverRsshubRoutes().then((routes) => {
      setAllRoutes(routes);
    }).catch((err) => {
      console.error('加载路由数据失败:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleClick = useCallback((nsKey: string) => {
    if (!allRoutes?.[nsKey]) return;
    onSelectSite(nsKey, allRoutes[nsKey]);
  }, [allRoutes, onSelectSite]);

  if (loading) {
    return (
      <div className="mb-8">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-1.5">
          <Flame size={14} className="text-orange-400" />
          热门站点
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-gray-600" />
        </div>
      </div>
    );
  }

  if (!allRoutes) return null;

  // 过滤出实际存在的热门站点
  const availableSites = POPULAR_SITE_KEYS.filter(key => allRoutes[key]);
  if (availableSites.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-1.5">
        <Flame size={14} className="text-orange-400" />
        热门站点
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {availableSites.map((nsKey) => {
          const ns = allRoutes[nsKey];
          const routeCount = Object.keys(ns.routes || {}).length;
          const displayName = SITE_NAMES[nsKey] || ns.name || nsKey;

          return (
            <button
              key={nsKey}
              onClick={() => handleClick(nsKey)}
              className="flex items-center gap-3 px-3.5 py-3 rounded-lg bg-[#111] border border-white/5 hover:border-white/15 hover:bg-[#161616] transition-all cursor-pointer group text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-300 group-hover:text-white transition-colors truncate">
                  {displayName}
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">
                  {routeCount} routes
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
