# Agent 导航卡片跳转 + 主动建议能力设计

> 日期: 2026-02-25
> 前置: `docs/2026-02-25-global-agent-assistant-implementation.md` (Phase 1-3 已完成)

## 1. 概述

本次迭代实现全局 Agent 助手的两个后续功能：

1. **导航卡片跳转** — 完成 AgentDrawer 中 TODO 的导航逻辑，使 Agent 返回的导航卡片可点击直达对应页面
2. **主动建议能力** — 实现 `suggestWhen` 预留接口，让 Agent 在特定场景主动弹出建议气泡

## 2. 功能一：导航卡片跳转

### 2.1 问题

`AgentDrawer.tsx:318` 存在未实现的导航逻辑：
```typescript
const handleNavigate = useCallback((_targetType: string, _targetId: string) => {
  // TODO: 根据 targetType 导航到对应页面
}, []);
```

`AgentDrawer` 作为独立组件无法直接调用 `App.tsx` 中的路由状态方法。

### 2.2 方案：通过 AgentContextProvider 暴露导航回调

#### 类型扩展

```typescript
// AgentContextProvider 新增
interface AgentContextValue {
  // ...已有字段
  navigate: (targetType: string, targetId: string) => void;
  registerNavigator: (handler: (targetType: string, targetId: string) => void) => void;
}
```

#### 数据流

1. `App.tsx` 中调用 `registerNavigator`，注册导航实现（内部调用 `setActiveView`、`handleOpenReader` 等）
2. `AgentDrawer` 导航卡片点击时调用 `navigate(targetType, targetId)`
3. `AgentContextProvider` 内部转发给已注册的 handler
4. 导航执行后自动关闭 AgentDrawer

#### 支持的 targetType

| targetType | 导航行为 |
|-----------|---------|
| `article` | 打开文章阅读器 (`handleOpenReader`) |
| `feed` | 跳转到订阅源列表并选中 |
| `book` | 跳转到书架并选中 |
| `knowledge-graph` | 跳转到知识图谱页面 |

### 2.3 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/renderer/contexts/AgentContextProvider.tsx` | 新增 `navigate` 和 `registerNavigator` |
| `src/renderer/App.tsx` | 调用 `registerNavigator` 注册导航实现 |
| `src/renderer/components/agent/AgentDrawer.tsx` | `handleNavigate` 调用 context 的 `navigate` 方法 |
| `src/renderer/components/agent/AgentAssistant.tsx` | 导航后自动关闭 Drawer（收起到 collapsed） |

## 3. 功能二：主动建议能力

### 3.1 触发机制

在 `AgentAssistant` 组件中监听 `viewState` 变化，运行内置的建议触发器。

#### 类型定义

```typescript
interface SuggestionTrigger {
  id: string;              // 唯一标识，防重复触发
  reason: string;          // 触发原因描述
  priority: 'low' | 'medium' | 'high';
}

interface AgentSuggestion {
  message: string;         // 展示给用户的提示文字
  quickActions: Array<{
    label: string;         // 按钮文字
    prompt: string;        // 点击后发送给 Agent 的 prompt
  }>;
  autoDismissMs?: number;  // 自动消失时间，默认 10000ms
}

interface SuggestionRule {
  id: string;
  check: (prev: AgentViewState | null, next: AgentViewState) => SuggestionTrigger | null;
  generate: (trigger: SuggestionTrigger, viewState: AgentViewState) => AgentSuggestion;
}
```

### 3.2 第一版内置触发器

| 触发器 ID | 条件 | 建议内容 | 快捷操作 |
|-----------|------|---------|---------|
| `reader-opened` | 进入 reader 页面 + 文章存在 | "需要我帮你理解这篇文章吗？" | [生成摘要, 提取要点] |
| `kg-opened` | 切换到 knowledge-graph | "需要我帮你探索知识图谱吗？" | [查找相关主题, 分析连接] |
| `feeds-opened` | 切换到 feeds | "需要我帮你管理订阅吗？" | [查看阅读统计, 查看未读] |

### 3.3 防骚扰机制

- **同 ID 去重**：同一 `trigger.id` 在当前会话中只触发一次（`Set<string>` 记录）
- **冷却期**：用户手动关闭建议后，30 分钟内不再触发同类建议
- **模式检测**：当 Agent 已处于 mini/expanded 模式时，不展示气泡建议（用户已在交互中）

### 3.4 UI：AgentSuggestionBubble

在 `AgentBubble` 上方弹出轻量建议卡片：

```
  ┌─────────────────────────────────────┐
  │ 需要我帮你生成摘要吗？         ✕    │
  │ [生成摘要]  [提取要点]              │
  └─────────────────────────────────────┘
                  ○ (AgentBubble)
```

- 动画：fade-in + slide-up（从下方向上滑入）
- 10 秒后自动 fade-out
- 点击快捷按钮 → 自动打开 mini 模式 + 发送对应 prompt
- 点击 ✕ → 关闭，记录冷却

### 3.5 新增文件

| 文件 | 功能 |
|------|------|
| `src/renderer/components/agent/AgentSuggestionBubble.tsx` | 建议气泡 UI 组件 |
| `src/renderer/components/agent/suggestion-triggers.ts` | 内置触发器定义 |

### 3.6 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/shared/types.ts` | 新增 `SuggestionTrigger`、`AgentSuggestion` 类型 |
| `src/renderer/components/agent/AgentAssistant.tsx` | 集成建议触发逻辑 + 渲染 `AgentSuggestionBubble` |
| `src/renderer/components/agent/AgentBubble.tsx` | 无修改（建议气泡独立渲染在其上方） |

## 4. 不在此次范围

- 基于阅读时间的触发器（"阅读停留 > 5 分钟"）— 需要计时器，后续迭代
- 白名单管理 UI
- 新模块注册（笔记、写作等）
- 卡片渲染器注册机制
