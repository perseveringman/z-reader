import { useState, useEffect } from 'react';
import {
  FileText,
  Tag,
  Rss,
  Star,
  Search,
  Settings,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  User,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Feed, Tag as TagType } from '../../shared/types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
  onAddFeed: () => void;
  onSearch: () => void;
  selectedFeedId: string | null;
  onFeedSelect: (feedId: string | null) => void;
  onManageFeed?: (feed: Feed) => void;
  selectedTagId?: string | null;
  onTagSelect?: (tagId: string | null) => void;
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

export function Sidebar({ collapsed, onToggleCollapse, activeView, onViewChange, onAddFeed, onSearch, selectedFeedId, onFeedSelect, onManageFeed, selectedTagId, onTagSelect }: SidebarProps) {
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
  }, []);

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
        transition-all duration-200 shrink-0
        ${collapsed ? 'w-[52px]' : 'w-[220px]'}
      `}
    >
      {/* 顶部区域 - macOS 红绿灯空间 */}
      <div className="h-10 flex items-center justify-between px-3 drag-region shrink-0">
        {!collapsed && (
          <span className="text-xs font-medium text-gray-500 tracking-tight pl-16">Z-Reader</span>
        )}
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={onAddFeed}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="添加 RSS 订阅"
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
                  transition-colors duration-150 cursor-pointer ml-3
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
          </>
        )}

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
            {/* Feed 列表 - 按分类展示 */}
            {!collapsed && Object.keys(feedCategories).map((category) => (
              <div key={category} className="mt-2">
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                  {category}
                </div>
                {feedCategories[category].map((feed) => {
                  // 获取 favicon 或首字母
                  const displayIcon = feed.favicon ? (
                    <img src={feed.favicon} alt="" className="w-4 h-4 rounded" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-gray-700 flex items-center justify-center text-[10px] text-gray-400">
                      {feed.title?.charAt(0).toUpperCase() || 'F'}
                    </div>
                  );

                  return (
                    <button
                      key={feed.id}
                      onClick={() => onFeedSelect(feed.id)}
                      className={`
                        group relative flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-[12px]
                        transition-colors duration-150 cursor-pointer
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
                      <span className="shrink-0">{displayIcon}</span>
                      <span className="flex-1 text-left truncate">{feed.title || feed.url}</span>
                      {onManageFeed && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onManageFeed(feed);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all cursor-pointer"
                          title="管理 Feed"
                        >
                          <Settings2 size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}

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
            <NavItem
              icon={<Trash2 size={iconSize} />}
              label="Trash"
              active={activeView === 'trash'}
              collapsed={collapsed}
              onClick={() => onViewChange('trash')}
            />
          </>
        )}
      </nav>

      {/* 底部操作区 */}
      <div className="px-2 py-2 border-t border-white/5 space-y-0.5">
        <NavItem
          icon={<Search size={iconSize} />}
          label="Search"
          collapsed={collapsed}
          onClick={onSearch}
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
