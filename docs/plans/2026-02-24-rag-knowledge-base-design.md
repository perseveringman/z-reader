# Z-Reader RAG 知识库设计文档

> 日期：2026-02-24
> 状态：设计中

## 1. 定位

Z-Reader RAG 知识库是 Z-Reader 的个人知识管理增强层，基于用户在 Library 和 Feed 中积累的内容，提供语义检索、知识问答、智能推荐、写作辅助和知识图谱可视化等能力。

**核心原则**：
- **Local-First**：向量数据存储在本地 SQLite（sqlite-vec 扩展），不依赖云端向量数据库
- **渐进式构建**：用户使用过程中自然积累知识，无需额外操作
- **混合检索**：向量语义检索 + FTS5 关键词检索，互补提升准确率
- **知识可视化**：通过知识图谱让用户看见自己的知识全貌

**Non-Goals**：
- 不做通用的 RAG 框架/SDK
- 不做云端向量数据库集成（保持 Local-First）
- 不做本地 Embedding 模型推理（使用云端 Embedding API）
- 不做实时 Web 搜索增强（RAG 仅检索本地知识库）

---

## 2. 使用场景

### 2.1 知识问答

用户对 Library 和 Feed 中的内容进行自然语言提问，获得基于个人知识库的回答，附带来源引用。

> "我收藏的文章里有哪些关于 Transformer 注意力机制的优化方法？"
> "Paul Graham 在最近的几篇文章中反复提到了什么观点？"

### 2.2 Feed 智能推荐

基于 Library 中的知识积累，对新进 Feed 文章进行相关度评估，标注哪些值得深读。

> Feed 列表中某篇文章被标注："与你在 Library 中保存的 3 篇 RAG 相关文章高度关联"

### 2.3 写作辅助

在写作或研究时，从知识库中检索相关段落、高亮和批注，辅助内容生产。

> 用户输入主题 "分布式系统的一致性"，系统返回相关的段落摘录、高亮笔记和引用来源

### 2.4 知识图谱与学习地图

通过实体抽取和关系建模，构建知识网状图。节点是核心概念，边是概念间的关系。帮助用户了解哪些领域学得深、哪些还未涉及。

> 可视化展示：用户在 "机器学习" 领域有 47 个关联知识点，但 "强化学习" 分支只有 2 个，暗示该领域尚未深入

---

## 3. 架构总览

```
用户内容入库                       用户查询
    │                               │
    ▼                               ▼
┌──────────────┐             ┌───────────────┐
│  Ingestion   │             │  Query Engine  │
│  Pipeline    │             │               │
│              │             │ ① 向量检索     │
│ ① 文本提取   │             │ ② FTS5 关键词  │
│ ② 智能分块   │             │ ③ RRF 融合排序 │
│ ③ Embedding  │             │ ④ 上下文组装   │
│ ④ 向量入库   │             │ ⑤ LLM 生成    │
│ ⑤ 实体抽取   │             └───────┬───────┘
└────┬─────────┘                     │
     │                               ▼
     ▼                        ┌──────────────┐
┌────────────────────────┐    │  Knowledge   │
│      SQLite 数据库       │    │  Graph       │
│                        │    │  Engine      │
│ articles    (原始内容)  │    │              │
│ articles_fts (全文索引) │    │ 实体 + 关系   │
│ chunks      (分块+元数据)│◄──┤ 知识地图可视化│
│ vec_chunks  (向量索引)  │    │ 学习覆盖度   │
│ entities    (实体)      │    └──────────────┘
│ entity_relations (关系) │
│ entity_sources   (来源) │
└────────────────────────┘
```

### 与现有 AI 模块的关系

RAG 知识库是 `src/ai/` 模块的**能力扩展**，不是独立系统：

- **复用 AI Provider 层**：Embedding 调用和 LLM 生成共享现有 Provider 配置
- **复用 AI Service 层**：任务队列、执行追踪等基础设施
- **新增 AI Skills**：`rag_chat`、`feed_recommend`、`writing_assist`、`build_knowledge_graph`
- **新增 AI Tools**：`search_knowledge_base`、`get_related_entities`

---

## 4. 现有基础设施评估

### 可直接复用

| 能力 | 现状 | RAG 中的作用 |
|-----|------|-------------|
| SQLite + better-sqlite3 | 核心数据库引擎 | 加载 sqlite-vec 扩展，存储向量 |
| Drizzle ORM + 迁移体系 | Schema 管理 | 新增 RAG 相关表 |
| FTS5 全文搜索 | `articles_fts` 虚拟表 | 混合检索的关键词检索层 |
| `contentText` 字段 | articles 表纯文本 | Embedding 的直接输入源 |
| 标签 + 高亮体系 | 结构化元数据 | 检索过滤条件 + 上下文增强 |
| Vercel AI SDK | LLM 调用抽象 | 生成回答 + 结构化实体抽取 |
| AI 任务队列 | 后台任务调度 | Embedding 异步生成 |
| `app_tasks` + 通知系统 | 后台任务 UI | 向用户展示索引构建进度 |
| 多媒体内容 | 文章/EPUB/PDF/转录 | 所有文本内容均可入库 |

### 需要新增

| 能力 | 说明 |
|------|------|
| sqlite-vec 扩展 | SQLite 向量搜索引擎 |
| Embedding Service | 云端 Embedding API 调用（批量 + 速率控制） |
| Chunking Service | 文本智能分块 |
| Ingestion Pipeline | 内容入库管线编排 |
| Hybrid Retriever | 向量 + FTS5 混合检索 |
| Entity Extraction | LLM 结构化实体抽取 |
| Knowledge Graph | 实体关系管理 + 可视化 |

---

## 5. 技术选型

### 5.1 向量数据库：sqlite-vec

**选型理由**：

1. z-reader 已深度使用 SQLite + better-sqlite3，sqlite-vec 作为 SQLite 扩展可以直接通过 `db.loadExtension()` 加载，零额外运维
2. 向量数据和业务数据在同一个数据库文件中，可用 SQL JOIN 实现向量检索 + 元数据过滤的混合查询
3. 体积小（约 1MB），对桌面应用包体影响可忽略
4. 个人知识库的数据规模（数万到十几万条 chunk）完全在 sqlite-vec 的性能舒适区内
5. 与现有 Drizzle ORM 迁移体系兼容

**备选方案对比**：

| 方案 | 优势 | 劣势 | 不选原因 |
|-----|------|------|---------|
| sqlite-vec | 统一技术栈，零运维 | 社区较新 | — |
| LanceDB | Rust 内核性能优秀 | Native 模块打包复杂 | 增加构建复杂度 |
| Vectra | 纯 TS 零依赖 | 性能一般 | 大数据量性能不足 |
| sqlite-vss | 基于 Faiss | 已停止维护 | sqlite-vec 是其继任者 |

### 5.2 Embedding 模型：云端 API

**首选**：OpenAI `text-embedding-3-small`
- 维度：1536（可降维至 512/256 节省存储）
- 性价比最优，每百万 token 约 $0.02
- 支持 8191 token 输入长度

**备选**：通义千问 `text-embedding-v3` 或其他 OpenAI 兼容 API
- 通过 OpenRouter 或直接调用
- 中文效果可能更优

**降维策略**：
- 默认使用 1536 维，在数据量超过 10 万 chunks 后可考虑降至 512 维
- sqlite-vec 支持不同维度的向量表，降维时重建索引即可

### 5.3 知识图谱可视化

**推荐**：`react-force-graph-2d`（基于 D3 force simulation）
- React 原生组件，与现有 UI 栈一致
- 支持节点/边的交互（点击、拖拽、缩放）
- 渲染性能良好（Canvas 渲染器，支持数千节点）

---

## 6. 数据库 Schema 设计

### 6.1 新增表

```sql
-- ============================================================
-- 文本分块表：将原始内容切分为可检索的知识单元
-- ============================================================
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,              -- UUID
  source_type TEXT NOT NULL,        -- 'article' | 'book' | 'highlight' | 'transcript'
  source_id TEXT NOT NULL,          -- 关联的 article/book/highlight ID
  chunk_index INTEGER NOT NULL,     -- 在原文中的顺序（从 0 开始）
  content TEXT NOT NULL,            -- chunk 文本内容
  token_count INTEGER,              -- token 数量（用于上下文窗口计算）
  metadata TEXT,                    -- JSON: { section, page, heading, ... }
  embedding_model TEXT,             -- 使用的 Embedding 模型标识
  embedding_status TEXT             -- 'pending' | 'done' | 'failed'
    NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
    DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL
    DEFAULT (datetime('now'))
);

CREATE INDEX idx_chunks_source
  ON chunks(source_type, source_id);
CREATE INDEX idx_chunks_status
  ON chunks(embedding_status);

-- ============================================================
-- 向量索引虚拟表（sqlite-vec）
-- ============================================================
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]             -- 维度匹配 Embedding 模型输出
);

-- ============================================================
-- 实体表：知识图谱的节点
-- ============================================================
CREATE TABLE entities (
  id TEXT PRIMARY KEY,              -- UUID
  name TEXT NOT NULL,               -- 实体名称（如 "Transformer"、"Paul Graham"）
  type TEXT NOT NULL,               -- 'concept' | 'person' | 'technology' | 'topic' | 'organization'
  description TEXT,                 -- 实体描述（LLM 生成）
  aliases TEXT,                     -- JSON 数组：别名列表（如 ["ML", "机器学习"]）
  mention_count INTEGER             -- 在所有内容中被提及的次数
    NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
    DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL
    DEFAULT (datetime('now'))
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name ON entities(name);

-- ============================================================
-- 实体关系表：知识图谱的边
-- ============================================================
CREATE TABLE entity_relations (
  id TEXT PRIMARY KEY,              -- UUID
  source_entity_id TEXT NOT NULL
    REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL
    REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,      -- 'related_to' | 'part_of' | 'prerequisite'
                                    -- | 'contrasts_with' | 'applied_in' | 'created_by'
  strength REAL NOT NULL            -- 关联强度（0.0 ~ 1.0），多次出现累加
    DEFAULT 1.0,
  evidence_count INTEGER            -- 支撑这条关系的来源数量
    NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
    DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL
    DEFAULT (datetime('now'))
);

CREATE INDEX idx_entity_relations_source
  ON entity_relations(source_entity_id);
CREATE INDEX idx_entity_relations_target
  ON entity_relations(target_entity_id);
CREATE UNIQUE INDEX idx_entity_relations_pair
  ON entity_relations(source_entity_id, target_entity_id, relation_type);

-- ============================================================
-- 实体来源表：实体与内容的多对多关联
-- ============================================================
CREATE TABLE entity_sources (
  entity_id TEXT NOT NULL
    REFERENCES entities(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,        -- 'article' | 'book' | 'highlight'
  source_id TEXT NOT NULL,          -- 关联的内容 ID
  chunk_id TEXT                     -- 具体来自哪个 chunk（可选）
    REFERENCES chunks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
    DEFAULT (datetime('now')),
  PRIMARY KEY (entity_id, source_type, source_id)
);

CREATE INDEX idx_entity_sources_source
  ON entity_sources(source_type, source_id);
```

### 6.2 与现有表的关系

```
feeds (1) ──── (N) articles (1) ──── (N) chunks (1) ──── (1) vec_chunks
                     │                      │
                     │                      └──── (N) entity_sources
                     │
                (N) highlights (1) ──── (N) chunks
                     │
                (N) article_tags
                     │
                (N) tags

books (1) ──── (N) chunks
transcripts (1) ──── (N) chunks

entities (1) ──── (N) entity_relations
    │
    └──── (N) entity_sources
```

**关键设计决策**：
- `chunks` 表通过 `source_type` + `source_id` 多态关联到不同内容表，而非外键
- 这样做是因为 chunks 需要关联 articles、books、highlights、transcripts 等多种类型
- `vec_chunks` 通过 `chunk_id` 与 `chunks` 表一一对应
- 删除原始内容时需要级联删除相关 chunks 和向量（通过应用层控制）

---

## 7. 核心模块设计

### 7.1 Embedding Service

负责将文本转换为向量。

```typescript
interface EmbeddingService {
  // 单条文本 Embedding
  embed(text: string): Promise<number[]>;

  // 批量 Embedding（内部控制速率和批次大小）
  embedBatch(texts: string[]): Promise<number[][]>;

  // 获取当前模型信息
  getModelInfo(): { model: string; dimensions: number };
}
```

**实现要点**：
- 使用 OpenAI `text-embedding-3-small` API
- 批量处理：每批最多 100 条，总 token 不超过 8191 * 100
- 速率控制：基于 token 用量的滑动窗口限速
- 重试策略：指数退避，最多 3 次重试
- 缓存：相同文本不重复计算（基于内容 hash）
- 通过现有 AI Provider 层的配置读取 API Key

### 7.2 Chunking Service

负责将长文本切分为适合 Embedding 的片段。

```typescript
interface ChunkingService {
  chunk(input: ChunkInput): ChunkResult[];
}

interface ChunkInput {
  text: string;                     // 原始文本
  sourceType: 'article' | 'book' | 'highlight' | 'transcript';
  metadata?: Record<string, any>;   // 上下文元数据
}

interface ChunkResult {
  content: string;                  // chunk 文本
  index: number;                    // 在原文中的位置
  tokenCount: number;               // token 数
  metadata: Record<string, any>;    // chunk 级别元数据
}
```

**分块策略**：

| 内容类型 | 策略 | 参数 |
|---------|------|------|
| 文章 (article) | 段落级分块，按 `\n\n` 分段，合并短段落 | 目标 300-500 tokens，overlap 50 tokens |
| 电子书 (book) | 章节 → 段落两级分块 | 目标 300-500 tokens，保留章节标题作为元数据 |
| 高亮 (highlight) | 每条高亮 + 批注为一个 chunk | 不分块，通常较短 |
| 转录 (transcript) | 按时间窗口分块（如每 60 秒） | 目标 300-500 tokens，保留时间戳 |

**Overlap 设计**：
- 相邻 chunk 之间保留约 50 tokens 的重叠
- 目的：避免跨 chunk 边界的语义断裂
- 在检索结果中，可通过 `chunk_index` 拼接相邻 chunk 恢复完整上下文

### 7.3 Ingestion Pipeline

编排完整的内容入库流程。

```typescript
interface IngestionPipeline {
  // 单条内容入库
  ingest(source: IngestSource): Promise<IngestResult>;

  // 批量回填（对已有内容生成 Embedding）
  backfill(options: BackfillOptions): Promise<BackfillResult>;

  // 删除内容的向量索引
  remove(sourceType: string, sourceId: string): Promise<void>;
}

interface IngestSource {
  type: 'article' | 'book' | 'highlight' | 'transcript';
  id: string;
  text: string;
  metadata?: Record<string, any>;
}
```

**完整流程**：

```
① 文本提取
   article → contentText (已有字段)
   book → EPUB/PDF 全文提取
   highlight → text + note 拼接
   transcript → 字幕文本拼接
       │
       ▼
② 分块 (Chunking Service)
   按内容类型选择策略
   生成 ChunkResult[]
       │
       ▼
③ 写入 chunks 表
   status = 'pending'
       │
       ▼
④ Embedding (Embedding Service)
   批量调用 API
   写入 vec_chunks 虚拟表
   更新 chunks.embedding_status = 'done'
       │
       ▼
⑤ 实体抽取 (Entity Extraction Service)
   LLM 结构化输出
   写入 entities + entity_relations + entity_sources
```

**触发时机**：

| 事件 | 触发方式 | 优先级 |
|------|---------|--------|
| 文章保存到 Library | 自动，入库后异步触发 | 高 |
| 新文章从 Feed 拉取 | 可选，需用户开启 Feed 索引 | 低 |
| 电子书导入 | 自动，导入后异步触发 | 高 |
| 转录完成 | 自动，ASR 完成后触发 | 中 |
| 高亮/批注变更 | 自动，去抖后触发（5 秒） | 中 |
| 手动触发 | 用户点击"重建索引" | 高 |

**后台任务集成**：
- 复用现有 `app_tasks` 表记录任务状态
- 复用 `notifications` 表推送进度
- 批量回填作为可取消的长任务运行

### 7.4 Hybrid Retriever（混合检索器）

**核心是将向量检索和关键词检索的结果融合**。

```typescript
interface HybridRetriever {
  search(query: SearchQuery): Promise<SearchResult[]>;
}

interface SearchQuery {
  text: string;                     // 用户查询文本
  topK?: number;                    // 返回结果数量（默认 10）
  filters?: {
    sourceTypes?: string[];         // 限定内容类型
    feedIds?: string[];             // 限定 Feed 来源
    tagIds?: string[];              // 限定标签
    dateRange?: { from: string; to: string };
    partition?: 'library' | 'feed'; // 分区过滤
  };
  mode?: 'hybrid' | 'vector' | 'keyword';  // 检索模式
}

interface SearchResult {
  chunkId: string;
  content: string;                  // chunk 文本
  score: number;                    // 融合后的相关度分数
  sourceType: string;
  sourceId: string;
  sourceTitle: string;              // 来源文章/书籍标题
  sourceUrl?: string;
  metadata: Record<string, any>;
}
```

**混合检索流程**：

```
用户查询 "Transformer 的注意力机制有哪些优化方法"
    │
    ├──── ① 向量检索路径
    │     查询文本 → Embedding Service → 查询向量
    │     → sqlite-vec KNN 搜索 (top 20)
    │     → 返回 [(chunkId, distance), ...]
    │
    ├──── ② 关键词检索路径
    │     查询文本 → FTS5 MATCH (articles_fts)
    │     → 获取匹配的 articleId 列表
    │     → 关联到 chunks 表 (top 20)
    │     → 返回 [(chunkId, bm25_score), ...]
    │
    └──── ③ 元数据过滤（可选）
          应用 sourceType / feedId / tag 过滤条件
    │
    ▼
④ Reciprocal Rank Fusion (RRF)
   对两路结果按排名融合：
   score(chunk) = Σ 1/(k + rank_in_list_i)
   k = 60（标准 RRF 常数）

   示例：
   chunk_A 在向量结果排第 1，关键词结果排第 3
   → score = 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323

   chunk_B 在向量结果排第 5，关键词结果未命中
   → score = 1/(60+5) = 0.0154
    │
    ▼
⑤ 按 RRF score 降序排列，取 top-K
```

**为什么选择 RRF 而非加权线性融合**：
- RRF 只依赖排名，不需要归一化不同系统的分数
- 实现简单，效果稳定，是工业界混合检索的标准方案
- 向量检索和 BM25 的分数量纲完全不同，直接加权不合理

### 7.5 Context Builder（上下文组装器）

将检索结果转化为 LLM 可消费的上下文。

```typescript
interface ContextBuilder {
  build(results: SearchResult[], query: string): PromptContext;
}

interface PromptContext {
  systemPrompt: string;
  contextBlocks: ContextBlock[];    // 按相关度排列的内容块
  totalTokens: number;              // 估算 token 数
}

interface ContextBlock {
  content: string;                  // chunk 内容
  citation: string;                 // 来源引用标记 [1], [2], ...
  sourceTitle: string;
  sourceUrl?: string;
}
```

**组装策略**：
1. 按 RRF score 排序取 top-N chunks
2. 对每个 chunk，检查前后相邻 chunk（通过 `chunk_index ± 1`），扩展上下文
3. 去重：同一篇文章的多个相邻 chunk 合并为一段
4. 截断：控制总上下文在 LLM 上下文窗口的 60% 以内
5. 添加来源引用标记 `[1]`, `[2]`, ...

**LLM 提示词模板**：

```
你是用户的个人知识助手。基于用户知识库中的以下内容回答问题。

如果知识库中没有相关信息，请明确告知用户，不要编造内容。
回答时请引用来源，使用 [1] [2] 等标注。

---
[知识库检索结果]
{contextBlocks}
---

用户问题：{query}
```

### 7.6 Entity Extraction Service（实体抽取服务）

使用 LLM 的结构化输出能力从内容中提取实体和关系。

```typescript
interface EntityExtractionService {
  // 从一批 chunks 中抽取实体和关系
  extract(chunks: ExtractInput[]): Promise<ExtractResult>;
}

interface ExtractInput {
  chunkId: string;
  content: string;
  sourceTitle: string;
}

interface ExtractResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

interface ExtractedEntity {
  name: string;
  type: 'concept' | 'person' | 'technology' | 'topic' | 'organization';
  description: string;
  aliases: string[];
}

interface ExtractedRelation {
  source: string;                   // 实体名称
  target: string;
  type: 'related_to' | 'part_of' | 'prerequisite'
      | 'contrasts_with' | 'applied_in' | 'created_by';
}
```

**LLM 提示词要点**：
- 使用 Vercel AI SDK 的 `generateObject` + Zod schema 强制结构化输出
- 每次提取限制在 3-5 个 chunk，避免上下文过长
- 提取后与已有实体做模糊匹配（Levenshtein 距离或 LLM 判定）去重
- 新实体直接写入，已有实体累加 `mention_count`
- 新关系直接写入，已有关系累加 `strength` 和 `evidence_count`

**实体去重策略**：
1. 精确匹配：`name` 完全一致
2. 别名匹配：新实体名称在已有实体的 `aliases` 中
3. LLM 判定：不确定时调用 LLM 判断两个实体是否指代同一概念

### 7.7 Knowledge Graph Service（知识图谱服务）

管理实体和关系的增删改查，以及图谱分析。

```typescript
interface KnowledgeGraphService {
  // 查询子图（指定实体的 N 度关联）
  getSubgraph(entityId: string, depth?: number): Promise<GraphData>;

  // 全图概览（按 mention_count 取 top-N 实体）
  getOverview(topN?: number): Promise<GraphData>;

  // 按类型或关键词搜索实体
  searchEntities(query: string, type?: string): Promise<Entity[]>;

  // 学习覆盖度分析
  getCoverageAnalysis(): Promise<CoverageReport>;

  // 知识缺口发现
  getGaps(): Promise<GapReport>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  mentionCount: number;             // 映射为节点大小
  sourceCount: number;              // 关联了多少篇内容
}

interface GraphEdge {
  source: string;
  target: string;
  relationType: string;
  strength: number;                 // 映射为边粗细
}
```

**学习覆盖度分析**：
- 统计每个 `type` 分类下的实体数量和平均 `mention_count`
- 识别"热点区域"（实体密集、mention_count 高的区域）
- 识别"冷区"（实体稀疏或孤立的区域）

**知识缺口发现**：
- 度数为 1 的实体（只被一篇内容提及）
- 与热点区域相邻但 mention_count 低的实体
- 关系图中的"桥接节点"（如果移除该节点，会导致子图断裂）

---

## 8. Feed 智能推荐设计

### 8.1 推荐流程

```
新 Feed 文章到达（RSS 拉取触发）
    │
    ▼
① 快速 Embedding
   标题 + 前 500 字 → Embedding Service
    │
    ▼
② 向量相似度计算
   与 Library 中的 vec_chunks 做 KNN 搜索
   取 top-5 最相似的 Library chunks
    │
    ▼
③ 相关度评分
   max_similarity = top-1 chunk 的相似度
   avg_similarity = top-5 chunks 的平均相似度
    │
    ├── max_similarity > 0.85 → "高度相关"
    ├── max_similarity > 0.70 → "可能相关"
    └── max_similarity < 0.70 → 不标注
    │
    ▼
④ 实体关联（可选，Phase 2 再开启）
   提取文章实体 → 查询知识图谱
   ├── 实体已存在且 mention_count 高 → "深化已有知识"
   └── 实体在图谱边缘或不存在 → "新领域探索"
    │
    ▼
⑤ 写入推荐信息
   更新 articles 表的 metadata 字段
   {
     "rag_relevance": 0.87,
     "rag_related_articles": ["article-id-1", "article-id-2"],
     "rag_recommendation": "与你保存的 3 篇 RAG 相关文章高度关联"
   }
```

### 8.2 性能考量

- Feed 拉取通常产生 10-50 篇新文章，Embedding 调用需批量处理
- 推荐计算作为后台任务异步执行，不阻塞 Feed 列表显示
- 结果缓存在 articles 表的 metadata 字段，前端直接读取

---

## 9. 写作辅助设计

### 9.1 功能流程

```
用户输入写作主题/大纲/关键词
    │
    ▼
① Hybrid Retriever 检索
   mode = 'hybrid'
   filters = { partition: 'library' }
   topK = 15
    │
    ▼
② 分类整理
   ├── 相关段落（来自 chunks）
   ├── 相关高亮和批注（来自 highlight chunks）
   └── 知识图谱关联概念
    │
    ▼
③ LLM 组装辅助内容
   ├── 可引用的观点和数据（带来源标注）
   ├── 相关文献列表（来源文章标题 + URL）
   ├── 知识图谱中的概念脉络（该主题关联了哪些概念）
   └── 建议探索的方向（知识缺口提示）
```

### 9.2 集成方式

作为现有 AI Chat 的一种模式：
- 用户在 Chat 面板中切换到"写作模式"
- 输入主题后，系统检索知识库并生成结构化的辅助材料
- 后续可以在对话中进一步讨论和细化

---

## 10. 代码目录结构

```
src/ai/
  services/
    embedding.ts              # Embedding Service（API 调用 + 缓存 + 速率控制）
    chunking.ts               # Chunking Service（分块策略）
    ingestion.ts              # Ingestion Pipeline（入库编排）
    retriever.ts              # Hybrid Retriever（混合检索 + RRF）
    context-builder.ts        # Context Builder（上下文组装）
    entity-extraction.ts      # Entity Extraction（LLM 结构化实体抽取）
    knowledge-graph.ts        # Knowledge Graph Service（图谱管理 + 分析）
  skills/
    rag-chat.ts               # RAG 知识问答 Skill
    feed-recommend.ts         # Feed 智能推荐 Skill
    writing-assist.ts         # 写作辅助 Skill
  tools/
    knowledge-tools.ts        # AI Tools: search_knowledge_base, get_related_entities
  providers/
    vec-db.ts                 # sqlite-vec 初始化与查询封装

src/main/
  db/
    schema.ts                 # 新增 chunks/entities/entity_relations/entity_sources 表定义
  ipc/
    rag-handlers.ts           # RAG 相关 IPC 处理器

src/renderer/
  components/
    KnowledgeGraph.tsx        # 知识图谱可视化组件
    RAGChatPanel.tsx          # RAG 问答面板（或复用现有 Chat 面板）
    FeedRelevanceBadge.tsx    # Feed 列表中的相关度标注
```

**边界规则**（沿用现有 AI 模块规范）：
- `src/ai/` 不直接 import `src/main/` 或 `src/renderer/`
- 数据库操作通过注入的回调函数
- `src/main/ipc/rag-handlers.ts` 作为 RAG 模块和 Electron IPC 的桥接层

---

## 11. IPC 通道设计

新增以下 IPC 通道（追加到 `src/shared/ipc-channels.ts`）：

```typescript
// RAG 知识库
RAG_SEARCH = 'rag:search',                       // 混合检索
RAG_CHAT = 'rag:chat',                           // 知识问答
RAG_CHAT_STREAM = 'rag:chat:stream',             // 流式问答
RAG_INDEX_STATUS = 'rag:index:status',            // 索引状态查询
RAG_INDEX_REBUILD = 'rag:index:rebuild',          // 手动重建索引
RAG_INDEX_PROGRESS = 'rag:index:progress',        // 索引构建进度事件

// 知识图谱
KG_GET_OVERVIEW = 'kg:get-overview',              // 获取图谱概览
KG_GET_SUBGRAPH = 'kg:get-subgraph',             // 获取子图
KG_SEARCH_ENTITIES = 'kg:search-entities',        // 搜索实体
KG_GET_COVERAGE = 'kg:get-coverage',              // 学习覆盖度
KG_GET_GAPS = 'kg:get-gaps',                      // 知识缺口

// Feed 推荐
FEED_RELEVANCE_COMPUTE = 'feed:relevance:compute', // 计算 Feed 相关度
FEED_RELEVANCE_GET = 'feed:relevance:get',         // 获取已计算的相关度
```

---

## 12. 实施 Phase 规划

### Phase 1：基础 RAG（核心链路跑通）

**目标**：用户可以对 Library 内容进行语义问答

**交付物**：
- sqlite-vec 扩展集成 + 向量表 Schema
- Embedding Service（OpenAI API 调用）
- Chunking Service（段落级分块）
- Ingestion Pipeline（文章入库管线）
- Hybrid Retriever（向量 + FTS5 混合检索 + RRF）
- Context Builder
- RAG Chat 基础 UI（复用现有 Chat 面板）
- Library 内容自动索引

**用户价值**：保存到 Library 的文章自动进入知识库，用户可以对知识库提问。

### Phase 2：知识图谱

**目标**：构建可视化的个人知识地图

**交付物**：
- Entity Extraction Service（LLM 实体抽取）
- Knowledge Graph Service（图谱 CRUD + 分析）
- 知识图谱可视化组件（react-force-graph-2d）
- 学习覆盖度分析
- 知识缺口发现

**用户价值**：用户能看到自己的知识全貌，了解哪些领域深入、哪些尚未涉及。

### Phase 3：智能功能

**目标**：RAG 能力延伸到 Feed 推荐和写作辅助

**交付物**：
- Feed 智能推荐（新文章与 Library 的相关度计算）
- Feed 列表相关度标注 UI
- 写作辅助模式
- 批量回填工具（对已有 Library 内容一次性生成 Embedding）
- 增量索引优化（Hook 到所有内容变更事件）

**用户价值**：Feed 流中值得读的内容被自动标注；写作时可以调用个人知识库。

### Phase 4：工程优化

**目标**：系统稳健性和用户体验打磨

**交付物**：
- Embedding 缓存策略（内容 hash 去重）
- 索引构建进度条 UI
- 错误恢复机制（部分 Embedding 失败不影响整体）
- 向量数据的 iCloud 同步策略（各设备独立生成 vs 同步向量）
- Embedding 模型切换支持（切换模型后重建索引）
- 性能基准测试与优化

---

## 13. 关键技术决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 向量数据库 | sqlite-vec | 统一 SQLite 技术栈，Local-First，零运维 |
| Embedding | 云端 API (OpenAI) | 效果好，成本低，不增加客户端体积 |
| 检索策略 | Hybrid (向量 + FTS5 + RRF) | 语义理解和精确匹配互补，效果优于单一方式 |
| 分块策略 | 段落级 + overlap | 简单有效，适合文章类内容 |
| 实体抽取 | LLM 结构化输出 | 灵活，覆盖面广，无需训练 NER 模型 |
| 图谱可视化 | react-force-graph-2d | React 生态内，交互体验好 |
| 向量同步 | 各设备独立生成 | 向量大且依赖模型版本，不适合同步 |
| Feed 索引 | 默认关闭，用户可开启 | Feed 量大，避免不必要的 API 成本 |

---

## 14. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Embedding API 不可用 | 新内容无法入库 | 缓存机制 + chunks 表记录 pending 状态，恢复后自动补齐 |
| Embedding 成本超预期 | 用户使用成本增加 | 按内容量估算并在 UI 提示；支持降维减少存储 |
| sqlite-vec 兼容性问题 | 特定平台无法加载扩展 | 降级为纯 FTS5 检索，关闭向量功能 |
| 实体抽取质量不稳定 | 图谱噪声多 | 设置置信度阈值，低质量实体不入库 |
| 大量内容回填耗时长 | 用户等待体验差 | 后台任务 + 进度条，支持取消和断点续传 |

---

## 15. 成功指标

| 指标 | 目标 | 阶段 |
|------|------|------|
| Library 文章自动进入知识库 | 入库成功率 > 99% | Phase 1 |
| RAG 问答返回相关结果 | 检索准确率用户满意 | Phase 1 |
| 知识图谱实体覆盖 | 每篇文章平均抽取 3-5 个实体 | Phase 2 |
| Feed 推荐标注 | 相关文章被正确标注 | Phase 3 |
| Embedding 生成延迟 | 单篇文章入库 < 5 秒 | Phase 1 |
| 混合检索延迟 | 单次查询 < 500ms | Phase 1 |
