# 2026-02-12 Agent 底座 P11 实装记录

> 关联 Linear Issue: `ZYB-186`

## 1. 本次目标

在 P10 “恢复模式化 + specialist 可插拔”基础上，完成以下落地闭环：

- 将业务侧 specialist 以 **适配器** 形式注册到主进程 runtime
- 提供 IPC 能力供渲染层查询可用 specialist 列表
- 运维面板支持 delegate 模式可见性与执行前校验
- 保持底座与业务完全解耦（core-agent 不依赖业务语义）

## 2. 交付内容

### 2.1 业务适配器 specialist 集合
文件：`src/business-adapters/zreader-agent/specialists.ts`

新增：
- `createZReaderResumeSpecialists()`
- 默认注册 `reader / writer / summarizer` 三类 specialist

特性：
- 以 `GraphNodeExecutor` 契约暴露，符合底座执行器接口
- 返回结构仅包含执行结果与元信息，不侵入底座核心类型
- 通过适配器层隔离业务语义，避免 `core-agent` 反向依赖

### 2.2 主进程 runtime 注册入口
文件：
- `src/main/services/agent-runtime-context.ts`
- `src/main.ts`

新增能力：
- `setResumeSpecialists(specialists?)`：批量注册/重置 specialist
- `listResumeSpecialists()`：返回已注册 specialist 名称列表

启动接入：
- 在 `app.on('ready')` 中调用：
  - `setResumeSpecialists(createZReaderResumeSpecialists())`

效果：
- delegate 模式可在主进程初始化完成后立即获得可用 specialist
- 仍保留 `setResumeSpecialistResolver()`，保障高级自定义场景兼容

### 2.3 IPC 与桥接扩展
文件：
- `src/shared/ipc-channels.ts`
- `src/shared/types.ts`
- `src/preload.ts`
- `src/main/ipc/agent-handlers.ts`

新增通道：
- `AGENT_RESUME_SPECIALISTS_LIST = 'agent:resume:specialists:list'`

新增 API：
- `window.electronAPI.agentResumeSpecialistsList(): Promise<string[]>`

主进程 handler：
- 返回 `listResumeSpecialists()` 结果，供渲染层动态展示

### 2.4 运维面板 delegate 可操作性增强
文件：`src/renderer/components/PreferencesDialog.tsx`

新增行为：
- 打开设置时加载 specialist 列表并展示状态（加载中/未注册/已注册）
- 当恢复模式为 `delegate` 且 specialist 列表为空时，阻断执行并提示

收益：
- 避免 delegate 模式在未注册执行器时触发无效恢复
- 提升恢复运维的可解释性与可控性

## 3. 解耦性说明

本阶段遵循“底座与业务强边界”：

- `src/core-agent/*` 未引入任何 Z-Reader 业务模块
- 业务仅通过 `business-adapters` 实现底座契约并注入主进程
- UI 通过 IPC 获取通用能力信息，不直接耦合执行器内部实现

## 4. 测试与验证

新增测试：
- `tests/zreader-agent-specialists.test.ts`
  - 校验业务适配器暴露 specialist 集合与执行结果
- `tests/agent-runtime-context-specialists.test.ts`
  - 校验 runtime specialist 的注册/查询/清空行为

验证命令：
- `pnpm test tests/zreader-agent-specialists.test.ts tests/agent-runtime-context-specialists.test.ts`
- `npx eslint src/business-adapters/zreader-agent/index.ts src/business-adapters/zreader-agent/specialists.ts src/main.ts src/main/ipc/agent-handlers.ts src/main/services/agent-runtime-context.ts src/preload.ts src/renderer/components/PreferencesDialog.tsx src/shared/ipc-channels.ts src/shared/types.ts tests/zreader-agent-specialists.test.ts tests/agent-runtime-context-specialists.test.ts`
- `pnpm test`

验证结果：
- 新增测试通过
- 改动范围 ESLint 通过
- 全量测试通过（`22 files / 91 tests`）

## 5. 阶段结论

P11 完成后，P10 的“可插拔恢复执行器”已从能力接口升级为可运行闭环：

- 主进程可在启动时注册业务 specialist
- 渲染层可感知 delegate 执行器可用性
- 恢复执行前具备显式校验与友好阻断
- 维持 core-agent 与业务模块的结构解耦

## 6. 下一步建议（P12）

- 增强恢复审计字段：记录 `mode / specialist / resolverSource / sideEffectFlag`
- 在 replay 视图增加恢复执行维度过滤与聚合
- 补充 delegate 模式下 specialist 命中率与失败原因统计
