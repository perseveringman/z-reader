import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Network, RefreshCw, Sparkles } from 'lucide-react';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import type { KGGraphData, KGGraphNode } from '../../shared/types';

interface ArticleKGPanelProps {
  articleId: string;
  extractSignal?: number;
}

export function ArticleKGPanel({
  articleId,
  extractSignal,
}: ArticleKGPanelProps) {
  const [graphData, setGraphData] = useState<KGGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const triggerRef = useRef<number | undefined>(extractSignal);

  // 加载文章图谱
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.kgGetArticleGraph(
        'article',
        articleId
      );
      setGraphData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  // 手动触发抽取
  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setError(null);
    try {
      const result = await window.electronAPI.kgExtract({
        sourceType: 'article',
        sourceId: articleId,
      });
      if (!result.success) {
        setError(result.error ?? '抽取失败');
      } else {
        // 抽取完成后重新加载图谱
        await loadGraph();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }, [articleId, loadGraph]);

  // 节点点击
  const handleNodeClick = useCallback(
    (nodeId: string, _node: KGGraphNode) => {
      setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    },
    [selectedNodeId]
  );

  // 初始加载
  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  // 外部触发信号
  useEffect(() => {
    if (extractSignal == null || triggerRef.current === extractSignal) return;
    triggerRef.current = extractSignal;
    void handleExtract();
  }, [extractSignal, handleExtract]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        加载知识图谱...
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          {graphData && graphData.nodes.length > 0 && (
            <>
              <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
                {graphData.nodes.length} 个实体
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
                {graphData.edges.length} 个关系
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
        >
          {extracting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : graphData && graphData.nodes.length > 0 ? (
            <RefreshCw className="w-3.5 h-3.5" />
          ) : (
            <Network className="w-3.5 h-3.5" />
          )}
          {extracting
            ? '正在提取...'
            : graphData && graphData.nodes.length > 0
              ? '重新提取'
              : '提取实体'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
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
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-gray-400">
              点击右上角按钮提取知识图谱
            </p>
            <p className="mt-1 text-xs text-gray-600">
              需要先配置 AI 并索引文章到 RAG 知识库
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
