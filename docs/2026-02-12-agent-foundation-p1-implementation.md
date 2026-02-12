# 2026-02-12 Agent 底座 P1 实装记录

> 关联 Linear Issue: `ZYB-174`

## 1. 本次目标

在既有 A 架构骨架上，落地 P1 的可运行主链路能力：

- Tool Registry + Sandbox
- Policy Engine + Approval Gateway
- Task/Event SQLite 持久化
- Runtime 与持久化、事件联动

## 2. 交付内容

### 2.1 Contracts 扩展
- 新增 `ITaskStore` 相关契约：
  - `AgentTaskRecord`
  - `AgentTaskEventRecord`
  - `AgentTaskPatch`
  - `ITaskStore`
- 文件：`src/core-agent/contracts/task-store.ts`
- contracts 总导出已包含 task-store：`src/core-agent/contracts/index.ts`

### 2.2 Tooling 实装
- `InMemoryToolRegistry`
  - 注册工具、按名称获取、列举工具定义
- `ToolPermissionSandbox`
  - 支持 `allowedPermissions` / `deniedPermissions`
  - 对工具声明权限进行准入判定
- 文件：
  - `src/core-agent/tooling/in-memory-tool-registry.ts`
  - `src/core-agent/tooling/tool-permission-sandbox.ts`

### 2.3 Safety 实装
- `ThresholdPolicyEngine`
  - 基于风险等级阈值判定是否要求审批
  - 支持阻断风险等级（`blockedRiskLevels`）
- `StaticApprovalGateway`
  - 用于本地/测试下的固定审批决策
- 文件：
  - `src/core-agent/security/threshold-policy-engine.ts`
  - `src/core-agent/security/static-approval-gateway.ts`

### 2.4 Runtime 执行器升级
- 新增 `PolicyAwareExecutor`
  - 支持 `tool` / `respond` step
  - 工具执行流程：
    1. registry 查找工具
    2. sandbox 鉴权
    3. policy 评估
    4. 若需审批则走 approval gateway
    5. 最终执行工具
- 文件：`src/core-agent/runtime/policy-aware-executor.ts`

### 2.5 Runtime 持久化联动
- `AgentRuntime` 增加可选 `ITaskStore` 依赖：
  - `TaskQueued` 时创建 task
  - `TaskRunning` 时更新状态/策略/风险
  - 结束时更新终态与输出/错误
  - 每个关键事件写入 `agent_task_events`
- 文件：`src/core-agent/runtime/agent-runtime.ts`

### 2.6 SQLite Provider 与主库迁移
- 新增 `SqliteTaskStore` provider：
  - 初始化 `agent_tasks` / `agent_task_events` 表
  - 提供 create/update/get task 与 append/list event
- 文件：
  - `src/core-agent/providers/task/sqlite-task-store.ts`
  - `src/core-agent/providers/task/index.ts`
- 主库迁移增加两张表：
  - `src/main/db/index.ts`
  - `src/main/db/schema.ts`

## 3. 测试与验证

### 3.1 新增测试
- `tests/core-agent-tooling.test.ts`
  - ToolRegistry 注册与查询
  - 高风险工具审批拒绝时中断
  - 高风险工具审批通过时执行
- `tests/core-agent-sqlite-task-store.test.ts`
  - Task/Event 持久化行为
  - Runtime 执行后事件序列落库

### 3.2 验证命令
- `pnpm test`
- `pnpm exec eslint --ext .ts src/core-agent src/shared/agent-protocol src/business-adapters/zreader-agent tests/core-agent-*.test.ts src/main/db/schema.ts src/main/db/index.ts`

### 3.3 结果
- 测试通过：`56 passed`
- 本次变更范围 ESLint 通过

## 4. 当前边界状态

- core-agent 仍保持业务无关，业务通过 adapter 注入。
- runtime 已具备“策略 → 执行器 → 策略审批 → 持久化”的最小闭环。
- 为后续接入真实工具集和审批 UI 留好了接口。

## 5. 下一步（P1.5 / P2 建议）

1. 引入真实 ToolSet（文件读写、命令执行等）并接入参数 schema 校验。
2. 将 `StaticApprovalGateway` 切换为可交互审批（IPC/UI）。
3. 增加 `ITraceStore` 落地实现（SQLite）并与 runtime/executor 打点。
4. 补充 Memory Store 与 Retriever 的 SQLite + 向量后端联动。
