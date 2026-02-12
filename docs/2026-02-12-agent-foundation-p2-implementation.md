# 2026-02-12 Agent 底座 P2 实装记录

> 关联 Linear Issue: `ZYB-176`

## 1. 本次目标

在 P1 主链路基础上，补齐 P2 的核心能力：

- TraceStore（SQLite）
- MemoryStore（SQLite）
- 向量双后端 Provider（sqlite-vec / lancedb）
- Runtime 接入可选 trace 打点

## 2. 交付内容

### 2.1 Memory 持久化
- 新增 `SqliteMemoryStore`：`src/core-agent/providers/memory/sqlite-memory-store.ts`
  - `upsert(record)`
  - `query({ scope, namespace, key, limit })`
  - `delete(namespace, key)`
- 表结构自动初始化：`agent_memories`
- 导出：`src/core-agent/providers/memory/index.ts`

### 2.2 Trace 持久化
- 新增 `SqliteTraceStore`：`src/core-agent/providers/trace/sqlite-trace-store.ts`
  - `append(record)`
  - `query({ taskId, limit })`
- 新增 `InMemoryTraceStore`（测试/本地运行）：`src/core-agent/observability/in-memory-trace-store.ts`
- 表结构自动初始化：`agent_traces`
- 导出更新：
  - `src/core-agent/providers/trace/index.ts`
  - `src/core-agent/observability/index.ts`

### 2.3 向量双后端 Provider 首版
- 新增共享基类：`BaseInMemoryVectorProvider`
  - 支持 `upsert/search/delete`
  - `search` 使用余弦相似度计算并按 `topK` 返回
- 新增 provider：
  - `SqliteVecProvider`
  - `LanceDbProvider`
- 新增工厂能力：`VectorProviderFactory.create(options)`
  - 按 `kind` 创建具体 provider
  - 保留兼容签名 `create(store, options)`
- 文件：
  - `src/core-agent/providers/vector/base-in-memory-vector-provider.ts`
  - `src/core-agent/providers/vector/sqlite-vec-provider.ts`
  - `src/core-agent/providers/vector/lancedb-provider.ts`
  - `src/core-agent/providers/vector/provider-factory.ts`

### 2.4 Runtime Trace 接入
- `AgentRuntime` 新增可选 `traceStore` 入参，记录关键 span：
  - `runtime.queued`
  - `runtime.classified`
  - `runtime.running`
  - `runtime.planned`
  - `runtime.executed`
  - `runtime.completed`
- 文件：`src/core-agent/runtime/agent-runtime.ts`

### 2.5 主库迁移补齐
- `src/main/db/schema.ts`
  - 新增 `agentMemories`
  - 新增 `agentTraces`
- `src/main/db/index.ts`
  - 新增 `agent_memories` / `agent_traces` 的建表与索引迁移

## 3. 测试

### 3.1 新增测试
- `tests/core-agent-memory-store.test.ts`
- `tests/core-agent-trace-store.test.ts`
- `tests/core-agent-vector-provider.test.ts`

### 3.2 核验结果
- `pnpm test`：通过（`63 passed`）
- 变更范围 ESLint：通过

## 4. 结果状态

- P2 范围内 contracts 能力已具备 provider 落地。
- Runtime 已支持写入 trace。
- 向量层已具备双后端可切换入口，后续可替换为真实 sqlite-vec / LanceDB 存储实现。

## 5. 下一步建议（P3）

1. 实装 `ITraceStore` 与 `IEventBus` 的统一审计回放视图。
2. 接入审批 UI（IPC）替代静态审批网关。
3. 增加风险策略配置化（按工具名/权限/风险级别组合策略）。
4. 为多 Agent 协作预留任务队列与任务依赖关系。
