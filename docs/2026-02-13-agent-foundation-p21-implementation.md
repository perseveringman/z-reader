# 2026-02-13 Agent 底座 P21 实装记录

> 关联 Linear Issue: `ZYB-196`

## 1. 本次目标

在 P20“筛选预设”基础上补齐使用连续性：恢复审计筛选状态在本地持久化，并在偏好面板重新打开时自动恢复。

## 2. 交付内容

### 2.1 审计筛选状态 sanitize 能力
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `ResolvedResumeAuditFilter`
- `sanitizeResumeAuditFilter(filter)`

行为：
- 对 `mode/status/taskId` 做合法性与空值归一化
- 非法值自动回落到 `all`
- `taskId` 自动 `trim`，空串回落到 `all`

同时更新：
- `filterResumeAuditEntries` 改为统一走 `sanitizeResumeAuditFilter`
- `getResumeAuditPresetFilter` 返回类型升级为 `ResolvedResumeAuditFilter`

### 2.2 偏好面板接入本地持久化
文件：`src/renderer/components/PreferencesDialog.tsx`

新增：
- 本地存储 key：`z-reader-agent-resume-audit-filter`
- `readPersistedResumeAuditFilter()`
- `persistResumeAuditFilter(filter)`

交互行为：
- 打开偏好面板时，恢复上次 `mode/status/task` 筛选状态
- 筛选器变化（含预设按钮）时，自动写回本地存储
- 与现有筛选逻辑兼容，不改变现有回放/审计接口契约

### 2.3 测试覆盖扩展
文件：`tests/agent-resume-audit-utils.test.ts`

新增用例：
- `应对持久化筛选状态进行 sanitize`

覆盖点：
- 合法值保留与 taskId trim
- 非法值回落到默认 `all`

## 3. 测试与验证

执行命令：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/utils/agent-resume-audit.ts src/renderer/components/PreferencesDialog.tsx tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 97 tests`）

## 4. 阶段结论

P21 完成后，恢复审计筛选具备“会话间连续性”：

- 运维排查视角在面板重新打开后可直接续接
- 通过 sanitize 保证持久化数据安全回读
- 为后续“自定义预设持久化”提供稳固基础
