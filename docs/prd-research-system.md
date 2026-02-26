# Z-Reader 研究系统 PRD

## 1. 背景与问题

### 为什么做？

Z-Reader 已经具备成熟的阅读基础设施（RSS 订阅、文章/书籍/播客/视频管理、高亮批注、知识图谱），但用户在"**跨材料主题阅读**"场景下缺乏有效工具：

- **信息碎片化**：用户阅读了大量文章和书籍，但难以将分散的知识点串联成系统性认知
- **缺少研究工作流**：没有一个聚合空间让用户围绕某个主题，把相关材料集中起来进行深度分析
- **AI 能力未充分释放**：现有 Agent 助手仅在阅读场景下做单篇文章问答，缺少跨文档推理和知识生成能力

### 为什么是现在？

1. 阅读系统基础设施已成熟（Sprint 1-2 完成），积累了足够的数据基础
2. 现有 Agent 基座（AgentService + ToolContext + Vercel AI SDK）已具备扩展能力
3. NotebookLM、Manus 等产品验证了"源材料驱动的 AI 研究"是强需求
4. 用户已在系统中积累了足够的阅读材料，是释放知识价值的最佳时机

### 核心用户故事

> *"作为一个技术研究者，我正在评估 3 种数据库方案。我在 Z-Reader 中收藏了 8 篇相关文章和 2 本技术书籍的章节。我希望创建一个'数据库选型'研究空间，把这些材料导入进去，然后让 AI 帮我对比各方案的优劣、生成对比矩阵、绘制思维导图、最终输出一份研究报告。"*

> *"作为一个投资分析师，我订阅了多个行业 RSS 源。每周我需要对 AI 芯片领域的最新进展做主题研究。我希望快速选择本周相关的 15 篇文章，让 AI 帮我提取关键信息、发现趋势、生成行业简报。"*

---

## 2. 成功标准

| 指标 | 目标 |
|------|------|
| 研究空间创建率 | 活跃用户周均创建 ≥ 1 个空间 |
| 材料导入效率 | 从阅读库导入材料 < 3 次点击 |
| AI 响应质量 | 基于源材料回答准确率 > 90%（含引用） |
| 产物生成完成率 | 用户发起的生成任务 80% 完成并保存 |
| 多材料分析上限 | 支持单空间 ≥ 50 篇文章 / ≥ 5 本书籍 |

---

## 3. 整体架构设计

### 3.1 导航层级改造：Activity Rail Bar

在现有 Sidebar 左侧增加一列 48px 宽的图标导航栏（Activity Rail Bar），作为最顶层模式切换：

```
┌────┬──────────┬─────────────────────┬──────────────────────┐
│Rail│ Sidebar  │   Content Area      │   Detail / Output    │
│Bar │          │                     │                      │
│48px│ ~220px   │   自适应             │   自适应              │
│    │          │                     │                      │
│ 📖 │ (阅读模式│   (阅读: 文章列表)   │   (阅读: 详情面板)    │
│    │  侧边栏) │   (研究: 对话区)     │   (研究: 工具/产物)   │
│ 🔬 │          │                     │                      │
│    │          │                     │                      │
└────┴──────────┴─────────────────────┴──────────────────────┘
```

- **📖 阅读 (Read)**：点击后右侧展示现有三栏阅读布局，完全保持现状
- **🔬 研究 (Research)**：点击后右侧展示研究系统三栏布局

### 3.2 研究模式布局（对标 NotebookLM）

```
┌────┬──────────┬─────────────────────┬──────────────────────┐
│Rail│ Sources  │   Chat Area         │   Studio Panel       │
│Bar │ Panel    │                     │                      │
│    │          │                     │                      │
│    │ 空间列表  │   AI 对话区域        │   快捷工具栏          │
│    │ ──────── │                     │   ──────────          │
│    │ 资源列表  │   支持多轮对话       │   产物列表            │
│    │ (文章)   │   引用源材料         │   (思维导图)          │
│    │ (书籍)   │   上下文感知         │   (知识图谱)          │
│    │ (高亮)   │                     │   (研究报告)          │
│    │          │   建议问题           │   (对比矩阵)          │
│    │          │                     │   (时间线)            │
│    │ 导入按钮  │   输入框            │   (数据表格)          │
└────┴──────────┴─────────────────────┴──────────────────────┘
     │  ~240px  │      自适应          │     ~320px           │
```

---

## 4. 核心概念模型

### 4.1 数据模型

```
Research Space (研究空间)
├── id: UUID
├── title: string          // 空间名称，如"数据库选型研究"
├── description: string    // 空间描述
├── icon: string           // 空间图标
├── status: enum           // active | archived
├── created_at / updated_at
│
├── Sources (资源列表)
│   ├── research_space_sources (多对多关联)
│   │   ├── source_type: article | book | highlight | note | url
│   │   ├── source_id: 对应记录 ID
│   │   ├── enabled: boolean    // 是否参与 AI 分析
│   │   └── added_at
│   └── (最多 50 个源材料)
│
├── Conversations (对话历史)
│   ├── research_conversations
│   │   ├── space_id
│   │   ├── messages: JSON     // 多轮对话
│   │   └── created_at
│   └── (每个空间多个对话)
│
└── Artifacts (产物)
    ├── research_artifacts
    │   ├── space_id
    │   ├── type: mindmap | knowledge_graph | report | comparison | timeline | table
    │   ├── title: string
    │   ├── content: JSON/HTML  // 产物内容
    │   ├── prompt: string      // 生成时使用的 prompt
    │   └── created_at
    └── (每个空间多个产物)
```

### 4.2 数据库表设计 (Drizzle Schema)

```typescript
// research_spaces - 研究空间
research_spaces: {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon'),
  status: text('status').default('active'),  // active | archived
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_flg: integer('deleted_flg').default(0),
}

// research_space_sources - 空间-资源关联
research_space_sources: {
  id: text('id').primaryKey(),
  space_id: text('space_id').references(research_spaces.id),
  source_type: text('source_type').notNull(),  // article | book | highlight | note | url
  source_id: text('source_id').notNull(),       // 对应 articles.id / books.id 等
  enabled: integer('enabled').default(1),       // 是否参与 AI 分析
  summary_cache: text('summary_cache'),          // 缓存的单源摘要
  added_at: text('added_at').notNull(),
}

// research_conversations - 研究对话
research_conversations: {
  id: text('id').primaryKey(),
  space_id: text('space_id').references(research_spaces.id),
  title: text('title'),
  messages: text('messages'),  // JSON 序列化的消息数组
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}

// research_artifacts - 研究产物
research_artifacts: {
  id: text('id').primaryKey(),
  space_id: text('space_id').references(research_spaces.id),
  type: text('type').notNull(),  // mindmap | knowledge_graph | report | comparison | timeline | table
  title: text('title').notNull(),
  content: text('content'),       // JSON/HTML 产物内容
  prompt: text('prompt'),         // 生成时使用的 prompt
  pinned: integer('pinned').default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_flg: integer('deleted_flg').default(0),
}
```

---

## 5. AI Agent 架构（核心技术方案）

### 5.1 多文档分析的核心挑战

单篇文章的 AI 分析相对简单，但多篇文章（尤其是长文）+ 多本书的主题阅读面临几个关键挑战：

| 挑战 | 说明 |
|------|------|
| **上下文窗口限制** | 50 篇文章 × 平均 3000 字 = 15 万字，远超大多数模型上下文窗口 |
| **信息检索精度** | 用户问题可能只关联其中 3-5 篇文章的特定段落 |
| **跨文档推理** | 需要在多篇文章之间建立联系、发现矛盾、提取共性 |
| **产物生成质量** | 思维导图/知识图谱需要结构化输出，不能简单拼凑 |

### 5.2 分层处理架构（Hierarchical RAG）

采用三层架构解决多文档分析问题：

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: 推理与生成层 (Reasoning & Generation)      │
│  ┌───────────────────────────────────────────────┐  │
│  │ 基于检索结果 + 摘要进行多步推理、对比分析、     │  │
│  │ 结构化输出（思维导图/知识图谱/报告）            │  │
│  │ 模型: smart (如 GPT-4o / Claude Sonnet)       │  │
│  └───────────────────────────────────────────────┘  │
│                        ▲                            │
│                        │ 相关片段 + 元摘要           │
│                        │                            │
│  Layer 2: 检索层 (Retrieval)                        │
│  ┌───────────────────────────────────────────────┐  │
│  │ 语义搜索：将用户问题向量化，匹配最相关的        │  │
│  │ 文档片段（Top-K chunks）                       │  │
│  │ 关键词搜索：SQLite FTS5 补充精确匹配            │  │
│  │ 技术: 本地 Embedding + 向量相似度               │  │
│  └───────────────────────────────────────────────┘  │
│                        ▲                            │
│                        │ 预处理好的 chunks           │
│                        │                            │
│  Layer 1: 预处理层 (Preprocessing)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ 材料导入时：                                    │  │
│  │ 1. 文本分块 (Chunking): 按段落/语义边界切分     │  │
│  │ 2. 向量化 (Embedding): 每个 chunk 生成向量      │  │
│  │ 3. 摘要生成 (Summary): 为每个源生成结构化摘要   │  │
│  │ 4. 关键信息提取: 关键论点、数据、结论            │  │
│  │ 模型: cheap/fast (如 GPT-4o-mini)              │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 5.3 导入时预处理流程

当用户将材料导入研究空间时，后台异步执行：

```
材料导入
  │
  ├──→ Step 1: 文本提取
  │    - 文章: content_text 字段
  │    - 书籍: 章节文本
  │    - 高亮: 高亮文本 + 笔记
  │
  ├──→ Step 2: 智能分块 (Chunking)
  │    - 按段落边界切分
  │    - 每 chunk 约 500-1000 tokens
  │    - 保留段落上下文元数据 (来源、章节、位置)
  │
  ├──→ Step 3: 向量嵌入 (Embedding)
  │    - 使用 Embedding 模型生成向量
  │    - 存储到本地向量索引 (sqlite-vec / hnswlib)
  │
  ├──→ Step 4: 源摘要生成
  │    - 用 fast 模型为每个源生成结构化摘要
  │    - 提取: 核心论点、关键数据、结论
  │    - 缓存到 summary_cache 字段
  │
  └──→ Step 5: 就绪通知
       - 通知前端该源已准备完毕
       - 更新源状态: processing → ready
```

### 5.4 对话时检索增强流程

```
用户提问: "这三种数据库在高并发场景下各自的性能表现如何？"
  │
  ├──→ Step 1: 查询理解
  │    - 提取关键概念: 数据库, 高并发, 性能
  │    - 判断查询类型: 跨文档对比分析
  │
  ├──→ Step 2: 混合检索
  │    - 向量搜索: 找到语义最相关的 Top-20 chunks
  │    - FTS5 搜索: 精确匹配"并发"、"性能"、"TPS"等关键词
  │    - 融合排序: RRF (Reciprocal Rank Fusion)
  │    - 去重 + 取 Top-10 chunks
  │
  ├──→ Step 3: 上下文组装
  │    - 将检索到的 chunks 按源分组
  │    - 附加每个源的结构化摘要
  │    - 组装成结构化 prompt:
  │      "以下是来自 3 篇文章的相关内容，请基于这些内容回答用户问题..."
  │
  └──→ Step 4: 推理生成
       - 调用 smart 模型生成回答
       - 要求带内联引用: [来源1, 段落3]
       - 流式输出到前端
```

### 5.5 Agent 模块扩展

在现有 `AgentService` 的模块系统中注册研究模块：

```typescript
// 新增研究模块
{
  id: 'research',
  activeWhen: (vs) => vs.pageState.page === 'research',
  systemPromptSegment: `你是一个研究助手，当前处于研究空间。你可以：
    - 基于导入的源材料回答问题（所有回答必须带引用）
    - 对多个源进行对比分析
    - 生成结构化产物（思维导图、知识图谱、研究报告等）
    - 发现跨文档的关联和矛盾
    
    重要原则：
    1. 所有回答必须基于源材料，不要凭空生成
    2. 使用 [来源名称] 标注引用
    3. 当源材料不足以回答时，明确告知用户`,
  actionLevels: {
    search_space_sources: 'read',
    get_source_content: 'read',
    generate_artifact: 'write',
    update_artifact: 'write',
  },
}
```

### 5.6 新增 AI Tools

```typescript
// 研究专用 Tools
createResearchTools(ctx: ResearchToolContext) {
  return {
    // 在空间源材料中语义搜索
    search_space_sources: { ... },
    // 获取源材料的完整内容或摘要
    get_source_summary: { ... },
    // 获取指定 chunk 的原文
    get_source_chunks: { ... },
    // 生成思维导图
    generate_mindmap: { ... },
    // 生成知识图谱
    generate_knowledge_graph: { ... },
    // 生成研究报告
    generate_report: { ... },
    // 生成对比矩阵
    generate_comparison: { ... },
    // 生成时间线
    generate_timeline: { ... },
    // 生成数据表格
    generate_data_table: { ... },
  };
}
```

---

## 6. 功能详细设计

### 6.1 Activity Rail Bar（导航栏）

**位置**：窗口最左侧，紧贴窗口边缘
**宽度**：48px，不可折叠
**样式**：极简图标 + tooltip，深色背景

| 图标 | 模式 | 说明 |
|------|------|------|
| 📖 `BookOpen` | 阅读 | 切换到阅读模式（当前布局） |
| 🔬 `FlaskConical` | 研究 | 切换到研究模式 |

- 选中态：图标高亮 + 左侧 3px 蓝色指示条
- 底部可放置全局设置入口

### 6.2 Sources Panel（资源面板）

**位置**：研究模式左侧栏
**宽度**：~240px

#### 空间管理区
- **空间选择器**：下拉选择/切换研究空间
- **新建空间**：快速创建新研究空间
- **空间设置**：编辑名称、描述、归档

#### 资源列表区
- **资源卡片**：显示每个源材料的类型图标、标题、状态
  - 状态指示：`processing`（分析中） / `ready`（就绪） / `error`（失败）
  - 启用/禁用切换：控制该源是否参与 AI 分析
  - 点击查看源摘要
- **资源统计**：显示总源数/已启用数、总字数

#### 导入操作区
- **从阅读库导入**：打开选择器，可按标签/分类筛选文章和书籍
- **从高亮导入**：导入已有的高亮批注
- **手动添加笔记**：直接粘贴文本作为源
- **导入 URL**：粘贴 URL 自动抓取内容

### 6.3 Chat Area（对话区）

**位置**：研究模式中间区域
**特性**：

- **源材料感知对话**：所有回答基于导入的源材料，自动带引用标注
- **引用跳转**：点击引用标注可跳转到对应源材料的原文位置
- **建议问题**：基于源材料自动生成 3-5 个建议问题
  - 首次进入空间时生成
  - 每次对话结束后推荐后续问题
- **对话管理**：支持多个对话线程，可切换/删除
- **流式输出**：复用现有 AgentService 的流式机制

#### 特殊对话能力
- **对比分析模式**：`@对比 [源A] 和 [源B] 在 XX 方面的差异`
- **提取模式**：`@提取 所有源中关于 XX 的关键数据`
- **生成模式**：`@生成 思维导图/报告/知识图谱`（结果自动保存到产物列表）

### 6.4 Studio Panel（工作台面板）

**位置**：研究模式右侧栏
**宽度**：~320px

#### 快捷工具栏
一键生成常用产物的按钮组：

| 工具 | 图标 | 说明 |
|------|------|------|
| 思维导图 | `Brain` | 基于所有源生成主题思维导图 |
| 知识图谱 | `Network` | 提取实体关系，生成交互式知识图谱 |
| 研究报告 | `FileText` | 生成结构化研究报告（Markdown） |
| 对比矩阵 | `Table` | 生成多维度对比表格 |
| 时间线 | `Clock` | 提取时间信息生成时间线 |
| FAQ | `HelpCircle` | 生成常见问题与解答 |
| 摘要 | `AlignLeft` | 生成全局综合摘要 |

#### 产物列表
- 展示已生成的所有产物
- 每个产物卡片包含：类型图标、标题、生成时间、操作按钮
- 点击产物在中间区域全屏展示
- 支持编辑、导出（Markdown/PNG/JSON）、删除
- 支持置顶重要产物

---

## 7. IPC 通信层设计

### 新增 IPC Channels

```typescript
// 研究空间 CRUD
RESEARCH_SPACE_CREATE    = 'research:space:create'
RESEARCH_SPACE_LIST      = 'research:space:list'
RESEARCH_SPACE_GET       = 'research:space:get'
RESEARCH_SPACE_UPDATE    = 'research:space:update'
RESEARCH_SPACE_DELETE    = 'research:space:delete'

// 资源管理
RESEARCH_SOURCE_ADD      = 'research:source:add'
RESEARCH_SOURCE_REMOVE   = 'research:source:remove'
RESEARCH_SOURCE_TOGGLE   = 'research:source:toggle'
RESEARCH_SOURCE_LIST     = 'research:source:list'
RESEARCH_SOURCE_STATUS   = 'research:source:status'

// 研究对话（复用 Agent 基座，新增空间上下文）
RESEARCH_CHAT_SEND       = 'research:chat:send'
RESEARCH_CHAT_STREAM     = 'research:chat:stream'

// 产物管理
RESEARCH_ARTIFACT_LIST   = 'research:artifact:list'
RESEARCH_ARTIFACT_GET    = 'research:artifact:get'
RESEARCH_ARTIFACT_CREATE = 'research:artifact:create'
RESEARCH_ARTIFACT_UPDATE = 'research:artifact:update'
RESEARCH_ARTIFACT_DELETE = 'research:artifact:delete'
RESEARCH_ARTIFACT_EXPORT = 'research:artifact:export'

// 预处理
RESEARCH_PREPROCESS_STATUS = 'research:preprocess:status'
```

---

## 8. Embedding 与向量存储方案

### 本地优先方案

考虑 Z-Reader 的 Local-First 原则，Embedding 和向量存储使用以下方案：

| 组件 | 选型 | 说明 |
|------|------|------|
| Embedding 模型 | **云端 API**（OpenAI text-embedding-3-small）| 高质量向量，1536 维 |
| 备选 Embedding | **本地模型**（通过 transformers.js 或 ONNX Runtime）| 离线可用，质量略低 |
| 向量存储 | **sqlite-vec** 或 **本地 JSON 文件** | 与现有 SQLite 生态统一 |
| 文本分块 | **自实现**（按段落 + token 计数）| 500-1000 tokens/chunk |

### 分块策略

```
1. 按自然段落切分
2. 短段落合并（< 100 tokens 的连续段落合并）
3. 长段落拆分（> 1000 tokens 按句子边界拆分）
4. 每个 chunk 保留元数据：
   - source_id: 来源材料 ID
   - source_title: 来源标题
   - chunk_index: 在原文中的位置
   - heading: 最近的标题层级
```

---

## 9. 开发路线图

### Phase 1: 基础骨架（MVP）— 2 周

**目标**：搭建研究系统的基本框架，实现核心交互流程

- [ ] Activity Rail Bar + 模式切换机制
- [ ] 研究空间 CRUD（数据库表 + IPC + UI）
- [ ] Sources Panel：空间列表 + 从阅读库导入文章
- [ ] Chat Area：基于导入文章的简单问答（将文章全文拼接到 prompt）
- [ ] Studio Panel：静态框架 + 产物列表骨架

### Phase 2: 智能检索（RAG 管线）— 2 周

**目标**：实现多文档智能检索，突破上下文窗口限制

- [ ] 文本分块引擎
- [ ] Embedding 生成（云端 API）
- [ ] 向量存储与相似度搜索
- [ ] 混合检索（向量 + FTS5）
- [ ] 导入时异步预处理流程
- [ ] 源材料状态管理（processing/ready/error）

### Phase 3: 产物生成 — 2 周

**目标**：实现各类研究产物的生成和展示

- [ ] 思维导图生成 + 交互式展示（复用现有 MindMapPanel）
- [ ] 知识图谱生成 + 可视化（复用现有 KnowledgeGraphView）
- [ ] 研究报告生成（Markdown 渲染）
- [ ] 对比矩阵生成（表格渲染）
- [ ] 产物导出（Markdown/PNG）

### Phase 4: 深度研究 — 2 周

**目标**：实现高级研究能力

- [ ] 深度研究任务（类似 Deep Research：自动多步搜索 + 分析）
- [ ] 建议问题自动生成
- [ ] 对话内引用标注 + 跳转
- [ ] 书籍章节级导入
- [ ] 本地 Embedding 模型支持（离线模式）

---

## 10. 不做什么（Scope 边界）

- **不做实时协作**：研究空间为单用户使用
- **不做外部搜索**：MVP 阶段仅基于导入的源材料，不联网搜索新资源
- **不做 Audio Overview**：不做 NotebookLM 风格的播客生成
- **不做 PPT/Slides 生成**：专注文本类产物
- **不做多模态分析**：不分析图片/视频内容，仅处理文本

---

## 11. 关键技术决策待定

| 决策点 | 选项 | 建议 |
|--------|------|------|
| 向量存储 | sqlite-vec vs hnswlib vs 纯 JSON | Phase 2 时评估，MVP 阶段用全文拼接 |
| Embedding 模型 | OpenAI API vs 本地 ONNX | 先用 API，Phase 4 增加本地支持 |
| 思维导图渲染 | Mermaid vs D3.js vs react-flow | 复用现有 MindMapPanel |
| 知识图谱渲染 | Force-directed graph | 复用现有 KnowledgeGraphView |
| 产物存储格式 | JSON vs Markdown vs HTML | 按产物类型分别选择 |

---

## 12. 与现有系统的集成点

| 现有模块 | 集成方式 |
|----------|----------|
| `AgentService` | 扩展模块系统，注册 `research` 模块 |
| `ToolContext` | 新增 `ResearchToolContext` 继承现有接口 |
| `AgentDrawer/MiniChat` | 研究模式下隐藏浮动 Agent，使用内置 Chat |
| `MindMapPanel` | 复用组件，适配研究产物数据 |
| `KnowledgeGraphView` | 复用组件，适配研究产物数据 |
| `articles/books 表` | 只读引用，不修改原始数据 |
| `highlights 表` | 可导入高亮作为源材料 |
| IPC 通信层 | 新增 `research-handlers.ts`，复用 preload 模式 |
