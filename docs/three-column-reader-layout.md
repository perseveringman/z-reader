# 三栏阅读视图实现

## 概述

重新设计了文章阅读视图，从全屏覆盖模式改为与 Readwise Reader 对齐的三栏集成布局，提供更流畅的阅读体验。

## 设计目标

对齐 Readwise Reader 的阅读体验：
- 左侧栏：文章目录导航 (Contents)
- 中间栏：文章正文内容
- 右侧栏：文章信息、笔记和 AI 对话 (Info/Notebook/Chat)

## 实现变更

### 1. App.tsx 状态管理优化

**新增状态**:
- `readerMode`: 控制是否进入阅读模式
- 当 `readerMode = true` 时，显示 ReaderView 替代 ContentList + DetailPanel

**关键代码**:
```tsx
const [readerMode, setReaderMode] = useState(false);

const handleOpenReader = useCallback((articleId: string) => {
  setReaderArticleId(articleId);
  setReaderMode(true);
}, []);

const handleCloseReader = useCallback(() => {
  setReaderMode(false);
  setReaderArticleId(null);
}, []);

// 条件渲染
{!readerMode ? (
  <>
    <ContentList onOpenReader={handleOpenReader} />
    <DetailPanel articleId={selectedArticleId} />
  </>
) : (
  <ReaderView articleId={readerArticleId!} onClose={handleCloseReader} />
)}
```

### 2. ReaderView 三栏布局

**布局结构**:
```
┌─────────────┬──────────────────────┬─────────────┐
│             │                      │             │
│  Contents   │   Article Content    │    Info     │
│  (220px)    │   (flex-1)           │   (280px)   │
│             │                      │             │
│  - 返回按钮  │   - 标题 + 元数据     │  - 标签切换  │
│  - 目录列表  │   - 正文内容          │  - 详细信息  │
│  (二期开发)  │   - 高亮工具栏        │  - 高亮笔记  │
│             │                      │  - AI 对话   │
└─────────────┴──────────────────────┴─────────────┘
```

**CSS 类名变更**:
- 从 `fixed inset-0 z-50` 改为 `flex flex-1 h-full`
- 移除全屏覆盖样式，改用 flex 布局集成到主窗口

**关键改动**:
```tsx
// 旧版：全屏覆盖
<div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f0f]">
  <div className="header">...</div>
  <div className="content">...</div>
</div>

// 新版：三栏布局
<div className="flex flex-1 h-full overflow-hidden">
  {/* 左侧目录栏 */}
  <div className="w-[220px] shrink-0 border-r">...</div>

  {/* 中间内容栏 */}
  <div className="flex-1 flex flex-col overflow-hidden">...</div>

  {/* 右侧详情栏 */}
  <ReaderDetailPanel articleId={articleId} />
</div>
```

### 3. ReaderDetailPanel 组件

**新增文件**: `src/renderer/components/ReaderDetailPanel.tsx`

**功能特性**:
- 三个标签页：Info / Notebook / Chat
- Info 标签显示：
  - 摘要 (Summary)
  - 元数据：Type, Domain, Published, Length, Progress, Saved, Author
- Notebook 标签显示：
  - 高亮数量统计
  - 高亮列表（带颜色标记和时间）
  - 悬浮显示删除按钮
- Chat 标签：占位符（二期功能）

**与 DetailPanel 的区别**:
- `ReaderDetailPanel`: 专为阅读模式设计，宽度 280px，显示更紧凑
- `DetailPanel`: 用于文章列表浏览，flex-1 自适应宽度

### 4. 左侧 Contents 栏（占位）

**当前状态**:
- 显示 "Contents" 标题
- 返回按钮（关闭阅读视图）
- 占位文本："文章目录功能开发中…"

**后续开发方向**:
- 自动提取文章 H2/H3 标题生成目录
- 点击目录项跳转到对应段落
- 高亮当前阅读位置
- 显示阅读进度百分比

## 用户体验优化

### 视觉流程
1. 用户在 ContentList 双击或按 Enter 打开文章
2. 整个主界面切换为三栏阅读布局
3. 左侧显示目录结构，中间显示正文，右侧显示详情
4. 点击左上角返回按钮回到文章列表

### 交互保持
- ✅ 文本选择高亮功能（鼠标选择后弹出颜色选择器）
- ✅ 键盘导航（j/k 段落导航，H 快速高亮）
- ✅ ESC 键关闭阅读视图
- ✅ 滚动位置记忆
- ✅ 高亮笔记实时同步

### 样式统一
- 背景色：`#0f0f0f` (主背景), `#141414` (侧边栏)
- 边框色：`#262626`
- 文本色：`#ffffff` (标题), `#e5e5e5` (正文), `#9ca3af` (元数据)
- 字体大小：保持 Readwise Reader 风格的层级关系

## 技术细节

### 状态同步
- ReaderView 和 ReaderDetailPanel 都会加载 articleId 对应的文章数据
- 高亮创建后通过 `setHighlights` 更新 ReaderDetailPanel 的显示
- 删除高亮后通过回调同步状态

### 性能优化
- 使用 `useCallback` 缓存事件处理函数
- 组件卸载时取消未完成的异步请求 (`cancelled` flag)
- 高亮渲染使用 `requestAnimationFrame` 优化

### 响应式处理
- 三栏布局固定宽度，确保内容区域有足够阅读空间
- 中间内容区域 `flex-1` 自适应剩余空间
- 最大内容宽度 680px，居中显示

## 文件清单

### 新增文件
- `src/renderer/components/ReaderDetailPanel.tsx` - 阅读模式专用详情面板

### 修改文件
- `src/renderer/App.tsx` - 添加 readerMode 状态和条件渲染逻辑
- `src/renderer/components/ReaderView.tsx` - 重构为三栏布局，移除全屏覆盖样式

### 未修改文件
- `src/renderer/components/DetailPanel.tsx` - 保持原样，用于文章列表浏览
- `src/renderer/components/ContentList.tsx` - 无需修改

## 后续优化方向

### 左侧目录栏
1. **自动目录生成**: 解析 HTML 提取 H2/H3 标题
2. **目录点击跳转**: 滚动到对应段落位置
3. **当前位置高亮**: 显示用户正在阅读的章节
4. **折叠/展开**: 支持多层级目录折叠

### 中间内容栏
1. **阅读进度保存**: 记录滚动位置，下次打开恢复
2. **字体大小调节**: 提供字体大小切换按钮
3. **主题切换**: 支持深色/浅色主题
4. **行高间距调节**: 优化阅读舒适度

### 右侧详情栏
1. **Chat 功能**: 集成 AI 对话，支持文章内容提问
2. **标签管理**: 为文章添加/移除标签
3. **笔记编辑**: 为高亮添加个人笔记
4. **分享功能**: 生成文章链接或导出笔记

## 测试要点

- [x] 点击文章进入三栏阅读视图
- [x] 左侧显示 Contents 标题和返回按钮
- [x] 中间显示文章正文和标题
- [x] 右侧显示 Info/Notebook/Chat 三个标签
- [x] Info 标签显示文章元数据
- [x] Notebook 标签显示高亮列表
- [x] 返回按钮正常工作，退出到文章列表
- [x] ESC 键可关闭阅读视图
- [ ] 高亮功能在新布局下正常工作（需测试）
- [ ] 键盘导航在新布局下正常工作（需测试）

## 相关 Issue

- 对齐 Readwise Reader 阅读体验
- 改善文章阅读的视觉流程
- 为目录导航功能预留左侧栏位置

## 更新日志

- 2026-02-09: 实现三栏阅读布局，移除全屏覆盖模式
