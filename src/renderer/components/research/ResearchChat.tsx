/**
 * 研究空间 AI 对话组件
 *
 * 完整的 Agent 流式对话实现，支持会话管理、流式消息接收、工具调用显示。
 * 参照 AgentDrawer 的模式，使用 agentSend / agentOnStream / agentSessionCreate 等 API。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { ChatMessage, AgentStreamChunk, ResearchSpaceSource, AgentViewState } from '../../../shared/types';
import { useAgentContext } from '../../hooks/useAgentContext';

interface ResearchChatProps {
  spaceId: string | null;
  sourceRefreshKey?: number;
  onArtifactCreated?: () => void;
  pendingPrompt?: string | null;
  onPendingPromptHandled?: () => void;
}

// ==================== 简单 Markdown 渲染 ====================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-[12px] text-blue-300">$1</code>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

// ==================== 工具名称映射 ====================

const TOOL_LABELS: Record<string, string> = {
  search_research_sources: '搜索源材料',
  get_source_summary: '获取摘要',
  generate_artifact: '生成产物',
};

// ==================== 组件 ====================

export function ResearchChat({ spaceId, sourceRefreshKey, onArtifactCreated, pendingPrompt, onPendingPromptHandled }: ResearchChatProps) {
  const { viewState: globalViewState, reportContext } = useAgentContext();

  // 对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 工具调用
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  // 源材料
  const [sources, setSources] = useState<ResearchSpaceSource[]>([]);

  // 输入
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 保持 streamingText 在 useEffect 闭包中可用
  const streamingTextRef = useRef('');
  streamingTextRef.current = streamingText;

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, activeToolCall]);

  // 空间切换时重置状态并加载源材料
  useEffect(() => {
    setMessages([]);
    setSessionId(null);
    setStreamingText('');
    setIsStreaming(false);
    setActiveToolCall(null);
    setSources([]);

    if (!spaceId) return;

    // 加载源材料列表
    window.electronAPI.researchSourceList(spaceId)
      .then(setSources)
      .catch(console.error);
  }, [spaceId]);

  // 当 sources 被外部更新时（导入/删除/切换），重新加载
  useEffect(() => {
    if (!spaceId || sourceRefreshKey === undefined) return;
    window.electronAPI.researchSourceList(spaceId)
      .then(setSources)
      .catch(console.error);
  }, [spaceId, sourceRefreshKey]);

  // 监听来自 StudioPanel 的预设 prompt，自动填入输入框
  useEffect(() => {
    if (!pendingPrompt || !spaceId) return;
    setInput(pendingPrompt);
    onPendingPromptHandled?.();
    // 聚焦到输入框
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [pendingPrompt, spaceId, onPendingPromptHandled]);

  // 上报研究页面上下文
  useEffect(() => {
    if (!spaceId) return;
    const enabledSources = sources.filter(s => s.enabled);
    reportContext({
      common: { currentPage: 'research', readerMode: false, selectedText: null },
      pageState: {
        page: 'research' as const,
        spaceId,
        sourceCount: sources.length,
        enabledSourceCount: enabledSources.length,
      },
    });
  }, [spaceId, sources, reportContext]);

  // 流式监听
  useEffect(() => {
    if (!spaceId) return;

    const unsub = window.electronAPI.agentOnStream((chunk: AgentStreamChunk) => {
      switch (chunk.type) {
        case 'text-delta':
          if (chunk.textDelta) {
            setStreamingText(prev => prev + chunk.textDelta);
          }
          break;

        case 'tool-call':
          if (chunk.toolCall) {
            setActiveToolCall(chunk.toolCall.name);
          }
          break;

        case 'tool-result':
          setActiveToolCall(null);
          // 如果是 generate_artifact 的结果，通知刷新产物列表
          if (chunk.toolResult?.name === 'generate_artifact') {
            onArtifactCreated?.();
          }
          break;

        case 'done': {
          const finalText = chunk.fullText || streamingTextRef.current;
          if (finalText) {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: finalText, timestamp: new Date().toISOString() },
            ]);
          }
          setStreamingText('');
          setIsStreaming(false);
          setActiveToolCall(null);
          break;
        }

        case 'error':
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `⚠️ 错误: ${chunk.error || '未知错误'}`, timestamp: new Date().toISOString() },
          ]);
          setStreamingText('');
          setIsStreaming(false);
          setActiveToolCall(null);
          break;
      }
    });

    return unsub;
  }, [spaceId, onArtifactCreated]);

  // 构建 viewState
  const buildViewState = useCallback((): AgentViewState => {
    const enabledSources = sources.filter(s => s.enabled);
    return {
      common: {
        ...globalViewState.common,
        currentPage: 'research',
        readerMode: false,
        selectedText: null,
        timestamp: Date.now(),
      },
      pageState: {
        page: 'research' as const,
        spaceId: spaceId!,
        sourceCount: sources.length,
        enabledSourceCount: enabledSources.length,
      },
    };
  }, [globalViewState, spaceId, sources]);

  // 发送消息（懒创建会话）
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !spaceId) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 添加用户消息
    setMessages(prev => [
      ...prev,
      { role: 'user', content: trimmed, timestamp: new Date().toISOString() },
    ]);
    setIsStreaming(true);
    setStreamingText('');

    // 懒创建会话
    let sid = sessionId;
    if (!sid) {
      try {
        const session = await window.electronAPI.agentSessionCreate();
        sid = session.id;
        setSessionId(sid);
      } catch (err) {
        console.error('Failed to create session:', err);
        setIsStreaming(false);
        return;
      }
    }

    window.electronAPI.agentSend({
      sessionId: sid,
      message: trimmed,
      viewState: buildViewState(),
    });
  }, [input, isStreaming, sessionId, spaceId, buildViewState]);

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // 自动调整 textarea 高度
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  if (!spaceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm">请先选择或创建一个研究空间</p>
          <p className="text-gray-600 text-xs mt-1">创建空间后，导入文章即可开始研究</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">输入问题开始研究...</p>
              <p className="text-gray-600 text-xs mt-1">
                AI 将基于导入的 {sources.length} 篇源材料回答你的问题
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-gray-200'
                }`}
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(msg.content) }}
              />
            </div>
          ))}

          {/* 工具调用指示器 */}
          {activeToolCall && (
            <div className="flex justify-start">
              <div className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {TOOL_LABELS[activeToolCall] || activeToolCall}...
              </div>
            </div>
          )}

          {/* 流式输出 */}
          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div
                className="max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed bg-white/5 text-gray-200"
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(streamingText) }}
              />
            </div>
          )}

          {/* 加载指示器（无内容时） */}
          {isStreaming && !streamingText && !activeToolCall && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg bg-white/5 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="border-t border-white/5 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入研究问题..."
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-200
                         placeholder-gray-500 resize-none outline-none focus:border-blue-500/50
                         transition-colors"
              style={{ maxHeight: 120 }}
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                         disabled:cursor-not-allowed text-white transition-colors shrink-0"
              title="发送"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
