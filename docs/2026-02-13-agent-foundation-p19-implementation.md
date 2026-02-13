# 2026-02-13 Agent 底座 P19 实装记录

> 关联 Linear Issue: `ZYB-194`

## 1. 本次目标

在 P18“任务排行快速钻取”基础上，补齐任务维度筛选能力，避免多 task 场景下审计信息混杂。

## 2. 交付内容

### 2.1 审计筛选新增 task 维度
文件：`src/renderer/utils/agent-resume-audit.ts`

新增类型：
- `ResumeAuditTaskFilter = 'all' | string`
- `ResumeAuditFilter.taskId`

行为：
- `filterResumeAuditEntries` 支持 `taskId` 过滤
- `listResumeAuditTaskIds(entries)` 提供下拉候选列表

### 2.2 运维面板新增任务筛选下拉
文件：`src/renderer/components/PreferencesDialog.tsx`

新增状态：
- `auditTaskFilter`

新增交互：
- 筛选区新增“任务”下拉（all + 当前审计 task 列表）
- 与 mode/status 共同作用于过滤结果

### 2.3 钻取联动任务筛选
文件：`src/renderer/components/PreferencesDialog.tsx`

更新：
- 点击 task 风险排行项后，除回填 taskId 与刷新外，自动设置 `auditTaskFilter=taskId`

效果：
- 直接进入该 task 的聚焦视图，减少手动二次筛选

### 2.4 规则函数化补充
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `selectPrimaryTaskId(input)`

用于快照查询路径中稳定选择首 task，并保留“多 task 提示”能力。

## 3. 测试与验证

文件：`tests/agent-resume-audit-utils.test.ts`

增强覆盖：
- task 筛选行为
- task 选项列表生成
- 首 task 选择规则

验证命令：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/utils/agent-resume-audit.ts src/renderer/components/PreferencesDialog.tsx tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 95 tests`）

## 4. 阶段结论

P19 完成后，恢复审计在多任务场景下具备更清晰的“任务聚焦视图”：

- 可在全局聚合与单任务聚焦之间快速切换
- 钻取路径与筛选状态保持一致
- 为后续增加“保存筛选视图/预设视图”打下基础
