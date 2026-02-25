import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { KGGraphData, KGEntityType, KGGraphNode } from '../../shared/types';

// ==================== 类型定义 ====================

interface ForceGraphNode {
  id: string;
  name: string;
  type: KGEntityType;
  mentionCount: number;
  sourceCount: number;
  description?: string;
  color: string;
  val: number; // 节点大小
}

interface ForceGraphLink {
  source: string;
  target: string;
  relationType: string;
  strength: number;
  evidenceCount: number;
  color: string;
  width: number;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

interface KnowledgeGraphViewProps {
  graphData: KGGraphData;
  onNodeClick?: (nodeId: string, node: KGGraphNode) => void;
  width?: number;
  height?: number;
  highlightEntityId?: string;
}

// ==================== 常量 ====================

/** 实体类型 → 颜色映射 */
const TYPE_COLORS: Record<KGEntityType, string> = {
  concept: '#3b82f6',      // blue
  person: '#22c55e',       // green
  technology: '#a855f7',   // purple
  topic: '#f59e0b',        // amber
  organization: '#ef4444', // red
};

/** 关系类型 → 标签 */
const RELATION_LABELS: Record<string, string> = {
  related_to: '相关',
  part_of: '属于',
  prerequisite: '前置',
  contrasts_with: '对比',
  applied_in: '应用于',
  created_by: '创建者',
};

/** 节点大小范围 */
const MIN_NODE_SIZE = 3;
const MAX_NODE_SIZE = 16;

// ==================== 动态导入 ====================

type ForceGraph2DModule = typeof import('react-force-graph-2d');
let forceGraphModulePromise: Promise<ForceGraph2DModule> | null = null;

function loadForceGraph(): Promise<ForceGraph2DModule> {
  if (forceGraphModulePromise) return forceGraphModulePromise;
  forceGraphModulePromise = import('react-force-graph-2d');
  return forceGraphModulePromise;
}

// ==================== 工具函数 ====================

/** 将 KGGraphData 转换为 react-force-graph-2d 的格式 */
function convertToForceGraphData(
  graphData: KGGraphData,
  highlightEntityId?: string
): ForceGraphData {
  // 计算节点大小的范围
  const mentionCounts = graphData.nodes.map((n) => n.mentionCount);
  const minMention = Math.min(...mentionCounts, 1);
  const maxMention = Math.max(...mentionCounts, 1);
  const mentionRange = maxMention - minMention || 1;

  const nodes: ForceGraphNode[] = graphData.nodes.map((node) => {
    const normalizedSize =
      ((node.mentionCount - minMention) / mentionRange) *
        (MAX_NODE_SIZE - MIN_NODE_SIZE) +
      MIN_NODE_SIZE;

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      mentionCount: node.mentionCount,
      sourceCount: node.sourceCount,
      description: node.description,
      color:
        highlightEntityId === node.id
          ? '#ffffff'
          : (TYPE_COLORS[node.type] ?? '#6b7280'),
      val: normalizedSize,
    };
  });

  // 确保 edge 的 source/target 都在节点集合中
  const nodeIds = new Set(nodes.map((n) => n.id));

  const links: ForceGraphLink[] = graphData.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      relationType: edge.relationType,
      strength: edge.strength,
      evidenceCount: edge.evidenceCount,
      color: 'rgba(255,255,255,0.15)',
      width: Math.min(edge.strength, 5),
    }));

  return { nodes, links };
}

// ==================== 组件 ====================

export function KnowledgeGraphView({
  graphData,
  onNodeClick,
  width,
  height,
  highlightEntityId,
}: KnowledgeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState<ForceGraphNode | null>(null);

  // 加载 ForceGraph2D 组件
  useEffect(() => {
    loadForceGraph()
      .then((mod) => {
        setForceGraph2D(() => mod.default);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load react-force-graph-2d:', err);
        setLoading(false);
      });
  }, []);

  // 监听容器尺寸 — 依赖 loading/ForceGraph2D 确保容器已在 DOM 中
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      }
    });

    observer.observe(container);
    // 初始尺寸
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => observer.disconnect();
  }, [loading, ForceGraph2D]);

  // 转换数据
  const forceGraphData = useMemo(
    () => convertToForceGraphData(graphData, highlightEntityId),
    [graphData, highlightEntityId]
  );

  // 数据变化后自动 zoomToFit
  useEffect(() => {
    if (!fgRef.current || forceGraphData.nodes.length === 0) return;
    // 等力导向稳定后执行 zoomToFit
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit?.(400, 40);
    }, 500);
    return () => clearTimeout(timer);
  }, [forceGraphData]);

  const effectiveWidth = width ?? dimensions.width;
  const effectiveHeight = height ?? dimensions.height;

  // 节点点击
  const handleNodeClick = useCallback(
    (node: ForceGraphNode) => {
      if (onNodeClick) {
        const originalNode = graphData.nodes.find((n) => n.id === node.id);
        if (originalNode) {
          onNodeClick(node.id, originalNode);
        }
      }
    },
    [onNodeClick, graphData.nodes]
  );

  // 自定义节点渲染
  const nodeCanvasObject = useCallback(
    (
      node: ForceGraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const x = (node as unknown as { x: number }).x;
      const y = (node as unknown as { y: number }).y;
      const size = node.val;
      const isHovered = hoveredNode?.id === node.id;
      const isHighlighted = highlightEntityId === node.id;

      // 绘制节点圆形
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = isHovered || isHighlighted ? 1 : 0.85;
      ctx.fill();

      // 高亮或 hover 时绘制边框
      if (isHovered || isHighlighted) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // 节点标签
      const fontSize = Math.max(10 / globalScale, 2);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(node.name, x, y + size + 2 / globalScale);
    },
    [hoveredNode, highlightEntityId]
  );

  // 容器始终渲染以确保 ref 可用，内部区分 loading/error/正常 状态
  return (
    <div ref={containerRef} className="flex-1 min-h-0 relative bg-[#0a0a0a]">
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          加载图谱组件...
        </div>
      ) : !ForceGraph2D ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-400">
          图谱组件加载失败
        </div>
      ) : (
        <>
          {effectiveWidth > 0 && effectiveHeight > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={forceGraphData}
              nodeId="id"
              width={effectiveWidth}
              height={effectiveHeight}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={(
                node: ForceGraphNode,
                color: string,
                ctx: CanvasRenderingContext2D
              ) => {
                const x = (node as unknown as { x: number }).x;
                const y = (node as unknown as { y: number }).y;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(x, y, node.val + 2, 0, 2 * Math.PI);
                ctx.fill();
              }}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: ForceGraphNode | null) => setHoveredNode(node)}
              linkColor={(link: ForceGraphLink) => link.color}
              linkWidth={(link: ForceGraphLink) => link.width}
              linkDirectionalParticles={0}
              backgroundColor="#0a0a0a"
              cooldownTicks={100}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
            />
          )}
        </>
      )}

      {/* Hover 信息面板 */}
      {hoveredNode && (
        <div className="absolute top-3 right-3 max-w-[240px] bg-[#1a1a1a] border border-white/10 rounded-lg p-3 text-xs pointer-events-none z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor:
                  TYPE_COLORS[hoveredNode.type] ?? '#6b7280',
              }}
            />
            <span className="text-white font-medium truncate">
              {hoveredNode.name}
            </span>
          </div>
          <div className="text-gray-500 space-y-0.5">
            <div>
              类型:{' '}
              <span className="text-gray-400">{hoveredNode.type}</span>
            </div>
            <div>
              提及:{' '}
              <span className="text-gray-400">
                {hoveredNode.mentionCount} 次
              </span>
            </div>
            <div>
              来源:{' '}
              <span className="text-gray-400">
                {hoveredNode.sourceCount} 篇
              </span>
            </div>
            {hoveredNode.description && (
              <div className="mt-1 text-gray-400 line-clamp-3">
                {hoveredNode.description}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-[10px] text-gray-500 pointer-events-none z-10">
        {(Object.entries(TYPE_COLORS) as [KGEntityType, string][]).map(
          ([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{type}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export { TYPE_COLORS, RELATION_LABELS };
