import { useState, useEffect, useCallback } from 'react';
import { ArtifactViewer } from './ArtifactViewer';
import type { ResearchArtifact } from '../../../shared/types';

interface StudioPanelProps {
  spaceId: string | null;
  refreshKey?: number;
  onSendPrompt?: (prompt: string) => void;
}

export function StudioPanel({ spaceId, refreshKey, onSendPrompt }: StudioPanelProps) {
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [viewingArtifact, setViewingArtifact] = useState<ResearchArtifact | null>(null);

  const loadArtifacts = useCallback(async () => {
    if (!spaceId) { setArtifacts([]); return; }
    try {
      const list = await window.electronAPI.researchArtifactList(spaceId);
      setArtifacts(list);
    } catch (err) {
      console.error('Failed to load artifacts:', err);
    }
  }, [spaceId]);

  useEffect(() => { loadArtifacts(); }, [loadArtifacts, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.researchArtifactDelete(id);
      loadArtifacts();
    } catch (err) {
      console.error('Failed to delete artifact:', err);
    }
  };

  const artifactTypeLabels: Record<string, string> = {
    report: '研究报告',
    comparison: '对比矩阵',
    summary: '摘要',
    faq: 'FAQ',
    mindmap: '思维导图',
    knowledge_graph: '知识图谱',
    timeline: '时间线',
  };

  if (!spaceId) return null;

  return (
    <div className="w-80 shrink-0 bg-[#111111] border-l border-white/5 flex flex-col">
      {/* 快捷工具栏 */}
      <div className="p-3 border-b border-white/5">
        <h3 className="text-sm font-medium text-gray-300 mb-2">快捷工具</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onSendPrompt?.('请根据所有源材料，生成一份详细的研究报告。报告应包含主要发现、关键论点和结论。')}
            className="flex-1 text-xs py-1.5 rounded bg-white/5 text-gray-400 hover:text-gray-300 hover:bg-white/10 border border-white/5"
          >
            生成报告
          </button>
          <button
            onClick={() => onSendPrompt?.('请对源材料中的主要观点/方案/产品进行对比分析，生成一个对比矩阵。')}
            className="flex-1 text-xs py-1.5 rounded bg-white/5 text-gray-400 hover:text-gray-300 hover:bg-white/10 border border-white/5"
          >
            对比矩阵
          </button>
          <button
            onClick={() => onSendPrompt?.('请根据所有源材料生成一个思维导图，用 generate_artifact 工具，type 为 mindmap')}
            className="flex-1 text-xs py-1.5 rounded bg-white/5 text-gray-400 hover:text-gray-300 hover:bg-white/10 border border-white/5"
          >
            思维导图
          </button>
          <button
            onClick={() => onSendPrompt?.('请生成当前源材料的知识图谱，使用 generate_knowledge_graph 工具。')}
            className="flex-1 text-xs py-1.5 rounded bg-white/5 text-gray-400 hover:text-gray-300 hover:bg-white/10 border border-white/5"
          >
            知识图谱
          </button>
        </div>
      </div>

      {/* 产物列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">研究产物</h3>
        {artifacts.length === 0 ? (
          <p className="text-xs text-gray-500 text-center mt-8">暂无产物</p>
        ) : (
          <div className="space-y-1">
            {artifacts.map(artifact => (
              <div
                key={artifact.id}
                onClick={() => setViewingArtifact(artifact)}
                className="px-2 py-2 rounded hover:bg-white/5 cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-400/70">
                    {artifactTypeLabels[artifact.type] || artifact.type}
                  </span>
                  <div className="flex items-center gap-1">
                    {artifact.pinned ? <span className="text-xs text-yellow-500">📌</span> : null}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(artifact.id); }}
                      className="text-xs text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-300 truncate mt-0.5">{artifact.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(artifact.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 产物查看器 */}
      {viewingArtifact && (
        <ArtifactViewer
          artifact={viewingArtifact}
          onClose={() => setViewingArtifact(null)}
        />
      )}
    </div>
  );
}
