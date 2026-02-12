# 2026-02-12 Agent 底座 P9 实装记录

> 关联 Linear Issue: `ZYB-184`

## 1. 本次目标

在 P8“可观测运维”基础上，补齐“可执行恢复”链路：

- 恢复前预检（是否可恢复、风险等级）
- 恢复执行（高风险确认后可执行）
- 恢复结果写入事件并复用既有回放链路

## 2. 交付内容

### 2.1 快照模型补齐图定义
文件：
- `src/core-agent/runtime/task-graph.ts`
- `src/core-agent/runtime/in-memory-graph-snapshot-store.ts`
- `src/core-agent/providers/task/sqlite-graph-snapshot-store.ts`
- `src/main/db/schema.ts`
- `src/main/db/index.ts`

关键变更：
- `GraphExecutionSnapshot` 新增 `graphDefinition?: AgentTaskGraph`
- 调度器持久化快照时写入图定义（用于后续直接恢复）
- SQLite 存储新增 `graph_definition_json` 列（含幂等迁移）
- 新增 `buildGraphFromSnapshot(snapshot)` 用于恢复图构建

### 2.2 恢复服务（预检 + 执行）
文件：`src/core-agent/runtime/agent-snapshot-resume-service.ts`

新增 `AgentSnapshotResumeService`：
- `preview(snapshotId)`
  - 返回：可恢复性、待恢复节点、失败节点、风险等级、拒绝原因
- `execute(snapshotId, confirmed)`
  - 高风险未确认则拒绝
  - 使用 `TaskGraphScheduler.resume(...)` 执行恢复
  - 执行结果写入 `graph.resume.executed` 事件，供回放查询

说明：
- 当前恢复执行为 **safe-recovery 模式**（节点执行使用安全 no-op specialist），用于验证恢复状态机和运维流程，不直接触发业务副作用。

### 2.3 IPC 能力扩展
文件：
- `src/shared/ipc-channels.ts`
- `src/shared/types.ts`
- `src/preload.ts`
- `src/main/ipc/agent-handlers.ts`
- `src/main/services/agent-runtime-context.ts`

新增接口：
- `agent:resume:preview`
- `agent:resume:execute`

渲染层 API：
- `window.electronAPI.agentResumePreview(input)`
- `window.electronAPI.agentResumeExecute(input)`

### 2.4 运维面板增强
文件：`src/renderer/components/PreferencesDialog.tsx`

在 Agent 运维区新增恢复操作流：
- 选择快照
- 执行恢复预检（展示 `canResume/risk/pending/failed`）
- 高风险恢复需勾选确认
- 执行恢复并提示回放 taskId

## 3. 测试与验证

### 3.1 新增测试
- `tests/core-agent-p9-snapshot-graph-definition.test.ts`
  - 快照持久化图定义 + 从快照重建图
- `tests/agent-resume-service.test.ts`
  - 高风险未确认拒绝执行
  - 确认后执行恢复并写入回放事件

### 3.2 更新测试
- `tests/core-agent-p6-snapshot-store.test.ts`
  - 补充 `graphDefinition` 持久化兼容验证

### 3.3 验证结果
- 变更范围 ESLint 通过
- `pnpm test` 通过（`87 passed`）

## 4. 阶段结论

P9 完成后，Agent 恢复能力从“可看”升级为“可控可执行”：

- 运维可先预检后执行，且高风险有明确确认门槛
- 恢复全流程有事件记录，可直接接入既有 replay 查询
- 快照具备自包含图定义，为后续真实 specialist 恢复打下基础
