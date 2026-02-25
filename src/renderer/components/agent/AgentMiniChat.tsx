import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Maximize2, Send, Loader2 } from 'lucide-react';

interface AgentMiniChatProps {
  onClose: () => void;
  onExpand: () => void;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  streamingText: string;
  isStreaming: boolean;
  onSend: (message: string) => void;
  currentPage: string;
  activeModules: string[];
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
  // 粗体: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  // 行内代码: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-[12px] text-blue-300">$1</code>');
  // 换行
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

export function AgentMiniChat({
  onClose,
  onExpand,
  messages,
  streamingText,
  isStreaming,
  onSend,
  currentPage,
  activeModules,
}: AgentMiniChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // 自动调整高度
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, []);

  const pageLabel = PAGE_LABELS[currentPage] || `📄 ${currentPage}`;

  return (
    <div className="w-[360px] h-[480px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <span className="text-sm font-medium text-gray-200">AI 助手</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onExpand}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            title="展开"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 上下文标签栏 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 shrink-0">
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
          {pageLabel}
        </span>
        {activeModules.map((mod) => (
          <span key={mod} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
            {mod}
          </span>
        ))}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
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
        {isStreaming && !streamingText && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg bg-white/5 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="px-3 py-2 border-t border-white/10 shrink-0">
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
  );
}
