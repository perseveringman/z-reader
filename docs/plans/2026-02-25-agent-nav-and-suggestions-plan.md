# Agent 导航卡片跳转 + 主动建议能力实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为全局 Agent 助手实现导航卡片点击跳转和主动建议气泡能力

**Architecture:** 通过扩展 AgentContextProvider 暴露 `navigate` + `registerNavigator` 回调实现跨组件导航。主动建议通过在 AgentAssistant 中监听 viewState 变化触发内置 SuggestionRule，渲染 AgentSuggestionBubble 气泡。

**Tech Stack:** React Context, TypeScript, Tailwind CSS, lucide-react

**设计文档:** `docs/plans/2026-02-25-agent-nav-and-suggestions-design.md`

---

## Task 1: 新增 Agent 建议相关类型

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: 在 `AgentActionLevel` 类型之后添加建议相关类型**

在 `src/shared/types.ts` 第 633 行 `export type AgentActionLevel = 'read' | 'write' | 'navigate';` 之后添加：

```typescript
/** Agent 主动建议触发器 */
export interface AgentSuggestionTrigger {
  id: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

/** Agent 主动建议 */
export interface AgentSuggestion {
  message: string;
  quickActions: Array<{
    label: string;
    prompt: string;
  }>;
  autoDismissMs?: number;
}

/** Agent 建议规则 */
export interface AgentSuggestionRule {
  id: string;
  check: (prev: AgentViewState | null, next: AgentViewState) => AgentSuggestionTrigger | null;
  generate: (trigger: AgentSuggestionTrigger, viewState: AgentViewState) => AgentSuggestion;
}
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(agent): 新增 Agent 建议相关类型定义"
```

---

## Task 2: 扩展 AgentContextProvider 支持导航

**Files:**
- Modify: `src/renderer/contexts/AgentContextProvider.tsx`

**Step 1: 扩展 AgentContextValue 接口和实现**

将整个文件替换为：

```typescript
import { createContext, useContext, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { AgentViewState, AgentCommonViewState, AgentPageSpecificState } from '../../shared/types';

type NavigateHandler = (targetType: string, targetId: string) => void;

interface AgentContextValue {
  viewState: AgentViewState;
  reportContext: (state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => void;
  getViewState: () => AgentViewState;
  /** 触发导航（AgentDrawer 等组件调用） */
  navigate: (targetType: string, targetId: string) => void;
  /** 注册导航处理器（App.tsx 调用） */
  registerNavigator: (handler: NavigateHandler) => void;
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
  navigate: () => {},
  registerNavigator: () => {},
});

export function AgentContextProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<AgentViewState>(defaultViewState);
  const navigatorRef = useRef<NavigateHandler | null>(null);

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

  const navigate = useCallback((targetType: string, targetId: string) => {
    navigatorRef.current?.(targetType, targetId);
  }, []);

  const registerNavigator = useCallback((handler: NavigateHandler) => {
    navigatorRef.current = handler;
  }, []);

  const value = useMemo(
    () => ({ viewState, reportContext, getViewState, navigate, registerNavigator }),
    [viewState, reportContext, getViewState, navigate, registerNavigator],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgentContext() {
  return useContext(AgentContext);
}
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/renderer/contexts/AgentContextProvider.tsx
git commit -m "feat(agent): AgentContextProvider 新增导航回调注册机制"
```

---

## Task 3: App.tsx 注册导航处理器

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: 在 App.tsx 的 AppContent 函数中注册导航处理器**

在已有的 `const { reportContext } = useAgentContext();`（第 182 行）改为：

```typescript
  const { reportContext, registerNavigator } = useAgentContext();
```

**Step 2: 在 reportContext 的 useEffect 之后（第 235 行之后）添加 navigator 注册**

```typescript
  // 注册 Agent 导航处理器
  useEffect(() => {
    registerNavigator((targetType: string, targetId: string) => {
      switch (targetType) {
        case 'article':
          handleOpenReader(targetId);
          break;
        case 'feed':
          setSelectedFeedId(targetId);
          setActiveView('feeds');
          break;
        case 'book':
          setSelectedBookId(targetId);
          setActiveView('books');
          break;
        case 'knowledge-graph':
          setActiveView('knowledge-graph');
          break;
        default:
          console.warn(`Unknown agent navigation targetType: ${targetType}`);
      }
    });
  }, [registerNavigator, handleOpenReader]);
```

**Step 3: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(agent): App.tsx 注册 Agent 导航处理器"
```

---

## Task 4: AgentDrawer 实现导航跳转

**Files:**
- Modify: `src/renderer/components/agent/AgentDrawer.tsx`

**Step 1: 修改 AgentDrawer 中的 useAgentContext 取值**

将第 70 行：

```typescript
  const { viewState } = useAgentContext();
```

改为：

```typescript
  const { viewState, navigate } = useAgentContext();
```

**Step 2: 修改 handleNavigate 实现**

将第 317-320 行的 handleNavigate：

```typescript
  // 导航卡片点击
  const handleNavigate = useCallback((_targetType: string, _targetId: string) => {
    // TODO: 根据 targetType 导航到对应页面
  }, []);
```

替换为：

```typescript
  // 导航卡片点击 → 通过 context 导航 + 关闭抽屉
  const handleNavigate = useCallback((targetType: string, targetId: string) => {
    navigate(targetType, targetId);
    onClose();
  }, [navigate, onClose]);
```

**Step 3: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/renderer/components/agent/AgentDrawer.tsx
git commit -m "feat(agent): AgentDrawer 导航卡片点击跳转实现"
```

---

## Task 5: 创建建议触发器定义

**Files:**
- Create: `src/renderer/components/agent/suggestion-triggers.ts`

**Step 1: 创建文件**

```typescript
import type { AgentViewState, AgentSuggestionRule } from '../../../shared/types';

/**
 * 内置建议触发器
 *
 * 每个规则定义：
 * - check: 比较 prev/next viewState，返回 trigger 或 null
 * - generate: 根据 trigger + viewState 生成具体建议
 */
export const builtinSuggestionRules: AgentSuggestionRule[] = [
  {
    id: 'reader-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      // 从非 reader 页面切换到 reader 页面
      if (prevPage !== 'reader' && nextPage === 'reader') {
        return { id: 'reader-opened', reason: '打开文章阅读器', priority: 'medium' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你理解这篇文章吗？',
      quickActions: [
        { label: '生成摘要', prompt: '请为我生成这篇文章的摘要' },
        { label: '提取要点', prompt: '请提取这篇文章的关键要点' },
      ],
      autoDismissMs: 10000,
    }),
  },
  {
    id: 'kg-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      if (prevPage !== 'knowledge-graph' && nextPage === 'knowledge-graph') {
        return { id: 'kg-opened', reason: '打开知识图谱', priority: 'low' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你探索知识图谱吗？',
      quickActions: [
        { label: '查找相关主题', prompt: '帮我查找知识图谱中的相关主题' },
        { label: '分析连接', prompt: '帮我分析知识图谱中的连接关系' },
      ],
      autoDismissMs: 10000,
    }),
  },
  {
    id: 'feeds-opened',
    check: (prev: AgentViewState | null, next: AgentViewState) => {
      const prevPage = prev?.pageState.page;
      const nextPage = next.pageState.page;
      if (prevPage !== 'feeds' && nextPage === 'feeds') {
        return { id: 'feeds-opened', reason: '打开订阅源', priority: 'low' };
      }
      return null;
    },
    generate: () => ({
      message: '需要我帮你管理订阅吗？',
      quickActions: [
        { label: '查看阅读统计', prompt: '查看我的阅读统计数据' },
        { label: '查看未读', prompt: '帮我查看未读文章' },
      ],
      autoDismissMs: 10000,
    }),
  },
];
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/renderer/components/agent/suggestion-triggers.ts
git commit -m "feat(agent): 定义内置建议触发器规则"
```

---

## Task 6: 创建 AgentSuggestionBubble 组件

**Files:**
- Create: `src/renderer/components/agent/AgentSuggestionBubble.tsx`

**Step 1: 创建建议气泡组件**

```typescript
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AgentSuggestion } from '../../../shared/types';

interface AgentSuggestionBubbleProps {
  suggestion: AgentSuggestion;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}

export function AgentSuggestionBubble({ suggestion, onAction, onDismiss }: AgentSuggestionBubbleProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 入场动画
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // 自动消失
  useEffect(() => {
    const ms = suggestion.autoDismissMs ?? 10000;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, ms);
    return () => clearTimeout(timer);
  }, [suggestion.autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const handleAction = (prompt: string) => {
    setExiting(true);
    setTimeout(() => onAction(prompt), 300);
  };

  return (
    <div
      className={`absolute bottom-full right-0 mb-3 w-[280px] bg-[#1a1a1a] border border-white/10
                   rounded-xl shadow-2xl p-3 transition-all duration-300
                   ${visible && !exiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {/* 消息 + 关闭按钮 */}
      <div className="flex items-start gap-2 mb-2">
        <p className="text-sm text-gray-300 flex-1 leading-relaxed">{suggestion.message}</p>
        <button
          onClick={handleDismiss}
          className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 快捷操作按钮 */}
      <div className="flex flex-wrap gap-1.5">
        {suggestion.quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleAction(action.prompt)}
            className="px-2.5 py-1 text-xs rounded-full bg-blue-600/20 text-blue-400
                       hover:bg-blue-600/30 transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* 小三角指向气泡 */}
      <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-[#1a1a1a] border-r border-b border-white/10 transform rotate-45" />
    </div>
  );
}
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/renderer/components/agent/AgentSuggestionBubble.tsx
git commit -m "feat(agent): 实现 AgentSuggestionBubble 建议气泡组件"
```

---

## Task 7: 集成建议能力到 AgentAssistant

**Files:**
- Modify: `src/renderer/components/agent/AgentAssistant.tsx`

**Step 1: 替换整个 AgentAssistant.tsx**

```typescript
/**
 * Agent 助手三态编排主组件
 *
 * 管理三种状态：collapsed（气泡）、mini（迷你聊天）、expanded（全尺寸抽屉）。
 * 固定定位在右下角，最高 z-index。
 * 集成主动建议能力：监听 viewState 变化触发建议气泡。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentBubble } from './AgentBubble';
import { AgentMiniChat } from './AgentMiniChat';
import { AgentDrawer } from './AgentDrawer';
import { AgentSuggestionBubble } from './AgentSuggestionBubble';
import { useAgentContext } from '../../hooks/useAgentContext';
import { builtinSuggestionRules } from './suggestion-triggers';
import type { ChatMessage, AgentStreamChunk, AgentSuggestion, AgentViewState } from '../../../shared/types';

type AgentMode = 'collapsed' | 'mini' | 'expanded';

/** 冷却时间：用户手动关闭建议后 30 分钟内不再触发同类 */
const COOLDOWN_MS = 30 * 60 * 1000;

export function AgentAssistant() {
  const [mode, setMode] = useState<AgentMode>('collapsed');
  const { viewState } = useAgentContext();

  // Mini 模式聊天状态（Drawer 内部自行管理独立状态）
  const [miniMessages, setMiniMessages] = useState<ChatMessage[]>([]);
  const [miniStreamingText, setMiniStreamingText] = useState('');
  const [miniIsStreaming, setMiniIsStreaming] = useState(false);
  const [miniSessionId, setMiniSessionId] = useState<string | null>(null);
  const [activeModules, setActiveModules] = useState<string[]>([]);

  // 建议状态
  const [activeSuggestion, setActiveSuggestion] = useState<AgentSuggestion | null>(null);
  const prevViewStateRef = useRef<AgentViewState | null>(null);
  const firedTriggersRef = useRef<Set<string>>(new Set());
  const cooldownMapRef = useRef<Map<string, number>>(new Map());

  // 监听 viewState 变化，执行建议触发器
  useEffect(() => {
    // 只在 collapsed 模式下展示建议
    if (mode !== 'collapsed') {
      prevViewStateRef.current = viewState;
      return;
    }

    const prev = prevViewStateRef.current;
    prevViewStateRef.current = viewState;

    for (const rule of builtinSuggestionRules) {
      // 同会话去重
      if (firedTriggersRef.current.has(rule.id)) continue;

      // 冷却期检查
      const cooldownUntil = cooldownMapRef.current.get(rule.id);
      if (cooldownUntil && Date.now() < cooldownUntil) continue;

      const trigger = rule.check(prev, viewState);
      if (trigger) {
        firedTriggersRef.current.add(rule.id);
        const suggestion = rule.generate(trigger, viewState);
        setActiveSuggestion(suggestion);
        break; // 每次只展示一条建议
      }
    }
  }, [viewState, mode]);

  // 建议气泡：用户关闭（记录冷却）
  const handleSuggestionDismiss = useCallback(() => {
    // 获取当前 suggestion 对应的 rule id 用于冷却
    if (activeSuggestion) {
      // 查找匹配的 rule id
      for (const rule of builtinSuggestionRules) {
        if (firedTriggersRef.current.has(rule.id)) {
          cooldownMapRef.current.set(rule.id, Date.now() + COOLDOWN_MS);
        }
      }
    }
    setActiveSuggestion(null);
  }, [activeSuggestion]);

  // 建议气泡：用户点击快捷操作 → 打开 mini 模式并发送 prompt
  const handleSuggestionAction = useCallback((prompt: string) => {
    setActiveSuggestion(null);
    setMode('mini');
    // 延迟发送，等 mini 模式的流式监听挂载
    setTimeout(() => {
      handleMiniSendDirect(prompt);
    }, 100);
  }, []);

  // Mini 模式流式监听
  useEffect(() => {
    if (mode !== 'mini') return;

    const unsubscribe = window.electronAPI.agentOnStream((chunk: AgentStreamChunk) => {
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        setMiniStreamingText((prev) => prev + chunk.textDelta);
      } else if (chunk.type === 'context-hint' && chunk.contextHint) {
        setActiveModules(chunk.contextHint.activeModules);
      } else if (chunk.type === 'done') {
        setMiniIsStreaming(false);
        if (chunk.fullText) {
          setMiniMessages((prev) => [
            ...prev,
            { role: 'assistant' as const, content: chunk.fullText!, timestamp: new Date().toISOString() },
          ]);
          setMiniStreamingText('');
        }
      } else if (chunk.type === 'error') {
        setMiniIsStreaming(false);
        setMiniStreamingText('');
      }
    });

    return unsubscribe;
  }, [mode]);

  // Mini 模式发送消息（内部直接调用版本，用于建议触发）
  const handleMiniSendDirect = useCallback(async (message: string) => {
    let sid = miniSessionId;
    if (!sid) {
      try {
        const session = await window.electronAPI.agentSessionCreate();
        sid = session.id;
        setMiniSessionId(sid);
      } catch {
        return;
      }
    }

    setMiniIsStreaming(true);
    setMiniStreamingText('');
    setMiniMessages((prev) => [
      ...prev,
      { role: 'user' as const, content: message, timestamp: new Date().toISOString() },
    ]);

    window.electronAPI.agentSend({
      sessionId: sid,
      message,
      viewState,
    });
  }, [miniSessionId, viewState]);

  // Mini 模式发送消息
  const handleMiniSend = useCallback(async (message: string) => {
    await handleMiniSendDirect(message);
  }, [handleMiniSendDirect]);

  // 快捷键: Cmd+J / Ctrl+J 切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setMode((prev) => (prev === 'collapsed' ? 'mini' : 'collapsed'));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {mode === 'collapsed' && (
        <div className="fixed bottom-6 right-6 z-[9999] relative">
          {activeSuggestion && (
            <AgentSuggestionBubble
              suggestion={activeSuggestion}
              onAction={handleSuggestionAction}
              onDismiss={handleSuggestionDismiss}
            />
          )}
          <AgentBubble onClick={() => setMode('mini')} />
        </div>
      )}
      {mode === 'mini' && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <AgentMiniChat
            onClose={() => setMode('collapsed')}
            onExpand={() => setMode('expanded')}
            messages={miniMessages as Array<{ role: 'user' | 'assistant'; content: string }>}
            streamingText={miniStreamingText}
            isStreaming={miniIsStreaming}
            onSend={handleMiniSend}
            currentPage={viewState.common.currentPage}
            activeModules={activeModules}
          />
        </div>
      )}
      <AgentDrawer
        open={mode === 'expanded'}
        onClose={() => setMode('collapsed')}
        onCollapse={() => setMode('mini')}
      />
    </>
  );
}
```

**Step 2: 验证编译**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/renderer/components/agent/AgentAssistant.tsx
git commit -m "feat(agent): AgentAssistant 集成主动建议触发能力"
```

---

## Task 8: 验证与文档

**Step 1: 全量编译验证**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && npx tsc --noEmit --pretty 2>&1 | head -50`
Expected: 无类型错误

**Step 2: 启动应用验证**

Run: `cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader && pnpm start`

验证清单：
- [ ] 导航卡片：Agent 返回导航卡片后，点击可跳转到对应文章/页面
- [ ] 导航后自动关闭 Drawer
- [ ] 进入 reader 页面时，气泡上方弹出"需要我帮你理解这篇文章吗？"建议
- [ ] 建议气泡 10 秒后自动消失
- [ ] 点击"生成摘要"按钮 → 自动打开 mini 模式并发送 prompt
- [ ] 点击 X 关闭建议后，短时间内切换回 reader 不再重复触发
- [ ] 切换到 knowledge-graph 页面时弹出对应建议
- [ ] 已处于 mini/expanded 模式时不弹出建议
- [ ] Cmd+J 快捷键仍然正常工作

**Step 3: 更新实施报告文档**

在 `docs/2026-02-25-global-agent-assistant-implementation.md` 的"后续迭代"部分，将以下两项标记为已完成：
- [x] 主动建议能力（`suggestWhen` 接口已预留）→ 已实现 3 个内置触发器
- [x] 导航卡片跳转 → 已通过 AgentContextProvider 导航回调实现

**Step 4: Commit**

```bash
git add docs/2026-02-25-global-agent-assistant-implementation.md
git commit -m "docs: 更新 Agent 导航卡片 + 主动建议实施完成"
```

---

## 依赖关系

```
Task 1 (类型) ─────────────────────→ Task 5 (触发器) → Task 6 (气泡组件) → Task 7 (集成 AgentAssistant)
                                                                                      ↓
Task 2 (Context 扩展) → Task 3 (App.tsx 注册) → Task 4 (Drawer 导航) ──────→ Task 8 (验证)
```

可并行：
- **Task 2 + Task 5** 可同时开始（互不依赖）
- **Task 3 + Task 6** 可同时开始（分别依赖 Task 2 和 Task 5）
