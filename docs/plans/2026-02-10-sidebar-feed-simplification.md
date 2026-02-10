# Sidebar Feed Section Simplification Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the Feed section in the sidebar by removing Unseen/Seen nav items, removing per-category feed listing, and keeping only: All Feeds, pinned feeds, and Manage feeds.

**Architecture:** The Feed section currently has 5 visual blocks (Unseen, Seen, Pinned feeds, All Feeds + per-category feed lists, Manage feeds). Simplify to 3: All Feeds (default entry point), pinned individual feeds, Manage feeds. The Unseen/Seen filtering already exists in ContentList tabs, so sidebar duplication is unnecessary. The per-category feed grouping (including "uncategorized") moves exclusively to the Manage feeds table.

**Tech Stack:** React, Tailwind CSS, Electron IPC

---

### Task 1: Remove Unseen/Seen nav items and per-category feed list from Sidebar

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx` (lines 274-391)

**Step 1: Replace the entire Feed section content**

Current Feed section (lines 273-391) contains:
1. Unseen NavItem (lines 275-281) — **REMOVE**
2. Seen NavItem (lines 282-288) — **REMOVE**
3. Pinned feeds (lines 289-320) — **KEEP**
4. All Feeds NavItem (lines 321-330) — **KEEP, move to top**
5. Per-category feed list (lines 331-382) — **REMOVE**
6. Manage feeds NavItem (lines 383-389) — **KEEP**

Replace lines 273-391 with:

```tsx
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
              onClick={() => onViewChange('manage-feeds')}
            />
          </>
        )}
```

**Step 2: Clean up unused imports**

Remove `Eye`, `EyeOff`, `Settings2` from lucide-react imports (no longer used in Sidebar).

Remove `onManageFeed` from `SidebarProps` interface and destructured props if no longer used (it was used by per-feed Settings2 icon which is now removed).

**Step 3: Update default activeView in App.tsx**

In `src/renderer/App.tsx`, the `handleDeleteFeed` callback (line ~160) sets `setActiveView('feed-unseen')` as fallback when deleting the currently selected feed. Change to `'feeds'` since `feed-unseen` is no longer a sidebar entry:

```tsx
// Change from:
setActiveView('feed-unseen');
// Change to:
setActiveView('feeds');
```

**Step 4: Verify ContentList still handles feed-unseen/feed-seen via tabs**

No changes needed — ContentList already handles `initialTab` from App.tsx which derives from `activeView`. The `feeds` view will show the default feed tab. Clicking "All Feeds" in sidebar sets `activeView='feeds'` which maps to `source='feed'` with no specific initialTab, and ContentList defaults to its current tab state.

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: Only the pre-existing @postlight/parser warning

**Step 6: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/App.tsx
git commit -m "refactor: simplify sidebar Feed section - remove Unseen/Seen/categories, keep All Feeds + pinned + manage"
```
