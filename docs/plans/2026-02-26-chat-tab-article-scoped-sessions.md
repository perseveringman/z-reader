# 对话 Tab 按文章隔离历史会话 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 对话 Tab 只展示当前文章的历史会话，切换文章时自动加载该文章最近一条会话，无历史则展示空状态。

**Architecture:** 在数据库层新增按 `article_id` 过滤的查询方法，通过新增 IPC 通道暴露给前端，`ChatPanel` 初始化时按 articleId 拉取并自动加载最近会话。

**Tech Stack:** better-sqlite3（直接 SQL）、Electron IPC（ipcMain.handle）、React useState/useEffect

---

### Task 1: 数据库层 — 新增 `listChatSessionsByArticle`

**Files:**
- Modify: `src/ai/providers/db.ts`（在 `listChatSessions` 方法之后，约第 367 行）

**Step 1: 找到 `listChatSessions` 方法并在其后插入新方法**

在 `src/ai/providers/db.ts` 的 `listChatSessions` 方法（约第 363 行）之后，紧接着添加：

```ts
/** 按 article_id 查询 Chat 会话列表（按 updated_at 降序） */
listChatSessionsByArticle(articleId: string, limit = 50): ChatSessionRow[] {
  return this.sqlite.prepare(
    'SELECT * FROM ai_chat_sessions WHERE article_id = ? ORDER BY updated_at DESC LIMIT ?'
  ).all(articleId, limit) as ChatSessionRow[];
}
```

**Step 2: 验证编译通过**

```bash
cd /Users/ryanbzhou/Developer/vibe-coding/freedom/z-reader
pnpm tsc --noEmit 2>&1 | head -20
```

期望：无 TypeScript 错误（或仅有与本次改动无关的已有错误）。

**Step 3: Commit**

```bash
git add src/ai/providers/db.ts
git commit -m "feat(ai-db): 新增 listChatSessionsByArticle 按文章过滤会话列表"
```

---

### Task 2: IPC 层 — 新增通道常量

**Files:**
- Modify: `src/shared/ipc-channels.ts`（在 `AI_CHAT_SESSION_DELETE` 行之后，约第 137 行）

**Step 1: 在 `AI_CHAT_SESSION_DELETE` 之后添加新常量**

```ts
AI_CHAT_SESSION_LIST_BY_ARTICLE: 'ai:chat:session:list-by-article',
```

完整的 AI Chat 区块修改后应为：

```ts
// AI Chat
AI_CHAT_SEND: 'ai:chat:send',
AI_CHAT_STREAM: 'ai:chat:stream',
AI_CHAT_SESSION_CREATE: 'ai:chat:session:create',
AI_CHAT_SESSION_LIST: 'ai:chat:session:list',
AI_CHAT_SESSION_GET: 'ai:chat:session:get',
AI_CHAT_SESSION_DELETE: 'ai:chat:session:delete',
AI_CHAT_SESSION_LIST_BY_ARTICLE: 'ai:chat:session:list-by-article',
```

**Step 2: 验证编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): 新增 AI_CHAT_SESSION_LIST_BY_ARTICLE 通道常量"
```

---

### Task 3: IPC 层 — 注册 handler

**Files:**
- Modify: `src/main/ipc/ai-handlers.ts`（在 `AI_CHAT_SESSION_DELETE` handler 之后，约第 922 行）

**Step 1: 在 `AI_CHAT_SESSION_DELETE` handler 结束后添加新 handler**

找到这段代码（约第 915 行）：

```ts
// 删除 Chat 会话
ipcMain.handle(
  IPC_CHANNELS.AI_CHAT_SESSION_DELETE,
  async (_event, id: string) => {
    const aiDb = getAIDatabase();
    aiDb.deleteChatSession(id);
  },
);
```

在其之后添加：

```ts
// 按文章查询 Chat 会话列表
ipcMain.handle(
  IPC_CHANNELS.AI_CHAT_SESSION_LIST_BY_ARTICLE,
  async (_event, articleId: string) => {
    const aiDb = getAIDatabase();
    return aiDb.listChatSessionsByArticle(articleId).map(mapChatSessionRow);
  },
);
```

**Step 2: 验证编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/main/ipc/ai-handlers.ts
git commit -m "feat(ipc-handler): 注册 AI_CHAT_SESSION_LIST_BY_ARTICLE handler"
```

---

### Task 4: 类型声明 — 在 `ElectronAPI` 中添加新方法签名

**Files:**
- Modify: `src/shared/types.ts`（在 `aiChatSessionList` 行之后，约第 1028 行）

**Step 1: 在 `aiChatSessionList` 行之后添加**

```ts
aiChatSessionListByArticle: (articleId: string) => Promise<ChatSession[]>;
```

完整的 aiChat 区块应为：

```ts
aiChatSessionCreate: (articleId?: string) => Promise<ChatSession>;
aiChatSessionList: () => Promise<ChatSession[]>;
aiChatSessionListByArticle: (articleId: string) => Promise<ChatSession[]>;
aiChatSessionGet: (id: string) => Promise<ChatSession | null>;
aiChatSessionDelete: (id: string) => Promise<void>;
```

**Step 2: 验证编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): 在 ElectronAPI 添加 aiChatSessionListByArticle 类型声明"
```

---

### Task 5: Preload — 添加桥接方法

**Files:**
- Modify: `src/preload.ts`（在 `aiChatSessionList` 之后，约第 148 行）

**Step 1: 在 `aiChatSessionList` 行之后添加**

```ts
aiChatSessionListByArticle: (articleId) =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_LIST_BY_ARTICLE, articleId),
```

完整的 AI Chat Session CRUD 区块应为：

```ts
// AI Chat Session CRUD
aiChatSessionCreate: (articleId) =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_CREATE, articleId),
aiChatSessionList: () =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_LIST),
aiChatSessionListByArticle: (articleId) =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_LIST_BY_ARTICLE, articleId),
aiChatSessionGet: (id) =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_GET, id),
aiChatSessionDelete: (id) =>
  ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_SESSION_DELETE, id),
```

**Step 2: 验证编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

期望：无新增错误。

**Step 3: Commit**

```bash
git add src/preload.ts
git commit -m "feat(preload): 添加 aiChatSessionListByArticle 桥接方法"
```

---

### Task 6: 前端 — 修改 `ChatPanel` 初始化逻辑

**Files:**
- Modify: `src/renderer/components/ChatPanel.tsx`

**Step 1: 定位初始化 useEffect（约第 490 行）**

当前代码：

```ts
// 初始化：仅加载会话列表，不立即创建会话（延迟到第一次发消息时创建）
useEffect(() => {
  if (apiConfigured === false) return;
  if (apiConfigured === null) return;

  const initSession = async () => {
    try {
      // 仅加载会话列表，不创建新会话
      const list = await window.electronAPI.aiChatSessionList();
      setSessions(list);
      await loadPromptPresets();
      // 重置当前会话状态
      setSessionId(null);
      setMessages([]);
    } catch {
      setError(t('chat.error'));
    }
  };
  initSession();
}, [articleId, apiConfigured, t, loadPromptPresets]);
```

**Step 2: 将该 useEffect 替换为以下内容**

```ts
// 初始化：按文章加载会话列表，自动加载最近一条，无历史则空状态
useEffect(() => {
  if (apiConfigured === false) return;
  if (apiConfigured === null) return;

  const initSession = async () => {
    try {
      await loadPromptPresets();

      if (!articleId) {
        setSessions([]);
        setSessionId(null);
        setMessages([]);
        return;
      }

      // 按文章拉取会话列表
      const list = await window.electronAPI.aiChatSessionListByArticle(articleId);
      setSessions(list);

      if (list.length > 0) {
        // 自动加载最近一条会话
        const latest = await window.electronAPI.aiChatSessionGet(list[0].id);
        if (latest) {
          setSessionId(latest.id);
          setMessages(latest.messages);
        } else {
          setSessionId(null);
          setMessages([]);
        }
      } else {
        // 无历史会话，空状态
        setSessionId(null);
        setMessages([]);
      }
    } catch {
      setError(t('chat.error'));
    }
  };
  initSession();
}, [articleId, apiConfigured, t, loadPromptPresets]);
```

**Step 3: 确认 `handleDeleteSession` 中刷新列表的调用也需要改为按文章过滤**

找到 `handleDeleteSession`（约第 668 行）中的这两行：

```ts
const list = await window.electronAPI.aiChatSessionList();
setSessions(list);
```

将两处（成功 + 失败恢复）全部替换为（需要 articleId）：

```ts
if (articleId) {
  const list = await window.electronAPI.aiChatSessionListByArticle(articleId);
  setSessions(list);
} else {
  setSessions([]);
}
```

注意：`handleDeleteSession` 中有两处 `aiChatSessionList()` 调用（try 和 catch 各一处），都需要替换。

**Step 4: 验证编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

期望：无新增 TypeScript 错误。

**Step 5: 手动测试验证**

启动应用：
```bash
pnpm start
```

验证以下场景：
1. 选中一篇**有历史对话**的文章 → Chat Tab 自动加载最近会话，展示历史消息
2. 选中一篇**无历史对话**的文章 → Chat Tab 展示空状态（预设卡片）
3. 发送一条消息，再切换到另一篇文章，再切回来 → 能看到刚才的对话
4. 历史下拉列表只展示当前文章的会话，不混入其他文章的会话
5. 删除当前会话后，如有其他会话不会自动切换（保持空状态）

**Step 6: Commit**

```bash
git add src/renderer/components/ChatPanel.tsx
git commit -m "feat(chat): 对话 Tab 按文章隔离历史会话，切换文章时自动加载最近会话"
```
