import { Sparkles } from 'lucide-react';

interface AgentBubbleProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function AgentBubble({ onClick, hasUnread }: AgentBubbleProps) {
  return (
    <button
      onClick={onClick}
      className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 
                 text-white shadow-lg hover:shadow-xl transition-all duration-200
                 flex items-center justify-center relative group"
      title="AI 助手 (⌘J)"
    >
      <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0f0f0f]" />
      )}
    </button>
  );
}
