# Z-Reader Agent Guidelines

## 沟通语言
所有沟通、注释、文档使用中文

## 项目概述

Z-Reader 是一个本地优先 (Local-First) 的 RSS 阅读器桌面应用，功能全面对齐 Readwise Reader。

## 技术栈

- **框架**: Electron + React + TypeScript
- **构建工具**: Vite (Electron Forge)
- **样式**: Tailwind CSS + Shadcn/UI
- **数据库**: SQLite (`better-sqlite3`)
- **ORM**: Drizzle ORM
- **RSS 解析**: rss-parser
- **正文提取**: @postlight/parser 或 mozilla/readability
- **状态管理**: React Context / Jotai
- **包管理器**: pnpm

## 常用命令

```bash
# 启动开发
pnpm start

# 打包
pnpm package
pnpm make

# 代码检查
pnpm lint
```

## 项目结构

```
src/
  main.ts              # Electron 主进程入口
  preload.ts           # Preload 安全桥接脚本 (electronAPI)
  renderer.ts          # 渲染进程入口 (React 挂载)
  index.css            # 全局样式 (Tailwind)
  main/
    db/
      schema.ts        # Drizzle 表定义 (feeds, articles, highlights, tags, article_tags, views)
      index.ts         # 数据库初始化与连接管理
    ipc/
      index.ts         # IPC handler 注册入口
      feed-handlers.ts # Feed CRUD handler
      article-handlers.ts # Article 查询/更新 handler
  renderer/
    App.tsx            # React 根组件 (三栏布局)
    components/
      Sidebar.tsx      # 左侧导航栏
      ContentList.tsx  # 中间内容列表
      DetailPanel.tsx  # 右侧详情面板
  shared/
    types.ts           # 共享类型定义
    ipc-channels.ts    # IPC 通道常量
    global.d.ts        # window.electronAPI 类型声明
docs/                  # 每个任务完成后的沉淀文档
```

## 架构约定

- **主进程 (Main)**: 负责 SQLite 数据库、RSS 抓取、文件操作、全局快捷键
- **渲染进程 (Renderer)**: UI 渲染与交互，通过 IPC 向主进程请求数据
- **Preload**: 安全的 IPC 桥接，渲染进程通过 `window.electronAPI` 调用主进程方法
- 所有数据优先存储本地 SQLite，渲染进程不直接连接数据库
- 预留 `updated_at` 和 `deleted_flg` 字段，为后续 CRDT 同步做准备

## 代码规范

- 使用 TypeScript 严格模式 (`noImplicitAny: true`)
- 样式使用 Tailwind CSS，UI 组件使用 Shadcn/UI 风格 (极简、高信噪比)
- ESLint 配置: `@typescript-eslint`
- 中文注释优先

## 文档要求

每一个任务完成都沉淀一个文档在 `docs/` 目录，以便后续的迭代参考。

## Linear 工作流
使用linear skills
每个任务必须与 Linear issue 关联，遵循以下流程。详细的 Linear MCP 配置和使用指南请参考 `docs/linear-integration.md`。

### Linear 项目信息
- **Team**: Zybwork (`132e85bf-3120-4802-a23e-6068fe02da4a`)
- **Project**: Z-Reader (`d31c5249-3735-4cff-8928-69facc54cfaa`)
- **Project URL**: https://linear.app/zybwork/project/z-reader-3d01c5fc927e

### Issue 状态流转
| 状态 | 类型 | 含义 |
|------|------|------|
| Backlog | backlog | 待规划的需求池 |
| Todo | unstarted | 已规划、待开发 |
| In Progress | started | 开发中 |
| Done | completed | 已完成 |
| Canceled | canceled | 已取消 |

### 可用标签
| 标签 | 用途 |
|------|------|
| Feature | 新功能 |
| Bug | 缺陷修复 |
| Improvement | 优化改进 |
| Infrastructure | 基础设施、构建、CI/CD |
| UI/UX | 用户界面与体验 |
| Database | 数据库 Schema、迁移 |

### 开始任务时
1. 使用 `/linear` skill 或 Linear MCP 创建 issue
   - 必须指定: `title`, `team: "Zybwork"`, `project: "Z-Reader"`
   - 建议指定: `description`, `priority` (1=紧急 2=高 3=普通 4=低), `labels`, `state: "In Progress"`
2. 在 thread 中记录 issue ID，后续引用

### 结束任务时
1. 使用 `/linear` skill 将 issue 状态更新为 `Done`
2. 如有需要，添加 comment 总结完成内容
3. 沉淀文档到 `docs/` 目录

### Sprint 管理
按 `docs/TECHNICAL_SPEC.md` 的 Roadmap 拆分 issue，每个 Sprint 内的任务项对应一个 Linear issue。大的任务可拆分为子 issue (`parentId`)。

### MCP 配置
首次使用需要配置 Linear MCP 服务器：
```bash
claude-internal mcp
```
按提示完成 Linear 认证配置。详细配置步骤和使用方法见 `docs/linear-integration.md`。

## 当前进度

参考 `docs/TECHNICAL_SPEC.md` 中的 Roadmap，当前处于 **Sprint 1: 基础设施与数据流** 阶段。

## 代码提交
使用github cli提交代码，提交时不要带上Co-Authored-By这种署名的行为