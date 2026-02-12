# 2026-02-12 Agent 底座 P10 实装记录

> 关联 Linear Issue: `ZYB-185`

## 1. 本次目标

在 P9 恢复链路基础上，引入恢复执行器模式分层，做到：

- `safe` 模式：无副作用恢复（用于状态修复演练）
- `delegate` 模式：委托真实 specialist 执行（可插拔）

同时把模式选择从服务层透传到 IPC 与运维面板。

## 2. 交付内容

### 2.1 恢复服务模式化
文件：`src/core-agent/runtime/agent-snapshot-resume-service.ts`

新增能力：
- 新增 `AgentResumeMode = safe | delegate`
- `preview/execute` 均支持 `mode` 输入
- `preview` 返回：`mode`、`requiresConfirmation`
- `execute` 返回：`mode`
- `delegate` 模式支持可插拔 `specialistResolver`

关键行为：
- `safe`：使用安全执行器，输出 `safe-recovery` 标识
- `delegate`：通过注入 resolver 获取真实 specialist；缺失 specialist 时由调度器失败返回
- `delegate` 及高风险场景统一要求确认（`requiresConfirmation=true`）

### 2.2 主进程注入点
文件：`src/main/services/agent-runtime-context.ts`

新增：
- `setResumeSpecialistResolver(resolver?)`

并在 `createSnapshotResumeService()` 中注入 resolver，实现恢复执行器的可插拔扩展点。

### 2.3 IPC/类型透传模式
文件：
- `src/shared/types.ts`
- `src/main/ipc/agent-handlers.ts`

变更：
- 新增共享类型 `AgentResumeMode`
- `AgentResumePreviewInput/ExecuteInput` 支持 `mode`
- `AgentResumePreviewResult` 增加 `mode` 与 `requiresConfirmation`
- `AgentResumeExecuteResult` 增加 `mode`
- 主进程 handler 对 mode 做归一化（默认 `safe`）

### 2.4 运维面板支持模式选择
文件：`src/renderer/components/PreferencesDialog.tsx`

新增交互：
- 恢复模式下拉：`safe（无副作用）` / `delegate（真实执行器）`
- 预检与执行均透传模式
- 根据 `requiresConfirmation` 决定是否展示确认勾选
- 预检结果展示 `mode` 与 `requiresConfirmation`

## 3. 测试与验证

### 3.1 测试增强
文件：`tests/agent-resume-service.test.ts`

新增覆盖：
- `delegate` 模式注入 resolver 后成功执行
- `delegate` 模式缺失 specialist 时失败

并保留既有：
- 高风险未确认拒绝
- `safe` 模式恢复成功并写入回放事件

### 3.2 验证结果
- 变更范围 ESLint 通过
- `pnpm test` 全量通过（`89 passed`）

## 4. 阶段结论

P10 完成后，恢复链路具备“模式可控 + 执行器可插拔”的演进基础：

- 默认可安全恢复，不触发业务副作用
- 需要时可切换到真实 specialist 执行
- 从 UI 到 IPC 到 runtime 的模式透传链路完整
