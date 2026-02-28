# 研究空间内联阅读器架构设计

## 概述

在研究空间中，用户点击源材料列表的文章（或 AI 对话中的引用）后，右侧栏（StudioPanel 位置）替换为对应类型的阅读器组件，支持就地阅读。点击返回恢复为 StudioPanel。

阅读器完全复用现有的阅读能力（翻译、高亮、批注、AI 对话、思维导图等），通过高度抽象的注册表模式支持文章、视频、播客、书籍、笔记等多种内容类型。

## 核心架构：容器组件 + 内容类型注册表

### 内容类型注册表

```typescript
type ContentType = 'article' | 'video' | 'podcast' | 'book' | 'note';

interface ReaderComponentProps {
  contentId: string;       // 内容 ID
  onClose: () => void;     // 返回回调
  embedded?: boolean;      // 嵌入模式标志
}

const READER_REGISTRY: Record<ContentType, React.ComponentType<ReaderComponentProps>> = {
  article: ArticleReaderCore,
  video: VideoReaderCore,
  podcast: PodcastReaderCore,
  book: BookReaderCore,
  note: NoteReaderCore,
};
```

新增内容类型只需在注册表添加一行映射。`embedded` 参数让阅读器核心区分嵌入模式和全屏模式。

## ReaderView 拆分策略

**不破坏现有 ReaderView**，从中提取内容渲染核心。

```
现有 ReaderView（保持不变，全屏阅读时使用）
  ├── 全屏外壳（工具栏 + TOC + 面板布局）
  └── 内容渲染核心逻辑 ← 提取

提取为 ArticleReaderCore：
  ├── 文章内容 HTML 渲染
  ├── 高亮引擎绑定 + AnnotationLayer
  ├── 翻译注入
  ├── 工具栏（高亮/翻译/设置按钮）
  ├── 阅读进度追踪
  └── 浮层侧边栏触发器

原有 ReaderView 重构为：
  ReaderView = 全屏外壳 + ArticleReaderCore
```

## 状态管理和数据流

### ResearchLayout 新增状态

```
readingItem: { type: ContentType, id: string } | null

null → 右侧渲染 StudioPanel（默认）
{ type, id } → 右侧渲染 ResearchReader
```

### 触发来源

1. **SourcesPanel**：点击文章标题区域 → `onOpenReader(articleId, mediaType)`
2. **ResearchChat**：AI 引用块上的"阅读原文" → `onOpenReader(articleId, mediaType)`

### 返回行为

ResearchReader 的 `onClose` → `setReadingItem(null)` → 恢复 StudioPanel

### 组件层级

```tsx
<ResearchLayout>
  <SourcesPanel onOpenReader={(id, type) => setReadingItem({ type, id })} />
  <ResearchChat onOpenReader={(id, type) => setReadingItem({ type, id })} />
  {readingItem ? (
    <ResearchReader
      contentType={readingItem.type}
      contentId={readingItem.id}
      onClose={() => setReadingItem(null)}
    />
  ) : (
    <StudioPanel />
  )}
</ResearchLayout>
```

## 浮层侧边栏设计

嵌入模式下，ReaderDetailPanel 的功能通过浮层侧边栏展示：

```
ArticleReaderCore（嵌入模式）
├── 顶部：返回按钮 + 文章标题 + 工具按钮组
│   └── [笔记] [翻译] [AI] [思维导图] [设置]
├── 正文区域：文章 HTML + 高亮 + 翻译 + 批注
└── 浮层侧边栏（Slide-over panel）
    └── ReaderDetailPanel 的各 Tab 内容
```

### 浮层交互

- **触发**：工具栏按钮点击 → 展开浮层并切到对应 Tab
- **高亮**：高亮文本后 → 自动展开笔记 Tab
- **关闭**：ESC 或点击遮罩
- **宽度**：min(360px, 面板宽度的 80%)
- **动画**：从右侧滑入，150ms ease-out，半透明遮罩

## SourcesPanel 点击行为

| 区域 | 行为 |
|------|------|
| 复选框 | 切换启用/禁用（不打开阅读器） |
| 文章标题区域 | 打开阅读器 |

视觉区分：
- 标题区域：cursor:pointer，hover 下划线
- 正在阅读的文章：蓝色左边框高亮

## ResearchChat 引用触发

- 引用块 hover 时显示"阅读原文"按钮
- 点击引用块标题 → 打开对应阅读器

## 文件变更清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/renderer/components/reader/ArticleReaderCore.tsx` | 从 ReaderView 提取的文章阅读核心 |
| `src/renderer/components/reader/ReaderRegistry.ts` | 内容类型注册表 |
| `src/renderer/components/reader/ReaderSlidePanel.tsx` | 浮层侧边栏容器 |
| `src/renderer/components/research/ResearchReader.tsx` | 研究空间阅读器容器 |

### 修改

| 文件 | 变更 |
|------|------|
| `ReaderView.tsx` | 内部改为使用 ArticleReaderCore，对外接口不变 |
| `research/ResearchLayout.tsx` | 新增 readingItem 状态，右侧条件渲染 |
| `research/SourcesPanel.tsx` | 标题区域增加打开阅读器回调 |
| `research/ResearchChat.tsx` | 引用块增加打开阅读器交互 |

## 实施分期

**第一阶段**：实现 article 类型的内联阅读器，包括完整的翻译、高亮、批注等功能复用。

**后续阶段**：在注册表中补充 video、podcast、book、note 类型的阅读器核心组件。
