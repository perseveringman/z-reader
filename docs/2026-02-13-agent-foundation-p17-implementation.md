# 2026-02-13 Agent 底座 P17 实装记录

> 关联 Linear Issue: `ZYB-192`

## 1. 本次目标

在 P16 告警能力基础上补齐 task 维度可观测性，提升“问题任务优先级排序”能力。

## 2. 交付内容

### 2.1 task 维度聚合函数
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `aggregateResumeAuditByTask(entries)`
- `ResumeAuditTaskAggregate`

输出字段：
- `taskId`
- `total / succeeded / failed`
- `successRate / avgHitRate`
- `sideEffectFailures`
- `lastOccurredAt`

排序策略（风险优先）：
1. `failed` 降序
2. `successRate` 升序
3. `avgHitRate` 升序

### 2.2 摘要导出增强
文件：`src/renderer/utils/agent-resume-audit.ts`

`buildResumeAuditReport` 新增：
- `Top Risk Tasks` 行（最多 3 个）

便于把风险任务快速同步到 issue/comment。

### 2.3 运维面板展示 task 风险排行
文件：`src/renderer/components/PreferencesDialog.tsx`

新增区块：
- `Task 风险排行（Top 5）`
- 每行显示：`taskId + failed + success + hit`

并继续复用：筛选、聚合摘要、告警分级、审计详情列表。

## 3. 测试与验证

文件：`tests/agent-resume-audit-utils.test.ts`

新增验证：
- task 聚合排序行为
- 报告文本包含 `Top Risk Tasks`

执行：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/utils/agent-resume-audit.ts src/renderer/components/PreferencesDialog.tsx tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 94 tests`）

## 4. 阶段结论

P17 完成后，恢复运维视角进一步从“事件/告警”升级到“任务级风险排序”：

- 可快速锁定最需要优先处理的 task
- 支持以 task 维度组织后续排障与复盘
- 为后续做 task 级趋势图与 SLA 看板奠定基础
