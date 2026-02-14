# AI 对话预设分析按钮

> ZYB-203 | 2026-02-14

## 概述

在文章详情页的 Chat tab 中添加 5 个预设分析按钮，用户可以快速选择思维框架对文章进行深度分析，并基于分析结果继续追问。

## 5 个分析框架

| 按钮 | 图标 | 颜色 | 用途 |
|------|------|------|------|
| 价值澄清 | Compass | amber | 识别核心价值观与潜在冲突 |
| 六顶思考帽 | Lightbulb | blue | 从六个角度全面分析 |
| 第一性原理 | Atom | emerald | 回归基本事实重新推导 |
| 苏格拉底提问 | HelpCircle | purple | 层层追问挑战假设与逻辑 |
| 费曼教学法 | GraduationCap | rose | 用最简单的语言重新解释 |

## 交互设计

- **空状态**：居中展示 5 个分析卡片（2 列网格），每个包含图标 + 名称 + 描述
- **对话进行中**：缩为输入框上方的小胶囊标签（pill），可横向滚动
- 点击按钮发送预设 prompt，以文章全文为上下文进行对话式分析

## 改动文件

- `src/renderer/components/ChatPanel.tsx` — 新增 `useAnalysisPresets` hook、`EmptyState` 改造、`AnalysisPills` 组件、`handlePresetSend` 方法
- `src/renderer/components/ReaderDetailPanel.tsx` — Chat tab 接入 `ChatPanel` 替换占位
- `src/locales/zh.json` / `src/locales/en.json` — 添加分析按钮 i18n 文案

## 技术要点

- 所有预设 prompt 在前端定义，复用现有的 `aiChatSend` IPC 流式通信
- 后端 `ChatService.buildSystemPrompt()` 已自动注入文章上下文（截取前 4000 字符）
- 无后端改动
