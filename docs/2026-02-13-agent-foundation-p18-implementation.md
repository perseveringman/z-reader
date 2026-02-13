# 2026-02-13 Agent 底座 P18 实装记录

> 关联 Linear Issue: `ZYB-193`

## 1. 本次目标

在 P17 风险排行基础上，打通“看见风险 → 快速钻取”的操作闭环。

## 2. 交付内容

### 2.1 快照查询主 task 选择规则函数化
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `selectPrimaryTaskId(input)`
- `PrimaryTaskSelection`

用途：
- 统一“多 task 输入时快照只取首个”的规则
- 降低组件内分支逻辑耦合，便于复用与测试

### 2.2 task 风险排行支持一键钻取
文件：`src/renderer/components/PreferencesDialog.tsx`

新增能力：
- `drillDownTaskFromRank(taskId)`
- 点击排行项后自动：
  1. 回填 taskId 输入框
  2. 查询该 task 快照（单 task 语义）
  3. 加载该 task 审计列表
  4. toast 提示定位成功

### 2.3 加载函数参数化
文件：`src/renderer/components/PreferencesDialog.tsx`

调整：
- `loadSnapshots(taskInput = agentTaskId)`
- `loadResumeAudit(taskInput = agentTaskId)`

收益：
- 支持从不同入口复用同一加载逻辑（输入框 / 排行点击）

## 3. 测试与验证

文件：`tests/agent-resume-audit-utils.test.ts`

新增覆盖：
- `selectPrimaryTaskId` 行为验证（空输入、单/多 task）

验证命令：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/components/PreferencesDialog.tsx src/renderer/utils/agent-resume-audit.ts tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 95 tests`）

## 4. 阶段结论

P18 完成后，运维面板从“静态排行”升级到“可操作排行”：

- 排障路径缩短：可直接从风险榜跳到具体 task
- 快照与审计链路在交互层实现闭环
- 核心规则函数化后，后续可继续复用到更多入口（如命令面板）
