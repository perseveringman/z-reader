# 全局 Agent 助手 — 实施完成报告

> 日期: 2026-02-25
> 关联设计: `docs/plans/2026-02-25-global-agent-assistant-design.md`

## 实施进度

### ✅ Phase 1: 基础架构（已完成）

核心类型定义、IPC 通道、Preload 桥接、AgentService、ActionRouter、Agent IPC Handlers。

### ✅ Phase 2: 悬浮 UI（已完成）

三态 UI 组件（AgentBubble → AgentMiniChat → AgentDrawer）、确认卡片、导航卡片、AgentAssistant 编排组件，集成到 App.tsx。

### ✅ Phase 3: 上下文细化（已完成）

8 个页面组件接入 `reportContext()` 上下文上报，扩展 `AgentPageSpecificState` 覆盖 12 种页面类型，阅读器页面自动拉取文章内容注入 system prompt。

### 旧 ChatPanel 处理

保留旧 ChatPanel 作为文章详情页内的快速问答入口，与全局 Agent 助手并行工作。

---

## 新增文件（12 个）

| 文件 | 功能 |
|------|------|
| `src/renderer/components/agent/AgentAssistant.tsx` | 三态编排主组件（collapsed/mini/expanded），⌘J 快捷键 |
| `src/renderer/components/agent/AgentBubble.tsx` | 右下角悬浮气泡按钮 |
| `src/renderer/components/agent/AgentMiniChat.tsx` | 迷你对话框（360×480） |
| `src/renderer/components/agent/AgentDrawer.tsx` | 完整抽屉面板（420px 宽） |
| `src/renderer/components/agent/ConfirmCard.tsx` | 写操作确认卡片（含"下次不再询问"） |
| `src/renderer/components/agent/NavigationCard.tsx` | 导航卡片（可点击跳转） |
| `src/renderer/components/agent/index.ts` | 桶导出 |
| `src/renderer/contexts/AgentContextProvider.tsx` | 全局上下文 Provider + useAgentContext hook |
| `src/renderer/hooks/useAgentContext.ts` | hook 重导出 |
| `src/ai/services/agent-service.ts` | AgentService 核心服务（上下文感知 + 文章内容自动拉取） |
| `src/ai/services/action-router.ts` | ActionRouter 分级控制 + 白名单持久化 |
| `src/main/ipc/agent-handlers.ts` | Agent IPC handlers（流式 + Session CRUD + 白名单） |

## 修改文件（14 个）

| 文件 | 修改内容 |
|------|---------|
| `src/shared/types.ts` | Agent 类型定义（12 种页面状态）+ ElectronAPI 接口扩展 |
| `src/shared/ipc-channels.ts` | 9 个 Agent IPC 通道常量 |
| `src/preload.ts` | Agent preload 桥接（send/stream/confirm/session/trusted） |
| `src/renderer/App.tsx` | AgentContextProvider 包裹 + AgentAssistant 组件 + 全页面上下文上报 |
| `src/main/ipc/index.ts` | 注册 agent handlers |
| `src/main/ipc/ai-handlers.ts` | 导出 helper 函数供 agent-handlers 复用 |
| `src/renderer/components/ContentList.tsx` | 上报列表数量、选中文章、筛选条件 |
| `src/renderer/components/BookList.tsx` | 上报选中图书、书籍数量 |
| `src/renderer/components/ReaderView.tsx` | 上报文章ID、媒体类型、阅读进度 |
| `src/renderer/components/VideoReaderView.tsx` | 上报文章ID、播放时间、是否有转录 |
| `src/renderer/components/PodcastReaderView.tsx` | 上报文章ID、播放时间、内容Tab |
| `src/renderer/components/BookReaderView.tsx` | 上报图书ID、阅读进度 |
| `src/renderer/components/KGOverviewPage.tsx` | 上报节点数量、选中节点、视图模式 |
| `src/renderer/components/WritingAssistPage.tsx` | 上报文档ID、字数 |

## 架构实现

- **模块注册制**: AgentService 内置 4 个默认模块（articles/tags/feeds/highlights），按 `activeWhen` 动态激活
- **分层上下文**: `CommonViewState`（通用）+ `PageSpecificState`（12 种页面联合类型），Push 轻量元数据 + Pull 重量数据
- **自动内容拉取**: 阅读器页面（article/video/podcast）自动通过 `toolContext.getArticleContent()` 拉取文章内容（≤6000 字符）注入 system prompt
- **三态 UI**: collapsed（气泡）→ mini（迷你对话框）→ expanded（完整抽屉），⌘J 快捷键切换
- **分级控制**: read（直接执行）/ write（确认卡片 + 白名单）/ navigate（导航卡片）
- **白名单**: 持久化到 `ai_settings` 表，确认卡片支持"下次不再询问"，ActionRouter 提供 get/set API
- **流式通信**: `agent:send` + `agent:stream` IPC 通道，复用 AI SDK v6 streamText 模式

## 上下文感知覆盖

| 页面 | 上报的关键数据 | 自动拉取 |
|------|--------------|---------|
| library-articles | selectedArticleId, visibleCount, listFilters | — |
| reader | articleId, mediaType, scrollProgress | ✅ 文章全文 |
| video-reader | articleId, currentTime, hasTranscript | ✅ 文章/转录文本 |
| podcast-reader | articleId, currentTime, contentTab | ✅ 文章/转录文本 |
| book-reader | bookId, readProgress | — |
| knowledge-graph | visibleNodeCount, selectedNodeId, viewMode | — |
| writing-assist | currentDocId, wordCount | — |
| feeds | selectedFeedId, unreadCount | — |
| books | selectedBookId, bookCount | — |
| discover | — | — |
| manage-feeds | selectedFeedId | — |

## 后续迭代

- [ ] 主动建议能力（`suggestWhen` 接口已预留）
- [ ] 白名单管理 UI（偏好设置页）
- [ ] 新模块注册（笔记、写作等）
- [ ] 卡片渲染器注册机制（各模块注册自定义结果展示组件）
- [ ] 选中文本上报（阅读器内选中文本传递给 Agent）
- [ ] 图书阅读器内容自动拉取

## Commits 记录

```
407769f fix(agent): 阅读器页面自动拉取文章内容注入 system prompt
0dd6dcc feat(agent): 扩展页面类型定义，完善 App.tsx 上下文上报
343a928 feat(agent): Reader 系列组件上下文上报
6bfa2e9 feat(agent): ContentList 和 BookList 上下文上报
80bb8c1 feat(agent): KG、写作、图书阅读器上下文上报
0d64fc1 feat(agent): 集成 AgentAssistant 到 App.tsx
7cceb41 feat(agent): 实现 AgentAssistant 三态编排主组件
e7eb93a feat(agent): 实现 AgentDrawer 完整抽屉面板
e7a9493 feat(agent): 实现 AgentService 核心服务
3b7e6b5 feat(agent): 实现 AgentBubble、AgentMiniChat、确认卡片和导航卡片
9985c74 feat(agent): 实现 ActionRouter 分级控制和白名单
351b030 feat(agent): 注册 Agent IPC handlers
92cc853 feat(agent): 实现 Preload Agent API 桥接
cf9cce3 feat(agent): 添加 Agent IPC 通道常量
2c74059 feat(agent): 定义全局 Agent 助手核心类型
```
