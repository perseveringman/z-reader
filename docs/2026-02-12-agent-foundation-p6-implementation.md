# 2026-02-12 Agent 底座 P6 实装记录

> 关联 Linear Issue: `ZYB-180`

## 1. 本次目标

在 P5 高级调度能力基础上，补齐可恢复执行能力：

- 重试 backoff（指数退避 + 抖动）
- 执行快照持久化
- 从快照恢复继续执行（resume）

## 2. 交付内容

### 2.1 调度器能力升级
文件：`src/core-agent/runtime/task-graph.ts`

新增能力：
- `GraphRunOptions.defaultRetry.backoff`
  - `baseDelayMs`
  - `factor`
  - `maxDelayMs`
  - `jitterMs`
- `GraphRunOptions.sleep`
  - 可注入 sleep 函数（便于测试与自定义等待策略）
- `GraphRunOptions.snapshotStore`
- `GraphRunOptions.snapshotId`

新增接口与模型：
- `GraphExecutionSnapshot`
- `GraphSnapshotStore`
- `TaskGraphScheduler.resume(...)`

核心行为：
- 节点失败后按 backoff 策略等待再重试
- 运行中持续写快照（running）
- 结束时写终态快照（succeeded/failed/canceled）
- `resume` 支持从 canceled 快照恢复未完成节点继续执行

### 2.2 快照内存实现
文件：`src/core-agent/runtime/in-memory-graph-snapshot-store.ts`

- `InMemoryGraphSnapshotStore`
  - `save(snapshot)`
  - `get(id)`

用于测试和本地快速验证。

### 2.3 SQLite 快照实现
文件：`src/core-agent/providers/task/sqlite-graph-snapshot-store.ts`

- `SqliteGraphSnapshotStore`
  - upsert 保存快照
  - 按 id 读取快照
- 对应导出更新：`src/core-agent/providers/task/index.ts`

### 2.4 主库迁移
- `src/main/db/schema.ts`
  - 新增 `agentGraphSnapshots`
- `src/main/db/index.ts`
  - 新增 `agent_graph_snapshots` 建表与索引迁移

## 3. 测试

### 3.1 新增测试
- `tests/core-agent-p5-task-graph-advanced.test.ts`
  - 并行执行
  - backoff 重试 + 补偿
  - 超时/取消
  - 快照恢复执行
- `tests/core-agent-p6-snapshot-store.test.ts`
  - SQLite 快照 store save/get/upsert

### 3.2 验证结果
- `pnpm test`：通过（`79 passed`）
- P6 相关代码 ESLint：通过

## 4. 阶段结论

P6 完成后，任务图执行器具备“可中断 + 可恢复 + 可控重试”的关键能力，基础设施可用于更长链路的稳定执行。

## 5. 下一步建议（P7）

1. 快照增量压缩与清理策略（防止长期膨胀）。
2. 恢复时一致性校验（图结构变更检测）。
3. 失败分类（可重试/不可重试）与策略模板化。
4. 将恢复能力接入 UI 运维面板。
