import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader2, ChevronLeft, Settings2 } from 'lucide-react';
import type { RSSHubCategory, RSSHubNamespace, RSSHubParamValue, DiscoverSearchResult } from '../../../shared/types';
import { useToast } from '../Toast';
import { CategoryGrid } from './CategoryGrid';
import { RouteList } from './RouteList';
import { SearchResults } from './SearchResults';
import { FeedPreview } from './FeedPreview';
import { RouteParamForm } from './RouteParamForm';
import { PopularSites } from './PopularSites';

interface DiscoverPageProps {
  onFeedAdded?: () => void;
}

type BreadcrumbItem = { label: string; type: 'home' | 'category' | 'namespace' };

export function DiscoverPage({ onFeedAdded }: DiscoverPageProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DiscoverSearchResult[] | null>(null);

  // RSSHub 分类浏览状态
  const [categories, setCategories] = useState<RSSHubCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryRoutes, setCategoryRoutes] = useState<Record<string, RSSHubNamespace> | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // RSSHub 配置
  const [rsshubBaseUrl, setRsshubBaseUrl] = useState<string | null>(null);
  const [rsshubConfigInput, setRsshubConfigInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // 预览
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | undefined>();

  // 路由参数表单
  const [activeRoute, setActiveRoute] = useState<{
    namespace: string;
    route: { path: string; name: string; example?: string; parameters?: Record<string, RSSHubParamValue> };
  } | null>(null);

  // 面包屑
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ label: '发现', type: 'home' }]);

  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // 加载 RSSHub 配置和分类
  useEffect(() => {
    window.electronAPI.discoverRsshubConfig().then((config) => {
      setRsshubBaseUrl(config.baseUrl);
      setRsshubConfigInput(config.baseUrl || '');
    }).catch((err) => console.error('加载 RSSHub 配置失败:', err));
  }, []);

  useEffect(() => {
    if (!rsshubBaseUrl) return;
    setLoadingCategories(true);
    window.electronAPI.discoverRsshubCategories().then((cats) => {
      setCategories(cats);
    }).catch(() => {
      showToast('加载 RSSHub 分类失败');
    }).finally(() => {
      setLoadingCategories(false);
    });
  }, [rsshubBaseUrl, showToast]);

  // 搜索
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearchResults(null);
    // 搜索时清除分类浏览状态
    setSelectedCategory(null);
    setCategoryRoutes(null);
    setBreadcrumb([{ label: '发现', type: 'home' }]);
    setActiveRoute(null);

    try {
      const results = await window.electronAPI.discoverSearch({ query: q });
      setSearchResults(results);
    } catch {
      showToast('搜索失败');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, showToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // 选择分类
  const handleSelectCategory = useCallback(async (category: string) => {
    setSelectedCategory(category);
    setLoadingRoutes(true);
    setCategoryRoutes(null);
    setBreadcrumb([
      { label: '发现', type: 'home' },
      { label: category, type: 'category' },
    ]);
    setSearchResults(null);

    try {
      const routes = await window.electronAPI.discoverRsshubRoutes(category);
      setCategoryRoutes(routes);
    } catch {
      showToast('加载路由失败');
    } finally {
      setLoadingRoutes(false);
    }
  }, [showToast]);

  // 选择热门站点（直接展示该站点的路由）
  const handleSelectPopularSite = useCallback((nsKey: string, ns: RSSHubNamespace) => {
    const displayName = ns.name || nsKey;
    setSelectedCategory(nsKey);
    setCategoryRoutes({ [nsKey]: ns });
    setLoadingRoutes(false);
    setBreadcrumb([
      { label: '发现', type: 'home' },
      { label: displayName, type: 'category' },
    ]);
    setSearchResults(null);
  }, []);

  // 面包屑导航
  const handleBreadcrumbClick = useCallback((item: BreadcrumbItem) => {
    if (item.type === 'home') {
      setSelectedCategory(null);
      setCategoryRoutes(null);
      setSearchResults(null);
      setActiveRoute(null);
      setBreadcrumb([{ label: '发现', type: 'home' }]);
      setQuery('');
    } else if (item.type === 'category' && selectedCategory) {
      setActiveRoute(null);
      setBreadcrumb(prev => prev.slice(0, 2));
    }
  }, [selectedCategory]);

  // 选择路由
  const handleSelectRoute = useCallback((namespace: string, route: { path: string; name: string; example?: string; parameters?: Record<string, RSSHubParamValue> }) => {
    // 如果没有参数（除了 path 中的 :param 部分），检查 example 是否可以直接订阅
    const pathParams = route.path.match(/:(\w+)/g);
    if (!pathParams || pathParams.length === 0) {
      // 无参数路由，直接预览
      const examplePath = route.example || route.path;
      setPreviewUrl(examplePath);
      setPreviewTitle(`${namespace} - ${route.name}`);
      return;
    }

    setActiveRoute({ namespace, route });
    setBreadcrumb(prev => [
      ...prev.filter(b => b.type !== 'namespace'),
      { label: route.name, type: 'namespace' },
    ]);
  }, []);

  // 保存 RSSHub 配置
  const handleSaveConfig = useCallback(async () => {
    const url = rsshubConfigInput.trim();
    if (!url) return;
    setSavingConfig(true);
    try {
      const result = await window.electronAPI.discoverRsshubConfig(url);
      setRsshubBaseUrl(result.baseUrl);
      setShowConfig(false);
      showToast('RSSHub 配置已保存');
    } catch {
      showToast('保存配置失败');
    } finally {
      setSavingConfig(false);
    }
  }, [rsshubConfigInput, showToast]);

  // 从搜索结果订阅
  const handleSubscribeFromSearch = useCallback((result: DiscoverSearchResult) => {
    if (result.feedUrl) {
      setPreviewUrl(result.feedUrl);
      setPreviewTitle(result.title);
    } else if (result.rsshubPath) {
      // RSSHub 路由，需要参数
      setActiveRoute({
        namespace: result.title.split(' - ')[0],
        route: {
          path: result.rsshubPath,
          name: result.title,
          example: result.rsshubPath,
          parameters: result.rsshubParams,
        },
      });
    }
  }, []);

  // 路由参数表单提交
  const handleRouteSubmit = useCallback((feedPath: string) => {
    setPreviewUrl(feedPath);
    setPreviewTitle(activeRoute?.route.name);
  }, [activeRoute]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* 顶部搜索栏 */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          {/* 面包屑 */}
          <div className="flex items-center gap-1 text-sm">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-600">/</span>}
                <button
                  onClick={() => handleBreadcrumbClick(item)}
                  className={`transition-colors cursor-pointer ${
                    i === breadcrumb.length - 1
                      ? 'text-white font-medium'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {item.label}
                </button>
              </span>
            ))}
          </div>

          {/* RSSHub 配置按钮 */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Settings2 size={14} />
            <span>RSSHub</span>
          </button>
        </div>

        {/* RSSHub 配置面板 */}
        {showConfig && (
          <div className="mb-4 p-3 bg-[#111] border border-white/10 rounded-md">
            <div className="text-xs text-gray-400 mb-2">RSSHub 实例地址</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={rsshubConfigInput}
                onChange={(e) => setRsshubConfigInput(e.target.value)}
                placeholder="https://rsshub.example.com"
                className="flex-1 px-3 py-1.5 bg-[#0a0a0a] border border-white/10 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig || !rsshubConfigInput.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors cursor-pointer"
              >
                {savingConfig ? <Loader2 size={14} className="animate-spin" /> : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* 搜索框 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索播客、网站名称，或输入 URL 发现 RSS..."
              className="w-full pl-9 pr-3 py-2.5 bg-[#111] border border-white/10 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors cursor-pointer shrink-0"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : '搜索'}
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 搜索结果 */}
        {searchResults !== null && (
          <SearchResults
            results={searchResults}
            loading={searching}
            onSubscribe={handleSubscribeFromSearch}
            onClear={() => { setSearchResults(null); setQuery(''); }}
          />
        )}

        {/* 路由参数表单 */}
        {activeRoute && !previewUrl && searchResults === null && (
          <div>
            <button
              onClick={() => {
                setActiveRoute(null);
                setBreadcrumb(prev => prev.filter(b => b.type !== 'namespace'));
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-4 cursor-pointer"
            >
              <ChevronLeft size={16} />
              返回
            </button>
            <RouteParamForm
              namespace={activeRoute.namespace}
              route={activeRoute.route}
              onSubmit={handleRouteSubmit}
              onCancel={() => {
                setActiveRoute(null);
                setBreadcrumb(prev => prev.filter(b => b.type !== 'namespace'));
              }}
            />
          </div>
        )}

        {/* 分类浏览（默认视图） */}
        {searchResults === null && !activeRoute && !previewUrl && (
          <>
            {!rsshubBaseUrl ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Settings2 size={40} className="text-gray-600 mb-4" />
                <p className="text-gray-400 text-sm mb-2">尚未配置 RSSHub 实例</p>
                <p className="text-gray-600 text-xs mb-4">
                  配置 RSSHub 地址后即可浏览和搜索丰富的内容源
                </p>
                <button
                  onClick={() => setShowConfig(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors cursor-pointer"
                >
                  配置 RSSHub
                </button>
              </div>
            ) : loadingCategories ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-gray-500" />
                <span className="ml-2 text-sm text-gray-500">加载分类中...</span>
              </div>
            ) : selectedCategory && categoryRoutes ? (
              <RouteList
                routes={categoryRoutes}
                loading={loadingRoutes}
                onSelectRoute={handleSelectRoute}
              />
            ) : (
              <>
                <PopularSites onSelectSite={handleSelectPopularSite} />
                <CategoryGrid
                  categories={categories}
                  onSelect={handleSelectCategory}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* 预览弹窗 */}
      {previewUrl && (
        <FeedPreview
          feedUrl={previewUrl}
          suggestedTitle={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(undefined); }}
          onSubscribed={() => {
            setPreviewUrl(null);
            setPreviewTitle(undefined);
            onFeedAdded?.();
          }}
        />
      )}
    </div>
  );
}
