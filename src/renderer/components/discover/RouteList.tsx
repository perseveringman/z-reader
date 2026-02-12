import { Loader2, ExternalLink } from 'lucide-react';
import type { RSSHubNamespace } from '../../../shared/types';

interface RouteListProps {
  routes: Record<string, RSSHubNamespace>;
  loading: boolean;
  onSelectRoute: (namespace: string, route: { path: string; name: string; example?: string; parameters?: Record<string, string> }) => void;
}

export function RouteList({ routes, loading, onSelectRoute }: RouteListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-gray-500" />
        <span className="ml-2 text-sm text-gray-500">加载路由中...</span>
      </div>
    );
  }

  const namespaces = Object.entries(routes);

  if (namespaces.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500">该分类下暂无路由</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {namespaces.map(([nsKey, ns]) => (
        <div key={nsKey} className="border border-white/5 rounded-lg overflow-hidden">
          {/* 站点头部 */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#111]">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">
                {ns.name || nsKey}
              </div>
              {ns.url && (
                <a
                  href={ns.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-gray-600 hover:text-gray-400 flex items-center gap-1 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ns.url}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            <span className="text-[10px] text-gray-600 shrink-0">
              {Object.keys(ns.routes || {}).length} 个路由
            </span>
          </div>

          {/* 路由列表 */}
          <div className="divide-y divide-white/5">
            {Object.entries(ns.routes || {}).map(([routeKey, route]) => (
              <button
                key={routeKey}
                onClick={() => onSelectRoute(ns.name || nsKey, {
                  path: routeKey,
                  name: route.name,
                  example: route.example,
                  parameters: route.parameters,
                })}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">{route.name}</div>
                  <span className="text-xs text-blue-500 shrink-0 ml-2">
                    {hasRequiredParams(routeKey) ? '配置参数' : '直接订阅'}
                  </span>
                </div>
                {route.description && (
                  <div className="text-xs text-gray-600 mt-1 line-clamp-2">{route.description}</div>
                )}
                {route.example && (
                  <div className="text-[10px] text-gray-700 mt-1 font-mono">{route.example}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function hasRequiredParams(path: string): boolean {
  return /:(\w+)/.test(path);
}
