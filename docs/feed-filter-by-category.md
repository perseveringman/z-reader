# Feed 分类展示与按 Feed 筛选功能

> **Linear Issue**: ZYB-152
> **完成日期**: 2026-02-09
> **关联计划**: `/docs/plans/2026-02-09-readwise-reader-parity.md` Task 2

## 功能概述

实现了 Sidebar Feed 区域按分类展示所有订阅源，用户可点击单个 Feed 筛选该 Feed 下的文章。

## 核心实现

### 1. App.tsx - Feed 筛选状态管理

**新增状态**:
```typescript
const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
```

**传递给 Sidebar**:
```typescript
<Sidebar
  selectedFeedId={selectedFeedId}
  onFeedSelect={(feedId) => {
    setSelectedFeedId(feedId);
    setActiveView('feeds');
  }}
  ...
/>
```

**传递给 ContentList**:
```typescript
<ContentList
  feedId={activeView === 'feeds' ? selectedFeedId : undefined}
  ...
/>
```

### 2. Sidebar.tsx - Feed 列表展示

**加载 Feed 列表**:
```typescript
const [feedCategories, setFeedCategories] = useState<Record<string, Feed[]>>({});

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
```

**分类展示结构**:
```
Feed (Section)
├── All Feeds (清除筛选)
├── Category 1 (分类名称)
│   ├── Feed A (favicon/首字母 + title)
│   └── Feed B
├── Category 2
│   └── Feed C
└── uncategorized (未分类)
    └── Feed D
```

**UI 细节**:
- 分类名称: `text-[10px] uppercase text-gray-600`
- Feed 项:
  - 未选中: `text-gray-400 hover:bg-white/5`
  - 选中: `text-white bg-white/[0.08]` + 蓝色左边框
- Feed 图标: 优先显示 `favicon`，否则显示首字母圆形占位符

### 3. ContentList.tsx - Feed 筛选查询

**新增 prop**:
```typescript
interface ContentListProps {
  feedId?: string | null;
  ...
}
```

**查询逻辑**:
```typescript
const fetchArticles = useCallback(async () => {
  const query: ArticleListQuery = {
    readStatus: activeTab,
    sortBy,
    sortOrder,
    limit: 100,
  };
  // 如果有 feedId，添加到查询参数
  if (feedId) {
    query.feedId = feedId;
  }
  const result = await window.electronAPI.articleList(query);
  setArticles(result);
}, [activeTab, sortBy, sortOrder, feedId]);
```

## 技术要点

1. **数据分组**: 使用 `Record<string, Feed[]>` 按 category 分组，提高渲染效率
2. **状态提升**: Feed 筛选状态在 App.tsx 统一管理，避免跨组件状态同步问题
3. **条件渲染**: 只在非 collapsed 且 feed section 展开时渲染 Feed 列表
4. **动态查询**: ContentList 根据 feedId 动态构建查询参数，复用现有列表逻辑

## 用户交互流程

1. 用户打开 Sidebar Feed 区域
2. 看到 "All Feeds" 和按分类分组的 Feed 列表
3. 点击某个 Feed → 触发 `onFeedSelect(feedId)`
4. App.tsx 设置 `selectedFeedId` 并切换到 `feeds` 视图
5. ContentList 接收 `feedId` prop，查询该 Feed 文章
6. 文章列表更新为该 Feed 的内容
7. 点击 "All Feeds" → 清除筛选，显示所有文章

## 样式规范

- **分类标题**: 小写字母显示 (uppercase CSS)，灰色 (`text-gray-600`)
- **Feed 项高度**: `py-1.5` (更紧凑)
- **选中状态**: 蓝色左边框 (`w-[3px] h-4 bg-blue-500`)
- **Favicon**: `w-4 h-4 rounded`
- **首字母占位符**: 圆形、深灰背景 (`bg-gray-700`)

## 后续扩展

- [ ] 显示每个 Feed 的未读文章数
- [ ] 支持 Feed 拖拽排序
- [ ] 支持 Feed 右键菜单（编辑、删除、刷新）
- [ ] Feed 列表按字母排序或按更新时间排序
- [ ] Feed 图标加载失败时的 fallback 处理

## 相关文件

- `/src/renderer/App.tsx`
- `/src/renderer/components/Sidebar.tsx`
- `/src/renderer/components/ContentList.tsx`
- `/src/shared/types.ts` (Feed 类型定义)
- `/src/shared/ipc-channels.ts` (FEED_LIST 通道)

## 测试场景

1. ✅ 无 Feed 时不显示分类
2. ✅ 单个分类下多个 Feed 正常展示
3. ✅ 未分类 Feed 归入 "uncategorized"
4. ✅ 点击 Feed 后文章列表正确筛选
5. ✅ 点击 "All Feeds" 清除筛选
6. ✅ Feed 选中状态蓝色边框正确显示
7. ✅ Sidebar collapsed 时不显示 Feed 列表
8. ✅ Feed 图标 favicon 和首字母正确显示
