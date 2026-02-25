# 全局 Agent 助手实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有页面级 ChatPanel 重构为全局悬浮 Agent 助手，支持上下文感知、模块注册、分级控制

**Architecture:** 渲染进程通过 AgentContextProvider 收集上下文，悬浮 AgentAssistant 组件负责 UI 展示（三态切换），主进程 AgentService 负责 Tool 动态注入和分级控制（ActionRouter）。各业务模块通过 AgentModule 接口注册能力。

**Tech Stack:** React Context + Jotai, Vercel AI SDK, Zod, Tailwind CSS, Electron IPC

**设计文档:** `docs/plans/2026-02-25-global-agent-assistant-design.md`

---

## Task 1: 定义核心类型

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: 在 `src/shared/types.ts` 末尾（ElectronAPI 接口之前）添加 Agent 相关类型**

在现有 `ChatStreamChunk` 类型之后添加：

```typescript
// ==================== Agent 助手类型 ====================

/** 通用视图元数据（所有页面都有） */
export interface AgentCommonViewState {
  currentPage: string;
  readerMode: boolean;
  selectedText: string | null;
  timestamp: number;
}

/** 各页面独有的元数据（联合类型） */
export type AgentPageSpecificState =
  | { page: 'library-articles'; selectedArticleId: string | null; listFilters: Record<string, unknown>; visibleCount: number }
  | { page: 'reader'; articleId: string; mediaType: string; scrollProgress: number }
  | { page: 'knowledge-graph'; visibleNodeCount: number; selectedNodeId: string | null }
  | { page: 'writing-assist'; currentDocId: string | null; wordCount: number }
  | { page: 'feeds'; selectedFeedId: string | null; unreadCount: number }
  | { page: 'books'; selectedBookId: string | null }
  | { page: string; [key: string]: unknown };

/** 完整的上下文快照 */
export interface AgentViewState {
  common: AgentCommonViewState;
  pageState: AgentPageSpecificState;
}

/** Agent 流式 Chunk（扩展自 ChatStreamChunk） */
export interface AgentStreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'action-confirm' | 'navigation-card' | 'context-hint' | 'done' | 'error' | 'title-generated';
  /** 文本增量 */
  textDelta?: string;
  /** 工具调用信息 */
  toolCall?: { name: string; args: Record<string, unknown> };
  /** 工具结果 + 可选卡片类型 */
  toolResult?: { name: string; result: string; cardType?: string };
  /** 写操作确认信息 */
  actionConfirm?: { toolName: string; preview: string; confirmId: string; allowTrust: boolean; args: Record<string, unknown> };
  /** 导航卡片数据 */
  navigationCard?: { title: string; subtitle?: string; targetType: string; targetId: string; thumbnail?: string };
  /** 上下文提示 */
  contextHint?: { activeModules: string[] };
  /** 错误信息 */
  error?: string;
  /** token 统计 */
  tokenCount?: number;
  /** 完整文本 */
  fullText?: string;
  /** 自动生成的会话标题 */
  title?: string;
}

/** Agent 发送消息输入 */
export interface AgentSendInput {
  sessionId: string;
  message: string;
  viewState: AgentViewState;
}

/** Agent 操作确认响应 */
export interface AgentConfirmResponse {
  confirmId: string;
  confirmed: boolean;
  trust: boolean;
}

/** Agent 操作分级 */
export type AgentActionLevel = 'read' | 'write' | 'navigate';
```

**Step 2: 在 ElectronAPI 接口中添加 Agent IPC 方法**

在 `aiChatSessionDelete` 之后添加：

```typescript
  // Agent 助手
  agentSend: (input: AgentSendInput) => void;
  agentOnStream: (callback: (chunk: AgentStreamChunk) => void) => () => void;
  agentConfirm: (response: AgentConfirmResponse) => void;
  agentSessionCreate: () => Promise<ChatSession>;
  agentSessionList: () => Promise<ChatSession[]>;
  agentSessionGet: (id: string) => Promise<ChatSession | null>;
  agentSessionDelete: (id: string) => Promise<void>;
  agentGetTrustedActions: () => Promise<string[]>;
  agentSetTrustedActions: (actions: string[]) => Promise<void>;
```

**Step 3: 验证类型无误**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误（新类型只是定义，尚未使用）

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(agent): 定义全局 Agent 助手核心类型"
```

---

## Task 2: 添加 Agent IPC 通道常量

**Files:**
- Modify: `src/shared/ipc-channels.ts`

**Step 1: 在 IPC_CHANNELS 对象的 `AI Chat` 段之后添加 Agent 通道**

```typescript
  // Agent 助手
  AGENT_SEND: 'agent:send',
  AGENT_STREAM: 'agent:stream',
  AGENT_CONFIRM: 'agent:confirm',
  AGENT_SESSION_CREATE: 'agent:session:create',
  AGENT_SESSION_LIST: 'agent:session:list',
  AGENT_SESSION_GET: 'agent:session:get',
  AGENT_SESSION_DELETE: 'agent:session:delete',
  AGENT_TRUSTED_ACTIONS_GET: 'agent:trustedActions:get',
  AGENT_TRUSTED_ACTIONS_SET: 'agent:trustedActions:set',
```

**Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(agent): 添加 Agent IPC 通道常量"
```

---

## Task 3: 实现 Preload Agent API

**Files:**
- Modify: `src/preload.ts`

**Step 1: 在 `aiChatSessionDelete` 之后添加 Agent 相关 preload 桥接**

```typescript
  // Agent 助手流式通信
  agentSend: (input) => ipcRenderer.send(IPC_CHANNELS.AGENT_SEND, input),
  agentOnStream: (callback: (chunk: AgentStreamChunk) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: AgentStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM, handler);
  },
  agentConfirm: (response) => ipcRenderer.send(IPC_CHANNELS.AGENT_CONFIRM, response),

  // Agent 会话 CRUD（复用 ChatSession 数据结构）
  agentSessionCreate: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_CREATE),
  agentSessionList: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_LIST),
  agentSessionGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_GET, id),
  agentSessionDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_DELETE, id),

  // Agent 白名单
  agentGetTrustedActions: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_GET),
  agentSetTrustedActions: (actions) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_SET, actions),
```

需要在 preload.ts 顶部 import 中确认 `AgentStreamChunk` 和 `AgentSendInput` 已导入。

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/preload.ts
git commit -m "feat(agent): 实现 Preload Agent API 桥接"
```

---

## Task 4: 实现 AgentContextProvider 和 useAgentContext hook

**Files:**
- Create: `src/renderer/contexts/AgentContextProvider.tsx`
- Create: `src/renderer/hooks/useAgentContext.ts`

**Step 1: 创建 AgentContextProvider**

`src/renderer/contexts/AgentContextProvider.tsx`:

```typescript
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { AgentViewState, AgentCommonViewState, AgentPageSpecificState } from '../../shared/types';

interface AgentContextValue {
  /** 当前上下文快照 */
  viewState: AgentViewState;
  /** 上报上下文（各组件调用） */
  reportContext: (state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => void;
  /** 获取当前完整快照 */
  getViewState: () => AgentViewState;
}

const defaultViewState: AgentViewState = {
  common: {
    currentPage: 'library-articles',
    readerMode: false,
    selectedText: null,
    timestamp: Date.now(),
  },
  pageState: { page: 'library-articles', selectedArticleId: null, listFilters: {}, visibleCount: 0 },
};

const AgentContext = createContext<AgentContextValue>({
  viewState: defaultViewState,
  reportContext: () => {},
  getViewState: () => defaultViewState,
});

export function AgentContextProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<AgentViewState>(defaultViewState);

  const reportContext = useCallback((state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => {
    setViewState((prev) => ({
      common: {
        ...prev.common,
        ...state.common,
        timestamp: Date.now(),
      },
      pageState: state.pageState ?? prev.pageState,
    }));
  }, []);

  const getViewState = useCallback(() => viewState, [viewState]);

  const value = useMemo(
    () => ({ viewState, reportContext, getViewState }),
    [viewState, reportContext, getViewState],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgentContext() {
  return useContext(AgentContext);
}
```

**Step 2: 创建便捷 hook**

`src/renderer/hooks/useAgentContext.ts`:

```typescript
export { useAgentContext } from '../contexts/AgentContextProvider';
```

**Step 3: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 4: Commit**

```bash
git add src/renderer/contexts/AgentContextProvider.tsx src/renderer/hooks/useAgentContext.ts
git commit -m "feat(agent): 实现 AgentContextProvider 和 useAgentContext hook"
```

---

## Task 5: 实现 ActionRouter（分级控制 + 白名单）

**Files:**
- Create: `src/ai/services/action-router.ts`

**Step 1: 创建 ActionRouter**

```typescript
import type { AIDatabase } from '../providers/db';
import type { AgentActionLevel, AgentStreamChunk } from '../../shared/types';
import crypto from 'node:crypto';

export interface ActionRouterDeps {
  aiDb: AIDatabase;
}

interface PendingConfirmation {
  resolve: (response: { confirmed: boolean; trust: boolean }) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * ActionRouter — 分级控制路由
 * read: 直接执行
 * write: 白名单检查 → 确认卡片 → 等待用户确认
 * navigate: 返回导航卡片数据
 */
export class ActionRouter {
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  constructor(private deps: ActionRouterDeps) {}

  /** 检查操作是否已被信任 */
  isActionTrusted(toolName: string): boolean {
    const raw = this.deps.aiDb.getSetting('trusted_actions');
    if (!raw) return false;
    try {
      const trusted: string[] = JSON.parse(raw);
      return trusted.includes(toolName);
    } catch {
      return false;
    }
  }

  /** 将操作加入信任白名单 */
  trustAction(toolName: string): void {
    const raw = this.deps.aiDb.getSetting('trusted_actions');
    let trusted: string[] = [];
    try {
      trusted = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }
    if (!trusted.includes(toolName)) {
      trusted.push(toolName);
      this.deps.aiDb.setSetting('trusted_actions', JSON.stringify(trusted));
    }
  }

  /** 获取所有信任的操作列表 */
  getTrustedActions(): string[] {
    const raw = this.deps.aiDb.getSetting('trusted_actions');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /** 设置信任操作列表 */
  setTrustedActions(actions: string[]): void {
    this.deps.aiDb.setSetting('trusted_actions', JSON.stringify(actions));
  }

  /**
   * 处理写操作确认
   * 需要推送确认卡片并等待用户回应
   */
  async requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
    preview: string,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<{ confirmed: boolean; trust: boolean }> {
    const confirmId = crypto.randomUUID();

    onChunk({
      type: 'action-confirm',
      actionConfirm: {
        toolName,
        preview,
        confirmId,
        allowTrust: true,
        args,
      },
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingConfirmations.delete(confirmId);
        resolve({ confirmed: false, trust: false });
      }, 60_000); // 60 秒超时

      this.pendingConfirmations.set(confirmId, { resolve, timeout });
    });
  }

  /** 处理前端返回的确认响应 */
  handleConfirmResponse(confirmId: string, confirmed: boolean, trust: boolean): void {
    const pending = this.pendingConfirmations.get(confirmId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingConfirmations.delete(confirmId);
      pending.resolve({ confirmed, trust });
    }
  }

  /** 清理所有待处理的确认 */
  cleanup(): void {
    for (const [, pending] of this.pendingConfirmations) {
      clearTimeout(pending.timeout);
      pending.resolve({ confirmed: false, trust: false });
    }
    this.pendingConfirmations.clear();
  }
}
```

**Step 2: 验证 AIDatabase 是否有 getSetting / setSetting 方法**

检查 `src/ai/providers/db.ts` 中已有的 setting 操作方法。如果没有 `getSetting`/`setSetting`，需要添加。

**Step 3: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 4: Commit**

```bash
git add src/ai/services/action-router.ts
git commit -m "feat(agent): 实现 ActionRouter 分级控制和白名单"
```

---

## Task 6: 实现 AgentService（主进程核心服务）

**Files:**
- Create: `src/ai/services/agent-service.ts`

**Step 1: 创建 AgentService**

```typescript
import { streamText, generateText, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { ToolContext } from '../tools/types';
import type { AIDatabase } from '../providers/db';
import type {
  AgentViewState,
  AgentStreamChunk,
  AgentActionLevel,
  ChatMessage,
} from '../../shared/types';
import { createAllTools } from '../tools';
import { ActionRouter } from './action-router';

/** 模块 tools 配置（主进程侧） */
export interface AgentModuleBackend {
  id: string;
  activeWhen: (viewState: AgentViewState) => boolean;
  systemPromptSegment: string;
  actionLevels: Record<string, AgentActionLevel>;
}

/** AgentService 依赖 */
export interface AgentServiceDeps {
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
  toolContext: ToolContext;
  aiDb: AIDatabase;
}

/**
 * AgentService — 全局 Agent 核心服务
 * 升级自 ChatService，增加上下文感知和分级控制
 */
export class AgentService {
  private actionRouter: ActionRouter;
  private modules: AgentModuleBackend[] = [];

  constructor(private deps: AgentServiceDeps) {
    this.actionRouter = new ActionRouter({ aiDb: deps.aiDb });
    this.registerDefaultModules();
  }

  /** 注册默认模块（主进程侧的激活条件和操作分级） */
  private registerDefaultModules(): void {
    this.modules = [
      {
        id: 'articles',
        activeWhen: (v) => ['library-articles', 'reader', 'feeds'].includes(v.common.currentPage),
        systemPromptSegment: '你可以搜索文章、获取文章内容、管理标签、标记已读、归档文章。',
        actionLevels: {
          search_articles: 'read',
          get_article_content: 'read',
          mark_as_read: 'write',
          archive_article: 'write',
        },
      },
      {
        id: 'tags',
        activeWhen: () => true, // 标签操作始终可用
        systemPromptSegment: '你可以查看、添加、移除文章标签。',
        actionLevels: {
          list_tags: 'read',
          add_tag: 'write',
          remove_tag: 'write',
        },
      },
      {
        id: 'feeds',
        activeWhen: (v) => ['feeds', 'library-articles'].includes(v.common.currentPage),
        systemPromptSegment: '你可以查看订阅源列表和阅读统计。',
        actionLevels: {
          list_feeds: 'read',
          get_reading_stats: 'read',
        },
      },
      {
        id: 'highlights',
        activeWhen: (v) => v.common.currentPage === 'reader',
        systemPromptSegment: '你可以查看和创建文章高亮。',
        actionLevels: {
          list_highlights: 'read',
          create_highlight: 'write',
        },
      },
    ];
  }

  /** 获取 ActionRouter 引用（供 IPC handler 调用） */
  getActionRouter(): ActionRouter {
    return this.actionRouter;
  }

  /** 根据上下文解析激活的模块 */
  private resolveActiveModules(viewState: AgentViewState): AgentModuleBackend[] {
    return this.modules.filter((m) => m.activeWhen(viewState));
  }

  /** 构建 system prompt */
  private buildSystemPrompt(activeModules: AgentModuleBackend[], viewState: AgentViewState): string {
    let prompt = `你是 Z-Reader 的 AI 助手，帮助用户管理和理解他们的阅读内容。
回答请使用用户的语言，简洁明了。`;

    // 添加当前上下文描述
    prompt += `\n\n当前上下文：用户在「${viewState.common.currentPage}」页面。`;

    if (viewState.common.selectedText) {
      prompt += `\n用户选中的文本：${viewState.common.selectedText.slice(0, 500)}`;
    }

    // 添加页面特定信息
    const ps = viewState.pageState;
    if (ps.page === 'reader' && 'articleId' in ps) {
      prompt += `\n正在阅读文章 ID: ${ps.articleId}`;
    } else if (ps.page === 'library-articles' && 'visibleCount' in ps) {
      prompt += `\n列表中有 ${ps.visibleCount} 篇文章`;
    }

    // 添加激活模块的能力描述
    prompt += '\n\n你当前可以执行以下操作：';
    for (const mod of activeModules) {
      prompt += `\n- ${mod.systemPromptSegment}`;
    }

    return prompt;
  }

  /** 获取工具的操作分级 */
  private getActionLevel(toolName: string, activeModules: AgentModuleBackend[]): AgentActionLevel {
    for (const mod of activeModules) {
      if (toolName in mod.actionLevels) {
        return mod.actionLevels[toolName];
      }
    }
    return 'read'; // 默认为读操作
  }

  /**
   * 处理用户消息（核心方法）
   */
  async handleMessage(
    sessionId: string,
    userMessage: string,
    viewState: AgentViewState,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<void> {
    // 1. 解析激活模块
    const activeModules = this.resolveActiveModules(viewState);

    // 推送上下文提示
    onChunk({
      type: 'context-hint',
      contextHint: { activeModules: activeModules.map((m) => m.id) },
    });

    // 2. 加载历史消息
    const session = this.deps.aiDb.getChatSession(sessionId);
    let history: ChatMessage[] = [];
    if (session) {
      try {
        history = JSON.parse(session.messages_json);
      } catch {
        history = [];
      }
    }

    // 3. 构建 system prompt
    const systemPrompt = this.buildSystemPrompt(activeModules, viewState);

    // 4. 构建消息数组
    const messages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    messages.push({ role: 'user', content: userMessage });

    // 5. 创建所有 tools
    const tools = createAllTools(this.deps.toolContext);

    // 6. 调用 streamText
    const result = streamText({
      model: this.deps.getModel('smart'),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });

    // 7. 消费流，逐块推送
    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.text;
          onChunk({ type: 'text-delta', textDelta: part.text });
        } else if (part.type === 'tool-call') {
          const level = this.getActionLevel(part.toolName, activeModules);
          onChunk({
            type: 'tool-call',
            toolCall: { name: part.toolName, args: part.input as Record<string, unknown> },
          });

          // 分级控制：write 操作需要确认
          if (level === 'write' && !this.actionRouter.isActionTrusted(part.toolName)) {
            const preview = `执行操作: ${part.toolName}(${JSON.stringify(part.input)})`;
            const response = await this.actionRouter.requestConfirmation(
              part.toolName,
              part.input as Record<string, unknown>,
              preview,
              onChunk,
            );
            if (response.trust) {
              this.actionRouter.trustAction(part.toolName);
            }
            if (!response.confirmed) {
              onChunk({
                type: 'tool-result',
                toolResult: { name: part.toolName, result: '用户取消了此操作' },
              });
              continue;
            }
          }
        } else if (part.type === 'tool-result') {
          const level = this.getActionLevel(part.toolName, activeModules);
          if (level === 'navigate') {
            // 导航操作：返回导航卡片
            onChunk({
              type: 'navigation-card',
              navigationCard: this.buildNavCard(part.toolName, part.output),
            });
          } else {
            onChunk({
              type: 'tool-result',
              toolResult: { name: part.toolName, result: JSON.stringify(part.output) },
            });
          }
        }
      }

      const totalUsage = await result.totalUsage;
      onChunk({
        type: 'done',
        tokenCount: totalUsage?.totalTokens ?? 0,
        fullText,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      onChunk({ type: 'error', error: errMsg });
    }

    // 8. 持久化消息
    const now = new Date().toISOString();
    const newMessages: ChatMessage[] = [
      ...history,
      { role: 'user' as const, content: userMessage, timestamp: now },
      { role: 'assistant' as const, content: fullText, timestamp: now },
    ];
    this.deps.aiDb.updateChatSession(sessionId, {
      messagesJson: JSON.stringify(newMessages),
    });

    // 9. 首次对话自动生成标题
    if (history.length === 0 && fullText) {
      this.generateTitle(sessionId, userMessage, fullText, onChunk).catch(() => {});
    }
  }

  /** 构建导航卡片数据 */
  private buildNavCard(toolName: string, output: unknown): { title: string; subtitle?: string; targetType: string; targetId: string } {
    const data = output as Record<string, unknown>;
    if (toolName === 'search_articles' && Array.isArray((data as { articles?: unknown[] })?.articles)) {
      const first = ((data as { articles: { id: string; title: string }[] }).articles)[0];
      return {
        title: first?.title ?? '未知文章',
        targetType: 'article',
        targetId: first?.id ?? '',
      };
    }
    return { title: '查看详情', targetType: 'unknown', targetId: '' };
  }

  /** 自动生成会话标题 */
  private async generateTitle(
    sessionId: string,
    userMessage: string,
    aiReply: string,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<void> {
    const snippet = (userMessage + '\n' + aiReply).slice(0, 500);
    const { text } = await generateText({
      model: this.deps.getModel('fast'),
      messages: [
        {
          role: 'user',
          content: `请根据以下对话内容，生成一个简短的对话标题（不超过20个字，不要加引号和标点）：\n\n${snippet}`,
        },
      ],
    });
    const title = text.trim().slice(0, 30);
    if (title) {
      this.deps.aiDb.updateChatSession(sessionId, { title });
      onChunk({ type: 'title-generated', title });
    }
  }
}
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/ai/services/agent-service.ts
git commit -m "feat(agent): 实现 AgentService 核心服务（上下文感知 + 分级控制）"
```

---

## Task 7: 注册 Agent IPC Handlers

**Files:**
- Create: `src/main/ipc/agent-handlers.ts`
- Modify: `src/main/ipc/index.ts`（在注册入口中引入）

**Step 1: 创建 agent-handlers.ts**

参考 `src/main/ipc/ai-handlers.ts` 中 Chat 相关 handler 的模式（`ipcMain.on` 用于流式，`ipcMain.handle` 用于 CRUD），实现：

- `AGENT_SEND`: 使用 `ipcMain.on`，创建 `AgentService` 实例，调用 `handleMessage` 流式推送
- `AGENT_CONFIRM`: 使用 `ipcMain.on`，转发确认响应到 `ActionRouter`
- `AGENT_SESSION_CREATE/LIST/GET/DELETE`: 使用 `ipcMain.handle`，复用 `AIDatabase` 的 session CRUD
- `AGENT_TRUSTED_ACTIONS_GET/SET`: 使用 `ipcMain.handle`，调用 `ActionRouter`

需要注意：`AgentService` 实例需要在模块级别保持引用（用于 `AGENT_CONFIRM` 查找待处理的确认），不能每次请求新建。使用一个模块级变量 `let agentService: AgentService | null = null;` 惰性初始化。

**Step 2: 在 IPC 注册入口引入**

在 `src/main/ipc/index.ts`（或相应的注册入口文件）中添加 `import './agent-handlers'` 或调用注册函数。

**Step 3: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 4: Commit**

```bash
git add src/main/ipc/agent-handlers.ts src/main/ipc/index.ts
git commit -m "feat(agent): 注册 Agent IPC handlers"
```

---

## Task 8: 实现 AgentBubble（气泡按钮组件）

**Files:**
- Create: `src/renderer/components/agent/AgentBubble.tsx`

**Step 1: 创建气泡按钮**

右下角 48px 圆形按钮，带脉冲动画和未读红点。使用 `lucide-react` 的 `Sparkles` 图标（已在项目中使用）。

```typescript
import { Sparkles } from 'lucide-react';

interface AgentBubbleProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function AgentBubble({ onClick, hasUnread }: AgentBubbleProps) {
  return (
    <button
      onClick={onClick}
      className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 
                 text-white shadow-lg hover:shadow-xl transition-all duration-200
                 flex items-center justify-center relative"
    >
      <Sparkles className="w-5 h-5" />
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0f0f0f]" />
      )}
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/agent/AgentBubble.tsx
git commit -m "feat(agent): 实现 AgentBubble 气泡按钮组件"
```

---

## Task 9: 实现 AgentMiniChat（迷你对话框）

**Files:**
- Create: `src/renderer/components/agent/AgentMiniChat.tsx`

**Step 1: 创建迷你对话框**

360px × 480px 浮动窗口，包含：
- 上下文指示条（显示当前页面）
- 简洁消息区
- 输入框 + 展开按钮 + 发送按钮

从 ChatPanel.tsx 复用 `renderSimpleMarkdown` 函数。消息列表和输入逻辑参考 ChatPanel 的实现。

核心 props：
```typescript
interface AgentMiniChatProps {
  onClose: () => void;
  onExpand: () => void;
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  onSend: (message: string) => void;
  currentPage: string;
  activeModules: string[];
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/agent/AgentMiniChat.tsx
git commit -m "feat(agent): 实现 AgentMiniChat 迷你对话框"
```

---

## Task 10: 实现确认卡片和导航卡片

**Files:**
- Create: `src/renderer/components/agent/ConfirmCard.tsx`
- Create: `src/renderer/components/agent/NavigationCard.tsx`

**Step 1: 创建 ConfirmCard**

写操作确认卡片，展示：
- 操作名称和参数预览
- 确认/取消按钮
- "下次不再询问"复选框

```typescript
interface ConfirmCardProps {
  toolName: string;
  preview: string;
  confirmId: string;
  onConfirm: (confirmId: string, trust: boolean) => void;
  onCancel: (confirmId: string) => void;
}
```

**Step 2: 创建 NavigationCard**

导航卡片，展示文章/节点摘要，点击触发跳转。

```typescript
interface NavigationCardProps {
  title: string;
  subtitle?: string;
  targetType: string;
  targetId: string;
  thumbnail?: string;
  onNavigate: (targetType: string, targetId: string) => void;
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/agent/ConfirmCard.tsx src/renderer/components/agent/NavigationCard.tsx
git commit -m "feat(agent): 实现确认卡片和导航卡片组件"
```

---

## Task 11: 实现 AgentDrawer（完整抽屉）

**Files:**
- Create: `src/renderer/components/agent/AgentDrawer.tsx`

**Step 1: 创建完整抽屉面板**

从右侧滑出，宽 420px，全高。包含：
- 头部：会话标题、新会话、历史列表、收起按钮
- 上下文指示条
- 对话区：消息气泡 + ConfirmCard + NavigationCard
- 输入区：输入框 + 预设 Prompt + 收缩按钮

参考 `TaskDrawer.tsx` 和 `NotificationDrawer.tsx` 的抽屉实现模式（动画、遮罩等）。
对话逻辑和消息渲染参考 `ChatPanel.tsx`。

核心 props：
```typescript
interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
  onCollapse: () => void;  // 收缩回 mini 模式
}
```

内部自行管理消息状态、session 状态，通过 `window.electronAPI.agentSend` 和 `agentOnStream` 通信。

**Step 2: Commit**

```bash
git add src/renderer/components/agent/AgentDrawer.tsx
git commit -m "feat(agent): 实现 AgentDrawer 完整抽屉面板"
```

---

## Task 12: 实现 AgentAssistant（三态编排主组件）

**Files:**
- Create: `src/renderer/components/agent/AgentAssistant.tsx`
- Create: `src/renderer/components/agent/index.ts`

**Step 1: 创建三态编排组件**

管理 collapsed / mini / expanded 三种状态的切换。固定定位在右下角，z-index 最高。

```typescript
import { useState, useEffect, useCallback } from 'react';
import { AgentBubble } from './AgentBubble';
import { AgentMiniChat } from './AgentMiniChat';
import { AgentDrawer } from './AgentDrawer';
import { useAgentContext } from '../../hooks/useAgentContext';
import type { ChatMessage, AgentStreamChunk } from '../../../shared/types';

type AgentMode = 'collapsed' | 'mini' | 'expanded';

export function AgentAssistant() {
  const [mode, setMode] = useState<AgentMode>('collapsed');
  const { viewState } = useAgentContext();

  // 消息状态（mini 和 expanded 共享）
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);

  // 流式监听
  useEffect(() => {
    const unsubscribe = window.electronAPI.agentOnStream((chunk: AgentStreamChunk) => {
      // 处理各种 chunk 类型...
    });
    return unsubscribe;
  }, []);

  // 发送消息
  const handleSend = useCallback(async (message: string) => {
    // 懒创建 session
    let sid = sessionId;
    if (!sid) {
      const session = await window.electronAPI.agentSessionCreate();
      sid = session.id;
      setSessionId(sid);
    }
    // 发送
    setIsStreaming(true);
    setStreamingText('');
    setMessages(prev => [...prev, { role: 'user', content: message, timestamp: new Date().toISOString() }]);
    window.electronAPI.agentSend({
      sessionId: sid,
      message,
      viewState,
    });
  }, [sessionId, viewState]);

  // 快捷键 Cmd+J 唤起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setMode(prev => prev === 'collapsed' ? 'mini' : 'collapsed');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      {mode === 'collapsed' && (
        <AgentBubble onClick={() => setMode('mini')} />
      )}
      {mode === 'mini' && (
        <AgentMiniChat
          onClose={() => setMode('collapsed')}
          onExpand={() => setMode('expanded')}
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSend={handleSend}
          currentPage={viewState.common.currentPage}
          activeModules={activeModules}
        />
      )}
      <AgentDrawer
        open={mode === 'expanded'}
        onClose={() => setMode('collapsed')}
        onCollapse={() => setMode('mini')}
      />
    </div>
  );
}
```

**Step 2: 创建 index.ts 导出**

`src/renderer/components/agent/index.ts`:
```typescript
export { AgentAssistant } from './AgentAssistant';
```

**Step 3: Commit**

```bash
git add src/renderer/components/agent/AgentAssistant.tsx src/renderer/components/agent/index.ts
git commit -m "feat(agent): 实现 AgentAssistant 三态编排主组件"
```

---

## Task 13: 集成到 App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: 添加 imports**

```typescript
import { AgentContextProvider } from './contexts/AgentContextProvider';
import { AgentAssistant } from './components/agent';
```

**Step 2: 用 AgentContextProvider 包裹 AppContent**

修改 `App` 组件：
```typescript
export function App() {
  return (
    <ToastProvider>
      <AgentContextProvider>
        <AppContent />
      </AgentContextProvider>
    </ToastProvider>
  );
}
```

**Step 3: 在 AppContent 的 return JSX 中添加 AgentAssistant**

在 `</div>` 闭合标签之前（与 TaskDrawer、NotificationDrawer 同级），添加：
```typescript
<AgentAssistant />
```

**Step 4: 在 AppContent 中添加上下文上报**

在 AppContent 组件内部添加 useAgentContext hook 并上报基础上下文：

```typescript
const { reportContext } = useAgentContext();

useEffect(() => {
  reportContext({
    common: {
      currentPage: activeView,
      readerMode,
      selectedText: null,
    },
    pageState: activeView === 'books'
      ? { page: 'books', selectedBookId }
      : activeView === 'knowledge-graph'
      ? { page: 'knowledge-graph', visibleNodeCount: 0, selectedNodeId: null }
      : activeView === 'writing-assist'
      ? { page: 'writing-assist', currentDocId: null, wordCount: 0 }
      : { page: activeView, selectedArticleId, listFilters: {}, visibleCount: 0 },
  });
}, [activeView, readerMode, selectedArticleId, selectedBookId, reportContext]);
```

**Step 5: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(agent): 集成 AgentAssistant 到 App.tsx"
```

---

## Task 14: 端到端验证

**Step 1: 启动开发服务器**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && pnpm start`

**Step 2: 验证功能**

- [ ] 右下角出现蓝色圆形气泡按钮
- [ ] 点击气泡打开迷你对话框
- [ ] 迷你对话框顶部显示当前页面上下文
- [ ] 输入消息后能收到 AI 流式回复
- [ ] 点击展开按钮切换到完整抽屉
- [ ] Cmd+J 快捷键切换气泡/迷你模式
- [ ] 在不同页面间切换时，上下文指示条自动更新
- [ ] AI 执行写操作时弹出确认卡片
- [ ] 确认卡片的"下次不再询问"复选框可用

**Step 3: 修复所有发现的问题**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(agent): 全局 Agent 助手 Phase 1 完成"
```

---

## 依赖关系

```
Task 1 (类型) → Task 2 (IPC通道) → Task 3 (Preload)
                                          ↓
Task 4 (ActionRouter) → Task 6 (AgentService) → Task 7 (IPC Handlers)
                                                        ↓
Task 4 (Context Provider) ──────────────────────→ Task 13 (集成 App.tsx)
                                                        ↑
Task 8 (Bubble) → Task 9 (Mini) → Task 10 (Cards) → Task 11 (Drawer) → Task 12 (Assistant)
```

可并行的任务组：
- **组 A**（Task 1→2→3）与 **组 B**（Task 4）可并行
- **组 C**（Task 8→9→10）UI 组件可与 **组 D**（Task 5→6→7）后端服务并行
