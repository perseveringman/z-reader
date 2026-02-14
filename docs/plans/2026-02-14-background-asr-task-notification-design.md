# 后台 ASR + 通用任务系统 + 通知系统 设计文档

日期: 2026-02-14

## 概述

三个独立但联动的系统：

1. **通用任务系统** — Main 进程的任务管理核心，所有后台任务统一注册、管理、持久化
2. **通知系统** — 双通道通知（应用内 + 系统级）+ 通知中心
3. **后台 ASR 标准版** — 基于火山引擎录音文件识别标准版 API 的后台转写

## 1. 通用任务系统

### 数据模型

新增 `app_tasks` 表：

```sql
CREATE TABLE app_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'asr-realtime' | 'asr-standard' | 'download' | ...
  article_id TEXT,           -- 关联文章（可选）
  status TEXT NOT NULL,      -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress REAL DEFAULT 0,   -- 0.0 ~ 1.0
  title TEXT NOT NULL,       -- 显示标题 e.g. "转写: 播客标题"
  detail TEXT,               -- 进度详情文本
  meta TEXT,                 -- JSON, 存任务特有数据 (如 requestId, pollInterval)
  error TEXT,                -- 失败原因
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### IPC 通道

```typescript
APP_TASK_CREATE:  'app-task:create'   // 创建任务
APP_TASK_CANCEL:  'app-task:cancel'   // 取消任务
APP_TASK_LIST:    'app-task:list'     // 查询任务列表
APP_TASK_UPDATED: 'app-task:updated'  // 广播: 任务状态变更 (main → renderer)
```

### 类型定义

```typescript
type AppTaskType = 'asr-realtime' | 'asr-standard' | 'download' | string;
type AppTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface AppTask {
  id: string;
  type: AppTaskType;
  articleId?: string;
  status: AppTaskStatus;
  progress: number;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 任务生命周期

1. `appTaskCreate(type, articleId, title, meta)` → 创建 pending 记录 → 启动对应执行器
2. 执行器更新 status/progress/detail → 广播 `APP_TASK_UPDATED` 到所有窗口
3. 完成/失败时更新状态 → 发通知 → 广播最终状态
4. `appTaskCancel(taskId)` → 设置 abort → 更新为 cancelled

### 任务看板 UI (侧边抽屉)

- 入口：顶部工具栏新增图标按钮，未完成任务数 badge
- 从右侧滑出，宽度 ~360px
- 任务列表按时间倒序，每个任务卡片：
  - 图标（按 type 区分）
  - 标题 + 状态 badge
  - 进度条（running 时显示）
  - 创建时间
- 筛选器：全部 / 进行中 / 已完成
- 已完成任务点击跳转到对应文章
- 失败任务显示错误 + 重试按钮

## 2. 通知系统

### 数据模型

新增 `notifications` 表：

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'success' | 'error' | 'info'
  title TEXT NOT NULL,
  body TEXT,
  article_id TEXT,           -- 可选，点击可跳转
  read INTEGER DEFAULT 0,   -- 0/1
  created_at TEXT NOT NULL
);
```

### IPC 通道

```typescript
NOTIFICATION_LIST:     'notification:list'      // 查询通知列表
NOTIFICATION_READ:     'notification:read'      // 标记已读
NOTIFICATION_READ_ALL: 'notification:read-all'  // 全部已读
NOTIFICATION_CLEAR:    'notification:clear'     // 清空通知
NOTIFICATION_NEW:      'notification:new'       // 广播: 新通知 (main → renderer)
```

### 双通道通知

任务完成/失败时，Main 进程同时:
1. 写入 `notifications` 表
2. 广播 `NOTIFICATION_NEW` → Renderer 弹出 Toast (3秒)
3. 调用 Electron `new Notification({ title, body })` 发系统通知

### 通知中心 UI

- 入口：顶部工具栏铃铛图标 + 未读数 badge
- 侧边抽屉，显示通知列表
- 每条通知：类型图标 + 标题 + 正文 + 时间 + 已读/未读指示
- 操作：标记已读、全部已读、清空
- 点击通知跳转到对应文章

## 3. 后台 ASR 标准版

### API 信息

- 提交: `POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`
- 查询: `POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`
- Resource ID: `volc.seedasr.auc` (SeedASR 2.0 标准版)
- 认证: 复用现有 `volcAsrAppKey` + `volcAsrAccessKey`

### 提交流程

1. 用户点击「后台转写」
2. Renderer 调用 `appTaskCreate({ type: 'asr-standard', articleId })`
3. Main 进程:
   - 校验 audioUrl 存在、ASR 凭据已配置
   - 生成 `requestId` (UUID)
   - 创建 app_task (status=running)
   - POST submit:
     ```json
     {
       "user": { "uid": "<appKey>" },
       "audio": { "format": "<mp3|wav|ogg>", "url": "<audioUrl>" },
       "request": {
         "model_name": "bigmodel",
         "enable_itn": true,
         "enable_punc": true,
         "show_utterances": true
       }
     }
     ```
   - Headers: `X-Api-Request-Id: <requestId>`, `X-Api-Sequence: -1`, 等
   - 成功后存 requestId 到 task.meta, 启动轮询

### 轮询流程

- 每 10 秒 POST query (空 body, 相同 headers + requestId)
- 检查 `X-Api-Status-Code`:
  - `20000001/20000002` → 继续轮询, 更新 detail="处理中..."
  - `20000000` → 成功:
    - 解析 utterances → TranscriptSegment[]
    - 保存到 transcripts 表 (删除旧记录后插入)
    - 更新 task 为 completed
    - 发通知: "转写完成: <文章标题>"
  - 其他 → 失败, 更新 task 为 failed, 发通知
- 超时保护: 30 分钟
- 取消: 停止轮询, 更新 task 为 cancelled

### 音频格式

从 audioUrl 推断格式 (mp3/wav/ogg), 标准版服务端支持主流格式, 无需本地转换。

## 4. PodcastReaderView 转写 tab 变更

### ready 状态

显示两个按钮:
- 「后台转写」(主按钮, 推荐) — 提交标准版 API, 用户可离开页面
- 「实时转写」(次按钮) — 现有流式 WebSocket, 需留在页面

### not-downloaded 状态

- 「后台转写」仍然可用（标准版直接传 URL, 不需要本地文件）
- 「实时转写」需要先下载 → 保持下载提示

### 任务进行中

- 如果有该 articleId 的 running 状态 asr-standard 任务:
  - 显示 "后台转写进行中, 可在任务面板查看" + 进度指示
  - 不阻塞用户操作, 可以离开页面

### 转写完成

- 从 DB 加载 transcript, 显示 TranscriptView
- 重新转写: 弹确认框, 选择实时或后台

## 5. 实现步骤

1. **DB Schema** — 新增 app_tasks + notifications 表, Drizzle schema, 迁移
2. **通用任务服务** — task-service.ts: CRUD + 广播 + 执行器注册
3. **通知服务** — notification-service.ts: CRUD + Toast + 系统通知
4. **IPC handlers** — app-task-handlers.ts, notification-handlers.ts
5. **类型 + preload** — 新增类型定义, preload bridge
6. **后台 ASR 服务** — standard-asr-service.ts: submit + poll + 结果解析
7. **任务看板组件** — TaskDrawer.tsx: 侧边抽屉 + 任务列表
8. **通知中心组件** — NotificationDrawer.tsx: 侧边抽屉 + 通知列表
9. **PodcastReaderView** — 双按钮 + 后台任务状态展示
10. **App.tsx** — 集成看板/通知入口, 全局通知监听
11. **构建验证** — TypeScript 编译检查
