# 研究系统 Phase 1 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 搭建研究系统骨架，实现 Activity Rail Bar 模式切换、研究空间 CRUD、从阅读库导入文章、基于现有 RAG 的检索增强问答、基础产物生成（报告 + 对比矩阵）。

**Architecture:** 在 App.tsx 外层新增 48px Activity Rail Bar 做模式切换。阅读模式保持现有代码不动，研究模式渲染独立的三栏布局（SourcesPanel + ResearchChat + StudioPanel）。后端扩展 AgentService 注册 research 模块，通过 Tool Calling 调用现有 HybridRetriever 实现检索增强问答。

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS + Drizzle ORM + SQLite + Vercel AI SDK v6 + sqlite-vec

**Design Doc:** `docs/plans/2026-02-26-research-system-design.md`

---

## Task 1: 数据库 Schema — 新增研究系统表

**Files:**
- Modify: `src/main/db/schema.ts:299` (在文件末尾追加)

**Step 1: 在 schema.ts 末尾新增 4 张表**

```typescript
// ==================== research_spaces 研究空间表 ====================
export const researchSpaces = sqliteTable('research_spaces', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon').default('FlaskConical'),
  status: text('status').default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});

// ==================== research_space_sources 空间-资源关联表 ====================
export const researchSpaceSources = sqliteTable('research_space_sources', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  enabled: integer('enabled').default(1),
  summaryCache: text('summary_cache'),
  processingStatus: text('processing_status').default('pending'),
  addedAt: text('added_at').notNull(),
});

// ==================== research_conversations 研究对话表 ====================
export const researchConversations = sqliteTable('research_conversations', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull(),
  title: text('title'),
  messages: text('messages'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==================== research_artifacts 研究产物表 ====================
export const researchArtifacts = sqliteTable('research_artifacts', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  prompt: text('prompt'),
  pinned: integer('pinned').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedFlg: integer('deleted_flg').default(0),
});
```

**Step 2: 验证应用能正常启动**

Run: `npm run dev`
Expected: 应用正常启动，Drizzle 自动创建新表（项目使用 push 模式）

**Step 3: Commit**

```
feat(research): add database schema for research system

Add 4 new tables: research_spaces, research_space_sources,
research_conversations, research_artifacts
```

---

## Task 2: IPC 通道 + 类型定义

**Files:**
- Modify: `src/shared/ipc-channels.ts:251` (在 `} as const;` 之前追加)
- Modify: `src/shared/types.ts` (新增研究系统类型 + 扩展 AgentPageSpecificState + 扩展 ElectronAPI)

**Step 1: 在 ipc-channels.ts 中新增研究系统通道**

在第 250 行（`EMBEDDING_CONFIG_SET` 后面）插入：

```typescript
  // Research (研究系统)
  RESEARCH_SPACE_CREATE: 'research:space:create',
  RESEARCH_SPACE_LIST: 'research:space:list',
  RESEARCH_SPACE_GET: 'research:space:get',
  RESEARCH_SPACE_UPDATE: 'research:space:update',
  RESEARCH_SPACE_DELETE: 'research:space:delete',
  RESEARCH_SOURCE_ADD: 'research:source:add',
  RESEARCH_SOURCE_REMOVE: 'research:source:remove',
  RESEARCH_SOURCE_TOGGLE: 'research:source:toggle',
  RESEARCH_SOURCE_LIST: 'research:source:list',
  RESEARCH_CONVERSATION_LIST: 'research:conversation:list',
  RESEARCH_CONVERSATION_DELETE: 'research:conversation:delete',
  RESEARCH_ARTIFACT_LIST: 'research:artifact:list',
  RESEARCH_ARTIFACT_GET: 'research:artifact:get',
  RESEARCH_ARTIFACT_DELETE: 'research:artifact:delete',
  RESEARCH_ARTIFACT_EXPORT: 'research:artifact:export',
```

**Step 2: 在 types.ts 中新增研究系统类型**

在文件末尾（约第 1463 行之后）追加：

```typescript
// ==================== Research (研究系统) 类型 ====================

export interface ResearchSpace {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchSpaceInput {
  title: string;
  description?: string;
  icon?: string;
}

export interface UpdateResearchSpaceInput {
  id: string;
  title?: string;
  description?: string;
  icon?: string;
  status?: string;
}

export interface ResearchSpaceSource {
  id: string;
  spaceId: string;
  sourceType: string;
  sourceId: string;
  enabled: number;
  processingStatus: string;
  addedAt: string;
  // 联查字段
  sourceTitle?: string;
}

export interface AddResearchSourceInput {
  spaceId: string;
  sourceType: string;
  sourceId: string;
}

export interface ResearchConversation {
  id: string;
  spaceId: string;
  title: string | null;
  messages: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResearchArtifactType = 'report' | 'comparison' | 'summary' | 'faq' | 'mindmap' | 'knowledge_graph' | 'timeline';

export interface ResearchArtifact {
  id: string;
  spaceId: string;
  type: ResearchArtifactType;
  title: string;
  content: string | null;
  prompt: string | null;
  pinned: number;
  createdAt: string;
  updatedAt: string;
}
```

**Step 3: 扩展 AgentPageSpecificState**

在 `src/shared/types.ts:594`（`| { page: 'manage-feeds'; ... }` 之后）插入新的联合类型成员：

```typescript
  | { page: 'research'; spaceId: string | null; sourceCount: number; enabledSourceCount: number }
```

**Step 4: 扩展 ElectronAPI 接口**

在 `src/shared/types.ts` 的 `ElectronAPI` 接口中（约第 1140 行，`embeddingConfigSet` 之后）追加：

```typescript
  // Research (研究系统)
  researchSpaceCreate: (input: CreateResearchSpaceInput) => Promise<ResearchSpace>;
  researchSpaceList: () => Promise<ResearchSpace[]>;
  researchSpaceGet: (id: string) => Promise<ResearchSpace | null>;
  researchSpaceUpdate: (input: UpdateResearchSpaceInput) => Promise<ResearchSpace>;
  researchSpaceDelete: (id: string) => Promise<void>;
  researchSourceAdd: (input: AddResearchSourceInput) => Promise<ResearchSpaceSource>;
  researchSourceRemove: (id: string) => Promise<void>;
  researchSourceToggle: (id: string) => Promise<ResearchSpaceSource>;
  researchSourceList: (spaceId: string) => Promise<ResearchSpaceSource[]>;
  researchConversationList: (spaceId: string) => Promise<ResearchConversation[]>;
  researchConversationDelete: (id: string) => Promise<void>;
  researchArtifactList: (spaceId: string) => Promise<ResearchArtifact[]>;
  researchArtifactGet: (id: string) => Promise<ResearchArtifact | null>;
  researchArtifactDelete: (id: string) => Promise<void>;
  researchArtifactExport: (id: string, format: 'markdown' | 'json') => Promise<string>;
```

**Step 5: Commit**

```
feat(research): add IPC channels and type definitions

Add research system IPC channels, type interfaces, extend
AgentPageSpecificState with research page, extend ElectronAPI
```

---

## Task 3: IPC Handlers — 研究空间与资源 CRUD

**Files:**
- Create: `src/main/ipc/research-handlers.ts`
- Modify: `src/main/ipc/index.ts` (注册新 handler)

**Step 1: 创建 research-handlers.ts**

实现研究空间 CRUD + 资源管理 IPC handlers。参照现有 handler 模式（如 `article-handlers.ts`），使用 `ipcMain.handle` 处理同步请求。

关键逻辑：
- `RESEARCH_SPACE_CREATE`: nanoid 生成 ID，INSERT 到 research_spaces
- `RESEARCH_SPACE_LIST`: SELECT WHERE deleted_flg = 0 ORDER BY updated_at DESC
- `RESEARCH_SPACE_DELETE`: 软删除 deleted_flg = 1
- `RESEARCH_SOURCE_ADD`: INSERT 到 research_space_sources，检查是否已被 RAG 索引，如未索引则触发 RAG ingest
- `RESEARCH_SOURCE_REMOVE`: DELETE FROM research_space_sources WHERE id = ?
- `RESEARCH_SOURCE_TOGGLE`: 切换 enabled 字段
- `RESEARCH_SOURCE_LIST`: SELECT 联查文章/书籍标题
- `RESEARCH_ARTIFACT_*`: 基础 CRUD

**Step 2: 在 index.ts 中注册**

在 `src/main/ipc/index.ts` 中新增：
```typescript
import { registerResearchHandlers } from './research-handlers';
// 在 registerAllIpcHandlers() 中添加：
registerResearchHandlers();
```

**Step 3: Commit**

```
feat(research): implement research IPC handlers

Add CRUD handlers for research spaces, sources, conversations,
and artifacts. Source import triggers RAG ingestion when needed.
```

---

## Task 4: Preload Bridge — 暴露研究系统 API

**Files:**
- Modify: `src/preload.ts` (在 electronAPI 对象中追加)

**Step 1: 追加研究系统 API 方法**

参照现有模式（如 `feedAdd: (input) => ipcRenderer.invoke(...)`），在 preload.ts 的 electronAPI 对象中追加所有研究系统方法。每个方法对应一个 IPC_CHANNELS 常量：

```typescript
  // Research (研究系统)
  researchSpaceCreate: (input) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SPACE_CREATE, input),
  researchSpaceList: () => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SPACE_LIST),
  researchSpaceGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SPACE_GET, id),
  researchSpaceUpdate: (input) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SPACE_UPDATE, input),
  researchSpaceDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SPACE_DELETE, id),
  researchSourceAdd: (input) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SOURCE_ADD, input),
  researchSourceRemove: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SOURCE_REMOVE, id),
  researchSourceToggle: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SOURCE_TOGGLE, id),
  researchSourceList: (spaceId) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_SOURCE_LIST, spaceId),
  researchConversationList: (spaceId) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_CONVERSATION_LIST, spaceId),
  researchConversationDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_CONVERSATION_DELETE, id),
  researchArtifactList: (spaceId) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_ARTIFACT_LIST, spaceId),
  researchArtifactGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_ARTIFACT_GET, id),
  researchArtifactDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_ARTIFACT_DELETE, id),
  researchArtifactExport: (id, format) => ipcRenderer.invoke(IPC_CHANNELS.RESEARCH_ARTIFACT_EXPORT, id, format),
```

**Step 2: Commit**

```
feat(research): expose research APIs in preload bridge
```

---

## Task 5: Agent 研究模块 — Tools + 模块注册

**Files:**
- Create: `src/ai/tools/research-tools.ts`
- Modify: `src/ai/tools/types.ts` (扩展 ToolContext)
- Modify: `src/ai/tools/index.ts` (注册 research tools)
- Modify: `src/ai/services/agent-service.ts:70-119` (新增 research 模块)
- Modify: `src/main/ai/tool-context-factory.ts` (实现新增的 ToolContext 方法)

**Step 1: 扩展 ToolContext 接口**

在 `src/ai/tools/types.ts` 的 `ToolContext` 接口中追加：

```typescript
  // ==================== 研究操作 ====================

  /** 在指定 sourceIds 范围内进行混合检索 */
  searchResearchSources: (query: string, sourceIds: string[], topK?: number) => Promise<{
    text: string;
    references: Array<{ sourceType: string; sourceId: string; title: string | null; chunkIndex: number }>;
    tokenCount: number;
  }>;

  /** 获取源材料摘要（标题 + 前 500 字） */
  getSourceSummary: (sourceType: string, sourceId: string) => Promise<{
    title: string;
    summary: string;
    wordCount: number;
  } | null>;

  /** 获取研究空间内所有启用的 sourceIds */
  getResearchSpaceSourceIds: (spaceId: string) => Promise<string[]>;

  /** 保存研究产物到数据库 */
  saveResearchArtifact: (input: {
    spaceId: string;
    type: string;
    title: string;
    content: string;
    prompt?: string;
  }) => Promise<{ id: string }>;
```

**Step 2: 创建 research-tools.ts**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

export function createResearchTools(ctx: ToolContext) {
  return {
    search_research_sources: tool({
      description: '在当前研究空间的源材料中搜索相关内容。返回带引用编号的相关文本片段。',
      inputSchema: z.object({
        query: z.string().describe('搜索查询'),
        topK: z.number().optional().default(10).describe('返回结果数量'),
      }),
      execute: async ({ query, topK }) => {
        // spaceId 通过 system prompt 上下文传递给 LLM
        // 这里通过 ctx 获取
        const sourceIds = await ctx.getResearchSpaceSourceIds(ctx._researchSpaceId ?? '');
        if (sourceIds.length === 0) return { text: '当前空间没有启用的源材料。', references: [] };
        return ctx.searchResearchSources(query, sourceIds, topK);
      },
    }),

    get_source_summary: tool({
      description: '获取指定源材料的摘要信息（标题和内容概要）',
      inputSchema: z.object({
        sourceType: z.string().describe('源类型：article 或 book'),
        sourceId: z.string().describe('源 ID'),
      }),
      execute: async ({ sourceType, sourceId }) => {
        return ctx.getSourceSummary(sourceType, sourceId);
      },
    }),

    generate_artifact: tool({
      description: '生成研究产物（研究报告、对比矩阵、摘要、FAQ 等）并保存',
      inputSchema: z.object({
        type: z.enum(['report', 'comparison', 'summary', 'faq']).describe('产物类型'),
        title: z.string().describe('产物标题'),
        content: z.string().describe('产物内容（Markdown 或 JSON 字符串）'),
      }),
      execute: async ({ type, title, content }) => {
        const result = await ctx.saveResearchArtifact({
          spaceId: ctx._researchSpaceId ?? '',
          type,
          title,
          content,
        });
        return { success: true, artifactId: result.id, message: `已生成并保存产物「${title}」` };
      },
    }),
  };
}
```

**Step 3: 在 tools/index.ts 中注册**

```typescript
import { createResearchTools } from './research-tools';

export function createAllTools(ctx: ToolContext) {
  return {
    ...createArticleTools(ctx),
    ...createTagTools(ctx),
    ...createFeedTools(ctx),
    ...createHighlightTools(ctx),
    ...createResearchTools(ctx),  // 新增
  };
}
```

**Step 4: 在 agent-service.ts 中注册 research 模块**

在 `registerDefaultModules()` 方法的 `this.modules` 数组中追加：

```typescript
      {
        id: 'research',
        activeWhen: (vs) => vs.pageState.page === 'research',
        systemPromptSegment: `你是一个研究助手。你可以：
- 在源材料中搜索相关内容（所有回答必须带 [来源名称] 引用标注）
- 获取源材料的摘要信息
- 生成结构化产物（研究报告、对比矩阵、摘要、FAQ）

重要原则：
1. 所有回答必须基于源材料，不要凭空生成
2. 使用 [来源名称] 标注引用
3. 当源材料不足以回答时，明确告知用户
4. 生成对比矩阵时使用 JSON 格式，其他产物使用 Markdown 格式`,
        actionLevels: {
          search_research_sources: 'read',
          get_source_summary: 'read',
          generate_artifact: 'write',
        },
      },
```

**Step 5: 在 tool-context-factory.ts 中实现新方法**

需要在 `createToolContext()` 工厂函数中实现 `searchResearchSources`、`getSourceSummary`、`getResearchSpaceSourceIds`、`saveResearchArtifact`。

`searchResearchSources` 的核心逻辑：
1. 调用现有 `createHybridRetriever()` 创建 retriever
2. 调用 `retriever.search({ text: query, topK, filters: { sourceIds } })`
3. 调用现有 `createContextBuilder()` 组装上下文
4. 返回带引用的文本

**Step 6: Commit**

```
feat(research): add Agent research module with RAG-powered tools

Register research module in AgentService, create search/summary/artifact
tools, implement ToolContext methods bridging to existing RAG pipeline.
```

---

## Task 6: 前端 — Activity Rail Bar + 模块化 Shell

**Files:**
- Create: `src/renderer/components/ActivityRailBar.tsx`
- Modify: `src/renderer/App.tsx` (改造为 Shell 结构)

**Step 1: 创建 ActivityRailBar 组件**

48px 宽的图标导航栏，位于窗口最左侧：
- 两个图标按钮：📖 阅读 (BookOpen) / 🔬 研究 (FlaskConical)
- 选中态：图标高亮 + 左侧 3px 蓝色指示条
- 深色背景，tooltip 显示模式名称
- 底部固定设置入口（可选，Phase 1 可跳过）

```typescript
interface ActivityRailBarProps {
  activeMode: 'read' | 'research';
  onModeChange: (mode: 'read' | 'research') => void;
}
```

**Step 2: 改造 App.tsx**

在 AppContent 组件中：
1. 新增 `appMode` 状态: `const [appMode, setAppMode] = useState<'read' | 'research'>('read');`
2. 在现有布局外层包裹 Rail Bar：

```tsx
<div className="flex flex-col h-screen bg-[#0f0f0f] text-gray-200 overflow-hidden">
  <div className="h-[38px] shrink-0 drag-region flex items-center" />
  <div className="flex flex-1 min-h-0 overflow-hidden">
    <ActivityRailBar activeMode={appMode} onModeChange={setAppMode} />
    {appMode === 'read' ? (
      // 现有的所有阅读模式布局代码（保持不动）
      readerMode || bookReaderMode ? (
        // 阅读器代码...
      ) : (
        // 三栏布局代码...
      )
    ) : (
      <ResearchLayout />
    )}
  </div>
  {/* 弹窗、对话框等保持在外层 */}
</div>
```

注意：现有代码中 `readerMode` / `bookReaderMode` 的条件渲染逻辑需要嵌套在 `appMode === 'read'` 分支内。弹窗组件（CommandPalette、AddFeedDialog 等）保持在最外层不受 appMode 影响。

**Step 3: 更新 Agent 上下文上报**

在 App.tsx 的 `reportContext` useEffect 中，当 `appMode === 'research'` 时上报研究页面状态：

```typescript
if (appMode === 'research') {
  return { page: 'research' as const, spaceId: null, sourceCount: 0, enabledSourceCount: 0 };
}
```

**Step 4: Commit**

```
feat(research): add Activity Rail Bar and shell architecture

Add 48px rail bar for mode switching between read/research.
Restructure App.tsx layout to support modular content areas.
```

---

## Task 7: 前端 — ResearchLayout 三栏布局骨架

**Files:**
- Create: `src/renderer/components/research/ResearchLayout.tsx`
- Create: `src/renderer/components/research/SourcesPanel.tsx`
- Create: `src/renderer/components/research/ResearchChat.tsx`
- Create: `src/renderer/components/research/StudioPanel.tsx`

**Step 1: 创建 ResearchLayout**

研究模式的三栏布局容器：
- 左栏 (SourcesPanel): ~240px，可折叠
- 中栏 (ResearchChat): 自适应
- 右栏 (StudioPanel): ~320px，可折叠

```typescript
export function ResearchLayout() {
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SourcesPanel
        activeSpaceId={activeSpaceId}
        onSpaceChange={setActiveSpaceId}
      />
      <ResearchChat spaceId={activeSpaceId} />
      <StudioPanel spaceId={activeSpaceId} />
    </div>
  );
}
```

**Step 2: 创建 SourcesPanel（左栏骨架）**

空间管理 + 资源列表：
- 顶部：空间选择器（下拉列表 + 新建按钮）
- 中部：资源卡片列表（显示导入的文章/书籍，带状态指示）
- 底部：导入按钮 + 资源统计

Phase 1 MVP 功能：
- 空间下拉选择/新建/重命名
- 显示空间内的资源列表
- "添加文章"按钮打开导入对话框
- 每个资源卡片显示：标题、类型图标、processing_status

**Step 3: 创建 ResearchChat（中栏骨架）**

AI 对话区域：
- 对话消息列表（复用现有 ChatPanel 的消息渲染样式）
- 底部输入框
- 通过 Agent IPC 通道发送消息（复用 agentSend/agentOnStream）

Phase 1 MVP 功能：
- 发送消息 → agentSend（viewState.page = 'research', spaceId）
- 接收流式回答（agentOnStream）
- 显示 text-delta、tool-call、tool-result、done
- 空状态提示"请先创建研究空间并导入文章"

**Step 4: 创建 StudioPanel（右栏骨架）**

快捷工具 + 产物列表：
- 顶部：快捷工具栏（Phase 1 只放 2 个按钮：生成报告、生成对比矩阵）
- 中部：产物列表（卡片式，显示类型图标 + 标题 + 时间）
- 点击产物 → 在中栏全屏展示内容

Phase 1 MVP 功能：
- 产物列表展示
- 点击查看产物内容（Markdown 渲染 / JSON 表格渲染）
- 删除产物

**Step 5: Commit**

```
feat(research): implement three-panel research layout

Add ResearchLayout with SourcesPanel (space management + sources),
ResearchChat (AI conversation), and StudioPanel (tools + artifacts).
```

---

## Task 8: 前端 — 资源导入对话框

**Files:**
- Create: `src/renderer/components/research/ImportDialog.tsx`
- Modify: `src/renderer/components/research/SourcesPanel.tsx` (集成对话框)

**Step 1: 创建 ImportDialog**

从阅读库导入文章/书籍的对话框：
- 打开时加载用户的所有文章列表（调用 `articleList`）和书籍列表（调用 `bookList`）
- Tab 切换：文章 / 书籍
- 搜索/过滤功能
- 多选 checkbox
- 确认导入 → 对每个选中项调用 `researchSourceAdd`
- 导入后自动触发 RAG 索引（在 IPC handler 中处理）

**Step 2: 集成到 SourcesPanel**

SourcesPanel 的"添加文章"按钮 → 打开 ImportDialog → 导入完成后刷新资源列表

**Step 3: Commit**

```
feat(research): add article/book import dialog for research spaces
```

---

## Task 9: 前端 — ResearchChat 完整实现

**Files:**
- Modify: `src/renderer/components/research/ResearchChat.tsx` (完整对话实现)

**Step 1: 实现 Agent 流式对话**

核心逻辑（参照现有 `AgentDrawer.tsx:564行` 的实现模式）：
1. 用户输入消息 → 调用 `window.electronAPI.agentSend({ sessionId, message, viewState })`
2. 监听 `window.electronAPI.agentOnStream(callback)`
3. 处理 chunk 类型：`text-delta` 累积文本、`tool-call` 显示工具调用、`done` 完成
4. viewState 中传递 `{ page: 'research', spaceId, sourceCount, enabledSourceCount }`

**关键差异**（与现有 Agent 对话的区别）：
- viewState.pageState.page 设为 `'research'`
- 需要传递 spaceId 以便 Agent 模块知道当前空间
- 不使用浮动 AgentAssistant/AgentDrawer，而是内嵌在 ResearchLayout 中

**Step 2: 会话管理**

- 首次进入空间时自动创建 Agent 会话（agentSessionCreate）
- 支持多会话切换（可选，Phase 1 可简化为单会话）
- 消息持久化由 AgentService 自动处理

**Step 3: Commit**

```
feat(research): implement full research chat with Agent streaming

Integrate Agent IPC for RAG-powered conversation in research mode.
```

---

## Task 10: 前端 — StudioPanel 产物渲染

**Files:**
- Modify: `src/renderer/components/research/StudioPanel.tsx` (完整实现)
- Create: `src/renderer/components/research/ArtifactViewer.tsx`
- Create: `src/renderer/components/research/ComparisonTable.tsx`

**Step 1: 实现 ArtifactViewer**

根据产物类型分发到不同渲染器：
- `report` / `summary` / `faq` → Markdown 渲染（复用项目中已有的 Markdown 渲染能力）
- `comparison` → ComparisonTable 组件

**Step 2: 实现 ComparisonTable**

渲染 JSON 格式的对比矩阵：
```typescript
interface ComparisonData {
  dimensions: string[];
  items: Array<{ name: string; values: Record<string, string> }>;
}
```
渲染为 HTML 表格，支持横向滚动。

**Step 3: 实现快捷工具栏**

StudioPanel 顶部的按钮组：
- "生成研究报告" → 在 ResearchChat 中自动发送预设 prompt
- "生成对比矩阵" → 在 ResearchChat 中自动发送预设 prompt

点击按钮 → 向 ResearchChat 传递消息 → Agent 自动调用 `generate_artifact` tool → 产物保存后刷新产物列表

**Step 4: Commit**

```
feat(research): implement artifact viewer and comparison table

Add ArtifactViewer with Markdown rendering and ComparisonTable
component. Add quick tool buttons for report/comparison generation.
```

---

## Task 11: RAG 适配 — 确保关键词搜索支持 sourceIds 过滤

**Files:**
- Modify: `src/ai/services/retriever.ts` (keywordSearch 方法)

**Step 1: 审查 keywordSearch 的 sourceIds 过滤**

当前 `keywordSearch` 方法（约第 123-184 行）通过 `articles_fts` 搜索文章，然后获取其 chunks。如果传入了 `filters.sourceIds`，需要确保在 FTS5 搜索结果中按 sourceIds 过滤。

审查当前逻辑，如果 sourceIds 过滤未在关键词搜索路径中实现，则添加：
```typescript
// 在 keywordSearch 中获取 article IDs 后
if (filters?.sourceIds) {
  articleIds = articleIds.filter(id => filters.sourceIds!.includes(id));
}
```

**Step 2: 验证混合检索在限定 sourceIds 时正常工作**

**Step 3: Commit**

```
fix(rag): ensure keyword search respects sourceIds filter

Previously keyword search via FTS5 did not filter by sourceIds.
Now both vector and keyword paths honor the sourceIds filter.
```

---

## Task 12: Agent 上下文传递 — spaceId 注入

**Files:**
- Modify: `src/ai/services/agent-service.ts` (handleMessage 方法)
- Modify: `src/ai/tools/types.ts` (ToolContext 增加 _researchSpaceId)
- Modify: `src/main/ai/tool-context-factory.ts` (支持设置 spaceId)

**Step 1: 在 ToolContext 中增加 _researchSpaceId 字段**

```typescript
export interface ToolContext {
  // ... 现有方法 ...

  /** 当前研究空间 ID（仅在 research 模式下有值） */
  _researchSpaceId?: string;
}
```

**Step 2: 在 AgentService.handleMessage 中注入 spaceId**

在 `handleMessage` 方法中，当检测到 `viewState.pageState.page === 'research'` 时，将 spaceId 注入到 toolContext：

```typescript
// 在 handleMessage 中，构建 tools 之前
if (viewState.pageState.page === 'research' && 'spaceId' in viewState.pageState) {
  this.deps.toolContext._researchSpaceId = viewState.pageState.spaceId as string;
}
```

**Step 3: 在 buildSystemPrompt 中注入空间上下文**

当 page === 'research' 时，在 system prompt 中注入当前空间信息：

```typescript
if (viewState.pageState.page === 'research') {
  const ps = viewState.pageState as { spaceId: string | null; sourceCount: number; enabledSourceCount: number };
  prompt += `\n\n当前研究空间：${ps.spaceId ?? '未选择'}`;
  prompt += `\n源材料数量：${ps.sourceCount} 篇（${ps.enabledSourceCount} 篇已启用）`;
}
```

**Step 4: Commit**

```
feat(research): inject research space context into Agent pipeline

Pass spaceId through ToolContext and system prompt so research
tools can filter retrieval to the current space's sources.
```

---

## Task 13: 集成验证 — 端到端功能测试

**Step 1: 启动应用，验证 Activity Rail Bar**

Run: `npm run dev`
Expected:
- 左侧出现 48px Rail Bar，包含阅读和研究两个图标
- 点击切换模式，布局正确切换
- 阅读模式下所有现有功能正常工作

**Step 2: 验证研究空间 CRUD**

- 点击研究模式
- 创建一个新研究空间
- 重命名空间
- 验证空间列表正常显示

**Step 3: 验证资源导入**

- 点击"添加文章"
- 从阅读库中选择 3-5 篇文章导入
- 验证资源列表显示导入的文章
- 验证 processing_status 从 pending → ready

**Step 4: 验证 AI 对话**

- 在 ResearchChat 中提问关于导入文章的问题
- 验证 Agent 调用 search_research_sources 工具
- 验证回答基于源材料并带有引用标注
- 验证流式输出正常

**Step 5: 验证产物生成**

- 点击"生成研究报告"快捷工具
- 验证 Agent 生成 Markdown 报告并保存
- 验证产物列表中出现新报告
- 点击查看报告内容
- 测试对比矩阵生成

**Step 6: Commit**

```
feat(research): Phase 1 complete - research system MVP

Verified end-to-end: rail bar, space CRUD, article import,
RAG-powered chat, report/comparison artifact generation.
```

---

## 文件变更总览

### 新建文件 (6 个)
| 文件 | 说明 |
|------|------|
| `src/main/ipc/research-handlers.ts` | 研究系统 IPC handlers |
| `src/ai/tools/research-tools.ts` | 研究 Agent tools |
| `src/renderer/components/ActivityRailBar.tsx` | Rail Bar 导航组件 |
| `src/renderer/components/research/ResearchLayout.tsx` | 研究三栏布局 |
| `src/renderer/components/research/SourcesPanel.tsx` | 左栏：空间+资源 |
| `src/renderer/components/research/ResearchChat.tsx` | 中栏：AI 对话 |
| `src/renderer/components/research/StudioPanel.tsx` | 右栏：工具+产物 |
| `src/renderer/components/research/ImportDialog.tsx` | 导入对话框 |
| `src/renderer/components/research/ArtifactViewer.tsx` | 产物渲染器 |
| `src/renderer/components/research/ComparisonTable.tsx` | 对比矩阵表格 |

### 修改文件 (9 个)
| 文件 | 修改范围 |
|------|---------|
| `src/main/db/schema.ts` | 追加 4 张表定义 |
| `src/shared/ipc-channels.ts` | 追加 ~15 个通道常量 |
| `src/shared/types.ts` | 追加研究类型 + 扩展 AgentPageSpecificState + 扩展 ElectronAPI |
| `src/preload.ts` | 追加 ~15 个 API 方法 |
| `src/main/ipc/index.ts` | 注册 registerResearchHandlers |
| `src/ai/tools/types.ts` | 扩展 ToolContext 接口（4 个新方法 + _researchSpaceId） |
| `src/ai/tools/index.ts` | 注册 createResearchTools |
| `src/ai/services/agent-service.ts` | 新增 research 模块 + spaceId 注入逻辑 |
| `src/main/ai/tool-context-factory.ts` | 实现研究相关 ToolContext 方法 |
| `src/ai/services/retriever.ts` | 确保 keywordSearch 支持 sourceIds 过滤 |
| `src/renderer/App.tsx` | 新增 appMode 状态 + Rail Bar + 条件渲染 |

### 依赖关系

```
Task 1 (Schema)
  ↓
Task 2 (Types + IPC Channels)
  ↓
Task 3 (IPC Handlers) + Task 4 (Preload)  ← 可并行
  ↓
Task 5 (Agent Module + Tools)
Task 11 (RAG sourceIds 过滤)  ← 可并行
Task 12 (spaceId 注入)  ← 依赖 Task 5
  ↓
Task 6 (Rail Bar + Shell)  ← 可与后端并行
Task 7 (ResearchLayout 骨架)
Task 8 (ImportDialog)
Task 9 (ResearchChat)
Task 10 (StudioPanel + 产物)
  ↓
Task 13 (集成验证)
```
