# Z-Reader AI Module 设计文档

> 日期：2026-02-13
> 状态：已确认

## 1. 定位

Z-Reader AI Module 是 Z-Reader 的内部 AI 能力模块，为阅读器提供内容智能分析、对话助手、自动化工作流等 AI 功能。

**核心原则**：
- **产品导向**：服务 Z-Reader 用户需求，不做通用框架
- **可抽离边界**：`src/ai/` 不依赖 `src/main/` 或 `src/renderer/`，保持架构上的可独立性
- **功能驱动**：每个开发阶段都交付用户可见的 AI 功能
- **复用优先**：基于 Vercel AI SDK，不重复造轮子

**Non-Goals**：
- 不做独立的 Agent Framework（不再定位为"Nexus Agent Framework"）
- 不做第三方插件生态
- 不做 MCP Server（Electron 桌面应用不需要对外暴露 MCP 协议）
- 不做分布式执行、Federated Learning
- 不做向量存储的 MVP 实现（后期演进）

---

## 2. 三层架构

```
┌─────────────────────────────────────────┐
│          AI Skills 层                    │
│  (具体业务功能: 摘要/翻译/标签/对话等)    │
│  每个 Skill = 一个函数 + schema 定义     │
└──────────────────▲──────────────────────┘
                   │ 调用
┌──────────────────┴──────────────────────┐
│          AI Service 层                   │
│  LLM 调用抽象（基于 Vercel AI SDK）       │
│  Chat Session 管理 / Tool 执行管理       │
│  Memory（会话记忆 + 简单持久化）          │
│  任务队列（后台任务调度）                 │
│  执行追踪（调试/日志/成本统计）           │
└──────────────────▲──────────────────────┘
                   │ Provider 接口
┌──────────────────┴──────────────────────┐
│          AI Provider 层                  │
│  LLM Provider 配置（OpenRouter/MiniMax） │
│  SQLite 持久化（chat history/任务记录）  │
│  配置管理（API Key/模型选择/偏好）        │
└─────────────────────────────────────────┘
```

### 2.1 AI Provider 层

**LLM Provider 配置**：
- 基于 Vercel AI SDK 的 `@ai-sdk/openai` 适配器
- OpenRouter 和 MiniMax 均兼容 OpenAI 协议，统一接入
- 模型路由配置：按任务类型（fast/smart/cheap）映射到具体模型
- Fallback 逻辑：主模型不可用时 3 秒内切换备选

**SQLite 持久化**（3 张核心表）：

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `ai_chat_sessions` | 对话历史 | session_id, title, messages_json, created_at, updated_at |
| `ai_task_logs` | 任务记录与追踪 | task_type, status, input_json, output_json, traces_json, token_count, cost_usd, metadata_json, created_at |
| `ai_settings` | AI 配置 | key, value_json |

后期可新增表（不改现有表）：
- `ai_content_embeddings` → 向量检索
- `ai_learned_patterns` → 行为归纳
- `ai_user_behaviors` → 行为日志

**配置管理**：
- API Key 存储在 SQLite settings
- 模型偏好（默认模型、fallback 模型）
- 功能开关（启用/禁用特定 Skill）

### 2.2 AI Service 层

**LLM 调用抽象**：
- 基于 Vercel AI SDK 的 `generateText` / `streamText` / `generateObject` / `streamObject`
- 统一的模型选择函数 `getModel(task: 'fast' | 'smart' | 'cheap')`
- Tool Calling 使用 AI SDK 原生支持，替代自建 MCP/Tool Registry

**Chat Session 管理**：
- 多轮对话支持，使用 AI SDK 的 `streamText` + `messages` + `tools`
- 会话历史持久化到 `ai_chat_sessions`
- Tool Calling 集成：AI 可调用 Z-Reader 功能（搜索/标记/打标签等）
- `maxSteps` 替代 ReAct/CoT 编排

**任务队列**：
- 简单的内存任务队列 + 并发控制（默认 3 并发）
- 接口抽象稳定，后期可替换为持久化队列/优先级队列/DAG 调度器

```typescript
interface AITaskQueue {
  enqueue(task: AITask): Promise<string>;
  cancel(taskId: string): Promise<void>;
  getStatus(taskId: string): TaskStatus;
  onProgress(taskId: string, cb: (update: TaskUpdate) => void): void;
}
```

**执行追踪**：
- 每次 AI 调用自动记录 trace（输入/输出/耗时/token/成本）
- 存入 `ai_task_logs.traces_json`
- 开发模式下在 DevTools Console 输出详细日志
- AI 调试面板可查看调用历史、trace 详情、成本统计

### 2.3 AI Skills 层

每个 Skill 是一个纯函数 + schema 定义：

```typescript
interface AISkill<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  execute: (input: TInput, ctx: AIContext) => Promise<TOutput>;
}
```

**MVP Skills 列表**：

| Skill | 类型 | 阶段 | 说明 |
|-------|------|------|------|
| `summarize` | 单次调用 | Phase 1 | 文章内容摘要 |
| `translate` | 单次调用 | Phase 1 | 内容翻译 |
| `auto_tag` | 单次调用 | Phase 1 | 基于内容自动打标签 |
| `extract_topics` | 单次调用 | Phase 2 | 提取文章主题关键词 |
| `chat` | 多轮对话 | Phase 2 | AI 对话助手（含 Tool Calling） |
| `recommend_next` | Tool Calling | Phase 3 | 基于阅读历史推荐下一篇 |
| `auto_archive` | 后台任务 | Phase 3 | 自动归档已读/过期内容 |
| `generate_report` | 后台任务 | Phase 3 | 生成阅读周报 |

**后期演进 Skills**（不在 MVP）：
- `detect_sentiment`（情感分析）
- `compare_viewpoints`（观点对照）
- `build_knowledge_graph`（知识图谱）
- `cluster_by_topic`（主题聚类）
- `fact_check`（事实核查）

---

## 3. Tools 定义（AI 可调用的 Z-Reader 功能）

用于 Chat 对话中的 Tool Calling，让 AI 能操作 Z-Reader：

| Tool | 功能 | 参数 |
|------|------|------|
| `search_articles` | 搜索文章 | query, filters |
| `get_article_content` | 获取文章全文 | articleId |
| `mark_as_read` | 标记已读 | articleId |
| `add_tag` | 添加标签 | articleId, tagName |
| `remove_tag` | 移除标签 | articleId, tagName |
| `archive_article` | 归档文章 | articleId |
| `list_feeds` | 列出所有订阅源 | — |
| `get_reading_stats` | 获取阅读统计 | timeRange |

Tools 通过注入的回调函数访问业务数据，`src/ai/` 不直接依赖 Drizzle 表。

---

## 4. 技术选型

| 能力 | 选型 | 说明 |
|------|------|------|
| LLM 调用 | Vercel AI SDK (`ai`, `@ai-sdk/openai`) | 多 Provider、流式输出、Tool Calling、结构化输出 |
| LLM Provider | OpenRouter（首选）、MiniMax（备选） | 均兼容 OpenAI 协议 |
| Schema 校验 | Zod | AI SDK 原生支持，用于 Skill input/output 和 Tool 参数校验 |
| 持久化 | better-sqlite3 + Drizzle ORM | 复用现有数据库基础设施 |
| 流式 UI | AI SDK 的 `useChat` hook（或自定义） | 渲染进程对话 UI |

**不引入的依赖**：
- LangChain/LangGraph → Vercel AI SDK 已覆盖需求
- sqlite-vss → MVP 不需要向量检索
- 任何独立的任务调度库 → 简单内存队列足够

---

## 5. 代码目录结构

```
src/ai/
  providers/
    llm.ts              # LLM Provider 配置（OpenRouter/MiniMax 适配）
    config.ts           # AI 配置管理（API Key/模型/偏好）
    db.ts               # AI 相关 SQLite 表操作
  services/
    chat.ts             # Chat 对话管理（会话创建/消息处理/Tool Calling）
    task-queue.ts       # 后台任务队列（并发控制/状态管理）
    trace.ts            # 执行追踪（调试/日志/成本统计）
  skills/
    types.ts            # Skill 接口定义
    summarize.ts        # 内容摘要
    translate.ts        # 内容翻译
    auto-tag.ts         # 自动标签
    extract-topics.ts   # 主题提取
    recommend.ts        # 推荐下一篇
    auto-archive.ts     # 自动归档
    report.ts           # 阅读周报
  tools/
    types.ts            # Tool 接口定义（AI SDK Tool 格式）
    article-tools.ts    # 文章相关 Tools（搜索/标记/获取内容）
    tag-tools.ts        # 标签相关 Tools
    feed-tools.ts       # Feed 相关 Tools
  index.ts              # 统一导出
```

**边界规则**：
- `src/ai/` 不 import `src/main/` 或 `src/renderer/`
- 业务数据访问通过 `tools/` 中注入的回调函数
- `src/main/ipc/agent-handlers.ts` 作为 AI 模块和 Electron IPC 的桥接层
- `src/renderer/` 通过 `window.electronAPI` 调用 AI 功能

---

## 6. 开发 Phase 规划

### Phase 1：基础 AI 能力

**交付物**：
- LLM Provider 集成（OpenRouter + Vercel AI SDK）
- 3 个核心 Skills：`summarize`、`translate`、`auto_tag`
- AI 设置面板（配置 API Key、选择模型）
- 执行追踪基础（记录每次调用的 trace）
- UI 集成：文章详情页增加"AI 摘要""翻译""自动标签"按钮

**用户价值**：用户可以对任意文章一键获取 AI 摘要、翻译、自动打标签。

### Phase 2：AI 对话 + Tool Calling

**交付物**：
- Chat 服务（多轮对话 + 会话历史持久化）
- 4 类 Tool 定义（article/tag/feed/highlight）
- Chat UI 组件（侧边栏对话面板）
- `extract_topics` Skill
- AI 调试面板（查看调用历史/trace/成本）

**用户价值**：用户可以和 AI 聊天讨论文章内容，AI 可以帮用户操作应用。

### Phase 3：后台自动化 + 智能推荐

**交付物**：
- 任务队列服务（并发控制/状态管理）
- `recommend_next` Skill（基于阅读历史推荐）
- `auto_archive` Skill（自动归档已读/过期内容）
- `generate_report` Skill（生成阅读周报）
- 后台定时任务配置 UI

**用户价值**：AI 在后台自动整理内容、推荐下一篇、生成阅读报告。

### Phase 4（后续演进，不在 MVP）
- 向量存储 + 语义检索（`ai_content_embeddings` 表）
- 行为学习 + 个性化推荐（`ai_learned_patterns` 表）
- 多模型策略优化（动态成本/质量路由）
- 高级任务编排（优先级队列/持久化队列）

---

## 7. 可演进性设计

### 任务队列演进路径

```
Phase 3: 简单内存队列（3 并发）
  ↓ 按需升级
Phase 4+: 持久化队列 + 优先级 + 失败重试
  ↓ 按需升级
远期: DAG 任务图 + 节点级重试 + 快照恢复
```

接口 `AITaskQueue` 保持稳定，实现可替换。

### 数据持久化演进路径

```
Phase 1-3: 3 张核心表（chat_sessions, task_logs, settings）
  ↓ 新增表，不改现有表
Phase 4+: + ai_content_embeddings（向量检索）
         + ai_learned_patterns（行为归纳）
         + ai_user_behaviors（行为日志）
```

`ai_task_logs` 中的 `metadata_json` 和 `traces_json` 提供扩展空间。

### LLM 层演进路径

```
Phase 1: OpenRouter 单 Provider
  ↓ 增加 Provider
Phase 2+: OpenRouter + MiniMax
  ↓ 增加策略
远期: + Ollama（本地模型）+ 动态路由策略
```

Vercel AI SDK 的 Provider 架构天然支持多 Provider 切换。

---

## 8. 成功指标

| 指标 | 目标 | 阶段 |
|------|------|------|
| 可对任意文章执行 AI 摘要/翻译/标签 | 功能可用 | Phase 1 |
| 主模型不可用时切换到备选 | 3 秒内 | Phase 1 |
| AI 对话可多轮交互并调用应用功能 | 功能可用 | Phase 2 |
| 新 Skill 开发周期 | 不超过 1 天 | Phase 2 |
| 后台任务不阻塞 UI | 3 并发正常运行 | Phase 3 |
| 每次 AI 调用成本可追踪 | 月度可统计 | Phase 1 |

---

## 9. 与旧 Agent 底座的关系

之前的 `src/core-agent/` 和 `src/business-adapters/` 代码（P1~P12 实现）已在 `1b424c3` 提交中删除。本设计是对该架构的完全重新设计，不延续旧代码。

**需要清理的残留**：
- `src/shared/agent-protocol/` → 删除
- `src/shared/types.ts` 中的 Agent 相关类型 → 删除
- `src/main/ipc/agent-handlers.ts` → 重写为新 AI 模块的 IPC 桥接
- `src/main/db/schema.ts` 中的 agent 相关表定义 → 替换为新的 3 张表
- `src/preload.ts` 中的 agent 相关 API → 替换为新 AI API
