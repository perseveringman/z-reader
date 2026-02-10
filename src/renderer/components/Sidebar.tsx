import { useState, useEffect } from 'react';
import {
  Inbox,
  Clock,
  Archive,
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
  Plus,
  Link,
  Trash2,
  ArrowRight,
  Pin,
  Keyboard,
  BookOpen,
} from 'lucide-react';
import type { Feed, Tag as TagType } from '../../shared/types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
  onAddFeed: () => void;
  onAddUrl: () => void;
  onSearch: () => void;
  onShortcutsHelp: () => void;
  selectedFeedId: string | null;
  onFeedSelect: (feedId: string | null) => void;
  selectedTagId?: string | null;
  onTagSelect?: (tagId: string | null) => void;
  refreshTrigger?: number;
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
        transition-colors duration-150 cursor-pointer outline-none
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
      className="flex items-center gap-1.5 w-full px-3 pt-5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors cursor-pointer outline-none"
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, activeView, onViewChange, onAddFeed, onAddUrl, onSearch, onShortcutsHelp, selectedFeedId, onFeedSelect, selectedTagId, onTagSelect, refreshTrigger }: SidebarProps) {
  const iconSize = 18;
  const [sections, setSections] = useState({
    library: true,
    feed: true,
    pinned: true,
  });
  const [feedCategories, setFeedCategories] = useState<Record<string, Feed[]>>({});
  const [tags, setTags] = useState<TagType[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // 加载 Feed 列表
  useEffect(() => {
    const loadFeeds = async () => {
      try {
        const feedList = await window.electronAPI.feedList();

        // 按 category 分组
        const grouped: Record<string, Feed[]> = {};
        feedList.forEach((feed) => {
          const category = feed.category || 'uncategorized';
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(feed);
        });
        setFeedCategories(grouped);
      } catch (err) {
        console.error('Failed to load feeds:', err);
      }
    };
    loadFeeds();
  }, [refreshTrigger]);

  // 加载 Tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tagList = await window.electronAPI.tagList();
        setTags(tagList);
      } catch (err) {
        console.error('Failed to load tags:', err);
      }
    };
    loadTags();
  }, [activeView]);

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={`
        flex flex-col h-full border-r border-white/5 bg-[#111111]
        transition-[width] duration-200 shrink-0 overflow-hidden
        ${collapsed ? 'w-0 border-r-0' : 'w-[220px]'}
      `}
    >
      <div className={`flex flex-col h-full min-w-[220px] ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        {!collapsed && (
          <span className="text-xs font-medium text-gray-500 tracking-tight">Z-Reader</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={onAddUrl}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Save URL to Library"
          >
            <Link size={16} />
          </button>
          <button
            onClick={onAddFeed}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Add RSS Feed"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>

      {/* 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-2 mt-1">
        {/* ===== Library Section ===== */}
        <SectionLabel
          label="Library"
          collapsed={collapsed}
          expanded={sections.library}
          onToggle={() => toggleSection('library')}
        />
        {(collapsed || sections.library) && (
          <>
            <NavItem
              icon={<Inbox size={iconSize} />}
              label="Inbox"
              active={activeView === 'library-inbox'}
              collapsed={collapsed}
              onClick={() => onViewChange('library-inbox')}
            />
            <NavItem
              icon={<Clock size={iconSize} />}
              label="Later"
              active={activeView === 'library-later'}
              collapsed={collapsed}
              onClick={() => onViewChange('library-later')}
            />
            <NavItem
              icon={<Archive size={iconSize} />}
              label="Archive"
              active={activeView === 'library-archive'}
              collapsed={collapsed}
              onClick={() => onViewChange('library-archive')}
            />
            <NavItem
              icon={<Tag size={iconSize} />}
              label="Tags"
              active={activeView === 'tags' && !selectedTagId}
              collapsed={collapsed}
              onClick={() => {
                setTagsExpanded(!tagsExpanded);
                onViewChange('tags');
                onTagSelect?.(null);
              }}
            />
            {/* Tags 子列表 */}
            {!collapsed && tagsExpanded && tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  onTagSelect?.(tag.id);
                  onViewChange('tags');
                }}
                className={`
                  relative flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-[12px]
                  transition-colors duration-150 cursor-pointer outline-none ml-3
                  ${selectedTagId === tag.id
                    ? 'text-white bg-white/[0.08]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }
                `}
              >
                {selectedTagId === tag.id && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
                )}
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {tag.articleCount !== undefined && (
                  <span className="text-[10px] text-gray-600">{tag.articleCount}</span>
                )}
              </button>
            ))}
            <NavItem
              icon={<BookOpen size={iconSize} />}
              label="Books"
              active={activeView === 'books'}
              collapsed={collapsed}
              onClick={() => onViewChange('books')}
            />
          </>
        )}

        {/* ===== Feed Section ===== */}
        <SectionLabel
          label="Feed"
          collapsed={collapsed}
          expanded={sections.feed}
          onToggle={() => toggleSection('feed')}
        />
        {(collapsed || sections.feed) && (
          <>
            <NavItem
              icon={<Rss size={iconSize} />}
              label="All Feeds"
              active={activeView === 'feeds' && selectedFeedId === null}
              collapsed={collapsed}
              onClick={() => {
                onViewChange('feeds');
                onFeedSelect(null);
              }}
            />
            {/* Pinned feeds */}
            {!collapsed && Object.values(feedCategories).flat().filter(f => f.pinned).map((feed) => {
              const displayIcon = feed.favicon ? (
                <img src={feed.favicon} alt="" className="w-4 h-4 rounded" />
              ) : (
                <div className="w-4 h-4 rounded bg-gray-700 flex items-center justify-center text-[10px] text-gray-400">
                  {feed.title?.charAt(0).toUpperCase() || 'F'}
                </div>
              );
              return (
                <button
                  key={`pin-${feed.id}`}
                  onClick={() => {
                    onFeedSelect(feed.id);
                    onViewChange('feeds');
                  }}
                  className={`
                    group relative flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-[12px]
                    transition-colors duration-150 cursor-pointer outline-none
                    ${selectedFeedId === feed.id
                      ? 'text-white bg-white/[0.08]'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                    }
                  `}
                  title={feed.title || feed.url}
                >
                  {selectedFeedId === feed.id && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
                  )}
                  <Pin size={10} className="shrink-0 text-blue-400/60" />
                  <span className="shrink-0">{displayIcon}</span>
                  <span className="flex-1 text-left truncate">{feed.title || feed.url}</span>
                </button>
              );
            })}
            <NavItem
              icon={<ArrowRight size={iconSize} />}
              label="Manage feeds"
              active={activeView === 'manage-feeds'}
              collapsed={collapsed}
              onClick={() => {
                onViewChange('manage-feeds');
              }}
            />
          </>
        )}

        {/* ===== Pinned Section ===== */}
        <SectionLabel
          label="Pinned"
          collapsed={collapsed}
          expanded={sections.pinned}
          onToggle={() => toggleSection('pinned')}
        />
        {(collapsed || sections.pinned) && (
          <>
            <NavItem
              icon={<Star size={iconSize} />}
              label="Shortlist"
              active={activeView === 'shortlist'}
              collapsed={collapsed}
              onClick={() => onViewChange('shortlist')}
            />
          </>
        )}
      </nav>

      {/* 底部操作区 */}
      <div className="px-2 py-2 border-t border-white/5 space-y-0.5">
        <NavItem
          icon={<Trash2 size={iconSize} />}
          label="Trash"
          active={activeView === 'trash'}
          collapsed={collapsed}
          onClick={() => onViewChange('trash')}
        />
        <NavItem
          icon={<Search size={iconSize} />}
          label="Search"
          collapsed={collapsed}
          onClick={onSearch}
        />
        <NavItem
          icon={<Keyboard size={iconSize} />}
          label="Shortcuts"
          collapsed={collapsed}
          onClick={onShortcutsHelp}
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
      </div>
    </aside>
  );
}
