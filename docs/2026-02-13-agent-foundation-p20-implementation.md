# 2026-02-13 Agent 底座 P20 实装记录

> 关联 Linear Issue: `ZYB-195`

## 1. 本次目标

在 P19“task 维度筛选”基础上，新增可一键复用的审计筛选预设，减少高频排障路径中的重复手动操作。

## 2. 交付内容

### 2.1 新增审计预设契约与映射函数
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `ResumeAuditPreset = 'all' | 'failed' | 'delegate'`
- `getResumeAuditPresetFilter(preset)`

映射规则：
- `all` -> `mode=all, status=all, taskId=all`
- `failed` -> `mode=all, status=failed, taskId=all`
- `delegate` -> `mode=delegate, status=all, taskId=all`

### 2.2 运维面板新增“预设”快捷操作
文件：`src/renderer/components/PreferencesDialog.tsx`

新增交互：
- “预设”按钮组：`all`、`失败优先`、`delegate`
- 新增 `applyAuditPreset(preset)`，统一同步更新：
  - `auditModeFilter`
  - `auditStatusFilter`
  - `auditTaskFilter`

效果：
- 将常见审计查询从多次下拉选择简化为一次点击
- 与现有筛选器兼容，不引入额外状态分叉

### 2.3 单测补齐预设映射覆盖
文件：`tests/agent-resume-audit-utils.test.ts`

新增用例：
- `应支持审计筛选预设映射`

确保：
- 预设到过滤条件的映射稳定可回归。

## 3. 测试与验证

执行命令：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/utils/agent-resume-audit.ts src/renderer/components/PreferencesDialog.tsx tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 96 tests`）

## 4. 阶段结论

P20 完成后，恢复审计筛选具备“预设视图”能力：

- 常见排障视角（失败优先、delegate）可一键切换
- 降低操作成本，提升运维排查效率
- 为后续扩展“可持久化自定义预设”提供稳定入口
