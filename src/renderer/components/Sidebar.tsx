import { useState } from 'react';
import {
  FileText,
  Tag,
  Rss,
  Star,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeft,
  User,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  count?: number;
  onClick?: () => void;
}

function NavItem({ icon, label, active, collapsed, count, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-3 w-full px-3 py-2 rounded-md text-[13px]
        transition-colors duration-150 cursor-pointer
        ${active
          ? 'text-white bg-white/[0.08]'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }
      `}
      title={collapsed ? label : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
      )}
      <span className="shrink-0">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {count !== undefined && (
            <span className="text-xs text-gray-500">{count}</span>
          )}
        </>
      )}
    </button>
  );
}

function SectionLabel({
  label,
  collapsed,
  expanded,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (collapsed) return <div className="my-2 border-t border-white/5" />;
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full px-3 pt-5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors cursor-pointer"
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, activeView, onViewChange }: SidebarProps) {
  const iconSize = 18;
  const [sections, setSections] = useState({
    library: true,
    feed: true,
    pinned: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={`
        flex flex-col h-full border-r border-white/5 bg-[#111111]
        transition-all duration-200 shrink-0
        ${collapsed ? 'w-[52px]' : 'w-[220px]'}
      `}
    >
      {/* 顶部区域 - macOS 红绿灯空间 */}
      <div className="h-10 flex items-center justify-between px-3 drag-region shrink-0">
        {!collapsed && (
          <span className="text-xs font-medium text-gray-500 tracking-tight pl-16">Z-Reader</span>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors no-drag cursor-pointer"
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-2 mt-1">
        <SectionLabel
          label="Library"
          collapsed={collapsed}
          expanded={sections.library}
          onToggle={() => toggleSection('library')}
        />
        {(collapsed || sections.library) && (
          <>
            <NavItem
              icon={<FileText size={iconSize} />}
              label="Articles"
              active={activeView === 'articles'}
              collapsed={collapsed}
              onClick={() => onViewChange('articles')}
            />
            <NavItem
              icon={<Tag size={iconSize} />}
              label="Tags"
              active={activeView === 'tags'}
              collapsed={collapsed}
              onClick={() => onViewChange('tags')}
            />
          </>
        )}

        <SectionLabel
          label="Feed"
          collapsed={collapsed}
          expanded={sections.feed}
          onToggle={() => toggleSection('feed')}
        />
        {(collapsed || sections.feed) && (
          <NavItem
            icon={<Rss size={iconSize} />}
            label="All Feeds"
            active={activeView === 'feeds'}
            collapsed={collapsed}
            onClick={() => onViewChange('feeds')}
          />
        )}

        <SectionLabel
          label="Pinned"
          collapsed={collapsed}
          expanded={sections.pinned}
          onToggle={() => toggleSection('pinned')}
        />
        {(collapsed || sections.pinned) && (
          <NavItem
            icon={<Star size={iconSize} />}
            label="Shortlist"
            active={activeView === 'shortlist'}
            collapsed={collapsed}
            onClick={() => onViewChange('shortlist')}
          />
        )}
      </nav>

      {/* 底部操作区 */}
      <div className="px-2 py-2 border-t border-white/5 space-y-0.5">
        <NavItem
          icon={<Search size={iconSize} />}
          label="Search"
          collapsed={collapsed}
        />
        <NavItem
          icon={<Settings size={iconSize} />}
          label="Preferences"
          collapsed={collapsed}
        />
        <NavItem
          icon={<User size={iconSize} />}
          label="Profile"
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
