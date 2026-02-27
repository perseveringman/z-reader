import React from 'react';
import { ComparisonTable } from './ComparisonTable';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { MindMapRenderer } from './MindMapRenderer';
import type { ResearchArtifact } from '../../../shared/types';

interface ArtifactViewerProps {
  artifact: ResearchArtifact;
  onClose: () => void;
}

export function ArtifactViewer({ artifact, onClose }: ArtifactViewerProps) {
  const renderContent = () => {
    if (!artifact.content) return <p className="text-gray-500">无内容</p>;

    if (artifact.type === 'comparison') {
      try {
        const data = JSON.parse(artifact.content);
        return <ComparisonTable data={data} />;
      } catch {
        return <pre className="text-sm text-gray-300 whitespace-pre-wrap">{artifact.content}</pre>;
      }
    }

    if (artifact.type === 'mindmap') {
      return <MindMapRenderer markdown={artifact.content || ''} className="h-[500px]" />;
    }

    // report, summary, faq 等使用 MarkdownRenderer 渲染
    return <MarkdownRenderer content={artifact.content} />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] rounded-xl border border-white/10 w-[720px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-gray-200">{artifact.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {artifact.type} · {new Date(artifact.createdAt).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </div>

        {/* 底部操作 */}
        <div className="p-3 border-t border-white/5 flex justify-end gap-2">
          <button
            onClick={async () => {
              try {
                const content = await window.electronAPI.researchArtifactExport(artifact.id, 'markdown');
                await navigator.clipboard.writeText(content);
              } catch (err) {
                console.error('Export failed:', err);
              }
            }}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-300 bg-white/5 rounded hover:bg-white/10"
          >
            复制内容
          </button>
        </div>
      </div>
    </div>
  );
}
