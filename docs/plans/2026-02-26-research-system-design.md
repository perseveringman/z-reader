# Z-Reader 研究系统 - 架构设计文档

> 日期: 2026-02-26
> 状态: 设计完成，待实现
> PRD: docs/prd-research-system.md

---

## 1. 架构决策总结

| 决策点 | 选定方案 | 理由 |
|--------|----------|------|
| 导航布局 | 新增 48px Activity Rail Bar | 模式隔离清晰，为未来多模块（笔记、任务等）留好结构 |
| AI 对话 | 扩展现有 AgentService，新增 `research` 模块 | 复用成熟基座（Tool Calling、流式推送、ActionRouter），保持架构一致性 |
| 检索策略 | 直接复用 + 增量升级现有 RAG | 已有完整 RAG 管线（分块/Embedding/向量搜索/FTS5/RRF），避免重复建设 |
| 产物存储 | 结构化产物用 JSON，文本产物用 Markdown | 数据视图分离，便于切换渲染库和多格式导出 |
| 前端架构 | 模块化 Shell + 模块注册表 | 面向多模块演进，每个模式独立开发、独立部署、接口通信 |

---

## 2. Phase 规划（3 Phase）

### Phase 1: 骨架 + 基础 RAG 集成

- Activity Rail Bar + 模式切换
- 研究空间 CRUD（数据库 + IPC + UI）
- Sources Panel：空间管理 + 从阅读库导入文章
- Chat Area：扩展 AgentService，注册 `research` 模块，复用现有 RAG 管线做检索增强问答
- Studio Panel：静态框架 + 2 种基础产物（研究报告 Markdown + 对比矩阵 JSON）
- RAG 适配：在现有 retriever 中增加按研究空间的 sourceIds 过滤

### Phase 2: RAG 升级 + 产物完善

- Contextual Chunking：导入时用 fast 模型给每个 chunk 添加文档上下文（预期提升 49% 检索准确率）
- Reranking：检索 Top-50 后用模型 rerank 到 Top-10（结合 Contextual Chunking 预期提升 67%）
- 修复 chunk overlap（已配置但未实现的 50 token 重叠）
- 源摘要生成 + 缓存到 summary_cache
- 补充产物类型：思维导图、知识图谱（复用现有 MindMapPanel/KnowledgeGraphView）、时间线
- 产物导出（Markdown/PNG）

### Phase 3: Agentic 推理 + 高级功能

- Agentic 多步检索：查询分解 → 迭代检索 → 质量评估 → 补充检索
- Corrective RAG：检索结果置信度评估，低置信度自动重新检索
- 建议问题自动生成
- 对话内引用标注 + 跳转到源材料原文位置
- 书籍章节级导入

---

## 3. 数据层设计

### 3.1 新增 Drizzle Schema 表

在 `src/main/db/schema.ts` 中追加：

```typescript
// ============================================================
// 研究系统表
// ============================================================

// research_spaces - 研究空间
export const researchSpaces = sqliteTable('research_spaces', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon').default('FlaskConical'),
  status: text('status').default('active'),         // active | archived
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_flg: integer('deleted_flg').default(0),
});

// research_space_sources - 空间-资源关联（多对多）
export const researchSpaceSources = sqliteTable('research_space_sources', {
  id: text('id').primaryKey(),
  space_id: text('space_id').notNull(),              // FK → research_spaces.id
  source_type: text('source_type').notNull(),         // article | book | highlight | note
  source_id: text('source_id').notNull(),             // 对应 articles.id / books.id 等
  enabled: integer('enabled').default(1),             // 是否参与 AI 分析
  summary_cache: text('summary_cache'),               // Phase 2: 缓存的单源摘要
  processing_status: text('processing_status').default('pending'),  // pending | processing | ready | error
  added_at: text('added_at').notNull(),
});

// research_conversations - 研究对话
export const researchConversations = sqliteTable('research_conversations', {
  id: text('id').primaryKey(),
  space_id: text('space_id').notNull(),              // FK → research_spaces.id
  title: text('title'),
  messages: text('messages'),                         // JSON: ChatMessage[]
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// research_artifacts - 研究产物
export const researchArtifacts = sqliteTable('research_artifacts', {
  id: text('id').primaryKey(),
  space_id: text('space_id').notNull(),              // FK → research_spaces.id
  type: text('type').notNull(),                       // mindmap | knowledge_graph | report | comparison | timeline | table | faq | summary
  title: text('title').notNull(),
  content: text('content'),                           // JSON（结构化产物）或 Markdown（文本产物）
  prompt: text('prompt'),                             // 生成时使用的 prompt
  pinned: integer('pinned').default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_flg: integer('deleted_flg').default(0),
});
```

### 3.2 索引

```sql
CREATE INDEX idx_research_space_sources_space ON research_space_sources(space_id);
CREATE INDEX idx_research_space_sources_source ON research_space_sources(source_type, source_id);
CREATE INDEX idx_research_conversations_space ON research_conversations(space_id);
CREATE INDEX idx_research_artifacts_space ON research_artifacts(space_id);
```

### 3.3 IPC Channels

在 `src/shared/ipc-channels.ts` 中新增，沿用现有 camelCase 风格：

```typescript
// 研究空间 CRUD
researchSpaceCreate    = 'research:space:create'
researchSpaceList      = 'research:space:list'
researchSpaceGet       = 'research:space:get'
researchSpaceUpdate    = 'research:space:update'
researchSpaceDelete    = 'research:space:delete'

// 资源管理
researchSourceAdd      = 'research:source:add'
researchSourceRemove   = 'research:source:remove'
researchSourceToggle   = 'research:source:toggle'
researchSourceList     = 'research:source:list'

// 研究对话（复用 Agent 流式机制，新增空间上下文）
researchChatSend       = 'research:chat:send'
researchChatStream     = 'research:chat:stream'

// 产物管理
researchArtifactList   = 'research:artifact:list'
researchArtifactGet    = 'research:artifact:get'
researchArtifactCreate = 'research:artifact:create'
researchArtifactUpdate = 'research:artifact:update'
researchArtifactDelete = 'research:artifact:delete'
researchArtifactExport = 'research:artifact:export'

// 预处理状态
researchPreprocessStatus = 'research:preprocess:status'
```

IPC handler 统一放在新文件 `src/main/ipc/research-handlers.ts`。

---

## 4. 前端架构：模块化 Shell

### 4.1 设计原则

面向多模块演进（阅读、研究、笔记、任务...），每个模式作为独立的"应用模块"：
- 每个模块独立开发、独立目录
- 模块间不直接 import，通过 IPC 层 + 事件总线通信
- Shell（App.tsx）只负责 Rail Bar + 模块加载/切换

### 4.2 模块接口

```typescript
// src/renderer/modules/types.ts
import type { LucideIcon } from 'lucide-react';

export interface AppModule {
  id: string;                        // 'read' | 'research' | 'notes' | 'tasks' ...
  label: string;                     // 显示名称（i18n key）
  icon: LucideIcon;                  // Rail Bar 图标
  component: React.ComponentType;    // 模块根组件
  order: number;                     // Rail Bar 排序序号
}
```

### 4.3 模块注册表

```typescript
// src/renderer/modules/registry.ts
import { readModule } from './read';
import { researchModule } from './research';

export const appModules: AppModule[] = [
  readModule,       // order: 1
  researchModule,   // order: 2
  // 未来: notesModule, tasksModule, ...
];
```

### 4.4 Shell 改造

```typescript
// App.tsx 改造后的核心逻辑
function App() {
  const [activeModuleId, setActiveModuleId] = useState('read');
  const activeModule = appModules.find(m => m.id === activeModuleId);

  return (
    <div className="flex h-screen">
      <ActivityRailBar
        modules={appModules}
        activeId={activeModuleId}
        onSwitch={setActiveModuleId}
      />
      <div className="flex-1">
        {activeModule && <activeModule.component />}
      </div>
    </div>
  );
}
```

### 4.5 Activity Rail Bar

- 宽度：48px，不可折叠
- 位置：窗口最左侧
- 样式：深色背景，极简图标 + tooltip
- 选中态：图标高亮 + 左侧 3px 蓝色指示条
- 从 `appModules` 读取图标和标签，按 `order` 排序渲染
- 底部可放置全局设置入口

### 4.6 研究模块组件结构

```
src/renderer/modules/research/
├── index.ts                         // 导出 researchModule: AppModule
├── ResearchLayout.tsx               // 三栏布局容器
├── components/
│   ├── SourcesPanel.tsx             // 左栏：空间管理 + 资源列表
│   │   ├── SpaceSelector.tsx        // 空间选择/切换下拉
│   │   ├── SourceList.tsx           // 资源卡片列表（含状态指示）
│   │   └── ImportDialog.tsx         // 从阅读库导入文章/书籍的对话框
│   ├── ResearchChat.tsx             // 中栏：AI 对话区
│   │   ├── MessageList.tsx          // 对话消息列表
│   │   ├── SuggestedQuestions.tsx   // 建议问题（Phase 3）
│   │   └── ChatInput.tsx            // 输入框
│   └── StudioPanel.tsx              // 右栏：工具 + 产物
│       ├── QuickTools.tsx           // 快捷工具栏
│       ├── ArtifactList.tsx         // 产物列表
│       └── ArtifactViewer.tsx       // 产物查看/编辑
├── hooks/
│   ├── useResearchSpaces.ts         // 空间 CRUD hooks
│   ├── useResearchSources.ts        // 资源管理 hooks
│   ├── useResearchChat.ts           // 对话 hooks（接入 Agent 流式管道）
│   └── useResearchArtifacts.ts      // 产物管理 hooks
└── store/
    └── research-store.ts            // 研究模块本地状态（Zustand）
```

### 4.7 阅读模块包装

Phase 1 中对现有阅读布局做最小改动——只是在外面套一层 wrapper：

```typescript
// src/renderer/modules/read/index.ts
import { BookOpen } from 'lucide-react';
import { ReadLayout } from './ReadLayout';

export const readModule: AppModule = {
  id: 'read',
  label: 'sidebar.read',
  icon: BookOpen,
  component: ReadLayout,  // 包装现有的 Sidebar + ContentList + DetailPanel
  order: 1,
};
```

`ReadLayout` 内部直接渲染现有的三栏组件，不改动任何现有逻辑。

---

## 5. AI Agent 研究模块

### 5.1 模块注册

在 AgentService 的模块列表中新增：

```typescript
{
  id: 'research',
  activeWhen: (vs: AgentViewState) => vs.pageState.page === 'research',
  systemPromptSegment: `你是一个研究助手，当前处于研究空间「{spaceTitle}」。
    你的源材料共 {sourceCount} 篇，涵盖 {sourceTypes}。

    能力：
    - 基于源材料回答问题（所有回答必须带 [来源名称] 引用标注）
    - 对多个源进行对比分析
    - 发现跨文档的关联和矛盾
    - 生成结构化产物（思维导图、知识图谱、研究报告、对比矩阵等）

    原则：
    1. 所有回答必须基于源材料，不要凭空生成
    2. 使用 [来源名称] 标注引用
    3. 当源材料不足以回答时，明确告知用户而非猜测
    4. 发现跨文档的联系、矛盾、共性时主动指出`,

  actionLevels: {
    search_research_sources: 'read',
    get_source_summary: 'read',
    get_source_chunks: 'read',
    generate_artifact: 'write',        // 需要前端确认
    update_artifact: 'write',
  },
}
```

### 5.2 研究专用 Tools

#### Phase 1 Tools

```typescript
// search_research_sources
// 在当前研究空间的源材料中进行语义搜索
{
  description: '在当前研究空间的源材料中搜索相关内容',
  parameters: z.object({
    query: z.string().describe('搜索查询'),
    topK: z.number().optional().default(10).describe('返回结果数量'),
  }),
  execute: async ({ query, topK }) => {
    // 1. 获取空间内所有 enabled 的 source_ids
    const sources = await getSpaceSources(spaceId, { enabled: true });
    const sourceIds = sources.map(s => s.source_id);

    // 2. 调用现有 HybridRetriever（向量 + FTS5 + RRF 融合）
    const results = await retriever.search({
      text: query,
      topK,
      filters: { sourceIds },
    });

    // 3. ContextBuilder 组装上下文 + 引用
    const context = await contextBuilder.build(results);
    return context;
  },
}

// get_source_summary
// 获取指定源材料的摘要信息
{
  description: '获取指定源材料的摘要和元信息',
  parameters: z.object({
    sourceId: z.string(),
  }),
  execute: async ({ sourceId }) => {
    // 查询 research_space_sources 获取 summary_cache
    // Phase 1: 返回文章标题 + 前 500 字
    // Phase 2: 返回 AI 生成的结构化摘要
  },
}

// generate_artifact
// 生成研究产物（需要 ActionRouter 确认）
{
  description: '生成研究产物（思维导图、报告、对比矩阵等）',
  parameters: z.object({
    type: z.enum(['report', 'comparison', 'mindmap', 'knowledge_graph', 'timeline', 'faq', 'summary']),
    title: z.string(),
    instruction: z.string().describe('产物内容的具体要求'),
  }),
  execute: async ({ type, title, instruction }) => {
    // 1. 检索空间内所有启用源的摘要/关键内容
    // 2. 根据 type 构造不同的生成 prompt
    // 3. 调用 LLM 生成产物内容
    // 4. 存储到 research_artifacts 表
    // 5. 返回产物 ID 和预览
  },
}
```

#### Phase 3 新增 Tools

```typescript
// analyze_query - 查询分解
{
  description: '将复杂研究问题分解为可检索的子问题',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    // 用 LLM 将复杂问题拆解为 2-5 个子问题
    // 返回 { subQueries: string[], strategy: 'parallel' | 'sequential' }
  },
}

// evaluate_results - 检索质量评估（Corrective RAG）
{
  description: '评估当前检索结果是否足以回答用户问题',
  parameters: z.object({
    query: z.string(),
    currentContext: z.string(),
  }),
  execute: async ({ query, currentContext }) => {
    // 用 LLM 评估上下文对问题的覆盖度
    // 返回 { sufficient: boolean, confidence: number, missingAspects: string[] }
  },
}
```

### 5.3 对话流程

```
用户在 ResearchChat 输入问题
  → IPC: researchChatSend({ spaceId, message, conversationId })
  → research-handlers.ts:
      1. 构造 AgentViewState { page: 'research', spaceId, sourceCount, ... }
      2. 调用 AgentService.send(viewState, message, sessionId)
  → AgentService:
      1. 检测 page === 'research'，激活 research 模块
      2. 构建 system prompt（含空间上下文信息）
      3. 注册 research tools
      4. streamText() 开始 Tool Calling 循环
  → LLM 自动决定:
      - 调用 search_research_sources 检索相关内容
      - 基于检索结果生成带引用的回答
      - 或调用 generate_artifact 生成产物
  → 流式推送 AgentStreamChunk 到前端
  → ResearchChat 渲染消息 + 引用标注
```

---

## 6. RAG 三层架构升级

### 6.1 现有 RAG 能力盘点

| 组件 | 现状 | 文件位置 |
|------|------|----------|
| 分块 | 按段落+句子边界，400 tokens/chunk | src/ai/services/chunking.ts |
| Embedding | 火山引擎 2048 维，逐条 API 调用 | src/ai/services/embedding.ts |
| 向量存储 | sqlite-vec + cosine 距离 | src/ai/providers/rag-db.ts |
| 混合检索 | 向量搜索 + FTS5 + RRF(K=60) 融合 | src/ai/services/retriever.ts |
| 上下文构建 | 带引用编号的 chunk 拼接，4000 tokens | src/ai/services/context-builder.ts |
| 摄入管线 | 分块 → Embedding → 存储，支持增量/失败恢复 | src/ai/services/ingestion.ts |

### 6.2 Phase 1 适配：按研究空间过滤

现有 `SearchFilters` 已支持 `sourceIds` 过滤。需要确保：

1. **向量搜索路径**：已支持 sourceIds 过滤（在 `applyFilters` 中）——无需改动
2. **关键词搜索路径**：当前只查 `articles_fts` 表，需要扩展：
   - 改为在 `chunks` 表上根据 `source_id IN (...)` 做过滤
   - 或保持 FTS5 搜索后，在结果中按 sourceIds 过滤

3. **材料导入触发 RAG 摄入**：
   - 用户将文章导入研究空间时，检查该文章是否已被 RAG 系统索引
   - 如果未索引，调用现有 `ingestion.ingest()` 进行分块 + Embedding
   - 如果已索引，直接关联（无需重复处理）
   - 更新 `research_space_sources.processing_status` 状态

### 6.3 Phase 2 升级：Contextual Chunking

在现有 `ingestion.ts` 的分块和 Embedding 之间插入新步骤：

```
Step 2: 分块 (chunking.ts)
  ↓
[新增] Step 2.5: Contextual Enrichment
  - 为整篇文档生成一份简短摘要（100-200 字）
  - 对每个 chunk，用 fast 模型生成上下文前缀（50-100 字）
    Prompt: "以下是文档《{title}》的摘要：{docSummary}。
             请为下面这段内容生成一句话的上下文描述，
             说明它在文档中的位置和语境：{chunkContent}"
  - 将"上下文前缀 + 原始 chunk"拼接后送入 Embedding
  - 原始 chunk content 保持不变（用于展示）
  - 上下文增强后的文本仅用于 Embedding
  ↓
Step 3: Embedding (embedding.ts)
```

成本控制：
- 使用 fast/cheap 模型（GPT-4o-mini 或同级别）
- 利用 Prompt Caching：同一文档的所有 chunks 共享文档摘要前缀
- 预估成本：每 1000 篇文章 × 平均 10 chunks = 10000 次 API 调用

### 6.4 Phase 2 升级：Reranking

在 `retriever.ts` 的 RRF 融合之后新增：

```
RRF 融合 → Top-50
  ↓
[新增] Reranking Step:
  - 将 Top-50 个 (query, chunk_content) 对送入 reranker
  - 方案 A（推荐）: 用 fast LLM 做 listwise reranking
    "对以下 50 段文本按照与查询的相关性排序，返回 Top-10 的编号"
  - 方案 B: 集成专用 Reranker API（Jina/Cohere）
  - 方案 C: 用 LLM 做 pointwise scoring（每个 chunk 独立评分）
  ↓
Reranked Top-10
  ↓
ContextBuilder 组装
```

### 6.5 Phase 2 升级：修复 Chunk Overlap

在 `chunking.ts` 的 `mergeAndSplitParagraphs` 方法中实现已配置但未生效的 overlap：

```typescript
// 当 flush 一个 chunk 时，保留最后 overlap tokens 的内容
// 作为下一个 chunk 的开头
const overlapText = getLastNTokens(currentChunk, this.config.overlap);
nextChunkStart = overlapText;
```

### 6.6 Phase 3 升级：Agentic 多步推理

核心思路：利用 AgentService 的 Tool Calling 循环实现 multi-hop retrieval。

```
用户问: "这三种数据库在高并发场景下各自的性能表现如何？"
  ↓
Agent 推理:
  1. 调用 analyze_query → 分解为:
     - "数据库A 高并发 性能"
     - "数据库B 高并发 性能"
     - "数据库C 高并发 性能"
  2. 对每个子问题调用 search_research_sources
  3. 调用 evaluate_results 评估覆盖度
     → { sufficient: false, missingAspects: ["对比基准测试数据"] }
  4. 针对缺失方面再次调用 search_research_sources
  5. 综合所有检索结果生成对比分析回答
```

这完全通过 LLM 的 Tool Calling 循环实现，不需要额外的编排框架。

---

## 7. 产物生成与渲染

### 7.1 产物类型与存储格式

| 产物类型 | 存储格式 | 渲染组件 | Phase |
|----------|----------|----------|-------|
| 研究报告 (report) | Markdown | MarkdownRenderer | 1 |
| 对比矩阵 (comparison) | JSON `{ headers, rows }` | ComparisonTable | 1 |
| 摘要 (summary) | Markdown | MarkdownRenderer | 1 |
| FAQ (faq) | Markdown | MarkdownRenderer | 1 |
| 思维导图 (mindmap) | JSON (Markmap 格式) | MindMapPanel（复用） | 2 |
| 知识图谱 (knowledge_graph) | JSON `{ nodes, edges }` | KnowledgeGraphView（复用） | 2 |
| 时间线 (timeline) | JSON `{ events: [{date, title, description}] }` | TimelineView（新建） | 2 |

### 7.2 产物生成 Prompt 模板

**研究报告**：
```
基于以下源材料，生成一份关于「{title}」的研究报告。
要求：
1. 使用 Markdown 格式
2. 包含：摘要、主要发现、详细分析、结论
3. 所有论点需标注 [来源名称] 引用
4. 在发现矛盾观点时明确指出

源材料：
{context}
```

**对比矩阵**：
```
基于以下源材料，生成一个对比矩阵。
输出 JSON 格式：
{
  "dimensions": ["维度1", "维度2", ...],
  "items": [
    { "name": "项目A", "values": { "维度1": "...", "维度2": "..." } },
    ...
  ]
}
要求：所有值需基于源材料，标注来源。

源材料：
{context}
```

### 7.3 产物渲染策略

`ArtifactViewer` 组件根据 `artifact.type` 分发到对应渲染器：

```typescript
switch (artifact.type) {
  case 'report':
  case 'summary':
  case 'faq':
    return <MarkdownRenderer content={artifact.content} />;
  case 'comparison':
    return <ComparisonTable data={JSON.parse(artifact.content)} />;
  case 'mindmap':
    return <MindMapPanel data={JSON.parse(artifact.content)} />;
  case 'knowledge_graph':
    return <KnowledgeGraphView data={JSON.parse(artifact.content)} />;
  case 'timeline':
    return <TimelineView data={JSON.parse(artifact.content)} />;
}
```

---

## 8. 研究模式布局参考

```
┌────┬──────────┬─────────────────────┬──────────────────────┐
│Rail│ Sources  │   Chat Area         │   Studio Panel       │
│Bar │ Panel    │                     │                      │
│    │          │                     │                      │
│ 📖 │ 空间选择器│   AI 对话区域        │   快捷工具栏          │
│    │ ──────── │                     │   ──────────          │
│ 🔬 │ 资源列表  │   支持多轮对话       │   产物列表            │
│    │ (文章)   │   引用源材料         │   (研究报告)          │
│    │ (书籍)   │   上下文感知         │   (对比矩阵)          │
│    │ (高亮)   │                     │   (思维导图)          │
│    │          │   建议问题           │   (知识图谱)          │
│    │ 导入按钮  │   输入框            │   (时间线)            │
│    │          │                     │                      │
│ ⚙  │ 资源统计  │                     │   导出按钮            │
└────┴──────────┴─────────────────────┴──────────────────────┘
 48px  ~240px        自适应                 ~320px
```

---

## 9. 与现有系统的集成点

| 现有模块 | 集成方式 | 改动范围 |
|----------|----------|----------|
| App.tsx | 改造为 Shell，提取 ReadLayout | 中等 |
| AgentService | 新增 research 模块注册 | 小 |
| HybridRetriever | 确保 sourceIds 过滤在所有路径生效 | 小 |
| IngestionService | 研究空间导入时触发摄入 | 小 |
| ContextBuilder | 复用，无需改动 | 无 |
| MindMapPanel | 复用组件，适配产物数据 | 小 |
| KnowledgeGraphView | 复用组件，适配产物数据 | 小 |
| IPC 通道 | 新增 research-handlers.ts | 新文件 |
| preload.ts | 新增 research 相关 API 暴露 | 小 |
| shared/types.ts | 新增研究相关类型定义 | 小 |
| AgentDrawer/MiniChat | 研究模式下隐藏（由研究模块内置 Chat 替代） | 小 |

---

## 10. 不做什么（Scope 边界）

- 不做实时协作（单用户使用）
- 不做外部联网搜索（仅基于导入的源材料）
- 不做 Audio Overview / 播客生成
- 不做 PPT/Slides 生成
- 不做多模态分析（不分析图片/视频，仅处理文本）
- Phase 1 不做 Contextual Chunking 和 Reranking（Phase 2）
- Phase 1 不做 Agentic 多步推理（Phase 3）
