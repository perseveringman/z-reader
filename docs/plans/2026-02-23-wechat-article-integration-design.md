# 微信公众号文章集成设计

## 概述

将 Access_wechat_article 项目的全部能力移植到 z-reader 中，作为一种新的 Feed 类型（`feed_type='wechat'`）深度融入现有体系，复用阅读、标注、标签等所有现有能力。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 实现方式 | 混合方案 | HTTP 逻辑用 TS 重写，网页离线保存用 Electron BrowserWindow |
| Token 获取 | 手动粘贴 | 最安全，避免触发微信风控 |
| UI 集成 | 深度融合 Feed 体系 | 公众号直接出现在 Feed 列表中，用微信图标区分 |
| 行为数据存储 | 新建独立表 | 不污染 articles 表结构 |

## 核心能力（从原项目移植）

1. **获取公众号主页链接** — 从任意文章 URL 提取公众号名称和 biz 值
2. **获取文章列表** — 调用微信 API 翻页获取（需 Token）
3. **下载文章内容** — Electron BrowserWindow 离线保存完整网页
4. **获取文章详情** — 阅读量、点赞、转发、在看、评论（需 Token）

## 架构设计

### 新增文件

```
src/main/services/
├── wechat-service.ts        # 核心爬虫逻辑（HTTP 请求、Token 管理、反封禁）
├── wechat-html-saver.ts     # 利用 Electron BrowserWindow 离线保存网页

src/main/ipc/
├── wechat-handlers.ts       # 微信相关 IPC 处理器

src/renderer/components/
├── WechatTokenDialog.tsx     # Token 配置对话框
├── WechatOperationPanel.tsx  # 微信专属操作区（嵌入 FeedDetailPanel）
├── WechatStatsSection.tsx    # 行为数据显示区块（嵌入 DetailPanel）
```

### 修改文件

```
src/main/db/schema.ts         # 新增 wechat_stats, wechat_comments 表; feeds 表新增字段
src/main/ipc/index.ts         # 注册 wechat-handlers
src/shared/ipc-channels.ts    # 新增微信相关 IPC 通道
src/shared/types.ts           # 新增微信相关类型定义
src/renderer/components/Sidebar.tsx        # 微信图标区分
src/renderer/components/AddFeedDialog.tsx  # 识别微信 URL
src/renderer/components/FeedDetailPanel.tsx # 嵌入微信操作区
src/renderer/components/DetailPanel.tsx    # 嵌入行为数据区块
src/renderer/App.tsx           # 注册新的 IPC 调用
```

## 数据模型

### feeds 表扩展

```sql
ALTER TABLE feeds ADD COLUMN wechat_biz TEXT;
ALTER TABLE feeds ADD COLUMN wechat_token_url TEXT;
ALTER TABLE feeds ADD COLUMN wechat_token_expiry TEXT;
```

### 新建 wechat_stats 表

```sql
CREATE TABLE wechat_stats (
  id TEXT PRIMARY KEY,
  article_id TEXT REFERENCES articles(id),
  read_count INTEGER,
  like_count INTEGER,
  share_count INTEGER,
  wow_count INTEGER,
  fetched_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 新建 wechat_comments 表

```sql
CREATE TABLE wechat_comments (
  id TEXT PRIMARY KEY,
  article_id TEXT REFERENCES articles(id),
  content TEXT,
  like_count INTEGER,
  nickname TEXT,
  created_at TEXT
);
```

## 反封禁策略

| 策略 | 实现 |
|------|------|
| 短延时 | 0.1-1.5 秒随机（单篇文章请求） |
| 长延时 | 3-7 秒随机（翻页/详情请求） |
| UA 伪装 | 内置 Chrome UA 列表轮换 |
| 会话持久化 | axios 实例 + cookie jar |
| 异常检测 | 人机验证/频率限制/纯图片文章检测 |
| 自适应频率 | 检测到限制时自动延长等待 |
| Token 过期检测 | API 异常时提示用户更新 |
| 错误隔离 | articles 表 fetchStatus 标记 |
| 增量保存 | SQLite 事务，断点续传 |

## UI 设计

### 侧边栏
- 微信公众号作为 Feed 列表中的一项，用微信图标（💬）区分
- 与 RSS、YouTube、Podcast 等 Feed 平等对待

### 添加公众号
- 融入 AddFeedDialog：粘贴 mp.weixin.qq.com URL 时自动识别
- 自动提取公众号名称和 biz 值

### FeedDetailPanel 扩展
- 微信 Feed 额外显示：Token 状态、操作按钮（拉取列表/下载内容/获取详情）、进度条

### DetailPanel 扩展
- 微信文章额外显示：阅读量、点赞、转发、在看、评论列表

### Token 配置对话框
- 粘贴 Fiddler 复制的 URL
- 自动解析参数
- 简明操作指引

### 阅读体验
- 完全复用 ReaderView，微信文章 = 普通文章

## 实现步骤

### Phase 1: 基础设施
1. 数据库 schema 变更（新表 + feeds 扩展）
2. 类型定义（IPC channels + TypeScript types）
3. wechat-service.ts 核心服务（Token 解析、反封禁工具函数）

### Phase 2: 核心功能
4. 功能1 — 从文章 URL 提取公众号信息（创建 wechat Feed）
5. 功能2 — 获取文章列表（API 调用 + 翻页 + 存储到 articles）
6. 功能3 — 下载文章内容（BrowserWindow 离线保存）
7. 功能4 — 获取行为数据（阅读量/点赞/评论 → wechat_stats/wechat_comments）

### Phase 3: UI 集成
8. AddFeedDialog 扩展（识别微信 URL）
9. Sidebar 微信图标
10. WechatTokenDialog（Token 配置）
11. WechatOperationPanel（操作面板，嵌入 FeedDetailPanel）
12. WechatStatsSection（行为数据，嵌入 DetailPanel）

### Phase 4: IPC 注册与联调
13. wechat-handlers.ts（IPC 处理器）
14. preload.ts 桥接
15. 端到端联调与测试
