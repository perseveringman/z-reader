import { useState, useEffect, useCallback } from 'react';
import { SourcesPanel } from './SourcesPanel';
import { ResearchChat } from './ResearchChat';
import { StudioPanel } from './StudioPanel';
import type { ResearchSpace } from '../../../shared/types';

export function ResearchLayout() {
  const [spaces, setSpaces] = useState<ResearchSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [studioCollapsed, setStudioCollapsed] = useState(false);

  const loadSpaces = useCallback(async () => {
    try {
      const list = await window.electronAPI.researchSpaceList();
      setSpaces(list);
      // 如果当前没有选中空间且有可用空间，自动选第一个
      if (!activeSpaceId && list.length > 0) {
        setActiveSpaceId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load research spaces:', err);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === '[') {
        e.preventDefault();
        setSourcesCollapsed(prev => !prev);
      }
      if (e.key === ']') {
        e.preventDefault();
        setStudioCollapsed(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleArtifactCreated = useCallback(() => {
    setArtifactRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {!sourcesCollapsed && (
        <SourcesPanel
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onSpaceChange={setActiveSpaceId}
          onSpacesChanged={loadSpaces}
          onSourcesChanged={() => setSourceRefreshKey(k => k + 1)}
        />
      )}
      <ResearchChat
        spaceId={activeSpaceId}
        sourceRefreshKey={sourceRefreshKey}
        onArtifactCreated={handleArtifactCreated}
        pendingPrompt={pendingPrompt}
        onPendingPromptHandled={() => setPendingPrompt(null)}
      />
      {!studioCollapsed && (
        <StudioPanel
          spaceId={activeSpaceId}
          refreshKey={artifactRefreshKey}
          onSendPrompt={setPendingPrompt}
        />
      )}
    </div>
  );
}
