# 2026-02-12 Agent 底座 P12 实装记录

> 关联 Linear Issue: `ZYB-187`

## 1. 本次目标

在 P11“恢复执行器可注册接入”基础上，增强恢复执行审计质量，确保运维回放可直接回答：

- 当前恢复是否可能有副作用
- specialist 解析命中率如何
- 本次恢复覆盖了多少节点、结果分布怎样

## 2. 交付内容

### 2.1 恢复审计结构化 payload
文件：`src/core-agent/runtime/agent-snapshot-resume-service.ts`

为 `graph.resume.executed` 事件新增统一审计结构 `AgentResumeAuditPayload`：

- 基础信息：`snapshotId / graphId / mode / status / executionOrder`
- 风险与确认：`riskLevel / requiresConfirmation`
- 副作用语义：`sideEffectFlag`（delegate=true, safe=false）
- 解析来源：`resolverSource`（`safe-runtime` 或 `delegate-resolver`）
- 节点统计：`nodeSummary`（pending/running/succeeded/failed/skipped/total）
- specialist 统计：`requested/resolved/missing + hitCount/missCount/hitRate`

### 2.2 specialist 解析命中率采集
文件：`src/core-agent/runtime/agent-snapshot-resume-service.ts`

新增“带审计的 resolver 包装”能力：

- 每次请求记录 `requestedAgents`
- 命中记录 `resolvedAgents` 与 `hitCount`
- 未命中记录 `missingAgents` 与 `missCount`
- 输出 `hitRate`（保留 4 位小数）

### 2.3 失败路径审计完善
文件：`src/core-agent/runtime/agent-snapshot-resume-service.ts`

无论恢复结果是成功还是失败，都会写入同一事件类型与统一字段结构，避免回放端分支解析。

## 3. 测试与验证

文件：`tests/agent-resume-service.test.ts`

测试升级点：
- `safe` 模式：校验 `sideEffectFlag=false`、`resolverSource=safe-runtime`、命中率统计
- `delegate` 成功：校验 `sideEffectFlag=true`、`resolverSource=delegate-resolver`、命中代理统计
- `delegate` 失败：校验 `missingAgents` 与 `hitRate=0`

执行验证：
- `pnpm test tests/agent-resume-service.test.ts`
- `npx eslint src/core-agent/runtime/agent-snapshot-resume-service.ts tests/agent-resume-service.test.ts`
- `pnpm test`

结果：
- 全部通过（`22 files / 91 tests`）

## 4. 阶段结论

P12 完成后，恢复执行链路具备可量化的审计信号：

- 可以从回放事件直接判断“是否可能有副作用”
- 可以评估 specialist 解析质量（命中/漏配）
- 可以快速定位恢复覆盖范围与结果分布

这为后续 replay UI 聚合展示和 SLO 指标沉淀提供了稳定数据面。
