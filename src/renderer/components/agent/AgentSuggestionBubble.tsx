import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AgentSuggestion } from '../../../shared/types';

interface AgentSuggestionBubbleProps {
  suggestion: AgentSuggestion;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}

export function AgentSuggestionBubble({ suggestion, onAction, onDismiss }: AgentSuggestionBubbleProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 入场动画
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // 自动消失
  useEffect(() => {
    const ms = suggestion.autoDismissMs ?? 10000;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, ms);
    return () => clearTimeout(timer);
  }, [suggestion.autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const handleAction = (prompt: string) => {
    setExiting(true);
    setTimeout(() => onAction(prompt), 300);
  };

  return (
    <div
      className={`absolute bottom-full right-0 mb-3 w-[280px] bg-[#1a1a1a] border border-white/10
                   rounded-xl shadow-2xl p-3 transition-all duration-300
                   ${visible && !exiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {/* 消息 + 关闭按钮 */}
      <div className="flex items-start gap-2 mb-2">
        <p className="text-sm text-gray-300 flex-1 leading-relaxed">{suggestion.message}</p>
        <button
          onClick={handleDismiss}
          className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 快捷操作按钮 */}
      <div className="flex flex-wrap gap-1.5">
        {suggestion.quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleAction(action.prompt)}
            className="px-2.5 py-1 text-xs rounded-full bg-blue-600/20 text-blue-400
                       hover:bg-blue-600/30 transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* 小三角指向气泡 */}
      <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-[#1a1a1a] border-r border-b border-white/10 transform rotate-45" />
    </div>
  );
}
