# 研究空间内联阅读器 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在研究空间右侧栏实现内联阅读器，点击源材料即可就地阅读，完全复用现有阅读器的翻译、高亮、批注等能力。

**Architecture:** 从现有 ReaderView (~1300 行) 提取内容渲染核心为 ArticleReaderCore 组件，通过内容类型注册表（ReaderRegistry）支持多种内容类型的分发。ResearchLayout 新增 readingItem 状态，控制右侧栏在 StudioPanel 和阅读器之间切换。辅助功能通过浮层侧边栏（ReaderSlidePanel）展示。

**Tech Stack:** React + TypeScript + Tailwind CSS，复用 highlight-engine / translation-injector / AnnotationLayer / ReaderDetailPanel

**Design Doc:** `docs/plans/2026-02-28-research-inline-reader-design.md`

---

### Task 1: 创建 ReaderRegistry 内容类型注册表

**Files:**
- Create: `src/renderer/components/reader/ReaderRegistry.ts`

**Step 1: 创建注册表文件**

```typescript
// src/renderer/components/reader/ReaderRegistry.ts
import type { ComponentType } from 'react';

/** 支持的内容类型 */
export type ContentType = 'article' | 'video' | 'podcast' | 'book' | 'note';

/** 所有阅读器组件的统一 Props 接口 */
export interface ReaderComponentProps {
  /** 内容 ID（articleId / bookId 等） */
  contentId: string;
  /** 返回/关闭回调 */
  onClose: () => void;
  /** 是否嵌入模式（区别于全屏模式） */
  embedded?: boolean;
}

/** 内容类型 → 阅读器组件 的注册表 */
const registry = new Map<ContentType, ComponentType<ReaderComponentProps>>();

/** 注册一个阅读器组件 */
export function registerReader(type: ContentType, component: ComponentType<ReaderComponentProps>) {
  registry.set(type, component);
}

/** 获取指定类型的阅读器组件，未注册则返回 undefined */
export function getReader(type: ContentType): ComponentType<ReaderComponentProps> | undefined {
  return registry.get(type);
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/reader/ReaderRegistry.ts
git commit -m "feat(reader): 创建内容类型注册表 ReaderRegistry"
```

---

### Task 2: 创建 ReaderSlidePanel 浮层侧边栏

**Files:**
- Create: `src/renderer/components/reader/ReaderSlidePanel.tsx`

**Step 1: 创建浮层侧边栏组件**

```tsx
// src/renderer/components/reader/ReaderSlidePanel.tsx
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ReaderSlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ReaderSlidePanel({ open, onClose, title, children }: ReaderSlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        className="absolute top-0 right-0 h-full z-50 bg-[#141414] border-l border-white/10 shadow-2xl flex flex-col"
        style={{
          width: 'min(360px, 80%)',
          animation: 'slideInRight 150ms ease-out',
        }}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between px-3 h-10 border-b border-white/10">
            <span className="text-xs font-medium text-gray-300">{title}</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/reader/ReaderSlidePanel.tsx
git commit -m "feat(reader): 创建浮层侧边栏组件 ReaderSlidePanel"
```

---

### Task 3: 提取 ArticleReaderCore 组件

这是最核心的 Task。从现有 ReaderView.tsx (~1337 行) 提取内容渲染核心为独立组件。

**Files:**
- Create: `src/renderer/components/reader/ArticleReaderCore.tsx`
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 创建 ArticleReaderCore**

从 `ReaderView.tsx` 提取以下逻辑到 `ArticleReaderCore.tsx`：

**包含的逻辑（从 ReaderView 复制）：**
- 所有 state（article、highlights、toolbar、translationData 等）
- 所有数据加载逻辑（文章加载、高亮加载、翻译加载）
- 高亮引擎绑定（applyHighlights、handleCreateHighlight、handleDeleteHighlight）
- 翻译触发/进度监听（handleTranslate、翻译进度监听 useEffect）
- 划词翻译（handleSelectionTranslate）
- 鼠标交互（handleMouseUp）
- 注释层回调（handleSaveNote、handleAnnotationTag*）
- 阅读进度追踪
- 段落焦点逻辑
- 键盘快捷键（部分调整）

**Props 接口：**

```typescript
interface ArticleReaderCoreProps {
  contentId: string;
  onClose: () => void;
  embedded?: boolean;
}
```

**布局区别（根据 embedded 参数）：**

**embedded=false（全屏模式，即原有 ReaderView 的行为）：**
- 三栏布局：左侧 TOC + 中间正文 + 右侧 ReaderDetailPanel
- `[` / `]` 键控制侧栏折叠

**embedded=true（嵌入模式，研究空间使用）：**
- 单栏布局：顶部工具栏 + 正文区域
- 无左侧 TOC 栏
- ReaderDetailPanel 通过 ReaderSlidePanel 浮层展示
- 工具栏按钮点击 → 打开浮层并切到对应 Tab

**具体操作：**

1. 复制 `ReaderView.tsx` 的全部内容到 `ArticleReaderCore.tsx`
2. 修改组件名称为 `ArticleReaderCore`
3. 修改 Props 接口：`articleId` → `contentId`，新增 `embedded`
4. 在 return 的 JSX 部分，根据 `embedded` 条件渲染：
   - `embedded=true`：不渲染左侧 TOC 栏，不渲染右侧 ReaderDetailPanel；改为在正文区域上方放工具栏按钮，ReaderDetailPanel 放入 ReaderSlidePanel
   - `embedded=false`：保持原有三栏布局
5. 新增浮层相关 state：`slidePanelOpen` 和 `slidePanelTab`
6. 注册到 ReaderRegistry

**嵌入模式 JSX 结构（核心部分）：**

```tsx
if (embedded) {
  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* 顶部工具栏 */}
      <div className="shrink-0 flex items-center justify-between px-3 h-10 border-b border-[#262626]">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="返回">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 truncate">{article?.title ?? '加载中…'}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* 翻译按钮 */}
          <button onClick={() => handleTranslate(defaultTargetLang)} className={...} title={...}>
            <Languages className="w-3.5 h-3.5" />
          </button>
          {/* 笔记按钮 */}
          <button onClick={() => openSlidePanel('notebook')} className={...} title="笔记">
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          {/* AI 对话按钮 */}
          <button onClick={() => openSlidePanel('chat')} className={...} title="AI 对话">
            <MessageSquareText className="w-3.5 h-3.5" />
          </button>
          {/* 翻译学习按钮 */}
          <button onClick={() => openSlidePanel('learn')} className={...} title="语言学习">
            <Languages className="w-3.5 h-3.5" />
          </button>
          {/* 设置按钮 */}
          <button onClick={() => setSettingsOpen(!settingsOpen)} className={...} title="排版设置">
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 阅读进度条 */}
      <div className="shrink-0 h-[2px] bg-white/5">
        <div className="h-full bg-blue-500 transition-[width] duration-300" style={{ width: `${Math.round(readProgress * 100)}%` }} />
      </div>

      {/* 排版设置 */}
      <ReaderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={readerSettings} onSettingsChange={setReaderSettings} />

      {/* 正文区域 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* ...正文渲染逻辑，与全屏模式完全相同... */}
      </div>

      {/* 悬浮工具栏 */}
      {toolbar && (/* ...与全屏模式相同... */)}

      {/* 浮层侧边栏 */}
      <ReaderSlidePanel open={slidePanelOpen} onClose={() => setSlidePanelOpen(false)}>
        <ReaderDetailPanel
          articleId={contentId}
          highlights={highlights}
          onHighlightsChange={setHighlights}
          onDeleteHighlight={handleDeleteHighlight}
          onHighlightClick={handleHighlightNavigate}
          forceTab={forceTab}
          readProgress={readProgress}
          selectionTranslationRefresh={selectionTranslationRefresh}
          focusTranslationId={focusTranslationId}
          onLocateTranslation={handleLocateTranslation}
          onTranslationDeleted={(id, _sourceText) => setSelectionTranslations(prev => prev.filter(t => t.id !== id))}
        />
      </ReaderSlidePanel>

      {/* 分享卡片 */}
      {article && <ShareCardModal ... />}
    </div>
  );
}
```

**Step 2: 重构 ReaderView 使用 ArticleReaderCore**

将 `ReaderView.tsx` 简化为薄壳组件：

```tsx
// src/renderer/components/ReaderView.tsx
import { ArticleReaderCore } from './reader/ArticleReaderCore';

interface ReaderViewProps {
  articleId: string;
  onClose: () => void;
}

export function ReaderView({ articleId, onClose }: ReaderViewProps) {
  return <ArticleReaderCore contentId={articleId} onClose={onClose} embedded={false} />;
}
```

**Step 3: 注册 ArticleReaderCore**

在 `ArticleReaderCore.tsx` 底部添加：

```typescript
import { registerReader } from './ReaderRegistry';
registerReader('article', ArticleReaderCore);
```

**Step 4: 验证**

- 运行 `pnpm start`
- 在阅读模式下打开任意文章，确认全屏阅读器的所有功能正常（翻译、高亮、批注、TOC、快捷键等）
- 确认没有任何回归

**Step 5: 提交**

```bash
git add src/renderer/components/reader/ArticleReaderCore.tsx src/renderer/components/ReaderView.tsx
git commit -m "refactor(reader): 从 ReaderView 提取 ArticleReaderCore，支持嵌入模式"
```

---

### Task 4: 创建 ResearchReader 容器组件

**Files:**
- Create: `src/renderer/components/research/ResearchReader.tsx`

**Step 1: 创建容器组件**

```tsx
// src/renderer/components/research/ResearchReader.tsx
import type { ContentType } from '../reader/ReaderRegistry';
import { getReader } from '../reader/ReaderRegistry';

// 确保 article reader 已注册
import '../reader/ArticleReaderCore';

interface ResearchReaderProps {
  contentType: ContentType;
  contentId: string;
  onClose: () => void;
}

export function ResearchReader({ contentType, contentId, onClose }: ResearchReaderProps) {
  const ReaderComponent = getReader(contentType);

  if (!ReaderComponent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">暂不支持 {contentType} 类型的阅读器</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <ReaderComponent contentId={contentId} onClose={onClose} embedded={true} />
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/research/ResearchReader.tsx
git commit -m "feat(research): 创建 ResearchReader 容器组件"
```

---

### Task 5: 修改 ResearchLayout 支持阅读器切换

**Files:**
- Modify: `src/renderer/components/research/ResearchLayout.tsx`

**Step 1: 新增 readingItem 状态和右侧条件渲染**

在 `ResearchLayout.tsx` 中：

1. 导入 ResearchReader 和 ContentType：
```typescript
import { ResearchReader } from './ResearchReader';
import type { ContentType } from '../reader/ReaderRegistry';
```

2. 新增 state：
```typescript
const [readingItem, setReadingItem] = useState<{ type: ContentType; id: string } | null>(null);
```

3. 新增 handler：
```typescript
const handleOpenReader = useCallback((id: string, type: ContentType) => {
  setReadingItem({ type, id });
}, []);

const handleCloseReader = useCallback(() => {
  setReadingItem(null);
}, []);
```

4. 修改 SourcesPanel，传入 `onOpenReader` 和 `readingArticleId`：
```tsx
<SourcesPanel
  spaces={spaces}
  activeSpaceId={activeSpaceId}
  onSpaceChange={setActiveSpaceId}
  onSpacesChanged={loadSpaces}
  onSourcesChanged={() => setSourceRefreshKey(k => k + 1)}
  onOpenReader={handleOpenReader}
  readingArticleId={readingItem?.id ?? null}
/>
```

5. 修改 ResearchChat，传入 `onOpenReader`：
```tsx
<ResearchChat
  spaceId={activeSpaceId}
  sourceRefreshKey={sourceRefreshKey}
  onArtifactCreated={handleArtifactCreated}
  pendingPrompt={pendingPrompt}
  onPendingPromptHandled={() => setPendingPrompt(null)}
  onOpenReader={handleOpenReader}
/>
```

6. 右侧区域条件渲染：
```tsx
{readingItem ? (
  <ResearchReader
    contentType={readingItem.type}
    contentId={readingItem.id}
    onClose={handleCloseReader}
  />
) : !studioCollapsed ? (
  <StudioPanel
    spaceId={activeSpaceId}
    refreshKey={artifactRefreshKey}
    onSendPrompt={setPendingPrompt}
  />
) : null}
```

**Step 2: 验证**

- 运行 `pnpm start`
- 切换到研究模式，确认 StudioPanel 仍正常显示
- 此时 SourcesPanel 和 ResearchChat 还没有触发逻辑，先确认不报错

**Step 3: 提交**

```bash
git add src/renderer/components/research/ResearchLayout.tsx
git commit -m "feat(research): ResearchLayout 支持右侧栏阅读器切换"
```

---

### Task 6: 修改 SourcesPanel 支持打开阅读器

**Files:**
- Modify: `src/renderer/components/research/SourcesPanel.tsx`

**Step 1: 扩展 Props 接口**

```typescript
import type { ContentType } from '../reader/ReaderRegistry';

interface SourcesPanelProps {
  spaces: ResearchSpace[];
  activeSpaceId: string | null;
  onSpaceChange: (id: string | null) => void;
  onSpacesChanged: () => void;
  onSourcesChanged?: () => void;
  onOpenReader?: (id: string, type: ContentType) => void;
  readingArticleId?: string | null;
}
```

**Step 2: 修改资源列表项的渲染**

将现有的源材料列表项中的标题区域改为可点击。当前 `SourcesPanel.tsx:176-200` 的列表项结构需要修改：

原来标题是 `<span>` 元素，改为：
- 标题区域 `<button>` 点击 → 调用 `onOpenReader(source.sourceId, 'article')`
- 复选框点击 → 保持原有 `handleToggleSource` 逻辑（stopPropagation）
- 正在阅读的文章左边框高亮

```tsx
{sources.map(source => (
  <div
    key={source.id}
    className={`group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-sm ${
      readingArticleId === source.sourceId ? 'border-l-2 border-blue-500 bg-white/5' : ''
    }`}
  >
    <button
      onClick={(e) => { e.stopPropagation(); handleToggleSource(source.id); }}
      className={`w-3 h-3 rounded-sm border shrink-0 ${
        source.enabled ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
      }`}
    />
    <button
      onClick={() => onOpenReader?.(source.sourceId, 'article')}
      className={`flex-1 truncate text-left hover:underline cursor-pointer ${
        source.enabled ? 'text-gray-300' : 'text-gray-500'
      }`}
    >
      {source.sourceTitle || source.sourceId}
    </button>
    <IndexStatusIndicator
      status={source.processingStatus}
      onReindex={() => handleReindex(source.id)}
    />
    <button
      onClick={() => handleRemoveSource(source.id)}
      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
    >
      {'\u2715'}
    </button>
  </div>
))}
```

**Step 3: 验证**

- 运行 `pnpm start`
- 切换到研究模式，选择一个有源材料的空间
- 点击文章标题 → 右侧栏应切换为阅读器
- 点击复选框 → 应只切换启用/禁用状态，不打开阅读器
- 正在阅读的文章应有蓝色左边框
- 点击阅读器返回按钮 → 右侧栏恢复为 StudioPanel

**Step 4: 提交**

```bash
git add src/renderer/components/research/SourcesPanel.tsx
git commit -m "feat(research): SourcesPanel 支持点击文章标题打开阅读器"
```

---

### Task 7: 修改 ResearchChat 支持引用跳转

**Files:**
- Modify: `src/renderer/components/research/ResearchChat.tsx`

**Step 1: 扩展 Props 接口**

```typescript
import type { ContentType } from '../reader/ReaderRegistry';

interface ResearchChatProps {
  spaceId: string | null;
  sourceRefreshKey?: number;
  onArtifactCreated?: () => void;
  pendingPrompt?: string | null;
  onPendingPromptHandled?: () => void;
  onOpenReader?: (id: string, type: ContentType) => void;
}
```

**Step 2: 在 AI 助手消息中添加"阅读原文"入口**

AI 回复中的 MarkdownRenderer 渲染后，我们需要在回复底部或引用位置添加可点击的源材料链接。

具体方案：在助手消息渲染区域底部，如果消息中引用了源材料（通过检测 sources 中的标题是否出现在消息内容中），显示"引用来源"区域，每个来源标题可点击打开阅读器。

在 messages 渲染的助手消息部分（`ResearchChat.tsx:291-295`），添加引用来源区域：

```tsx
{msg.role === 'assistant' && (
  <div className="max-w-[85%]">
    <div className="px-3 py-2 rounded-lg text-sm leading-relaxed bg-white/5 text-gray-200">
      <MarkdownRenderer content={msg.content} className="text-[13px]" />
    </div>
    {/* 引用来源 */}
    <SourceLinks
      content={msg.content}
      sources={sources}
      onOpenReader={onOpenReader}
    />
  </div>
)}
```

新增 SourceLinks 子组件（在同文件内）：

```tsx
function SourceLinks({
  content,
  sources,
  onOpenReader,
}: {
  content: string;
  sources: ResearchSpaceSource[];
  onOpenReader?: (id: string, type: ContentType) => void;
}) {
  // 简单匹配：检查消息中是否包含源材料标题
  const mentionedSources = sources.filter(
    s => s.sourceTitle && content.includes(s.sourceTitle)
  );
  if (mentionedSources.length === 0 || !onOpenReader) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {mentionedSources.map(s => (
        <button
          key={s.id}
          onClick={() => onOpenReader(s.sourceId, 'article')}
          className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline px-1.5 py-0.5 rounded bg-white/5"
        >
          📄 {s.sourceTitle}
        </button>
      ))}
    </div>
  );
}
```

**Step 3: 验证**

- 运行 `pnpm start`
- 在研究空间中与 AI 对话，AI 引用源材料后消息下方应出现来源链接
- 点击来源链接 → 右侧栏切换为阅读器

**Step 4: 提交**

```bash
git add src/renderer/components/research/ResearchChat.tsx
git commit -m "feat(research): ResearchChat 支持引用来源打开阅读器"
```

---

### Task 8: 端到端验证和 lint 检查

**Step 1: 运行 lint**

```bash
pnpm lint
```

修复所有 lint 错误。

**Step 2: 全功能验证**

逐一验证以下场景：

1. **阅读模式全屏阅读器**（回归测试）：
   - 打开文章 → ReaderView 正常
   - 高亮、翻译、批注、TOC、快捷键全部正常
   - `[` / `]` 键控制侧栏折叠正常

2. **研究空间 SourcesPanel 触发**：
   - 点击文章标题 → 右侧栏切换为阅读器
   - 复选框仍正常切换启用/禁用
   - 正在阅读的文章有蓝色左边框

3. **研究空间阅读器功能**：
   - 文章正文正常渲染
   - 高亮选中文本 → 工具栏弹出 → 创建高亮
   - 翻译按钮 → 全文翻译正常
   - 划词翻译正常
   - 工具栏按钮点击 → 浮层侧边栏弹出
   - 浮层中笔记、AI 对话、思维导图、语言学习 Tab 正常
   - ESC 关闭浮层
   - 点击遮罩关闭浮层

4. **返回行为**：
   - 点击返回按钮 → 右侧栏恢复为 StudioPanel
   - ESC 键 → 如有浮层先关闭浮层，无浮层则返回

5. **ResearchChat 引用触发**：
   - AI 回复中引用源材料 → 显示来源链接
   - 点击来源链接 → 打开阅读器

**Step 3: 修复发现的问题**

根据验证结果修复任何问题。

**Step 4: 提交最终修复**

```bash
git add -A
git commit -m "fix(research): 修复内联阅读器端到端验证问题"
```

---

### Task 9: 沉淀文档

**Files:**
- Create: `docs/research-inline-reader.md`

**Step 1: 编写功能文档**

记录实现总结：架构决策、核心组件、扩展方式（如何新增内容类型）、已知限制。

**Step 2: 提交**

```bash
git add docs/research-inline-reader.md
git commit -m "docs: 研究空间内联阅读器功能文档"
```

---

### Task 10: 更新 Linear issue

使用 Linear MCP 将相关 issue 状态更新为 Done，添加完成 comment。
