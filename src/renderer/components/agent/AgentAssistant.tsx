/**
 * Agent 助手三态编排主组件
 *
 * 管理三种状态：collapsed（气泡）、mini（迷你聊天）、expanded（全尺寸抽屉）。
 * 固定定位在右下角，最高 z-index。
 */

import { useState, useEffect, useCallback } from 'react';
import { AgentBubble } from './AgentBubble';
import { AgentMiniChat } from './AgentMiniChat';
import { AgentDrawer } from './AgentDrawer';
import { useAgentContext } from '../../hooks/useAgentContext';
import type { ChatMessage, AgentStreamChunk } from '../../../shared/types';

type AgentMode = 'collapsed' | 'mini' | 'expanded';

export function AgentAssistant() {
  const [mode, setMode] = useState<AgentMode>('collapsed');
  const { viewState } = useAgentContext();

  // Mini 模式聊天状态（Drawer 内部自行管理独立状态）
  const [miniMessages, setMiniMessages] = useState<ChatMessage[]>([]);
  const [miniStreamingText, setMiniStreamingText] = useState('');
  const [miniIsStreaming, setMiniIsStreaming] = useState(false);
  const [miniSessionId, setMiniSessionId] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);

  // Mini 模式流式监听
  useEffect(() => {
    if (mode !== 'mini') return;

    const unsubscribe = window.electronAPI.agentOnStream((chunk: AgentStreamChunk) => {
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        setMiniStreamingText((prev) => prev + chunk.textDelta);
      } else if (chunk.type === 'context-hint' && chunk.contextHint) {
        setActiveModules(chunk.contextHint.activeModules);
      } else if (chunk.type === 'done') {
        setMiniIsStreaming(false);
        if (chunk.fullText) {
          setMiniMessages((prev) => [
            ...prev,
            { role: 'assistant' as const, content: chunk.fullText!, timestamp: new Date().toISOString() },
          ]);
          setMiniStreamingText('');
        }
      } else if (chunk.type === 'error') {
        setMiniIsStreaming(false);
        setMiniStreamingText('');
      }
    });

    return unsubscribe;
  }, [mode]);

  // Mini 模式发送消息
  const handleMiniSend = useCallback(async (message: string) => {
    let sid = miniSessionId;
    if (!sid) {
      try {
        const session = await window.electronAPI.agentSessionCreate();
        sid = session.id;
        setMiniSessionId(sid);
      } catch {
        return;
      }
    }

    setMiniIsStreaming(true);
    setMiniStreamingText('');
    setMiniMessages((prev) => [
      ...prev,
      { role: 'user' as const, content: message, timestamp: new Date().toISOString() },
    ]);

    window.electronAPI.agentSend({
      sessionId: sid,
      message,
      viewState,
    });
  }, [miniSessionId, viewState]);

  // 快捷键: Cmd+J / Ctrl+J 切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setMode((prev) => (prev === 'collapsed' ? 'mini' : 'collapsed'));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {mode === 'collapsed' && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <AgentBubble onClick={() => setMode('mini')} />
        </div>
      )}
      {mode === 'mini' && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <AgentMiniChat
            onClose={() => setMode('collapsed')}
            onExpand={() => setMode('expanded')}
            messages={miniMessages as Array<{ role: 'user' | 'assistant'; content: string }>}
            streamingText={miniStreamingText}
            isStreaming={miniIsStreaming}
            onSend={handleMiniSend}
            currentPage={viewState.common.currentPage}
            activeModules={activeModules}
          />
        </div>
      )}
      <AgentDrawer
        open={mode === 'expanded'}
        onClose={() => setMode('collapsed')}
        onCollapse={() => setMode('mini')}
      />
    </>
  );
}
