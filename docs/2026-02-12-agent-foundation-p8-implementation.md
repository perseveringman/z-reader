# 2026-02-12 Agent 底座 P8 实装记录

> 关联 Linear Issue: `ZYB-183`

## 1. 本次目标

将 P7 的快照治理与恢复可观测能力接入桌面端运维入口，做到：

- 主进程可通过 IPC 查询任务快照与执行清理
- 渲染层可在设置面板直接完成快照运维操作
- 保持底座与业务解耦（仅通过 shared contract + IPC）

## 2. 交付内容

### 2.1 IPC 协议扩展
文件：`src/shared/ipc-channels.ts`

新增 channel：
- `AGENT_SNAPSHOT_LIST` (`agent:snapshot:list`)
- `AGENT_SNAPSHOT_CLEANUP` (`agent:snapshot:cleanup`)

### 2.2 共享类型扩展
文件：`src/shared/types.ts`

新增类型：
- `AgentGraphSnapshotItem`
- `AgentSnapshotListQuery`
- `AgentSnapshotCleanupInput`
- `AgentSnapshotCleanupResult`

扩展 `ElectronAPI`：
- `agentSnapshotList(query)`
- `agentSnapshotCleanup(input)`

### 2.3 Preload 桥接
文件：`src/preload.ts`

新增渲染进程可调用 API：
- `window.electronAPI.agentSnapshotList`
- `window.electronAPI.agentSnapshotCleanup`

### 2.4 主进程快照运维处理
文件：
- `src/main/services/agent-runtime-context.ts`
- `src/main/ipc/agent-handlers.ts`

新增服务工厂：
- `createGraphSnapshotStore()`（基于 `SqliteGraphSnapshotStore`）

新增 handler：
- `AGENT_SNAPSHOT_LIST`
  - 按 `taskId` 查询快照（倒序）
  - 返回 UI 友好结构（含 `nodeCount`）
- `AGENT_SNAPSHOT_CLEANUP`
  - 支持 `maxSnapshotsPerTask` 与 `staleBefore` 参数
  - 参数做最小归一化（负数归零、空时间忽略）

### 2.5 Renderer 运维面板接入
文件：`src/renderer/components/PreferencesDialog.tsx`

在“偏好设置”中新增 **Agent 运维面板（本地）** 区域：
- 输入 `taskId` 查询快照
- 展示快照状态、节点数、执行步数、更新时间
- 配置清理策略并执行清理
- 操作反馈（loading/error/toast）

同时将设置弹窗升级为更大宽度与可滚动，支持运维信息展示。

## 3. 验证

### 3.1 代码检查
- `pnpm eslint src/shared/ipc-channels.ts src/shared/types.ts src/preload.ts src/main/services/agent-runtime-context.ts src/main/ipc/agent-handlers.ts src/renderer/components/PreferencesDialog.tsx`

结果：通过。

### 3.2 测试
- `pnpm test`

结果：通过（`84 passed`）。

## 4. 阶段结论

P8 完成后，Agent 快照治理能力已具备本地可操作入口：

- 开发/运维可不改代码直接执行快照查询与清理
- 恢复链路的关键状态可视化能力增强
- 维持了 core-agent 与业务 UI 的契约式解耦
