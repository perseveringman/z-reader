# 全局 Agent 助手架构设计

> 日期: 2026-02-25
> 状态: 设计完成，待实施

## 1. 概述

将现有的页面级 AI 对话（ChatPanel，嵌入在 DetailPanel Tab 中）重构为**全局悬浮 Agent 助手**。Agent 具备元素级上下文感知能力，能根据用户当前所在页面、选中状态等信息智能调用对应 tools 执行任务。架构采用模块注册制，支持未来笔记系统、写作系统等新模块零改动接入。

## 2. 架构决策总结

| 决策项 | 方案 |
|--------|------|
| 上下文感知粒度 | 元素级感知，预留主动建议接口 |
| UI 形态 | 混合式：气泡 → 迷你对话框 → 完整抽屉 |
| Tool 注入策略 | 分层：核心 tools 常驻 + 模块 tools 按上下文动态激活 |
| 上下文采集 | 混合：轻量元数据 Push + 重量数据 Pull |
| 元数据结构 | 通用 CommonViewState + 页面独有 PageSpecificState（联合类型） |
| 操作控制 | 分级：读直接执行、写需确认（支持白名单）、导航展示卡片 |
| 模块扩展 | AgentModule 接口注册制，含 tools + context + 卡片渲染器 + system prompt |
| 卡片渲染 | 各模块注册自定义 CardRenderer，Agent UI 自动匹配 |

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    渲染进程 (Renderer)                     │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │          AgentContextProvider (全局)                  │ │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐       │ │
│  │  │ 页面元数据 │  │ 选中状态  │  │ 模块注册表 │       │ │
│  │  │  (Push)   │  │  (Push)   │  │ (tools+ctx)│       │ │
│  │  └───────────┘  └───────────┘  └───────────┘       │ │
│  └──────────────────────▲──────────────────────────────┘ │
│                         │ 读取                           │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │         AgentAssistant (悬浮组件)                     │ │
│  │  ┌─────────┐     ┌──────────────────┐               │ │
│  │  │ 气泡模式 │ ←→  │ 抽屉模式(展开)    │               │ │
│  │  └─────────┘     │ - 对话区          │               │ │
│  │                  │ - 结果卡片区      │               │ │
│  │                  │ - 操作确认区      │               │ │
│  │                  └──────────────────┘               │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────────────▼─────────────────────────────┘
                     IPC (流式通信)
┌────────────────────────────┴─────────────────────────────┐
│                    主进程 (Main)                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              AgentService                            │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │ │
│  │  │Core Tools│  │Context Tools │  │ Action Router  │  │ │
│  │  │(常驻)    │  │(动态注入)    │  │(分级控制)      │  │ │
│  │  └──────────┘  └──────────────┘  └───────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## 4. 模块注册系统

每个业务模块通过统一接口向 Agent 注册自己的能力，新模块接入零改动现有代码。

### 4.1 模块接口定义

```typescript
interface AgentModule {
  /** 模块唯一标识 */
  id: string;                          // 'articles' | 'knowledge-graph' | 'notes' | 'writing'

  /** 该模块在哪些页面/视图下激活 */
  activeWhen: (viewState: AgentViewState) => boolean;

  /** 该模块提供的 context 工厂（Pull 模式，按需拉取重量数据） */
  getContext: () => Promise<ModuleContext>;

  /** 该模块提供的 tools 定义（注入给 LLM） */
  tools: ToolDefinition[];

  /** 该模块的 system prompt 片段（告诉 LLM 当前模块能做什么） */
  systemPromptSegment: string;

  /** 操作分级声明 */
  actionLevels: Record<string, 'read' | 'write' | 'navigate'>;

  /** 该模块的结果卡片渲染器（可选） */
  cardRenderers?: Record<string, React.ComponentType<{ data: unknown }>>;
}
```

### 4.2 注册示例

**知识图谱模块：**

```typescript
const kgModule: AgentModule = {
  id: 'knowledge-graph',
  activeWhen: (view) => view.common.currentPage === 'knowledge-graph',
  getContext: async () => ({
    graphStats: await window.electronAPI.kgGetStats(),
    visibleNodes: currentVisibleNodes,
  }),
  tools: [getGraphNodes, searchConnections, findRelatedTopics],
  systemPromptSegment: '你现在在知识图谱页面，可以查询节点关系、搜索连接、发现相关主题...',
  actionLevels: {
    getGraphNodes: 'read',
    deleteNode: 'write',
    openArticleFromNode: 'navigate',
  },
  cardRenderers: {
    graphNode: GraphNodeCard,
    connectionList: ConnectionCard,
  },
};
```

**未来笔记模块（示例）：**

```typescript
const notesModule: AgentModule = {
  id: 'notes',
  activeWhen: (view) => view.common.currentPage === 'notes',
  getContext: async () => ({
    currentNote: await window.electronAPI.noteGetCurrent(),
    recentNotes: await window.electronAPI.noteListRecent(10),
  }),
  tools: [createNote, updateNote, searchNotes, linkNoteToArticle],
  systemPromptSegment: '你现在在笔记页面，可以创建/编辑笔记、搜索笔记、关联笔记到文章...',
  actionLevels: {
    searchNotes: 'read',
    createNote: 'write',
    updateNote: 'write',
    openNote: 'navigate',
  },
};
```

### 4.3 Tool 分层策略

- **Core Tools（常驻）**：`search_articles`、`get_reading_stats`、`list_feeds` 等通用工具，任何页面都可用
- **Module Tools（动态）**：各模块注册的专属工具，仅在模块激活时注入 LLM
- 好处：减少 token 消耗，提高 LLM 工具选择准确率

## 5. 全局上下文系统

### 5.1 数据结构（Push 层：分层元数据）

```typescript
// 通用元数据（所有页面都有）
interface CommonViewState {
  /** 当前页面标识 */
  currentPage: string;
  /** 阅读器是否打开 */
  readerMode: boolean;
  /** 当前选中/高亮的文本 */
  selectedText: string | null;
  /** 时间戳 */
  timestamp: number;
}

// 各页面独有的元数据（联合类型，类型安全）
type PageSpecificState =
  | { page: 'library-articles'; selectedArticleId: string | null; listFilters: ListFilters; visibleCount: number }
  | { page: 'reader'; articleId: string; mediaType: string; scrollProgress: number }
  | { page: 'knowledge-graph'; visibleNodeCount: number; selectedNodeId: string | null }
  | { page: 'writing-assist'; currentDocId: string | null; wordCount: number }
  | { page: 'feeds'; selectedFeedId: string | null; unreadCount: number }
  | { page: 'books'; selectedBookId: string | null }
  | { page: string; [key: string]: unknown };  // 兜底，允许未注册模块上报

// 完整的上下文快照
interface AgentViewState {
  common: CommonViewState;
  pageState: PageSpecificState;
}
```

### 5.2 上报方式（Hook）

```typescript
// 任何组件内使用
const { reportContext } = useAgentContext();

// ContentList 组件中
useEffect(() => {
  reportContext({
    common: { currentPage: 'library-articles', readerMode: false, selectedText: null },
    pageState: { page: 'library-articles', selectedArticleId, listFilters, visibleCount: articles.length },
  });
}, [contentSource, mediaType, articles.length]);

// KnowledgeGraphView 组件中
useEffect(() => {
  reportContext({
    common: { currentPage: 'knowledge-graph', readerMode: false, selectedText: null },
    pageState: { page: 'knowledge-graph', visibleNodeCount: nodes.length, selectedNodeId },
  });
}, [nodes.length, selectedNodeId]);
```

### 5.3 数据组装流程

```
用户输入消息
    ↓
1. 读取 AgentViewState（Push 的轻量数据，同步，零延迟）
    ↓
2. 根据 currentPage 找到所有 active 的 AgentModule
    ↓
3. 调用各 active module 的 getContext()（Pull 重量数据，异步）
    ↓
4. 合并 core tools + active modules 的 tools
    ↓
5. 拼接 system prompt = 基础 prompt + 各 module 的 systemPromptSegment
    ↓
6. 发送给 LLM
```

## 6. 悬浮助手 UI 设计

### 6.1 三态切换

```
collapsed (默认)
  ○  右下角 48px 圆形按钮，带未读消息红点
       │ 点击
       ▼
mini (快速对话框, 360px × 480px)
  ┌────────────────────────────┐
  │ 上下文指示条                │  "当前: 文章详情"
  │ ─────────────────────────  │
  │ 对话消息区（简洁）          │
  │                            │
  │ ─────────────────────────  │
  │ [输入框]         [展开] [发送]│
  └────────────────────────────┘
       │ 点击展开
       ▼
expanded (完整抽屉, 420px 宽, 全高)
  ┌────────────────────────────────────────────┐
  │ 头部: 会话标题 / 新会话 / 历史 / 收起       │
  │ 上下文卡片: 当前页面详情 + 可用能力提示      │
  │ ──────────────────────────────────────────  │
  │ 对话区:                                     │
  │   消息气泡（支持 Markdown）                  │
  │   工具调用结果卡片（文章卡片/图谱节点等）     │
  │   写操作确认卡片（确认/取消按钮）            │
  │   导航卡片（可点击跳转）                     │
  │ ──────────────────────────────────────────  │
  │ 输入区: 输入框 + 预设 Prompt + 收缩按钮      │
  └────────────────────────────────────────────┘
```

### 6.2 关键 UI 细节

- **上下文指示条**：顶部始终显示当前感知到的上下文（如 "📄 正在阅读: Rust异步编程指南"），让用户知道 Agent "看到了什么"
- **结果卡片**：tool 返回的结构化数据渲染为专属卡片组件，每个模块可注册自己的卡片渲染器（`cardRenderers`）
- **确认卡片**：写操作展示操作预览 + 确认/取消按钮 + "下次不再询问" 复选框
- **导航卡片**：展示文章/节点的摘要卡片，点击触发应用内导航

## 7. 主进程 AgentService

### 7.1 核心流程

```typescript
class AgentService {
  private moduleRegistry = new Map<string, AgentModuleBackend>();
  private coreTools: ToolDefinition[];
  private actionRouter: ActionRouter;

  /**
   * 处理用户消息
   */
  async handleMessage(
    sessionId: string,
    userMessage: string,
    viewState: AgentViewState,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<void> {
    // 1. 根据 viewState 确定激活的模块
    const activeModules = this.resolveActiveModules(viewState);

    // 2. 合并 tools（core + active modules）
    const tools = this.buildTools(activeModules, viewState);

    // 3. 拼接 system prompt
    const systemPrompt = this.buildSystemPrompt(activeModules, viewState);

    // 4. 调用 LLM streamText
    // 5. 拦截 tool call，执行分级控制
    // 6. 流式推送结果
  }
}
```

### 7.2 分级控制 ActionRouter

```typescript
class ActionRouter {
  async execute(
    toolName: string,
    args: unknown,
    level: 'read' | 'write' | 'navigate',
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<ToolResult> {
    switch (level) {
      case 'read':
        // 直接执行，返回结果
        return await this.executeTool(toolName, args);

      case 'write':
        // 检查白名单
        const trusted = await this.deps.aiDb.isActionTrusted(toolName);
        if (trusted) {
          return await this.executeTool(toolName, args);
        }
        // 未信任：推送确认卡片，带"下次不再询问"选项
        onChunk({
          type: 'action_confirm',
          toolName,
          args,
          preview: await this.generatePreview(toolName, args),
          confirmId,
          allowTrust: true,
        });
        const response = await this.waitForConfirmation(confirmId);
        if (response.trust) {
          await this.deps.aiDb.trustAction(toolName);
        }
        return response.confirmed
          ? await this.executeTool(toolName, args)
          : { type: 'cancelled' };

      case 'navigate':
        // 不执行导航，返回导航卡片数据
        const cardData = await this.buildNavigationCard(toolName, args);
        return { type: 'navigation_card', data: cardData };
    }
  }
}
```

### 7.3 白名单机制

- 持久化到 `ai_settings` 表，key 为 `trusted_actions`，value 为操作名数组
- 用户可在确认卡片中勾选"下次不再询问"，将操作加入白名单
- 设置页面提供白名单管理界面，可随时增减信任的操作

### 7.4 流式 Chunk 类型

```typescript
type AgentStreamChunk =
  | { type: 'text-delta'; content: string }
  | { type: 'tool_call'; toolName: string; args: unknown }
  | { type: 'tool_result'; toolName: string; data: unknown; cardType?: string }
  | { type: 'action_confirm'; toolName: string; preview: string; confirmId: string; allowTrust: boolean }
  | { type: 'navigation_card'; data: NavigationCardData }
  | { type: 'context_hint'; activeModules: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

## 8. 预留能力接口（主动感知与建议）

当前不实现，但架构预留以下扩展点：

```typescript
interface AgentModule {
  // ... 现有字段

  /** 【预留】主动建议触发器：上下文变化时，判断是否需要主动建议 */
  suggestWhen?: (prev: AgentViewState, next: AgentViewState) => SuggestionTrigger | null;

  /** 【预留】建议内容生成 */
  generateSuggestion?: (trigger: SuggestionTrigger) => Promise<AgentSuggestion>;
}

interface SuggestionTrigger {
  reason: string;         // '长文打开' | '阅读超过5分钟' | '连续阅读同主题'
  priority: 'low' | 'medium' | 'high';
}

interface AgentSuggestion {
  message: string;        // "需要我帮你生成摘要吗？"
  quickActions: string[]; // ['生成摘要', '提取要点', '翻译全文']
}
```

未来实现时，`AgentContextProvider` 监听 `viewState` 变化，调用各模块的 `suggestWhen()`，满足条件时在气泡按钮上展示建议气泡。

## 9. 文件结构规划

```
src/
  ai/
    services/
      chat.ts             → 保留，被 AgentService 内部复用
      agent-service.ts    → 新增：全局 Agent 核心服务
      action-router.ts    → 新增：分级控制路由
    tools/
      core-tools.ts       → 新增：常驻 tools（搜索、统计等）
      article-tools.ts    → 现有
      tag-tools.ts        → 现有
      feed-tools.ts       → 现有
      highlight-tools.ts  → 现有
      kg-tools.ts         → 新增：知识图谱 tools
  renderer/
    components/
      agent/
        AgentAssistant.tsx    → 新增：悬浮助手主组件（三态切换）
        AgentBubble.tsx       → 新增：气泡按钮
        AgentMiniChat.tsx     → 新增：迷你对话框
        AgentDrawer.tsx       → 新增：完整抽屉
        AgentContextBar.tsx   → 新增：上下文指示条
        ConfirmCard.tsx       → 新增：写操作确认卡片
        NavigationCard.tsx    → 新增：导航卡片
      ChatPanel.tsx           → 逐步废弃，功能迁移到 agent/
    hooks/
      useAgentContext.ts      → 新增：上下文上报 hook
    contexts/
      AgentContextProvider.tsx → 新增：全局上下文 Provider
    modules/
      article-module.ts       → 新增：文章模块注册
      kg-module.ts             → 新增：知识图谱模块注册
      feed-module.ts           → 新增：Feed 模块注册
      reader-module.ts         → 新增：阅读器模块注册
      book-module.ts           → 新增：图书模块注册
      writing-module.ts        → 新增：写作模块注册
      index.ts                 → 新增：模块注册表
  shared/
    types.ts                   → 扩展：AgentViewState、AgentStreamChunk 等类型
```

## 10. 实施路线图

### Phase 1：基础架构（1-2 周）
- 定义 `AgentModule`、`AgentViewState` 等核心类型
- 实现 `AgentContextProvider` + `useAgentContext` hook
- 实现 `AgentService`（重构 ChatService）
- 实现 `ActionRouter` 分级控制（含白名单）
- 现有页面组件接入 `reportContext()`

### Phase 2：悬浮 UI（1 周）
- 实现三态 UI 组件（Bubble → Mini → Drawer）
- 上下文指示条
- 结果卡片 / 确认卡片 / 导航卡片渲染
- 旧 ChatPanel 功能迁移

### Phase 3：模块注册（1 周）
- 将现有 tools 按模块拆分注册
- 各页面组件接入上下文上报
- core tools 抽取
- 卡片渲染器注册

### Phase 4：打磨与扩展（持续）
- 主动建议能力实现
- 笔记模块 / 写作模块接入
- 白名单管理 UI
- 快捷键支持（如 Cmd+J 唤起助手）

## 11. 与现有架构的兼容策略

- **渐进式迁移**：先实现全局 Agent，旧 ChatPanel 保留但标记废弃，待新组件稳定后移除
- **复用现有 AI 层**：`AgentService` 内部复用现有的 `ChatService`、`createAllTools`、LLM Provider 等
- **IPC 通道新增**：新增 `agent:*` 系列 IPC 通道，不修改现有 `ai:chat:*` 通道
- **数据库兼容**：复用 `ai_chat_sessions` 表，新增 `trusted_actions` 到 `ai_settings`
