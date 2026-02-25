import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Network, Search, X } from 'lucide-react';
import { KnowledgeGraphView, TYPE_COLORS } from './KnowledgeGraphView';
import type {
  KGGraphData,
  KGGraphNode,
  KGStats,
  KGEntityType,
} from '../../shared/types';

export function KGOverviewPage() {
  const { t } = useTranslation();
  const [graphData, setGraphData] = useState<KGGraphData | null>(null);
  const [stats, setStats] = useState<KGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'subgraph'>('overview');

  // 加载全局概览
  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, kgStats] = await Promise.all([
        window.electronAPI.kgGetOverview(100),
        window.electronAPI.kgGetStats(),
      ]);
      setGraphData(overview);
      setStats(kgStats);
      setViewMode('overview');
      setSelectedNodeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // 节点点击 → 加载子图
  const handleNodeClick = useCallback(
    async (nodeId: string, _node: KGGraphNode) => {
      setSelectedNodeId(nodeId);
      try {
        const subgraph = await window.electronAPI.kgGetSubgraph(nodeId, 2);
        setGraphData(subgraph);
        setViewMode('subgraph');
      } catch (err) {
        console.error('Failed to load subgraph:', err);
      }
    },
    []
  );

  // 搜索
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      void loadOverview();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const entities = await window.electronAPI.kgSearchEntities(
        searchQuery
      );
      // 把搜索结果展示为简化图谱（节点 + 空关系）
      if (entities.length > 0) {
        // 取第一个结果展开子图
        const subgraph = await window.electronAPI.kgGetSubgraph(
          entities[0].id,
          2
        );
        setGraphData(subgraph);
        setSelectedNodeId(entities[0].id);
        setViewMode('subgraph');
      } else {
        setGraphData({ nodes: [], edges: [] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, loadOverview]);

  // 回车搜索
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSearch();
      }
    },
    [handleSearch]
  );

  if (loading && !graphData) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t('kg.overview')}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0f0f0f]">
      {/* 顶部工具栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-200">
            {t('sidebar.knowledgeGraph')}
          </h2>

          {/* 统计 */}
          {stats && (
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span>
                {stats.entityCount} {t('kg.entityCount')}
              </span>
              <span className="text-gray-700">·</span>
              <span>
                {stats.relationCount} {t('kg.relationCount')}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('kg.searchPlaceholder')}
              className="h-7 w-[180px] pl-7 pr-7 text-[12px] rounded-md bg-white/5 border border-white/10 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  void loadOverview();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 视图模式指示 / 返回概览 */}
          {viewMode === 'subgraph' && (
            <button
              onClick={() => void loadOverview()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer"
            >
              返回概览
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* 图谱内容 */}
      {graphData && graphData.nodes.length > 0 ? (
        <KnowledgeGraphView
          graphData={graphData}
          onNodeClick={handleNodeClick}
          highlightEntityId={selectedNodeId ?? undefined}
        />
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center px-8">
          <div className="text-center text-gray-500">
            <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-gray-400">{t('kg.noData')}</p>
            <p className="mt-1 text-xs text-gray-600">
              {t('kg.generateHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
