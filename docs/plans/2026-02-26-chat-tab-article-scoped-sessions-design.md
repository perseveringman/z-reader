# 设计文档：对话 Tab 按文章隔离历史会话

**日期**：2026-02-26
**状态**：已确认，待实现

## 背景

文章详情页的对话 Tab（`ChatPanel`）目前展示所有文章的历史会话，不区分当前文章。用户切换文章时无法自动加载该文章的对话历史，体验割裂。

## 目标

- 对话历史只展示当前文章的会话
- 切换文章时，自动加载该文章最近一条会话（含历史消息）
- 若该文章无历史会话，展示空状态（新对话）

## 设计方案

选定**方案 A：后端过滤 + 自动加载最近会话**。

## 改动范围

### 1. 数据库层 `src/ai/providers/db.ts`

新增方法：

```ts
listChatSessionsByArticle(articleId: string, limit = 50): ChatSessionRow[]
```

SQL：
```sql
SELECT * FROM ai_chat_sessions
WHERE article_id = ?
ORDER BY updated_at DESC
LIMIT ?
```

复用已有 `idx_ai_chat_sessions_article` 索引。

### 2. IPC 层

**`src/shared/ipc-channels.ts`**
新增常量：
```ts
AI_CHAT_SESSION_LIST_BY_ARTICLE: 'ai:chat-session-list-by-article'
```

**`src/main/ipc/ai-handlers.ts`**
新增 handler：接收 `articleId: string`，调用 `aiDb.listChatSessionsByArticle(articleId)`，返回 mapped session 列表。

**`src/shared/global.d.ts`**
新增类型声明：
```ts
aiChatSessionListByArticle(articleId: string): Promise<ChatSession[]>
```

**`src/preload.ts`**
新增桥接方法：透传 IPC 调用。

### 3. 前端 `src/renderer/components/ChatPanel.tsx`

初始化 `useEffect`（依赖 `articleId`）改为：

1. `articleId` 为 null → 清空 sessions 和消息，展示空状态
2. 调用 `aiChatSessionListByArticle(articleId)` 获取该文章的会话列表
3. 更新 `sessions` state（历史下拉只显示当前文章的会话）
4. 列表非空 → 调用 `aiChatSessionGet(sessions[0].id)` 自动加载最近会话
5. 列表为空 → `sessionId = null, messages = []`，展示空状态

## 数据流

```
切换文章
  → ChatPanel useEffect(articleId)
  → IPC: AI_CHAT_SESSION_LIST_BY_ARTICLE(articleId)
  → db.listChatSessionsByArticle(articleId)
  → 有结果 → IPC: AI_CHAT_SESSION_GET(sessions[0].id) → 加载消息
  → 无结果 → 空状态
```

## 不变的部分

- `SessionDropdown` 无需改动，直接受 `sessions` state 驱动
- 新建会话、删除会话、发消息逻辑不变
- `articleId` 为 null 时的处理逻辑不变
