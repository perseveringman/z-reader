# 2026-02-12 Agent 底座 P3 实装记录

> 关联 Linear Issue: `ZYB-177`

## 1. 本次目标

在 P2 基础上提升“可运营”能力：

- 审批从静态决策升级为可交互审批队列（IPC）
- 审计回放能力（按 task 聚合任务、事件、trace）
- 策略配置化（支持工具规则与阈值配置）

## 2. 交付内容

### 2.1 审批交互能力
- 新增 `InMemoryApprovalQueue`
  - `enqueue(request)`：挂起审批并返回 Promise
  - `listPending()`：查看待审批列表
  - `decide(id, input)`：提交审批决策
- 新增 `InteractiveApprovalGateway`，通过 queue 实现异步审批
- 文件：
  - `src/core-agent/security/approval-queue.ts`
  - `src/core-agent/security/interactive-approval-gateway.ts`

### 2.2 策略配置化能力
- 新增策略配置模型：
  - `AgentPolicyConfig`
  - `AgentToolPolicyRule`
  - `normalize/merge` 工具
- 新增 `ConfigurablePolicyEngine`
  - 支持工具级规则：`blocked / overrideRiskLevel / forceApproval`
  - 支持全局风险阈值与阻断级别
- 文件：
  - `src/core-agent/security/policy-config.ts`
  - `src/core-agent/security/configurable-policy-engine.ts`

### 2.3 审计回放能力
- 新增 `AuditReplayService`
  - `getTaskReplay(taskId)` 聚合：
    - task（`ITaskStore.getTask`）
    - events（`ITaskStore.listEvents`）
    - traces（`ITraceStore.query`）
- 文件：`src/core-agent/observability/audit-replay-service.ts`

### 2.4 主进程 IPC 接入
- 新增 Agent IPC handlers：`src/main/ipc/agent-handlers.ts`
  - `agent:approval:list`
  - `agent:approval:decide`
  - `agent:replay:get`
  - `agent:policy:get`
  - `agent:policy:set`
- IPC 注册入口接入：`src/main/ipc/index.ts`
- preload 桥接接入：`src/preload.ts`
- 共享类型与通道定义扩展：
  - `src/shared/types.ts`
  - `src/shared/ipc-channels.ts`

### 2.5 主进程策略服务
- 新增 `agent-policy-service`
  - 通过 settings 读写 `agentPolicy`
  - 提供 `getAgentPolicyConfig / setAgentPolicyConfig`
- 新增 `agent-runtime-context`
  - 提供审批队列与 replay service 的统一入口
- 文件：
  - `src/main/services/agent-policy-service.ts`
  - `src/main/services/agent-runtime-context.ts`

## 3. 测试

### 3.1 新增测试
- `tests/core-agent-p3-policy.test.ts`
  - 工具规则强制审批
  - 阻断规则
  - 配置 merge 行为
- `tests/core-agent-p3-approval.test.ts`
  - 审批挂起与决策通过
  - 无效审批单处理
- `tests/core-agent-p3-replay.test.ts`
  - task/events/traces 聚合回放

### 3.2 验证结果
- `pnpm test`：通过（`69 passed`）
- P3 变更范围 ESLint：通过

## 4. 阶段结果

- Agent 底座已有可交互审批基础能力。
- 已具备可查询的审计回放聚合能力。
- 策略已从固定逻辑演进为可配置逻辑。

## 5. 下一步建议（P4）

1. 将审批队列对接 renderer UI（审批面板）。
2. 让 runtime 在关键策略点写入更细粒度 trace（含 policy reason）。
3. 加入工具级 RBAC 与项目级策略模板。
4. 引入多 Agent 协作任务图与依赖管理。
