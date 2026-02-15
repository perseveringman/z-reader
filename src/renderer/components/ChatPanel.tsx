import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Plus, Loader2, ChevronDown, ChevronRight, MessageSquare, Settings, Trash2 } from 'lucide-react';
import type { ChatMessage, ChatSession, ChatStreamChunk, AIPromptPreset } from '../../shared/types';

// ==================== 简单 Markdown 渲染 ====================

/**
 * 将简单 Markdown 文本转换为 HTML
 * 支持: **bold**, `code`, ```code blocks```, - list items
 */
function renderSimpleMarkdown(text: string): string {
  // 先处理代码块（避免内部被其它规则干扰）
  let html = text;

  // 代码块: ```...```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    return `<pre class="my-2 p-2 rounded bg-white/5 text-[12px] leading-[1.5] overflow-x-auto"><code>${escaped}</code></pre>`;
  });

  // 按行处理（排除代码块）
  const lines = html.split('\n');
  const processed: string[] = [];
  let inList = false;
  let inPre = false;

  for (const line of lines) {
    // 追踪是否在 <pre> 块内
    if (line.includes('<pre class=')) {
      inPre = true;
    }
    if (inPre) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      processed.push(line);
      if (line.includes('</pre>')) {
        inPre = false;
      }
      continue;
    }

    // 列表项: - item 或 * item
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (listMatch) {
      if (!inList) {
        processed.push('<ul class="list-disc list-inside my-1 space-y-0.5">');
        inList = true;
      }
      processed.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    // 非列表行关闭列表
    if (inList) {
      processed.push('</ul>');
      inList = false;
    }

    // 空行
    if (line.trim() === '') {
      processed.push('<br/>');
      continue;
    }

    // 普通行
    processed.push(`<p class="my-0.5">${inlineMarkdown(line)}</p>`);
  }

  if (inList) {
    processed.push('</ul>');
  }

  return processed.join('');
}

/** 行内 Markdown: **bold**, `code` */
function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  // 粗体: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  // 行内代码: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-[12px] text-blue-300">$1</code>');
  return html;
}

/** HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==================== 子组件 ====================

/** 空状态：展示预设分析卡片 */
function EmptyState({
  onSelectPreset,
  presets,
  loading,
}: {
  onSelectPreset: (prompt: string) => void;
  presets: AIPromptPreset[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-2">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-gray-600 opacity-30" />
        <p className="text-sm text-gray-500">{t('chat.empty')}</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      ) : presets.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 w-full">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.prompt)}
              className="flex flex-col items-start gap-1.5 p-2.5 rounded-lg bg-[#1a1a1a] border border-white/5 hover:border-white/15 transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="text-[12px] font-medium text-gray-300 group-hover:text-white transition-colors">
                  {preset.title}
                </span>
              </div>
              <span className="text-[11px] text-gray-600 leading-tight line-clamp-2">
                {preset.prompt}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[11px] text-gray-600 mt-3">{t('chat.analysisHint')}</p>
    </div>
  );
}

/** 对话中的快捷标签栏 */
function PromptPills({
  presets,
  onSelectPreset,
  disabled,
}: {
  presets: AIPromptPreset[];
  onSelectPreset: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelectPreset(preset.prompt)}
          disabled={disabled}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20"
        >
          <MessageSquare className="w-3 h-3" />
          {preset.title}
        </button>
      ))}
    </div>
  );
}

/** API Key 未配置提示 */
function ApiKeyHint() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-gray-500 px-6">
        <Settings className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t('ai.configureApiKey')}</p>
      </div>
    </div>
  );
}

/** 消息气泡 */
function ChatBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-[1.6]
          ${isUser
            ? 'bg-blue-600 text-white'
            : 'bg-[#1a1a1a] border border-white/5 text-gray-300'
          }
        `}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div
            className="prose-chat break-words"
            dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(message.content) }}
          />
        )}
        {/* 工具调用折叠区 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-1.5">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              {toolsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>{t('chat.toolCalling', { name: `${message.toolCalls.length} tools` })}</span>
            </button>
            {toolsExpanded && (
              <div className="mt-1.5 space-y-1">
                {message.toolCalls.map((tc, i) => (
                  <div key={i} className="text-[11px] rounded bg-white/5 px-2 py-1.5">
                    <span className="text-purple-400 font-medium">{tc.name}</span>
                    <pre className="mt-1 text-gray-500 overflow-x-auto text-[10px] leading-[1.4]">
                      {JSON.stringify(tc.args, null, 2)}
                    </pre>
                    {tc.result && (
                      <pre className="mt-1 text-gray-400 overflow-x-auto text-[10px] leading-[1.4] border-t border-white/5 pt-1">
                        {tc.result.length > 200 ? tc.result.slice(0, 200) + '...' : tc.result}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 流式回复气泡 */
function StreamingBubble({
  text,
  toolCalls,
}: {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
}) {
  const { t } = useTranslation();
  const [toolsExpanded, setToolsExpanded] = useState(true);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg px-3 py-2 bg-[#1a1a1a] border border-white/5 text-[13px] leading-[1.6] text-gray-300">
        {/* 工具调用展示（流式阶段默认展开） */}
        {toolCalls.length > 0 && (
          <div className="mb-2 pb-1.5 border-b border-white/10">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              {toolsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>{t('chat.toolCalling', { name: toolCalls[toolCalls.length - 1].name })}</span>
            </button>
            {toolsExpanded && (
              <div className="mt-1.5 space-y-1">
                {toolCalls.map((tc, i) => (
                  <div key={i} className="text-[11px] rounded bg-white/5 px-2 py-1.5">
                    <span className="text-purple-400 font-medium">{tc.name}</span>
                    <pre className="mt-1 text-gray-500 overflow-x-auto text-[10px] leading-[1.4]">
                      {JSON.stringify(tc.args, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 流式文本 */}
        {text ? (
          <div className="break-words">
            <div dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(text) }} />
            <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[12px]">{t('chat.thinking')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 会话列表下拉 */
function SessionDropdown({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 max-h-[300px] overflow-y-auto"
    >
      {/* 新建会话 */}
      <button
        onClick={() => { onNew(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer border-b border-white/5"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{t('chat.newSession')}</span>
      </button>
      {/* 会话列表 */}
      {sessions.length === 0 ? (
        <div className="px-3 py-4 text-[12px] text-gray-600 text-center">
          {t('chat.sessionList')}
        </div>
      ) : (
        sessions.map((s) => (
          <div
            key={s.id}
            className={`
              group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors
              ${s.id === currentSessionId ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
            `}
            onClick={() => onSelect(s.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] truncate">{s.title || t('chat.newSession')}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-gray-500 hover:text-red-400 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ==================== 主组件 ====================

interface ChatPanelProps {
  articleId: string | null;
}

export function ChatPanel({ articleId }: ChatPanelProps) {
  const { t } = useTranslation();

  // 状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<{ name: string; args: Record<string, unknown> }[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessionList, setShowSessionList] = useState(false);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null); // null = 检查中
  const [error, setError] = useState<string | null>(null);
  const [promptPresets, setPromptPresets] = useState<AIPromptPreset[]>([]);
  const [loadingPromptPresets, setLoadingPromptPresets] = useState(false);

  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 使用 ref 保存最新值，避免 useEffect 依赖循环
  const toolCallsRef = useRef(toolCalls);
  toolCallsRef.current = toolCalls;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const loadPromptPresets = useCallback(async () => {
    setLoadingPromptPresets(true);
    try {
      const presets = await window.electronAPI.aiPromptPresetList({
        target: 'chat',
        enabledOnly: true,
      });
      setPromptPresets(presets);
    } catch {
      setPromptPresets([]);
    } finally {
      setLoadingPromptPresets(false);
    }
  }, []);

  // 检查 API Key 配置
  useEffect(() => {
    window.electronAPI.aiSettingsGet().then((settings) => {
      setApiConfigured(!!(settings.apiKey && settings.apiKey.trim().length > 0));
    }).catch(() => {
      setApiConfigured(false);
    });
  }, []);

  // 初始化：仅加载会话列表，不立即创建会话（延迟到第一次发消息时创建）
  useEffect(() => {
    if (apiConfigured === false) return;
    if (apiConfigured === null) return;

    const initSession = async () => {
      try {
        // 仅加载会话列表，不创建新会话
        const list = await window.electronAPI.aiChatSessionList();
        setSessions(list);
        await loadPromptPresets();
        // 重置当前会话状态
        setSessionId(null);
        setMessages([]);
      } catch {
        setError(t('chat.error'));
      }
    };
    initSession();
  }, [articleId, apiConfigured, t, loadPromptPresets]);

  // 监听流式回复
  useEffect(() => {
    const unsubscribe = window.electronAPI.aiChatOnStream((chunk: ChatStreamChunk) => {
      if (chunk.type === 'text-delta') {
        setStreamingText((prev) => prev + (chunk.textDelta ?? ''));
      } else if (chunk.type === 'tool-call') {
        if (chunk.toolCall) {
          setToolCalls((prev) => [...prev, chunk.toolCall!]);
        }
      } else if (chunk.type === 'tool-result') {
        // 可选：更新工具调用结果
      } else if (chunk.type === 'done') {
        // 将流式文本合并为完整 assistant 消息
        const currentToolCalls = toolCallsRef.current;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: chunk.fullText ?? '',
            timestamp: new Date().toISOString(),
            toolCalls: currentToolCalls.length > 0 ? currentToolCalls.map((tc) => ({ ...tc })) : undefined,
          },
        ]);
        setStreamingText('');
        setToolCalls([]);
        setIsStreaming(false);
      } else if (chunk.type === 'error') {
        setError(chunk.error ?? t('chat.error'));
        setStreamingText('');
        setToolCalls([]);
        setIsStreaming(false);
      } else if (chunk.type === 'title-generated') {
        // AI 自动生成的会话标题，更新会话列表中对应条目
        if (chunk.title) {
          const currentId = sessionIdRef.current;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentId ? { ...s, title: chunk.title! } : s,
            ),
          );
        }
      }
    });
    return unsubscribe;
  }, [t]);

  // 确保会话已创建（延迟创建），返回 sessionId
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const session = await window.electronAPI.aiChatSessionCreate(articleId ?? undefined);
      setSessionId(session.id);
      // 刷新会话列表
      const list = await window.electronAPI.aiChatSessionList();
      setSessions(list);
      return session.id;
    } catch {
      setError(t('chat.error'));
      return null;
    }
  }, [sessionId, articleId, t]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setError(null);
    setInput('');
    setIsStreaming(true);

    // 延迟创建会话（第一次发消息时才创建）
    const currentSessionId = await ensureSession();
    if (!currentSessionId) {
      setIsStreaming(false);
      return;
    }

    window.electronAPI.aiChatSend({
      sessionId: currentSessionId,
      message: userMsg.content,
      articleId: articleId ?? undefined,
    });
  }, [input, isStreaming, articleId, ensureSession]);

  // 预设分析按钮发送
  const handlePresetSend = useCallback(async (prompt: string) => {
    if (isStreaming) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setError(null);
    setIsStreaming(true);

    // 延迟创建会话（第一次发消息时才创建）
    const currentSessionId = await ensureSession();
    if (!currentSessionId) {
      setIsStreaming(false);
      return;
    }

    window.electronAPI.aiChatSend({
      sessionId: currentSessionId,
      message: prompt,
      articleId: articleId ?? undefined,
    });
  }, [isStreaming, articleId, ensureSession]);

  // 键盘事件：Enter 发送
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // 新建会话（仅重置状态，不立即创建数据库记录）
  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setStreamingText('');
    setToolCalls([]);
    setIsStreaming(false);
  }, []);

  // 关闭会话列表
  const handleCloseSessionList = useCallback(() => {
    setShowSessionList(false);
  }, []);

  // 切换会话
  const handleSelectSession = useCallback(async (id: string) => {
    try {
      const session = await window.electronAPI.aiChatSessionGet(id);
      if (session) {
        setSessionId(session.id);
        setMessages(session.messages);
      }
      setShowSessionList(false);
    } catch {
      setError(t('chat.error'));
    }
  }, [t]);

  // 删除会话
  const handleDeleteSession = useCallback(async (id: string) => {
    // 乐观更新：立即从列表中移除，提供即时视觉反馈
    setSessions((prev) => prev.filter((s) => s.id !== id));
    // 如果删除的是当前会话，重置聊天状态
    if (id === sessionId) {
      handleNewSession();
    }
    try {
      await window.electronAPI.aiChatSessionDelete(id);
      // 从数据库重新加载列表，确保一致性
      const list = await window.electronAPI.aiChatSessionList();
      setSessions(list);
    } catch {
      // 删除失败时恢复列表
      const list = await window.electronAPI.aiChatSessionList();
      setSessions(list);
      setError(t('chat.error'));
    }
  }, [sessionId, handleNewSession, t]);

  // 检查中 loading
  if (apiConfigured === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  // API Key 未配置
  if (apiConfigured === false) {
    return (
      <div className="flex flex-col h-full">
        <ApiKeyHint />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：会话管理 */}
      <div className="shrink-0 relative">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <button
            onClick={() => setShowSessionList(!showSessionList)}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('chat.sessionList')}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={() => { handleNewSession(); setShowSessionList(false); }}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer"
            title={t('chat.newSession')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {showSessionList && (
          <SessionDropdown
            sessions={sessions}
            currentSessionId={sessionId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onDelete={handleDeleteSession}
            onClose={handleCloseSessionList}
          />
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <EmptyState
            onSelectPreset={handlePresetSend}
            presets={promptPresets}
            loading={loadingPromptPresets}
          />
        )}
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}
        {isStreaming && <StreamingBubble text={streamingText} toolCalls={toolCalls} />}
        {/* 错误提示 */}
        {error && !isStreaming && (
          <div className="flex justify-center">
            <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
              {error}
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="shrink-0 border-t border-white/5 p-3">
        {/* 对话中显示快捷标签 */}
        {messages.length > 0 && promptPresets.length > 0 && (
          <div className="mb-2">
            <PromptPills
              presets={promptPresets}
              onSelectPreset={handlePresetSend}
              disabled={isStreaming}
            />
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            disabled={isStreaming}
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="shrink-0 px-3 py-2 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isStreaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{t('chat.send')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
