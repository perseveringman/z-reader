# AI 工作台（AI Workbench）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Z-Reader 新增高优先级「AI 工作台」，交付每日 Feed 主题分析、每周阅读总结、笔记总结、自定义报告、报告历史与交互式探索。

**Architecture:** 复用现有 AI 模块（`src/ai/`）+ Electron IPC + SQLite。新增 `ai_reports` 持久化层、`report-service` 生成层、`AIWorkbenchPage` UI 层。自动报告使用主进程定时任务，自定义报告使用现有 AI 流式能力并扩展为结构化报告输出。

**Tech Stack:** TypeScript, React, Electron IPC, Drizzle + better-sqlite3, Vercel AI SDK, ECharts, Vitest

---

## 0) 方案对比（先确认方向）

### 方案 A（推荐）：本地聚合 + LLM 增强
- 优点：隐私友好，复用现有数据库，离线可展示历史，成本可控
- 缺点：统计口径要自己维护，图表 schema 需要长期演进

### 方案 B：全 LLM 动态生成（弱结构）
- 优点：开发快，prompt 驱动扩展性强
- 缺点：结果不稳定，图表可交互能力弱，难做历史筛选与导出一致性

### 方案 C：外部分析服务（云端）
- 优点：可做重型计算和多设备同步
- 缺点：引入后端与数据同步复杂度，偏离当前本地优先架构

**结论：**采用方案 A。先稳定交付「结构化报告 + 历史 + 可点击下钻」，再在后续 Phase 增加向量聚类和高级推荐。

---

## 1) 报告数据结构（统一模型）

### 1.1 SQLite 表

`ai_reports`（核心表）
- `id TEXT PRIMARY KEY`
- `report_type TEXT NOT NULL`  
  值：`daily_feed_topics | weekly_reading_summary | notes_summary | custom_analysis | monthly_review | yearly_review | recommendation`
- `title TEXT NOT NULL`
- `period_start TEXT NOT NULL`
- `period_end TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'completed'` (`pending | running | completed | failed`)
- `query_text TEXT`（自定义分析原始自然语言）
- `input_json TEXT`（生成上下文快照）
- `output_json TEXT NOT NULL`（统一结构化报告体）
- `tags_json TEXT`（用于历史筛选）
- `created_by TEXT NOT NULL DEFAULT 'system'`（`system | user`）
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `deleted_flg INTEGER DEFAULT 0`

`ai_report_exports`（导出记录）
- `id TEXT PRIMARY KEY`
- `report_id TEXT NOT NULL REFERENCES ai_reports(id)`
- `format TEXT NOT NULL` (`markdown | pdf | image | json`)
- `file_path TEXT`
- `created_at TEXT NOT NULL`

### 1.2 TypeScript 类型（`src/shared/types.ts`）

```ts
export type AIReportType =
  | 'daily_feed_topics'
  | 'weekly_reading_summary'
  | 'notes_summary'
  | 'custom_analysis'
  | 'monthly_review'
  | 'yearly_review'
  | 'recommendation';

export interface AIReportDataPoint {
  id: string;
  label: string;
  value: number | string;
  articleId?: string;
  highlightId?: string;
  feedId?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface AIReportSection {
  id: string;
  type: 'metric' | 'list' | 'timeseries' | 'distribution' | 'insight' | 'knowledge_card';
  title: string;
  description?: string;
  dataPoints: AIReportDataPoint[];
}

export interface AIReport {
  id: string;
  reportType: AIReportType;
  title: string;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  queryText?: string | null;
  sections: AIReportSection[];
  tags: string[];
  createdBy: 'system' | 'user';
  createdAt: string;
  updatedAt: string;
}
```

---

## 2) 报告模板 JSON Schema（Daily/Weekly/Notes/Custom）

### 2.1 通用 Envelope

```json
{
  "version": "1.0",
  "summary": "string",
  "sections": [],
  "insights": ["string"],
  "drilldowns": []
}
```

### 2.2 Daily Feed Topics

```json
{
  "version": "1.0",
  "summary": "今日订阅主题概览",
  "sections": [
    { "id": "hot_topics", "type": "distribution", "title": "热点主题排名", "dataPoints": [] },
    { "id": "topic_cloud", "type": "list", "title": "主题词云", "dataPoints": [] },
    { "id": "related_articles", "type": "list", "title": "相关文章", "dataPoints": [] }
  ],
  "insights": [],
  "drilldowns": [
    { "sourceSectionId": "hot_topics", "action": "open-article-list-by-topic" }
  ]
}
```

### 2.3 Weekly Reading Summary

```json
{
  "version": "1.0",
  "summary": "本周阅读习惯总结",
  "sections": [
    { "id": "reading_volume", "type": "timeseries", "title": "阅读量趋势", "dataPoints": [] },
    { "id": "reading_duration", "type": "timeseries", "title": "阅读时长", "dataPoints": [] },
    { "id": "topic_distribution", "type": "distribution", "title": "主题分布", "dataPoints": [] },
    { "id": "habit_insights", "type": "insight", "title": "习惯洞察", "dataPoints": [] }
  ],
  "insights": [],
  "drilldowns": [
    { "sourceSectionId": "reading_volume", "action": "open-articles-by-date" }
  ]
}
```

### 2.4 Notes Summary

```json
{
  "version": "1.0",
  "summary": "本期笔记知识卡片",
  "sections": [
    { "id": "clusters", "type": "knowledge_card", "title": "主题知识卡片", "dataPoints": [] },
    { "id": "key_quotes", "type": "list", "title": "关键引用", "dataPoints": [] }
  ],
  "insights": [],
  "drilldowns": [
    { "sourceSectionId": "clusters", "action": "open-highlight-list-by-topic" }
  ]
}
```

### 2.5 Custom Analysis

```json
{
  "version": "1.0",
  "summary": "自定义分析结果",
  "sections": [],
  "insights": [],
  "drilldowns": []
}
```

---

## 3) 任务拆分（TDD + 小步提交）

### Task 1: 建立 AI 报告 Domain 与 IPC 契约

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload.ts`
- Test: `tests/ai-reports-contract.test.ts`

**Step 1: 写 failing test（类型与 channel 常量）**

```ts
import { IPC_CHANNELS } from '../src/shared/ipc-channels';
import { expect, it, describe } from 'vitest';

describe('AI report IPC contracts', () => {
  it('defines report channels', () => {
    expect(IPC_CHANNELS.AI_REPORT_GENERATE).toBe('ai:report:generate');
    expect(IPC_CHANNELS.AI_REPORT_LIST).toBe('ai:report:list');
  });
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-reports-contract.test.ts`
- Expected: FAIL（缺少 channel/type）

**Step 3: 最小实现**
- 在 `src/shared/ipc-channels.ts` 新增：
  - `AI_REPORT_GENERATE`
  - `AI_REPORT_LIST`
  - `AI_REPORT_GET`
  - `AI_REPORT_DELETE`
  - `AI_REPORT_EXPORT`
- 在 `src/shared/types.ts` 增加 `AIReport*` 类型
- 在 `src/preload.ts` 暴露 `aiReportGenerate/list/get/delete/export`

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-reports-contract.test.ts`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/preload.ts tests/ai-reports-contract.test.ts
git commit -m "feat(ai): add report domain types and IPC contracts"
```

---

### Task 2: 数据库与存储层（报告历史）

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/index.ts`
- Create: `src/ai/providers/report-db.ts`
- Test: `tests/ai-report-db.test.ts`

**Step 1: 写 failing test（CRUD + 过滤）**

```ts
it('can create and list reports by type', async () => {
  const row = repo.createReport(...);
  const rows = repo.listReports({ type: 'daily_feed_topics' });
  expect(rows[0].id).toBe(row.id);
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-report-db.test.ts`
- Expected: FAIL（repo 未实现）

**Step 3: 最小实现**
- `schema.ts` 增加 `aiReports` / `aiReportExports`
- `db/index.ts` 增加 `CREATE TABLE IF NOT EXISTS` + 索引 + 兼容迁移
- `report-db.ts` 实现：
  - `createReport`
  - `updateReport`
  - `listReports`
  - `getReport`
  - `softDeleteReport`
  - `createExportRecord`

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-report-db.test.ts`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/main/db/schema.ts src/main/db/index.ts src/ai/providers/report-db.ts tests/ai-report-db.test.ts
git commit -m "feat(ai): add report history tables and repository"
```

---

### Task 3: 报告生成服务（Daily/Weekly/Notes/Custom）

**Files:**
- Create: `src/ai/services/report-service.ts`
- Modify: `src/main/ai/tool-context-factory.ts`
- Test: `tests/ai-report-service.test.ts`

**Step 1: 写 failing test（四种报告可生成结构化 output）**

```ts
it('generates weekly report sections', async () => {
  const report = await service.generateWeeklySummary(...);
  expect(report.sections.some(s => s.id === 'reading_volume')).toBe(true);
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-report-service.test.ts`
- Expected: FAIL

**Step 3: 最小实现**
- `report-service.ts` 提供：
  - `generateDailyFeedTopics()`
  - `generateWeeklyReadingSummary()`
  - `generateNotesSummary()`
  - `generateCustomAnalysis(query)`
- 数据来源：
  - `articles`（阅读量、时长、主题原始语料）
  - `highlights`（笔记与高亮）
  - `aiExtractTopics` 或内部 `extract-topics` 复用
- 输出严格对齐统一 JSON schema

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-report-service.test.ts`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/ai/services/report-service.ts src/main/ai/tool-context-factory.ts tests/ai-report-service.test.ts
git commit -m "feat(ai): implement structured report generation service"
```

---

### Task 4: IPC + 自动任务（每日/每周定时）

**Files:**
- Create: `src/main/ipc/ai-report-handlers.ts`
- Modify: `src/main/ipc/index.ts`
- Create: `src/main/services/ai-report-scheduler.ts`
- Modify: `src/main.ts`
- Test: `tests/ai-report-handlers.test.ts`

**Step 1: 写 failing test（IPC handler 路由 + 参数校验）**

```ts
it('lists reports and supports type filter', async () => {
  const rows = await invokeList({ type: 'weekly_reading_summary' });
  expect(Array.isArray(rows)).toBe(true);
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-report-handlers.test.ts`
- Expected: FAIL

**Step 3: 最小实现**
- 注册 IPC：
  - `ai:report:generate`
  - `ai:report:list`
  - `ai:report:get`
  - `ai:report:delete`
  - `ai:report:export`
- `ai-report-scheduler.ts`：
  - 每日固定时刻生成 daily report（默认 08:00 本地时间）
  - 每周固定时刻生成 weekly report（默认周一 08:10）
  - 失败写 `ai_task_logs` + `notifications`
- `main.ts` 在 app ready 后启动 scheduler

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-report-handlers.test.ts`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/ai-report-handlers.ts src/main/ipc/index.ts src/main/services/ai-report-scheduler.ts src/main.ts tests/ai-report-handlers.test.ts
git commit -m "feat(ai): add report IPC and background scheduler"
```

---

### Task 5: AI 工作台页面（Step 1~3：入口、自动报告、笔记总结）

**Files:**
- Create: `src/renderer/components/AIWorkbenchPage.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`
- Test: `tests/ai-workbench-page.test.tsx`

**Step 1: 写 failing test（可导航到 AI 工作台 + 展示三分区）**

```tsx
it('shows quick cards, history and custom input areas', () => {
  render(<AIWorkbenchPage />);
  expect(screen.getByText(/快速报告|Quick Reports/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-workbench-page.test.tsx`
- Expected: FAIL

**Step 3: 最小实现**
- `Sidebar` 新增入口：`AI 工作台`
- `App.tsx` 新增 `activeView === 'ai-workbench'` 分支
- `AIWorkbenchPage.tsx` 首版包含三区：
  - 快速报告卡片（每日 Feed / 每周总结 / 笔记总结）
  - 历史列表（筛选 + 标签）
  - 自定义分析输入区
- 图表库接入：`echarts`（词云可先用条形分布占位）

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-workbench-page.test.tsx`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/AIWorkbenchPage.tsx src/renderer/components/Sidebar.tsx src/renderer/App.tsx src/locales/zh.json src/locales/en.json tests/ai-workbench-page.test.tsx
git commit -m "feat(renderer): add AI workbench entry and base layout"
```

---

### Task 6: 自定义分析流式输出 + 自动入历史（Step 4）

**Files:**
- Modify: `src/main/ipc/ai-handlers.ts`
- Modify: `src/ai/services/chat.ts`
- Modify: `src/renderer/components/AIWorkbenchPage.tsx`
- Test: `tests/ai-workbench-custom-analysis.test.tsx`

**Step 1: 写 failing test（提交自然语言请求后可流式显示并保存）**

```tsx
it('streams custom analysis and persists report history', async () => {
  // submit query -> receives chunks -> appears in history
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-workbench-custom-analysis.test.tsx`
- Expected: FAIL

**Step 3: 最小实现**
- 自定义分析调用 AI（可走 `streamText`），同时转换为 `AIReport` 存储
- UI 显示「AI 思考过程」：
  - tool call
  - tool result
  - text delta
- 完成后自动刷新历史

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-workbench-custom-analysis.test.tsx`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/ai-handlers.ts src/ai/services/chat.ts src/renderer/components/AIWorkbenchPage.tsx tests/ai-workbench-custom-analysis.test.tsx
git commit -m "feat(ai): support streaming custom analysis with auto-save history"
```

---

### Task 7: 历史管理 + 下钻 + 导出分享（Step 5）

**Files:**
- Modify: `src/main/ipc/export-handlers.ts`
- Modify: `src/main/ipc/ai-report-handlers.ts`
- Modify: `src/renderer/components/AIWorkbenchPage.tsx`
- Test: `tests/ai-report-export.test.ts`

**Step 1: 写 failing test（导出 markdown/pdf/image + 删除 + 筛选）**

```ts
it('exports report in markdown format', async () => {
  const out = await exportReport('report-id', 'markdown');
  expect(out).toContain('.md');
});
```

**Step 2: Run test to verify it fails**
- Run: `pnpm test tests/ai-report-export.test.ts`
- Expected: FAIL

**Step 3: 最小实现**
- 报告历史：
  - 按 type/tag/date filter
  - 软删除
- 导出：
  - Markdown：直接写文件
  - PDF：复用现有导出能力（如当前无统一 PDF 服务，先渲染 HTML 再导出）
  - Image：调用现有分享图导出路径
- 下钻：
  - 点击图表点 -> 调用 `onNavigateToArticle(articleId)`

**Step 4: Run test to verify it passes**
- Run: `pnpm test tests/ai-report-export.test.ts`
- Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/export-handlers.ts src/main/ipc/ai-report-handlers.ts src/renderer/components/AIWorkbenchPage.tsx tests/ai-report-export.test.ts
git commit -m "feat(ai): add report history management, drilldown and export"
```

---

### Task 8: 质量闸门（回归 + 文档）

**Files:**
- Create: `docs/ai-workbench.md`
- Modify: `docs/agent-prd.md`（Phase 规划新增 AI 工作台里程碑）

**Step 1: Run targeted tests**
- Run: `pnpm test tests/ai-reports-contract.test.ts tests/ai-report-db.test.ts tests/ai-report-service.test.ts tests/ai-report-handlers.test.ts tests/ai-workbench-page.test.tsx tests/ai-workbench-custom-analysis.test.tsx tests/ai-report-export.test.ts`
- Expected: 全部 PASS

**Step 2: Run lint**
- Run: `pnpm lint`
- Expected: PASS

**Step 3: 写文档**
- `docs/ai-workbench.md`：架构、schema、IPC、导出格式、下钻协议
- `docs/agent-prd.md`：新增 Phase 条目

**Step 4: Commit**

```bash
git add docs/ai-workbench.md docs/agent-prd.md
git commit -m "docs(ai): add AI workbench architecture and roadmap updates"
```

---

## 4) Phase 集成建议（纳入现有路线图）

### Phase 3.1（1 周）
- AI 工作台入口 + 报告历史 + Daily/Weekly 自动生成

### Phase 3.2（1 周）
- 笔记总结知识卡片 + 自定义分析流式输出 + 自动保存

### Phase 3.3（0.5 周）
- 导出/分享 + 可点击下钻 + 质量回归与文档收敛

### Phase 4（可选）
- 月度总结、年度回顾、内容推荐报告
- cluster_by_topic / extract_quotes 深化（向量化可后置）

---

## 5) 验收标准（对应你的 6 项核心诉求）

- 每日 Feed 主题分析：可自动生成并展示热点、词云、相关文章
- 每周阅读总结：有趋势图、主题分布、时长统计、习惯洞察
- 笔记总结：可按主题生成知识卡片并关联来源
- 自定义报告：自然语言输入，流式展示，生成后入历史
- 报告历史：支持筛选、删除、导出、分享
- 交互式探索：图表/数据点可点击下钻到文章或高亮

---

Plan complete and saved to `docs/plans/2026-02-14-ai-workbench-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
