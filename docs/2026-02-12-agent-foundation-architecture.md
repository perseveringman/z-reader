# 2026-02-12 Agent 底座架构设计（Local-First Monolith，预留 B/C 演进）

> 关联 Linear Issue: `ZYB-173`

## 1. 目标与约束

### 1.1 目标
- 为 Z-Reader 提供一套 **SOTA Agent 底座**，支持：任务规划、工具调用、记忆、检索、安全策略、可观测性。
- 采用 **A 方案（Local-First Monolith）**，并保证可平滑演进到：
  - **B**：本地微内核 + Worker 进程池
  - **C**：事件驱动 DAG 编排
- 底座与业务完全分离：核心层无业务语义、无业务依赖。

### 1.2 关键约束
- 允许使用联网大模型 API。
- 不依赖需单独部署的云基础设施（向量库、长期记忆、任务队列、审计均本地）。
- 向量层采用可插拔双后端：`sqlite-vec` / `LanceDB`。
- 编排模式采用混合自适应：`ReAct` 与 `Plan-and-Execute` 自动路由，可手动强制。

### 1.3 非目标
- 本文不实现具体业务 Agent（如 feed/article/highlight 业务流程）。
- 本文不绑定单一模型厂商。

---

## 2. 总体架构

### 2.1 分层（Hexagonal / Clean）

```text
┌────────────────────────────────────────────────────────┐
│                    Business Adapters                  │
│  (z-reader adapter, future adapters, tool adapters)  │
└───────────────────▲────────────────────────────────────┘
                    │ implements contracts only
┌───────────────────┴────────────────────────────────────┐
│                     Core Agent                         │
│ kernel / orchestration / memory / tooling / safety /  │
│ observability / contracts / provider factories         │
└───────────────────▲────────────────────────────────────┘
                    │ provider interfaces
┌───────────────────┴────────────────────────────────────┐
│                      Providers                          │
│ llm gateway / sqlite-vec / lancedb / sqlite trace     │
└────────────────────────────────────────────────────────┘
```

### 2.2 解耦边界
- `src/core-agent/**` 禁止 import `src/main/**`、`src/renderer/**`、`src/business-adapters/**`。
- 业务通过 `IBusinessCapabilityProvider` 注入，不允许核心层反向依赖业务实现。
- 所有跨层能力通过 `contracts` 暴露，禁止依赖具体 provider 私有细节。

---

## 3. 核心模块职责

### 3.1 Kernel
- 会话生命周期管理（创建、恢复、关闭）。
- 任务状态机（`queued/running/waiting_approval/succeeded/failed/canceled`）。
- 事件总线分发（供观测、审计、UI 订阅）。

### 3.2 Orchestration
- `TaskClassifier`：复杂度、风险、上下文长度、工具数量评估。
- `StrategyRouter`：自适应选择 `react` 或 `plan_execute`。
- `Executor`：按策略执行，支持重试、降级、人工确认挂起点。

### 3.3 Memory
- 短期记忆：会话上下文、scratchpad（SQLite）。
- 长期记忆：事实记忆、用户偏好（SQLite）。
- 语义记忆：向量检索（`IVectorStore` 插拔实现）。

### 3.4 Tooling
- 工具注册中心（Schema + 权限声明 + 超时配置）。
- 工具执行沙箱（文件白名单、命令黑名单、网络域白名单）。
- 参数校验（zod schema）与审计记录。

### 3.5 Safety
- Prompt 注入风险检测。
- 风险分级（`low/medium/high/critical`）。
- `ApprovalGateway`：高风险动作人工确认后执行。

### 3.6 Observability
- 每步 trace（planning/tool/llm/policy/approval）。
- 指标：token、延迟、成本、工具成功率。
- 可回放：按 `taskId` 重建完整执行轨迹。

---

## 4. 关键接口契约（A→B/C 的演进锚点）

> 下列接口由 `src/core-agent/contracts` 定义。

- `IStrategyRouter`
- `IPlanner`
- `IExecutor`
- `IMemoryStore`
- `IVectorStore`
- `IRetriever`
- `ITool`
- `IToolRegistry`
- `IToolSandbox`
- `IPolicyEngine`
- `IApprovalGateway`
- `ITraceStore`
- `IEventBus`
- `IBusinessCapabilityProvider`

### 4.1 编排模式
- 默认：`strategy = adaptive`。
- 可强制：`force_mode = react | plan_execute`。
- 失败降级：
  - `plan_execute` 失败 → 受限 `react`。
  - 连续失败或高风险 → `waiting_approval`。

### 4.2 向量双后端切换
- 统一 `IVectorStore` API：`upsert/search/delete`。
- 配置驱动 provider 选择：`sqlite-vec` / `lancedb`。
- 支持迁移期灰度双写与一致性校验任务。

---

## 5. 数据流（执行路径）

1. UI/业务适配器发起 `executeTask(request)`。
2. Kernel 创建任务并广播 `TaskQueued`。
3. StrategyRouter 自适应选路（或读取 `force_mode`）。
4. Planner 生成动作（ReAct step 或 plan tree）。
5. Executor 调用 Tool Runtime。
6. Safety 执行风险判断；高风险进入审批闸门。
7. Memory 更新短期/长期记忆；可触发向量写入。
8. Observability 持续记录 trace / metrics。
9. Kernel 写入终态并发布 `TaskSucceeded`/`TaskFailed`。

---

## 6. 本地数据模型草案（SQLite）

### 6.1 表建议
- `agent_sessions`
  - `id`, `user_id`, `created_at`, `updated_at`, `metadata_json`
- `agent_tasks`
  - `id`, `session_id`, `status`, `strategy`, `risk_level`, `input_json`, `output_json`, `error_text`, `created_at`, `updated_at`
- `agent_task_events`
  - `id`, `task_id`, `event_type`, `payload_json`, `occurred_at`
- `agent_memories`
  - `id`, `scope`(`session`/`long_term`), `namespace`, `key`, `value_json`, `created_at`, `updated_at`
- `agent_traces`
  - `id`, `task_id`, `span`, `kind`, `latency_ms`, `token_in`, `token_out`, `cost_usd`, `payload_json`, `created_at`

### 6.2 向量数据
- sqlite-vec：向量与 metadata 落地同库。
- LanceDB：本地文件目录（按 namespace 划分）。
- 统一通过 `IVectorStore` 访问，业务层无感。

---

## 7. 目录结构（落地）

```text
src/
  core-agent/
    contracts/
    runtime/
    providers/
    security/
    observability/
  business-adapters/
    zreader-agent/
  shared/
    agent-protocol/
```

### 7.1 规则
- `core-agent`：可独立发布的底座包边界。
- `business-adapters`：仅实现 contracts，不允许修改 core 内核。
- `shared/agent-protocol`：跨进程/跨层消息协议。

---

## 8. 配置与开关

- `AGENT_MODEL_PROVIDER`：模型提供商。
- `AGENT_STRATEGY_MODE`：`adaptive|react|plan_execute`。
- `AGENT_VECTOR_PROVIDER`：`sqlite_vec|lancedb`。
- `AGENT_VECTOR_MIGRATION_DUAL_WRITE`：迁移期双写。
- `AGENT_POLICY_APPROVAL_REQUIRED_RISK`：审批阈值。

---

## 9. 分阶段路线图

### P1（1-2 周）
- 单 Agent 执行主链路
- 自适应编排路由
- 工具注册 + 最小策略控制
- trace 打点

### P2（1-2 周）
- 长期记忆
- 向量双后端可插拔
- 混合检索（BM25 + vector）

### P3（1 周）
- 风险策略与审批闸门
- 审计回放
- 边界检查自动化

### P4（1-2 周）
- 多 Agent 协作（Supervisor + Specialist）
- 任务队列与性能优化
- 为 B/C 演进预留兼容层

---

## 10. 验收标准（MVP）

### 功能验收
- 可按任务复杂度自动选择 ReAct/Plan-and-Execute。
- 可通过配置强制策略模式。
- 可切换向量后端并保持同一调用接口。
- 核心层与业务层边界检查可自动验证。

### 性能基线（初版）
- 单任务调度开销（不含 LLM）P95 < 50ms。
- 工具调用失败重试具备指数退避。
- trace 记录对主流程额外开销 < 10%。

### 安全基线
- 高风险工具调用默认进入审批。
- 工具参数在执行前必须 schema 校验通过。
- 审计日志可按任务重放关键决策路径。

---

## 11. B/C 演进兼容策略

### A → B（多进程）
- 把 `IExecutor` 和 `IToolRuntime` 迁移到 worker。
- `IEventBus` 从内存实现切换到 IPC/本地消息队列。
- contracts 不变，provider 工厂替换。

### A → C（DAG）
- 在 `IPlanner` 返回结构中引入 `plan graph` 扩展字段。
- `IExecutor` 支持节点级状态持久化与重放。
- `ITaskStore` 增加节点依赖关系索引。

---

## 12. 实施备注

- 本文仅定义底座架构，不引入业务领域词汇到核心代码。
- 后续开发遵循“先 contracts、后 provider、再 adapter”的顺序。
- 必须持续运行边界测试，防止未来迭代回耦。
