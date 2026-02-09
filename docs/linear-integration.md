# Linear Integration Guide

## 概述

本文档记录 Z-Reader 项目中 Linear 的集成配置和使用方法，包括 MCP (Model Context Protocol) 服务器配置和 Claude Code Skills 使用指南。

## Linear MCP 服务器配置

### 前置条件

1. **获取 Linear API Key**
   - 访问 [Linear Settings → API](https://linear.app/settings/api)
   - 点击 "Create new API key"
   - 选择适当的权限范围（建议至少包含 read/write issues, projects, teams）
   - 复制生成的 API key

### 配置步骤

使用 Claude Code 内置的 `/mcp` 命令进行交互式配置：

```bash
claude-internal mcp
```

按照提示选择 Linear MCP 服务器并完成认证配置。

### 验证连接

配置完成后，会显示：

```
Authentication successful. Connected to linear.
```

可以使用以下命令查看已配置的 MCP 服务器：

```bash
claude-internal mcp list
```

### 手动配置（可选）

如果需要手动配置，可以使用以下命令：

```bash
claude-internal mcp add -e LINEAR_API_KEY=your_api_key_here linear -- npx @modelcontextprotocol/server-linear
```

## Linear Skills 使用指南

配置完成后，可以通过 Claude Code 的 `linear` skill 来管理 Linear 中的 issues、projects 和 team workflows。

### 基本使用

在 Claude Code 中，可以直接使用自然语言与 Linear 交互：

```
/linear create issue: [任务描述]
/linear list my issues
/linear update issue [issue-id] status to Done
```

### 工作流集成

根据 AGENT.md 中定义的工作流，每个开发任务都应与 Linear issue 关联：

#### 1. 创建 Issue

开始新任务时：

```
/linear create issue with:
- title: "实现文章标注功能"
- team: "Zybwork"
- project: "Z-Reader"
- description: "详细需求描述..."
- priority: 2 (高优先级)
- labels: ["Feature", "UI/UX"]
- state: "In Progress"
```

#### 2. 更新 Issue 状态

任务进行中更新状态：

```
/linear update issue [issue-id]:
- state: "In Progress"
- add comment: "已完成数据库 schema 设计"
```

#### 3. 完成任务

任务完成时：

```
/linear update issue [issue-id]:
- state: "Done"
- add comment: "功能已完成并沉淀文档至 docs/highlight-annotation.md"
```

## Linear 项目配置

### 项目信息

- **Team**: Zybwork
  - Team ID: `132e85bf-3120-4802-a23e-6068fe02da4a`
- **Project**: Z-Reader
  - Project ID: `d31c5249-3735-4cff-8928-69facc54cfaa`
  - Project URL: https://linear.app/zybwork/project/z-reader-3d01c5fc927e

### Issue 状态定义

| 状态 | 类型 | 含义 | 使用场景 |
|------|------|------|----------|
| Backlog | `backlog` | 待规划的需求池 | 新想法、未评审的需求 |
| Todo | `unstarted` | 已规划、待开发 | Sprint 规划后的任务 |
| In Progress | `started` | 开发中 | 正在实现的任务 |
| Done | `completed` | 已完成 | 已实现并验证的任务 |
| Canceled | `canceled` | 已取消 | 不再执行的任务 |

### 标签分类

| 标签 | 用途 | 示例 |
|------|------|------|
| Feature | 新功能 | 实现 RSS 订阅、阅读视图 |
| Bug | 缺陷修复 | 修复文章解析错误 |
| Improvement | 优化改进 | 提升列表滚动性能 |
| Infrastructure | 基础设施 | 配置 CI/CD、数据库迁移 |
| UI/UX | 用户界面与体验 | 键盘导航、命令面板 |
| Database | 数据库相关 | Schema 设计、索引优化 |

### Priority 定义

- `0`: None - 无优先级
- `1`: Urgent - 紧急（阻塞性 bug、严重安全问题）
- `2`: High - 高（核心功能、重要优化）
- `3`: Normal - 普通（常规功能、一般改进）
- `4`: Low - 低（Nice-to-have 功能）

## 最佳实践

### 1. Issue 创建规范

创建 issue 时应包含：

- **清晰的标题**: 简明扼要，使用动词开头（如"实现..."、"修复..."、"优化..."）
- **详细的描述**: 包含需求背景、功能范围、验收标准
- **合适的标签**: 便于分类和检索
- **明确的优先级**: 帮助团队规划工作顺序
- **关联的 Project**: 确保 issue 归属到 Z-Reader 项目

### 2. 状态更新时机

- 开始工作时立即更新为 "In Progress"
- 遇到阻塞时添加 comment 说明情况
- 完成开发后更新为 "Done"（而非 commit 时）
- 如需要代码评审，可以在 comment 中添加评审链接

### 3. 文档关联

每个完成的 issue 都应：

1. 在 `docs/` 目录沉淀相应文档
2. 在 issue 的最后 comment 中添加文档链接
3. 文档名称与 issue 主题保持一致（使用 kebab-case）

示例：
```
Issue: "实现文章标注与高亮功能"
Doc: docs/highlight-annotation.md
```

### 4. Sprint 管理

根据 `docs/TECHNICAL_SPEC.md` 的 Roadmap：

- 每个 Sprint 的任务项对应一个 Linear issue
- 大任务拆分为子 issue（使用 `parentId` 关联）
- Sprint 结束时创建总结 issue（如 "Sprint 2 完成总结"）

### 5. 使用 Linear 查询

常用查询示例：

```bash
# 查看当前 Sprint 的所有任务
/linear list issues in project "Z-Reader" with state "In Progress"

# 查看我的待办任务
/linear list my issues with state "Todo"

# 搜索特定标签的 issue
/linear list issues with label "Feature" in project "Z-Reader"

# 查看某个 issue 的详细信息
/linear get issue [issue-id]
```

## 常见问题

### Q: MCP 连接失败怎么办？

A: 检查以下几点：
1. API key 是否有效（未过期、权限充足）
2. 网络连接是否正常
3. 使用 `claude-internal mcp list` 查看配置状态
4. 必要时重新运行 `claude-internal mcp` 重新配置

### Q: 如何批量创建 issues？

A: 可以在 Claude Code 中描述需求列表，让 AI 助手通过 Linear skill 批量创建。例如：

```
请帮我在 Linear 创建以下 issues for Z-Reader project:
1. 实现全文搜索功能 (Feature, High priority)
2. 添加文章导出为 Markdown (Feature, Normal priority)
3. 优化启动性能 (Improvement, Normal priority)
```

### Q: 如何查看 Sprint 进度？

A: 使用 Linear 的 project view 或通过 skill 查询：

```
/linear list issues in project "Z-Reader" grouped by state
```

### Q: Issue 应该多细粒度？

A: 建议：
- 单个 issue 的工作量控制在 0.5-2 天
- 超过 2 天的任务拆分为子 issues
- 一个功能模块可以作为父 issue，具体实现拆分为子 issues

## 扩展阅读

- [Linear API Documentation](https://developers.linear.app/docs)
- [Model Context Protocol (MCP) Specification](https://spec.modelcontextprotocol.io/)
- [Claude Code MCP Integration Guide](https://docs.anthropic.com/claude-code/mcp)

## 更新日志

- 2026-02-09: 初始文档创建，记录 Linear MCP 配置和 Skills 使用方法
