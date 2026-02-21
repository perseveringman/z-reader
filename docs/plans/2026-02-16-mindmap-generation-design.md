# 2026-02-16 文本生成思维导图设计

## 目标

为文章、视频转写、播客转写提供通用的「文本 -> 思维导图」能力，首版定位为只读导图，渲染方案采用 Markmap。

## 关键决策

- 渲染库：`markmap`
- 交互模式：只读（支持查看、缩放、重新生成）
- 触发方式：用户点击「生成思维导图」后才生成，不做自动生成
- 持久化策略：长期保存，每篇内容仅保留最新一版
- UI 位置：右侧详情面板新增 `MindMap` tab（`DetailPanel` + `ReaderDetailPanel`）

## 架构设计

### 前端

- 新增 `MindMapPanel` 组件：
  - 读取已保存导图：`aiMindmapGet(articleId)`
  - 生成导图：`aiMindmapGenerate({ articleId })`
  - 渲染：Markmap（优先本地包，失败时回退远程 ESM）
- `DetailPanel`：
  - 新增 `MindMap` tab
  - 在 `Info > AI 操作` 增加「生成思维导图」按钮
  - 点击按钮切换到 `MindMap` tab 并触发生成
- `ReaderDetailPanel`：
  - 新增 `MindMap` tab
  - 在 tab 内手动点击生成

### 主进程 / IPC

- 新增 IPC 通道：
  - `ai:mindmap:get`
  - `ai:mindmap:generate`
- 生成流程：
  1. 根据 `articleId` 读取文章与 transcript
  2. 选择文本源（视频/播客优先 transcript，其他优先正文，最后摘要）
  3. 调用 LLM 生成 Markmap 可用 Markdown
  4. 写入 `ai_mindmaps`（按 `article_id` upsert）
  5. 记录 `ai_task_logs`（`task_type = mindmap`）

### 数据层

- 新增表 `ai_mindmaps`：
  - 核心字段：`article_id`、`source_type`、`source_hash`、`prompt_version`、`model`、`mindmap_markdown`、`token_count`、`created_at`、`updated_at`
  - 约束：`article_id` 唯一（保证每篇只保留最新版本）

## 错误处理

- 无可用文本源：返回明确错误提示
- LLM 失败：记录失败日志并返回错误；不影响阅读流程
- 渲染失败：前端回退显示 Markdown 原文

## 验证策略

- 合约验证：`shared/types`、`preload`、`ipc-channels` 一致
- 变更文件 lint：无新增 lint error
- 现有项目测试状态：受本地 `better-sqlite3` 二进制版本不匹配影响，存在与本功能无关的历史失败

