# Sprint 1: 基础设施与数据流 — 完成报告

## 概述

Sprint 1 全部 7 项任务已完成，Z-Reader 具备了完整的数据层、IPC 通信、RSS 抓取、三栏 UI 和文章展示能力。

## 完成的 Issue

| Issue | 标题 | 状态 |
|-------|------|------|
| ZYB-119 | 数据库层 - Drizzle + SQLite + 全部表结构 | ✅ Done |
| ZYB-120 | IPC 通信层 - 主进程 ↔ 渲染进程 API 定义 | ✅ Done |
| ZYB-121 | RSS 抓取服务 - 添加订阅、OPML 导入、定时解析入库 | ✅ Done |
| ZYB-122 | 基础三栏 UI 框架 - 侧边栏导航 + 内容列表 + 详情面板 | ✅ Done |
| ZYB-123 | 文章卡片组件 - 缩略图、标题、摘要、元数据、阅读进度 | ✅ Done |
| ZYB-124 | 状态切换 - Inbox / Later / Archive 三态 Tab | ✅ Done |

## 技术实现摘要

### 数据库层 (ZYB-119)
- Drizzle ORM + better-sqlite3，WAL 模式
- 6 张表: feeds, articles, highlights, tags, article_tags, views
- FTS5 全文搜索索引
- 性能索引: feed_id, read_status, saved_at, published_at, deleted_flg

### IPC 通信层 (ZYB-120)
- 共享类型定义 `src/shared/types.ts`
- IPC 通道常量 `src/shared/ipc-channels.ts`
- Preload 桥接 `src/preload.ts` 暴露 `window.electronAPI`
- Feed CRUD + Article CRUD handlers

### RSS 抓取服务 (ZYB-121)
- `src/main/services/rss-service.ts`
- rss-parser 解析 + fetch API 获取
- Etag/Last-Modified 增量拉取，HTTP 304 跳过
- 文章去重 (guid 或 url+feedId)
- 自动提取: 缩略图、字数、阅读时长、域名
- Feed 健康监控 (errorCount)
- OPML 导入 (正则解析 outline 标签)
- 每 15 分钟定时拉取 (setInterval)

### 三栏 UI 框架 (ZYB-122)
- Sidebar: Library/Feed/Pinned 三区域导航 + 折叠支持
- ContentList: 350px 宽度，Tab 切换
- DetailPanel: Info/Notebook/Chat 三 Tab
- macOS hiddenInset 标题栏，暗色主题

### 文章卡片组件 (ZYB-123)
- `src/renderer/components/ArticleCard.tsx`
- 缩略图 (48x48) 或域名首字母 fallback
- 标题单行截断 + 摘要两行 clamp
- 元数据行: 域名、作者、阅读时长
- 相对时间显示 (2h ago, 3d ago)
- 阅读进度条 (蓝色)
- 选中态: 左侧蓝色边框 + 背景高亮
- Hover 快捷操作: Inbox/Later/Archive

### 状态切换 (ZYB-124)
- Inbox/Later/Archive Tab 联通 electronAPI 过滤
- 排序控制: Date saved / Date published，升序/降序
- 底部状态栏显示实际条目数
- 快捷操作触发状态变更后自动刷新

## 文件清单

```
src/
  main.ts                          # 主进程入口 (含定时拉取启动)
  preload.ts                       # IPC 桥接
  main/
    db/
      schema.ts                    # Drizzle 表定义
      index.ts                     # 数据库初始化
    ipc/
      index.ts                     # IPC handler 注册入口
      feed-handlers.ts             # Feed CRUD + RSS 抓取 handlers
      article-handlers.ts          # Article CRUD handlers
    services/
      rss-service.ts               # RSS 抓取服务
  renderer/
    App.tsx                        # 三栏布局
    components/
      Sidebar.tsx                  # 左侧导航栏
      ContentList.tsx              # 中间内容列表 (含排序/Tab/数据加载)
      ArticleCard.tsx              # 文章卡片组件
      DetailPanel.tsx              # 右侧详情面板
  shared/
    types.ts                       # 共享类型
    ipc-channels.ts                # IPC 通道常量
    global.d.ts                    # window.electronAPI 类型声明
```

## 下一步: Sprint 2 — 极致阅读体验

1. 正文提取引擎 (@postlight/parser)
2. 沉浸阅读视图 (Reader View)
3. 键盘导航系统 (全面对齐readwise reader)
4. 焦点系统与段落级蓝色焦点条
5. 高亮与批注功能
6. 命令面板 (Command Palette)
7. 操作撤销栈 (Undo Stack)
8. Toast 操作反馈提示
