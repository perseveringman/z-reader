# Z-Reader AI Module - 技术架构 PRD

### TL;DR

Z-Reader AI Module 是 Z-Reader 阅读器的内嵌 AI 能力层。基于 Vercel AI SDK 构建，采用三层架构（AI Provider 层、AI Service 层、AI Skills 层），提供内容智能分析、对话助手、自动化工作流等功能。技术栈：TypeScript/Node.js、Vercel AI SDK、Zod、SQLite。LLM 通过 OpenRouter（首选）和 MiniMax（备选）接入。架构保持可抽离边界，但当前只服务 Z-Reader。

---

## Goals

### Business Goals

* 为 Z-Reader 提供完整的 AI 能力，覆盖内容分析、对话、自动化三大场景。
* 基于 Vercel AI SDK 快速集成，新 Skill 开发周期不超过 1 天。
* 每次 AI 调用的 token 和成本可追踪，支持月度统计与优化。
* 架构保持可抽离，未来可复用到其他内容产品。

### User Goals

* 用户可一键对任意内容执行 AI 操作（摘要、翻译、标签）。
* 用户可与 AI 对话，讨论文章内容，AI 可帮用户操作应用（搜索、标记、标签等）。
* 后台自动化任务（推荐、归档、报告）不干扰正常使用。
* 所有内容和对话数据本地存储，用户完全控制。
* AI 响应支持流式输出，体验实时。

### Non-Goals

* 不做独立的通用 Agent Framework（不再定位为"Nexus Agent Framework"）。
* 不做第三方插件生态或公开 Skill 市场。
* 不做 MCP Server（Electron 桌面应用不需要对外暴露 MCP 协议）。
* 不做分布式执行、Federated Learning、边缘计算。
* MVP 阶段不做向量存储（后期演进）。
* 不做 ReAct/CoT 自适应编排引擎（AI SDK 的 `maxSteps` + Tool Calling 覆盖需求）。

---

## User Stories

**Z-Reader 用户**

* 作为读者，我希望一键获取文章摘要和翻译，快速了解文章核心内容。
* 作为读者，我希望 AI 自动为文章打标签，减少手动整理的工作量。
* 作为 Power User，我希望和 AI 对话来批量分析、筛选、整理内容，取代多步手动操作。
* 作为订阅大量 Feed 的用户，我希望 AI 自动推荐值得阅读的内容、归档过期内容。
* 作为想复盘阅读习惯的用户，我希望 AI 生成阅读周报。

**开发者**

* 作为开发者，我希望新增一个 AI Skill 只需写一个函数 + schema 定义，不需要改底层代码。
* 作为开发者，我希望可以随时切换 LLM Provider，不影响上层功能。
* 作为开发者，我希望能查看每次 AI 调用的完整 trace（prompt → 响应 → Tool 调用 → 结果），方便调试。

---

## Functional Requirements

* **LLM 集成 (Priority: Highest)**

  * 基于 Vercel AI SDK 接入 OpenRouter（首选）和 MiniMax（备选）。
  * 模型路由：按任务类型（fast/smart/cheap）映射到具体模型。
  * Fallback：主模型不可用时 3 秒内切换备选。
  * Token 用量和成本记录（每次调用写入 ai_task_logs）。

* **AI Skills (Priority: Highest)**

  * Skill 接口：每个 Skill = 纯函数 + Zod schema。
  * 8 个 MVP Skills：summarize、translate、auto_tag、extract_topics、chat、recommend_next、auto_archive、generate_report。
  * 流式输出支持（摘要、对话等场景）。

* **Chat 对话 (Priority: High)**

  * 多轮对话，使用 AI SDK 的 `streamText` + `tools` + `maxSteps`。
  * Tool Calling：AI 可调用 Z-Reader 功能（搜索文章、标记已读、添加标签等）。
  * 会话历史持久化到 SQLite。

* **后台任务 (Priority: Medium)**

  * 简单的内存任务队列，3 并发不阻塞 UI。
  * 支持推荐、归档、报告等后台 Skill 执行。
  * 任务状态管理（pending/running/completed/failed）。

* **执行追踪与调试 (Priority: Medium)**

  * 每次 AI 调用记录完整 trace（输入/输出/耗时/token/成本）。
  * AI 调试面板：查看调用历史、trace 详情、成本统计。
  * 开发模式下 Console 输出详细日志。

* **数据持久化 (Priority: High)**

  * 3 张核心表：ai_chat_sessions、ai_task_logs、ai_settings。
  * 预留扩展字段（metadata_json、traces_json）。

---

## Architecture Overview

### 三层架构

```
┌─────────────────────────────────────────┐
│          AI Skills 层                    │
│  (具体业务功能: 摘要/翻译/标签/对话等)    │
│  每个 Skill = 一个函数 + Zod schema      │
└──────────────────▲──────────────────────┘
                   │ 调用
┌──────────────────┴──────────────────────┐
│          AI Service 层                   │
│  LLM 调用抽象（基于 Vercel AI SDK）       │
│  Chat Session 管理 / Tool 执行管理       │
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

### 边界规则

* `src/ai/` 不 import `src/main/` 或 `src/renderer/`。
* 业务数据访问通过注入的回调函数，不直接依赖 Drizzle 表。
* `src/main/ipc/agent-handlers.ts` 作为 AI 模块和 Electron IPC 的桥接层。
* `src/renderer/` 通过 `window.electronAPI` 调用 AI 功能。

---

## AI Provider 层设计

### LLM Provider

* 基于 Vercel AI SDK 的 `@ai-sdk/openai` 适配器。
* OpenRouter 和 MiniMax 均兼容 OpenAI 协议，统一接入。
* 统一模型选择函数 `getModel(task: 'fast' | 'smart' | 'cheap')`。
* Fallback 逻辑：主 Provider 超时/错误时自动切换备选。

### 数据持久化

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `ai_chat_sessions` | 对话历史 | session_id, title, messages_json, created_at, updated_at |
| `ai_task_logs` | 任务记录与追踪 | task_type, status, input_json, output_json, traces_json, token_count, cost_usd, metadata_json, created_at |
| `ai_settings` | AI 配置 | key, value_json |

后期新增表（不改现有表）：
* `ai_content_embeddings` → 向量检索
* `ai_learned_patterns` → 行为归纳
* `ai_user_behaviors` → 行为日志

### 配置管理

* API Key 存储在 SQLite（ai_settings 表）。
* 模型偏好：默认模型、Fallback 模型。
* 功能开关：启用/禁用特定 Skill。

---

## AI Service 层设计

### LLM 调用抽象

基于 Vercel AI SDK：
* `generateText()` / `streamText()` → 文本生成与流式输出
* `generateObject()` / `streamObject()` → 结构化输出（带 Zod schema 校验）
* Tool Calling → AI SDK 原生支持，替代自建 MCP/Tool Registry

### Chat Session 管理

* 多轮对话：AI SDK 的 `streamText` + `messages` + `tools` + `maxSteps`。
* 会话历史持久化到 `ai_chat_sessions`。
* `maxSteps` 替代 ReAct/CoT 编排——AI 自动决定何时调用工具、何时回复用户。

### 任务队列

```typescript
interface AITaskQueue {
  enqueue(task: AITask): Promise<string>;
  cancel(taskId: string): Promise<void>;
  getStatus(taskId: string): TaskStatus;
  onProgress(taskId: string, cb: (update: TaskUpdate) => void): void;
}
```

* 简单的内存任务队列 + 并发控制（默认 3 并发）。
* 接口稳定，后期可替换为持久化队列/优先级队列/DAG 调度器。

### 执行追踪

* 每次 AI 调用自动记录 trace：输入/输出/耗时/token/成本。
* 存入 `ai_task_logs.traces_json`。
* 开发模式下 DevTools Console 输出详细日志。
* AI 调试面板：调用历史、trace 详情、成本统计。

---

## AI Skills 层设计

### Skill 接口

```typescript
interface AISkill<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  execute: (input: TInput, ctx: AIContext) => Promise<TOutput>;
}
```

### MVP Skills

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

### 后期 Skills（不在 MVP）

* `detect_sentiment`（情感分析）
* `compare_viewpoints`（观点对照）
* `build_knowledge_graph`（知识图谱，需向量存储）
* `cluster_by_topic`（主题聚类，需向量存储）
* `fact_check`（事实核查）

### Tools 定义（AI 可调用的 Z-Reader 功能）

用于 Chat 对话中的 Tool Calling：

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

## Technical Specifications

### 技术选型

| 能力 | 选型 | 说明 |
|------|------|------|
| LLM 调用 | Vercel AI SDK (`ai`, `@ai-sdk/openai`) | 多 Provider、流式输出、Tool Calling、结构化输出 |
| LLM Provider | OpenRouter（首选）、MiniMax（备选） | 均兼容 OpenAI 协议 |
| Schema 校验 | Zod | AI SDK 原生支持 |
| 持久化 | better-sqlite3 + Drizzle ORM | 复用现有基础设施 |

### 不引入的依赖

* LangChain/LangGraph → Vercel AI SDK 已覆盖需求
* sqlite-vss → MVP 不需要向量检索
* 独立的任务调度库 → 简单内存队列足够

---

## 代码目录结构

```
src/ai/
  providers/
    llm.ts              # LLM Provider 配置（OpenRouter/MiniMax 适配）
    config.ts           # AI 配置管理（API Key/模型/偏好）
    db.ts               # AI 相关 SQLite 表操作
  services/
    chat.ts             # Chat 对话管理
    task-queue.ts       # 后台任务队列
    trace.ts            # 执行追踪
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
    types.ts            # Tool 接口定义
    article-tools.ts    # 文章相关 Tools
    tag-tools.ts        # 标签相关 Tools
    feed-tools.ts       # Feed 相关 Tools
  index.ts              # 统一导出
```

---

## Development Roadmap

### Phase 1：基础 AI 能力

**交付物**：
* LLM Provider 集成（OpenRouter + Vercel AI SDK）
* 3 个核心 Skills：`summarize`、`translate`、`auto_tag`
* AI 设置面板（配置 API Key、选择模型）
* 执行追踪基础（记录每次调用的 trace）
* UI 集成：文章详情页增加"AI 摘要""翻译""自动标签"按钮

**用户价值**：用户可以对任意文章一键获取 AI 摘要、翻译、自动打标签。

### Phase 2：AI 对话 + Tool Calling

**交付物**：
* Chat 服务（多轮对话 + 会话历史持久化）
* 4 类 Tool 定义（article/tag/feed/highlight）
* Chat UI 组件（侧边栏对话面板）
* `extract_topics` Skill
* AI 调试面板（查看调用历史/trace/成本）

**用户价值**：用户可以和 AI 聊天讨论文章内容，AI 可以帮用户操作应用。

### Phase 3：后台自动化 + 智能推荐

**交付物**：
* 任务队列服务（并发控制/状态管理）
* `recommend_next` Skill
* `auto_archive` Skill
* `generate_report` Skill
* 后台定时任务配置 UI

**用户价值**：AI 在后台自动整理内容、推荐下一篇、生成阅读报告。

### Phase 4（后续演进，不在 MVP）

* 向量存储 + 语义检索（`ai_content_embeddings` 表）
* 行为学习 + 个性化推荐（`ai_learned_patterns` 表）
* 多模型策略优化
* 高级任务编排

---

## 可演进性设计

### 任务队列演进路径

```
Phase 3: 简单内存队列（3 并发）
  ↓
Phase 4+: 持久化队列 + 优先级 + 失败重试
  ↓
远期: DAG 任务图 + 节点级重试 + 快照恢复
```

接口 `AITaskQueue` 保持稳定，实现可替换。

### 数据持久化演进路径

```
Phase 1-3: 3 张核心表
  ↓ 新增表，不改现有表
Phase 4+: + ai_content_embeddings + ai_learned_patterns + ai_user_behaviors
```

### LLM 层演进路径

```
Phase 1: OpenRouter 单 Provider
  ↓
Phase 2+: OpenRouter + MiniMax
  ↓
远期: + Ollama（本地模型）+ 动态路由策略
```

---

## Success Metrics

| 指标 | 目标 | 阶段 |
|------|------|------|
| 可对任意文章执行 AI 摘要/翻译/标签 | 功能可用 | Phase 1 |
| 主模型不可用时切换到备选 | 3 秒内 | Phase 1 |
| AI 对话可多轮交互并调用应用功能 | 功能可用 | Phase 2 |
| 新 Skill 开发周期 | 不超过 1 天 | Phase 2 |
| 后台任务不阻塞 UI | 3 并发正常运行 | Phase 3 |
| 每次 AI 调用成本可追踪 | 月度可统计 | Phase 1 |

---

## Testing Strategy

* **单元测试**：每个 Skill 独立测试（mock LLM 响应）。
* **集成测试**：Chat 多轮对话 + Tool Calling 端到端测试。
* **LLM 响应测试**：使用 AI SDK 的 mock provider 测试 prompt 质量。
* **性能测试**：后台任务并发执行不阻塞 UI 交互。

---

## Migration Notes

### 旧 Agent 底座清理

之前的 `src/core-agent/` 和 `src/business-adapters/` 代码已删除。需要清理残留：

* `src/shared/agent-protocol/` → 删除
* `src/shared/types.ts` 中的 Agent 相关类型 → 删除
* `src/main/ipc/agent-handlers.ts` → 重写为新 AI 模块的 IPC 桥接
* `src/main/db/schema.ts` 中的 agent 相关表定义 → 替换为新的 3 张表
* `src/preload.ts` 中的 agent 相关 API → 替换为新 AI API
