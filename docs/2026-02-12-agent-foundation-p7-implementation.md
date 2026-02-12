# 2026-02-12 Agent 底座 P7 实装记录

> 关联 Linear Issue: `ZYB-182`

## 1. 本次目标

在 P6 的“可恢复执行”基础上，补齐治理能力，确保长期可维护：

- 快照清理策略（避免快照长期膨胀）
- resume 一致性校验（防止图结构漂移导致错误恢复）
- 失败分类模板化（可重试 / 不可重试）

## 2. 交付内容

### 2.1 调度器治理增强
文件：`src/core-agent/runtime/task-graph.ts`

新增能力：
- **失败分类模板**
  - `GraphFailurePolicyTemplate`
  - `GraphFailureRule`
  - `GraphFailureClass`
- **节点执行输出扩展**
  - `GraphNodeExecutionOutput.errorCode`
- **节点结果扩展**
  - `GraphNodeResult.errorCode`
  - `GraphNodeResult.failureClass`
- **恢复前一致性校验**
  - 校验 `graphId/taskId/sessionId`
  - 校验 `graphSignature`（若存在）
  - 对旧快照回退到节点集合校验

关键行为：
- 失败命中“不可重试”规则时，立即停止重试。
- 失败命中“可重试”规则时，按 backoff 继续重试。
- `resume` 在图结构漂移时直接拒绝执行，避免状态污染。

### 2.2 快照模型与治理接口
文件：`src/core-agent/runtime/task-graph.ts`

`GraphExecutionSnapshot` 新增：
- `graphSignature?: string`

`GraphSnapshotStore` 新增：
- `listByTask(taskId)`
- `cleanup(policy)`

并新增：
- `GraphSnapshotCleanupPolicy`
- `GraphSnapshotCleanupResult`

### 2.3 InMemory 快照治理实现
文件：`src/core-agent/runtime/in-memory-graph-snapshot-store.ts`

新增实现：
- `listByTask(taskId)`：按 `updatedAt DESC` 返回
- `cleanup(policy)`：支持
  - `staleBefore`（按更新时间清理）
  - `maxSnapshotsPerTask`（按任务保留最新 N 条）

### 2.4 SQLite 快照治理实现
文件：`src/core-agent/providers/task/sqlite-graph-snapshot-store.ts`

新增能力：
- 快照 `graph_signature` 字段持久化
- `listByTask(taskId)`
- `cleanup(policy)`（同策略逻辑）

兼容迁移：
- `initTables()` 中为新库建表包含 `graph_signature`
- 对旧库执行 `ALTER TABLE ... ADD COLUMN graph_signature`（幂等 try/catch）

### 2.5 主库 Schema / Migration 更新
文件：
- `src/main/db/schema.ts`
- `src/main/db/index.ts`

更新内容：
- `agent_graph_snapshots` 增加 `graph_signature` 列定义
- 启动迁移增加该列的幂等补丁

## 3. 测试

### 3.1 新增测试
- `tests/core-agent-p7-task-graph-governance.test.ts`
  - resume 图结构漂移校验
  - 失败模板命中不可重试
  - 失败模板命中可重试
  - 内存快照清理策略

### 3.2 扩展测试
- `tests/core-agent-p6-snapshot-store.test.ts`
  - 校验 `graphSignature` 持久化
  - `listByTask` 与 `cleanup` 行为

### 3.3 验证结果
- `pnpm test tests/core-agent-p5-task-graph-advanced.test.ts tests/core-agent-p6-snapshot-store.test.ts tests/core-agent-p7-task-graph-governance.test.ts` 通过
- 变更范围 ESLint 通过

## 4. 阶段结论

P7 完成后，任务图执行链路具备以下治理特性：

- 可恢复但不盲恢复（结构校验）
- 可重试但不乱重试（失败分类模板）
- 可持久化且可控膨胀（快照清理策略）

整体可维护性与线上稳定性相比 P6 明显提升。
