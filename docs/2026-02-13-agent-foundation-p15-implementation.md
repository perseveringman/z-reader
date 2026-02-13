# 2026-02-13 Agent 底座 P15 实装记录

> 关联 Linear Issue: `ZYB-190`

## 1. 本次目标

在 P14 审计筛选与摘要基础上，支持跨 task 聚合回放审计，提升批量排障效率。

## 2. 交付内容

### 2.1 taskId 输入标准化工具
文件：`src/renderer/utils/agent-resume-audit.ts`

新增：
- `normalizeTaskIdsInput(input: string): string[]`

能力：
- 支持空白/逗号/分号（中英文）分隔
- 自动去重并保留顺序

### 2.2 多 task 审计聚合加载
文件：`src/renderer/components/PreferencesDialog.tsx`

变更点：
- 运维面板输入升级为 `Task ID(s)`
- `loadResumeAudit` 支持批量 taskId：
  - 并发拉取 replay（`Promise.allSettled`）
  - 聚合 `graph.resume.executed` 事件并全局时间排序
  - 对部分失败 task 给出错误提示但保留成功结果

### 2.3 单 task 快照语义保护
文件：`src/renderer/components/PreferencesDialog.tsx`

规则：
- 快照查询仍保持单 task 语义
- 当输入多个 taskId 时，自动选第一个并 toast 提示

### 2.4 聚合摘要增强
文件：`src/renderer/components/PreferencesDialog.tsx`

新增指标展示：
- `tasks`（当前筛选命中的 task 数）
- 复用现有总量/成功率/副作用占比/命中率/Top Missing 指标

## 3. 测试与验证

文件：`tests/agent-resume-audit-utils.test.ts`

新增覆盖：
- 多 taskId 输入解析与去重

验证命令：
- `pnpm test tests/agent-resume-audit-utils.test.ts`
- `npx eslint src/renderer/utils/agent-resume-audit.ts src/renderer/components/PreferencesDialog.tsx tests/agent-resume-audit-utils.test.ts`
- `pnpm test`

结果：
- 全部通过（`23 files / 94 tests`）

## 4. 阶段结论

P15 完成后，恢复审计能力已从“单任务查看”升级为“多任务聚合排障”：

- 可一次性横向比较多 task 的恢复质量
- 部分任务失败不会阻断整体审计观察
- 与现有筛选与摘要机制完全兼容，前端维护成本低
