# AI 调试面板实现文档

> 日期：2026-02-14
> 分支：feature/ai-chat-toolcalling

## 概述

AI 调试面板是 Phase 2 的最后一个交付物，集成在偏好设置对话框中，提供 AI 调用历史查看、执行追踪详情、成本统计等调试功能。

## 架构

### 组件结构

```
PreferencesDialog.tsx
  └── AIDebugPanel.tsx（新建）
        ├── 统计卡片区（总调用次数 / 总 Token / 总成本）
        ├── 类型分组标签（按 taskType 统计）
        ├── 类型筛选 Tab（全部 / summarize / translate / ...）
        └── 调用日志列表（可展开）
              └── LogDetailExpanded（懒加载详情）
                    ├── 错误信息（如有）
                    ├── JsonBlock（输入 JSON，可复制）
                    ├── JsonBlock（输出 JSON，可复制）
                    └── TraceSteps（执行追踪步骤列表）
```

### 数据流

1. 面板挂载时调用 `window.electronAPI.aiTaskLogs(50)` 获取最近 50 条日志
2. 统计卡片从日志列表本地计算，无需额外 IPC 调用
3. 点击展开某条日志时，调用 `window.electronAPI.aiTaskLogDetail(logId)` 懒加载完整详情
4. `tracesJson` 字段通过 `JSON.parse()` 解析为 `AIExecutionTrace` 结构

### 后端 API（已就绪，无需修改）

| IPC 通道 | 方法 | 说明 |
|----------|------|------|
| `ai:taskLogs` | `aiTaskLogs(limit?)` | 查询最近 N 条任务日志摘要 |
| `ai:taskLogDetail` | `aiTaskLogDetail(logId)` | 查询单条日志完整详情（含 traces） |

### 类型定义（已就绪）

- `AITaskLogItem` — 日志摘要（id, taskType, status, tokenCount, costUsd, createdAt）
- `AITaskLogDetail` — 完整详情（扩展 inputJson, outputJson, tracesJson, errorText）

## 修改文件

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/renderer/components/AIDebugPanel.tsx` | 新建 | 调试面板主组件 |
| `src/renderer/components/PreferencesDialog.tsx` | 修改 | 用 AIDebugPanel 替换简易日志列表 |
| `src/locales/zh.json` | 修改 | 添加 18 个调试面板 i18n key |
| `src/locales/en.json` | 修改 | 添加对应英文翻译 |

## 功能清单

- [x] 统计卡片：总调用次数、总 Token 用量、总成本
- [x] 按类型分组统计标签
- [x] 类型筛选 Tab（仅显示实际存在的类型）
- [x] 调用日志列表（按时间倒序）
- [x] 点击展开详情（懒加载）
- [x] 输入/输出 JSON 查看 + 复制按钮
- [x] Trace 步骤列表（type/duration/tokens/input/output）
- [x] 错误信息高亮显示
- [x] 中英文国际化
