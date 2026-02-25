/**
 * Agent 助手三态编排主组件
 *
 * 管理三种状态：collapsed（气泡）、mini（迷你聊天）、expanded（全尺寸抽屉）。
 * 固定定位在右下角，最高 z-index。
 * 集成主动建议能力：监听 viewState 变化触发建议气泡。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentBubble } from './AgentBubble';
import { AgentMiniChat } from './AgentMiniChat';
import { AgentDrawer } from './AgentDrawer';
import { AgentSuggestionBubble } from './AgentSuggestionBubble';
import { useAgentContext } from '../../hooks/useAgentContext';
import { builtinSuggestionRules } from './suggestion-triggers';
import type { ChatMessage, AgentStreamChunk, AgentSuggestion, AgentViewState } from '../../../shared/types';

type AgentMode = 'collapsed' | 'mini' | 'expanded';

/** 冷却时间：用户手动关闭建议后 30 分钟内不再触发同类 */
const COOLDOWN_MS = 30 * 60 * 1000;

export function AgentAssistant() {
  const [mode, setMode] = useState<AgentMode>('collapsed');
  const { viewState } = useAgentContext();

  // Mini 模式聊天状态（Drawer 内部自行管理独立状态）
  const [miniMessages, setMiniMessages] = useState<ChatMessage[]>([]);
  const [miniStreamingText, setMiniStreamingText] = useState('');
  const [miniIsStreaming, setMiniIsStreaming] = useState(false);
  const [miniSessionId, setMiniSessionId] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);

  // 建议状态
  const [activeSuggestion, setActiveSuggestion] = useState<AgentSuggestion | null>(null);
  const prevViewStateRef = useRef<AgentViewState | null>(null);
  const firedTriggersRef = useRef<Set<string>>(new Set());
  const cooldownMapRef = useRef<Map<string, number>>(new Map());

  // 监听 viewState 变化，执行建议触发器
  useEffect(() => {
    // 只在 collapsed 模式下展示建议
    if (mode !== 'collapsed') {
      prevViewStateRef.current = viewState;
      return;
    }

    const prev = prevViewStateRef.current;
    prevViewStateRef.current = viewState;

    for (const rule of builtinSuggestionRules) {
      // 同会话去重
      if (firedTriggersRef.current.has(rule.id)) continue;

      // 冷却期检查
      const cooldownUntil = cooldownMapRef.current.get(rule.id);
      if (cooldownUntil && Date.now() < cooldownUntil) continue;

      const trigger = rule.check(prev, viewState);
      if (trigger) {
        firedTriggersRef.current.add(rule.id);
        const suggestion = rule.generate(trigger, viewState);
        setActiveSuggestion(suggestion);
        break; // 每次只展示一条建议
      }
    }
  }, [viewState, mode]);

  // 建议气泡：用户关闭（记录冷却）
  const handleSuggestionDismiss = useCallback(() => {
    // 获取当前 suggestion 对应的 rule id 用于冷却
    if (activeSuggestion) {
      // 查找匹配的 rule id
      for (const rule of builtinSuggestionRules) {
        if (firedTriggersRef.current.has(rule.id)) {
          cooldownMapRef.current.set(rule.id, Date.now() + COOLDOWN_MS);
        }
      }
    }
    setActiveSuggestion(null);
  }, [activeSuggestion]);

  // 建议气泡：用户点击快捷操作 → 打开 mini 模式并发送 prompt
  const handleSuggestionAction = useCallback((prompt: string) => {
    setActiveSuggestion(null);
    setMode('mini');
    // 延迟发送，等 mini 模式的流式监听挂载
    setTimeout(() => {
      handleMiniSendDirect(prompt);
    }, 100);
  }, []);

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

  // Mini 模式发送消息（内部直接调用版本，用于建议触发）
  const handleMiniSendDirect = useCallback(async (message: string) => {
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

  // Mini 模式发送消息
  const handleMiniSend = useCallback(async (message: string) => {
    await handleMiniSendDirect(message);
  }, [handleMiniSendDirect]);

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
          <div className="relative">
            {activeSuggestion && (
              <AgentSuggestionBubble
                suggestion={activeSuggestion}
                onAction={handleSuggestionAction}
                onDismiss={handleSuggestionDismiss}
              />
            )}
            <AgentBubble onClick={() => setMode('mini')} />
          </div>
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
