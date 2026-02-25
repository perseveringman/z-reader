/**
 * Agent 助手全尺寸抽屉面板
 *
 * 右侧滑入式抽屉，420px 宽，支持完整对话、会话管理、操作确认、导航卡片等。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Plus, MessageSquare, Minimize2, Send, Loader2, Trash2,
} from 'lucide-react';
import type { ChatMessage, ChatSession, AgentStreamChunk } from '../../../shared/types';
import { useAgentContext } from '../../hooks/useAgentContext';
import { ConfirmCard } from './ConfirmCard';
import { NavigationCard } from './NavigationCard';

interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
  onCollapse: () => void;
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

// ==================== 页面标签映射 ====================

const PAGE_LABELS: Record<string, string> = {
  'library-articles': '📄 文章列表',
  reader: '📖 阅读器',
  'knowledge-graph': '📊 知识图谱',
  'writing-assist': '✍️ 写作助手',
  feeds: '📡 订阅源',
  books: '📚 书架',
};

// ==================== 内嵌卡片数据 ====================

interface PendingConfirm {
  toolName: string;
  preview: string;
  confirmId: string;
}

interface InlineNavigationCard {
  title: string;
  subtitle?: string;
  targetType: string;
  targetId: string;
  thumbnail?: string;
}

// ==================== 组件 ====================

export function AgentDrawer({ open, onClose, onCollapse }: AgentDrawerProps) {
  const { viewState, navigate } = useAgentContext();

  // 对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 会话列表
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessionList, setShowSessionList] = useState(false);

  // 工具调用 & 卡片
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [pendingConfirms, setPendingConfirms] = useState<Map<string, PendingConfirm>>(new Map());
  const [navigationCards, setNavigationCards] = useState<InlineNavigationCard[]>([]);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  // 输入
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, pendingConfirms, navigationCards]);

  // 打开时加载会话列表
  useEffect(() => {
    if (open) {
      window.electronAPI.agentSessionList().then(setSessions).catch(console.error);
    }
  }, [open]);

  // 流式监听
  useEffect(() => {
    if (!open) return;
    const unsub = window.electronAPI.agentOnStream((chunk: AgentStreamChunk) => {
      switch (chunk.type) {
        case 'text-delta':
          if (chunk.textDelta) {
            setStreamingText((prev) => prev + chunk.textDelta);
          }
          break;

        case 'tool-call':
          if (chunk.toolCall) {
            setActiveToolCall(chunk.toolCall.name);
          }
          break;

        case 'tool-result':
          setActiveToolCall(null);
          break;

        case 'action-confirm':
          if (chunk.actionConfirm) {
            const { toolName, preview, confirmId } = chunk.actionConfirm;
            setPendingConfirms((prev) => new Map(prev).set(confirmId, { toolName, preview, confirmId }));
          }
          break;

        case 'navigation-card':
          if (chunk.navigationCard) {
            setNavigationCards((prev) => [...prev, chunk.navigationCard!]);
          }
          break;

        case 'context-hint':
          if (chunk.contextHint?.activeModules) {
            setActiveModules(chunk.contextHint.activeModules);
          }
          break;

        case 'title-generated':
          if (chunk.title && sessionId) {
            setSessions((prev) =>
              prev.map((s) => (s.id === sessionId ? { ...s, title: chunk.title ?? s.title } : s)),
            );
          }
          break;

        case 'done': {
          const finalText = chunk.fullText || streamingText;
          if (finalText) {
            setMessages((prev) => [
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
          setMessages((prev) => [
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
  }, [open, sessionId, streamingText]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (showSessionList) {
          setShowSessionList(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, showSessionList]);

  // 发送消息（懒创建会话）
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed, timestamp: new Date().toISOString() },
    ]);
    setIsStreaming(true);
    setStreamingText('');
    setNavigationCards([]);

    // 懒创建会话
    let sid = sessionId;
    if (!sid) {
      try {
        const session = await window.electronAPI.agentSessionCreate();
        sid = session.id;
        setSessionId(sid);
        setSessions((prev) => [session, ...prev]);
      } catch (err) {
        console.error('Failed to create session:', err);
        setIsStreaming(false);
        return;
      }
    }

    window.electronAPI.agentSend({
      sessionId: sid,
      message: trimmed,
      viewState,
    });
  }, [input, isStreaming, sessionId, viewState]);

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
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, []);

  // 新建会话
  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
    setActiveToolCall(null);
    setPendingConfirms(new Map());
    setNavigationCards([]);
    setShowSessionList(false);
  }, []);

  // 切换会话
  const handleSwitchSession = useCallback(async (id: string) => {
    try {
      const session = await window.electronAPI.agentSessionGet(id);
      if (session) {
        setSessionId(session.id);
        setMessages(session.messages);
        setStreamingText('');
        setIsStreaming(false);
        setActiveToolCall(null);
        setPendingConfirms(new Map());
        setNavigationCards([]);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
    setShowSessionList(false);
  }, []);

  // 删除会话
  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await window.electronAPI.agentSessionDelete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) handleNewSession();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [sessionId, handleNewSession]);

  // 确认操作
  const handleConfirm = useCallback((confirmId: string, trust: boolean) => {
    window.electronAPI.agentConfirm({ confirmId, confirmed: true, trust });
    setPendingConfirms((prev) => {
      const next = new Map(prev);
      next.delete(confirmId);
      return next;
    });
  }, []);

  const handleCancelConfirm = useCallback((confirmId: string) => {
    window.electronAPI.agentConfirm({ confirmId, confirmed: false, trust: false });
    setPendingConfirms((prev) => {
      const next = new Map(prev);
      next.delete(confirmId);
      return next;
    });
  }, []);

  // 导航卡片点击 → 通过 context 导航 + 关闭抽屉
  const handleNavigate = useCallback((targetType: string, targetId: string) => {
    navigate(targetType, targetId);
    onClose();
  }, [navigate, onClose]);
  const currentPage = viewState.common.currentPage;
  const pageLabel = PAGE_LABELS[currentPage] || `📄 ${currentPage}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-[420px] bg-[#1a1a1a] border-l border-white/10 
                     flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
                       open ? 'translate-x-0' : 'translate-x-full'
                     }`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-sm font-semibold text-white">AI 助手</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewSession}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
              title="新对话"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setShowSessionList((v) => !v)}
              className={`p-1 rounded hover:bg-white/10 transition-colors cursor-pointer ${
                showSessionList ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="会话历史"
            >
              <MessageSquare size={16} />
            </button>
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
              title="收起"
            >
              <Minimize2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 上下文标签栏 */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-white/5 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
            {pageLabel}
          </span>
          {activeModules.map((mod) => (
            <span key={mod} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              {mod}
            </span>
          ))}
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 min-h-0 relative">
          {/* 会话列表覆盖层 */}
          {showSessionList && (
            <div className="absolute inset-0 z-10 bg-[#1a1a1a] overflow-y-auto">
              <div className="px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-medium text-gray-300">会话历史</h3>
              </div>
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <MessageSquare size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">暂无会话</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer ${
                        s.id === sessionId ? 'bg-white/5' : ''
                      }`}
                      onClick={() => handleSwitchSession(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 truncate">
                          {s.title || '新对话'}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {new Date(s.updatedAt).toLocaleDateString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.id);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 消息列表 */}
          <div className="h-full overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MessageSquare size={32} className="mb-3 opacity-40" />
                <p className="text-sm">开始一段新对话</p>
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

            {/* 导航卡片 */}
            {navigationCards.map((card, i) => (
              <div key={`nav-${i}`} className="flex justify-start">
                <div className="max-w-[85%]">
                  <NavigationCard
                    title={card.title}
                    subtitle={card.subtitle}
                    targetType={card.targetType}
                    targetId={card.targetId}
                    thumbnail={card.thumbnail}
                    onNavigate={handleNavigate}
                  />
                </div>
              </div>
            ))}

            {/* 确认卡片 */}
            {Array.from(pendingConfirms.values()).map((confirm) => (
              <div key={confirm.confirmId} className="flex justify-start">
                <div className="max-w-[85%]">
                  <ConfirmCard
                    toolName={confirm.toolName}
                    preview={confirm.preview}
                    confirmId={confirm.confirmId}
                    onConfirm={handleConfirm}
                    onCancel={handleCancelConfirm}
                  />
                </div>
              </div>
            ))}

            {/* 工具调用指示器 */}
            {activeToolCall && (
              <div className="flex justify-start">
                <div className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-400 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  🔧 正在调用: {activeToolCall}...
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

            {/* 加载指示器 */}
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
        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 
                         placeholder-gray-500 resize-none outline-none focus:border-blue-500/50
                         transition-colors"
              style={{ maxHeight: 96 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 
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
    </>
  );
}
