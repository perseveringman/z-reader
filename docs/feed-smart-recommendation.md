# Feed 智能推荐

## 概述

Feed 智能推荐功能基于 RAG（检索增强生成）向量检索，自动计算 Feed 文章与用户 Library 内容的语义相关度，在文章卡片上展示推荐标签，帮助用户从大量 Feed 中快速发现与自身兴趣相关的内容。

## 整体架构

```
用户开启开关 → Feed文章进入 → Embedding生成查询向量 → KNN搜索Library向量 → 计算相似度 → 打标签 → UI展示徽章
```

### 核心思路

- 用户 Library 中收藏的文章代表其兴趣偏好
- Library 文章经过分块（chunking）+ 向量化（embedding）后存入向量数据库
- 每篇 Feed 文章的标题和内容片段也生成向量，与 Library 向量做 KNN 相似度搜索
- 相似度超过阈值的 Feed 文章标记为"高度相关"或"可能相关"

## 两条处理路径

| | 回填（Backfill） | 实时（Feed Hook） |
|---|---|---|
| **触发** | 用户手动点"开始回填"按钮 | Feed 拉取新文章自动触发 |
| **入口文件** | `src/ai/services/backfill.ts` Phase 2 | `src/main/ipc/feed-relevance-hook.ts` |
| **处理方式** | 批量逐篇处理所有历史 Feed 文章 | 单篇异步非阻塞处理 |
| **进度展示** | UI 进度条 + 百分比实时显示 | 后台静默，仅 console.log |
| **错误处理** | 单篇失败继续下一篇 | 失败静默处理 |
| **用途** | 补齐历史数据 | 保证新文章实时标注 |

两条路径最终都调用同一个核心方法：`feed-relevance.ts` → `computeRelevance(title, contentPreview)`。

## 核心计算流程

文件：`src/ai/services/feed-relevance.ts`

### 步骤详解

1. **拼接查询文本** — `title + '\n' + contentPreview`，截取前 2000 字符
2. **生成查询向量** — 调用 Embedding API（doubao-embedding-vision-251215，2048 维），返回 `Float32Array`
3. **KNN 搜索** — 使用 sqlite-vec 在 `vec_chunks` 表中搜索 top-20 最近邻 chunks
4. **加载 chunk 元数据** — 从 `chunks` 表批量获取命中 chunk 的 `source_type`、`source_id`
5. **过滤 Library 来源** — 只保留 `source_type = 'article'` 且对应 `articles.source = 'library'` 的结果
6. **计算相似度** — `similarity = 1 - cosine_distance`（cosine distance 范围 0~2）
7. **每篇文章取最高分** — 一篇 Library 文章可能有多个 chunks 命中，取最高相似度作为该文章的得分
8. **标签转换** — 按最高分应用阈值规则
9. **返回结果** — 包含 score、label、topMatches（最多 3 篇匹配 Library 文章标题）、computedAt

### 评分规则

| 相似度范围 | 标签 | 含义 |
|-----------|------|------|
| > 0.85 | `high` | 高度相关，重点推荐 |
| 0.70 ~ 0.85 | `medium` | 可能相关，参考推荐 |
| <= 0.70 | `none` | 无关联，不显示 |

### 返回数据结构

```typescript
interface FeedRelevanceInfo {
  score: number;          // 0 ~ 1，保留 3 位小数
  label: 'high' | 'medium' | 'none';
  topMatches: string[];   // 最多 3 个匹配的 Library 文章标题
  computedAt: string;     // ISO 8601 时间戳
}
```

## 数据存储

计算结果写入 `articles.metadata` JSON 字段：

```json
{
  "feedRelevance": {
    "score": 0.891,
    "label": "high",
    "topMatches": ["Library文章标题1", "Library文章标题2"],
    "computedAt": "2026-02-25T10:30:00.000Z"
  }
}
```

回填查询条件（判断是否已计算过）：

```sql
AND (a.metadata IS NULL OR a.metadata NOT LIKE '%feedRelevance%')
```

## 向量搜索参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 向量维度 | 2048 | 来自 Embedding 配置，可调 |
| 距离函数 | Cosine Distance | sqlite-vec 默认 |
| 距离范围 | [0, 2] | 0=完全相同，2=完全相反 |
| 相似度公式 | `1 - distance` | 范围 [-1, 1] |
| top-K | 20 | KNN 搜索候选数量 |
| 内容截取 | 前 2000 字符 | 查询文本长度限制 |

### 向量表结构

```sql
-- chunks 表：存储分块元数据和内容
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source_type TEXT,       -- 'article'
  source_id TEXT,         -- 对应 articles.id
  chunk_index INTEGER,
  content TEXT,
  token_count INTEGER,
  embedding_status TEXT,  -- 'pending' | 'done' | 'failed'
  ...
);

-- vec_chunks 表：sqlite-vec 虚拟表
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[2048]
);
```

## 实时路径的前置检查

`feed-relevance-hook.ts` 中有 4 层保护检查，任一不满足则跳过计算：

1. **功能开关** — `feedSmartRecommendEnabled` 已开启（从 `settings-service.ts` 读取 JSON 文件）
2. **文章内容** — `contentText` 非空
3. **Embedding 配置** — API Key、Base URL、Model ID 已配置
4. **Library 索引** — `chunks` 表中至少存在一条 `source_type = 'article'` 的记录

## UI 展示

### 徽章组件

文件：`src/renderer/components/RelevanceBadge.tsx`

| 标签 | 样式 | 文案 |
|------|------|------|
| `high` | 蓝色背景 `bg-blue-500/15` + 蓝色文字 `text-blue-400` + Sparkles 图标 | "高度相关" |
| `medium` | 琥珀色背景 `bg-amber-500/15` + 琥珀色文字 `text-amber-400` + Sparkles 图标 | "可能相关" |
| `none` | **不渲染** | - |

- 支持 compact 模式（列表视图仅显示图标，卡片视图显示完整标签）
- 鼠标悬停 tooltip 显示匹配的 Library 文章标题

### 展示位置

文件：`src/renderer/components/ArticleCard.tsx`，第 195 行

```tsx
{source === 'feed' && <RelevanceBadge metadata={article.metadata} compact={compact} />}
```

位于文章卡片元信息行（域名 · 作者 · 阅读时间）末尾，仅 `source === 'feed'` 的文章显示。

## 用户入口

文件：`src/renderer/components/PreferencesDialog.tsx`

路径：设置 → AI → 智能功能

- **Feed 智能推荐开关** — 开启/关闭功能，立即保存到 `z-reader-settings.json`
- **回填批大小** — 可调范围 10~500，默认 50
- **开始回填按钮** — 触发批量计算，实时显示进度

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/ai/services/feed-relevance.ts` | 核心相关度计算服务 |
| `src/ai/services/backfill.ts` | 批量回填调度（Phase 2） |
| `src/main/ipc/feed-relevance-hook.ts` | 新 Feed 文章实时计算钩子 |
| `src/ai/providers/rag-db.ts` | RAG 数据库层（向量搜索、chunk 管理） |
| `src/ai/services/embedding.ts` | Embedding API 调用封装 |
| `src/renderer/components/RelevanceBadge.tsx` | 推荐徽章 UI 组件 |
| `src/renderer/components/ArticleCard.tsx` | 文章卡片（集成徽章） |
| `src/renderer/components/PreferencesDialog.tsx` | 设置页面（开关、回填控制） |
| `src/main/services/settings-service.ts` | 应用设置读写（JSON 文件） |

## 已知问题与修复记录

### 1. Embedding 全部失败导致推荐无效

**现象**：chunks 表所有记录 `embedding_status = 'failed'`，vec_chunks 为空，所有 feed 文章 score = 0。

**原因**：Embedding API 调用异常但未正确重试。

**修复**：重置 `embedding_status` 为 `pending` 后重新生成向量。

### 2. 智能推荐开关不持久化

**现象**：开启开关后关闭设置页再打开，开关恢复为关闭状态。

**原因**：AI 设置页面标注"自动保存"但实际使用 `updateField` 只更新 React 状态，无保存按钮。

**修复**：在 `PreferencesDialog.tsx` 中为开关和批大小控件添加 `window.electronAPI.settingsSet()` 即时保存。

### 3. 设置读取源不匹配

**现象**：开启开关后仍然没有推荐结果。

**原因**：`feed-relevance-hook.ts` 从 `ai_settings` SQL 表读取 `appSettings`，但该表无此键。`feedSmartRecommendEnabled` 实际存储在 `z-reader-settings.json` 文件中。

**修复**：改为从 `settings-service.ts` 的 `loadSettings()` 读取。

### 4. similarity 负数导致 computeRelevance 崩溃

**现象**：`TypeError: Cannot read properties of undefined (reading '1')` at `feed-relevance.ts:100`。

**原因**：sqlite-vec cosine distance 范围 0~2，`similarity = 1 - distance` 可以为负数。原代码 `bestPerArticle.get(hit.sourceId) ?? 0` 以 0 作为初始比较值，负数 similarity 永远不会被存入 Map，导致 Map 为空，`sortedArticles[0]` 为 `undefined`。

**修复**：
- `?? 0` 改为 `?? -Infinity`
- 新增 `if (sortedArticles.length === 0)` 防御性检查
