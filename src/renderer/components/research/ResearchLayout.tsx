import { useState, useEffect, useCallback } from 'react';
import { SourcesPanel } from './SourcesPanel';
import { ResearchChat } from './ResearchChat';
import { StudioPanel } from './StudioPanel';
import type { ResearchSpace } from '../../../shared/types';

export function ResearchLayout() {
  const [spaces, setSpaces] = useState<ResearchSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

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

  const handleArtifactCreated = useCallback(() => {
    setArtifactRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SourcesPanel
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSpaceChange={setActiveSpaceId}
        onSpacesChanged={loadSpaces}
      />
      <ResearchChat
        spaceId={activeSpaceId}
        onArtifactCreated={handleArtifactCreated}
        pendingPrompt={pendingPrompt}
        onPendingPromptHandled={() => setPendingPrompt(null)}
      />
      <StudioPanel
        spaceId={activeSpaceId}
        refreshKey={artifactRefreshKey}
        onSendPrompt={setPendingPrompt}
      />
    </div>
  );
}
