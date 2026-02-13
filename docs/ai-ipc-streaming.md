# AI IPC 流式通信层

## 概述

本任务实现了 AI Chat 功能的 IPC 通信层，包括：
1. ToolContext 工厂 — 桥接 AI 模块与 Drizzle ORM 数据库
2. 流式 Chat handler — 支持持续推送 chunk 到渲染进程
3. Session CRUD handler — 会话的增删查改
4. Preload 流式 API — 安全桥接渲染进程与主进程
5. ElectronAPI 类型声明更新

## 架构

```
渲染进程 (Renderer)                   主进程 (Main)
┌─────────────────────┐              ┌─────────────────────────────┐
│ electronAPI         │              │ ai-handlers.ts              │
│ .aiChatSend() ──────┼── send ──►  │ ipcMain.on(AI_CHAT_SEND)   │
│ .aiChatOnStream() ◄─┼── on ────   │   → ChatService.sendMessage │
│                     │              │   → event.sender.send(chunk)│
│ .aiChatSessionCreate├── invoke ──► │ ipcMain.handle(SESSION_*) │
│ .aiChatSessionList  │              │   → AIDatabase CRUD        │
└─────────────────────┘              └──────────┬──────────────────┘
                                                │
                                     ┌──────────▼──────────────────┐
                                     │ tool-context-factory.ts     │
                                     │ createToolContext(db)       │
                                     │   → searchArticles         │
                                     │   → getArticleContent      │
                                     │   → markAsRead / archive   │
                                     │   → listTags / addTag ...  │
                                     └─────────────────────────────┘
```

## 关键设计决策

### 流式通信使用 `ipcMain.on` 而非 `ipcMain.handle`

- `ipcMain.handle` 只能返回一次结果（Promise）
- `ipcMain.on` + `event.sender.send()` 可以多次推送数据
- Chat 流式回复需要逐块推送 text-delta / tool-call / tool-result / done / error

### Preload 的 `aiChatOnStream` 返回取消订阅函数

```typescript
aiChatOnStream: (callback) => {
  const handler = (_event, chunk) => callback(chunk);
  ipcRenderer.on(IPC_CHANNELS.AI_CHAT_STREAM, handler);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_STREAM, handler);
},
```

渲染进程组件在 unmount 时调用返回的函数取消订阅，防止内存泄漏。

### ToolContext 工厂的字段映射

| ToolContext 方法 | 数据库字段/操作 |
|---|---|
| `markAsRead` | `readStatus = 'seen'` |
| `archiveArticle` | `readStatus = 'archive'` |
| `searchArticles` | `LIKE` 模糊匹配 `title` |
| `addTag` | 忽略大小写查找或创建 tag，插入 article_tags |
| `getReadingStats` | 统计 `seen`/`archive` 状态 + `updatedAt` 时间范围 |

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/ai/tool-context-factory.ts` | 新建 | ToolContext 工厂，实现 11 个方法 |
| `src/main/ipc/ai-handlers.ts` | 修改 | 新增 Chat 流式/Session CRUD/主题提取/日志详情 handler |
| `src/preload.ts` | 修改 | 新增 aiChatSend/aiChatOnStream/Session CRUD/Topics/LogDetail |
| `src/shared/types.ts` | 修改 | ElectronAPI 接口新增 Chat 相关方法类型 |

## 测试结果

- TypeScript 类型检查通过（无新增错误）
- 所有 118 个既有测试通过，无回归
