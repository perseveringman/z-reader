import { useState, useEffect, useCallback, useRef } from 'react';
import type { ResearchSpace, ResearchSpaceSource } from '../../../shared/types';
import type { ContentType } from '../reader/ReaderRegistry';
import { ImportDialog } from './ImportDialog';

interface SourcesPanelProps {
  spaces: ResearchSpace[];
  activeSpaceId: string | null;
  onSpaceChange: (id: string | null) => void;
  onSpacesChanged: () => void;
  onSourcesChanged?: () => void;
  onOpenReader?: (id: string, type: ContentType) => void;
  readingArticleId?: string | null;
}

/** 索引状态指示器 */
function IndexStatusIndicator({ status, onReindex }: { status: string; onReindex: () => void }) {
  switch (status) {
    case 'ready':
      return <span className="shrink-0 text-green-400 text-xs" title="索引完成">{'\u2713'}</span>;
    case 'processing':
      return <span className="shrink-0 text-blue-400 text-xs source-index-processing" title="正在索引...">{'\u25CF'}</span>;
    case 'error':
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onReindex(); }}
          className="shrink-0 text-red-400 hover:text-red-300 text-xs"
          title="索引失败，点击重试"
        >
          {'\u2715'}
        </button>
      );
    default: // pending
      return <span className="shrink-0 text-gray-600 text-xs" title="等待索引">{'\u25CF'}</span>;
  }
}

export function SourcesPanel({ spaces, activeSpaceId, onSpaceChange, onSpacesChanged, onSourcesChanged, onOpenReader, readingArticleId }: SourcesPanelProps) {
  const [sources, setSources] = useState<ResearchSpaceSource[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newSpaceTitle, setNewSpaceTitle] = useState('');
  const [showImport, setShowImport] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载当前空间的资源列表
  const loadSources = useCallback(async () => {
    if (!activeSpaceId) { setSources([]); return; }
    try {
      const list = await window.electronAPI.researchSourceList(activeSpaceId);
      setSources(list);
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  }, [activeSpaceId]);

  useEffect(() => { loadSources(); }, [loadSources]);

  // 当有 processing 状态的 source 时，每 3 秒自动刷新
  const hasProcessing = sources.some(s => s.processingStatus === 'processing');

  useEffect(() => {
    if (hasProcessing) {
      intervalRef.current = setInterval(() => {
        loadSources();
      }, 3000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasProcessing, loadSources]);

  // 创建新空间
  const handleCreateSpace = async () => {
    if (!newSpaceTitle.trim()) return;
    try {
      const space = await window.electronAPI.researchSpaceCreate({ title: newSpaceTitle.trim() });
      setNewSpaceTitle('');
      setIsCreating(false);
      onSpacesChanged();
      onSpaceChange(space.id);
    } catch (err) {
      console.error('Failed to create space:', err);
    }
  };

  // 删除资源
  const handleRemoveSource = async (sourceId: string) => {
    try {
      await window.electronAPI.researchSourceRemove(sourceId);
      loadSources();
      onSourcesChanged?.();
    } catch (err) {
      console.error('Failed to remove source:', err);
    }
  };

  // 切换资源启用状态
  const handleToggleSource = async (sourceId: string) => {
    try {
      await window.electronAPI.researchSourceToggle(sourceId);
      loadSources();
      onSourcesChanged?.();
    } catch (err) {
      console.error('Failed to toggle source:', err);
    }
  };

  // 重新索引
  const handleReindex = async (sourceId: string) => {
    try {
      await window.electronAPI.researchSourceReindex(sourceId);
      loadSources();
    } catch (err) {
      console.error('Failed to reindex source:', err);
    }
  };

  return (
    <div className="w-60 shrink-0 bg-[#111111] border-r border-white/5 flex flex-col">
      {/* processing 动画样式 */}
      <style>{`
        @keyframes source-index-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .source-index-processing {
          animation: source-index-pulse 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* 空间选择器 */}
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-300">研究空间</h3>
          <button
            onClick={() => setIsCreating(true)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            + 新建
          </button>
        </div>
        {isCreating && (
          <div className="flex gap-1 mb-2">
            <input
              value={newSpaceTitle}
              onChange={e => setNewSpaceTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateSpace()}
              placeholder="空间名称..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
            <button onClick={handleCreateSpace} className="text-xs text-blue-400 hover:text-blue-300 px-1">{'\u2713'}</button>
            <button onClick={() => { setIsCreating(false); setNewSpaceTitle(''); }} className="text-xs text-gray-500 hover:text-gray-400 px-1">{'\u2715'}</button>
          </div>
        )}
        <select
          value={activeSpaceId ?? ''}
          onChange={e => onSpaceChange(e.target.value || null)}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
        >
          <option value="">选择空间...</option>
          {spaces.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>

      {/* 资源列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        {!activeSpaceId ? (
          <p className="text-xs text-gray-500 text-center mt-8">请选择或创建一个研究空间</p>
        ) : sources.length === 0 ? (
          <p className="text-xs text-gray-500 text-center mt-8">暂无源材料</p>
        ) : (
          <div className="space-y-1">
            {sources.map(source => (
              <div
                key={source.id}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-sm ${
                  readingArticleId === source.sourceId ? 'border-l-2 border-blue-500 bg-white/5' : ''
                }`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleSource(source.id); }}
                  className={`w-3 h-3 rounded-sm border shrink-0 ${
                    source.enabled ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
                  }`}
                />
                <button
                  onClick={() => onOpenReader?.(source.sourceId, 'article')}
                  className={`flex-1 truncate text-left hover:underline cursor-pointer ${
                    source.enabled ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {source.sourceTitle || source.sourceId}
                </button>
                <IndexStatusIndicator
                  status={source.processingStatus}
                  onReindex={() => handleReindex(source.id)}
                />
                <button
                  onClick={() => handleRemoveSource(source.id)}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
                >
                  {'\u2715'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {activeSpaceId && (
        <div className="p-3 border-t border-white/5">
          <button
            className="w-full text-xs text-center py-1.5 rounded border border-dashed border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
            onClick={() => setShowImport(true)}
          >
            + 添加文章
          </button>
          <p className="text-xs text-gray-600 text-center mt-1.5">
            {sources.length} 篇材料 · {sources.filter(s => s.enabled).length} 篇启用
          </p>
        </div>
      )}
      {showImport && activeSpaceId && (
        <ImportDialog
          spaceId={activeSpaceId}
          existingSourceIds={sources.map(s => s.sourceId)}
          onClose={() => setShowImport(false)}
          onImported={() => { loadSources(); onSourcesChanged?.(); }}
        />
      )}
    </div>
  );
}
