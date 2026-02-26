import React from 'react';
import { BookOpen, FlaskConical } from 'lucide-react';

interface ActivityRailBarProps {
  activeMode: 'read' | 'research';
  onModeChange: (mode: 'read' | 'research') => void;
}

export function ActivityRailBar({ activeMode, onModeChange }: ActivityRailBarProps) {
  const modes = [
    { id: 'read' as const, icon: BookOpen, label: '阅读' },
    { id: 'research' as const, icon: FlaskConical, label: '研究' },
  ];

  return (
    <div className="w-12 shrink-0 bg-[#0a0a0a] border-r border-white/5 flex flex-col items-center pt-2 gap-1">
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            className={`
              relative w-10 h-10 flex items-center justify-center rounded-lg
              transition-colors duration-150 group
              ${isActive
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }
            `}
            title={mode.label}
          >
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
            )}
            <Icon size={20} />
          </button>
        );
      })}
    </div>
  );
}
