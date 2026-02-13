# Task 6: extract_topics Skill 实现文档

## 概述

实现了 `extract_topics` AI Skill，用于从文章内容中提取 5-10 个核心主题关键词，并在文章详情面板中提供交互入口。

## 变更文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/ai/skills/extract-topics.ts` | 新建 | 主题提取 Skill 定义 |
| `src/ai/index.ts` | 修改 | 导出 `extractTopicsSkill` |
| `src/renderer/components/DetailPanel.tsx` | 修改 | 新增"提取主题"按钮及结果展示 |
| `src/locales/zh.json` | 修改 | 新增 `ai.extractTopics`、`ai.topics` 翻译键 |
| `src/locales/en.json` | 修改 | 对应英文翻译 |
| `tests/ai-extract-topics.test.ts` | 新建 | 9 条单元测试 |

## Skill 设计

### extractTopicsSkill

```typescript
{
  name: 'extract_topics',
  description: '从文章内容提取主题关键词',
  inputSchema: z.object({ articleId: z.string() }),
  execute: async (input, ctx) => { ... }
}
```

- 使用 `ctx.getModel('fast')` 获取快速模型
- 通过 `ctx.getArticleContent` 获取文章全文
- 调用 AI SDK `generateObject` 生成结构化输出（`schema` 参数）
- 截取前 6000 字符作为上下文
- 返回 `{ topics: string[] }`

### 与 IPC Handler 的关系

Task 4 已在 `ai-handlers.ts` 中直接实现了 `AI_EXTRACT_TOPICS` handler（使用相同的 `generateObject` 逻辑）。本次创建的 Skill 文件提供可复用的定义，方便未来 Skill 编排场景。两者逻辑一致，IPC handler 额外处理了数据库操作和日志记录。

## UI 集成

在 DetailPanel 的 AI 操作区域（紧接在"AI 标签"之后）新增：

- **按钮**: 翡翠绿 Hash 图标 + "提取主题" 文本
- **加载态**: Loader2 旋转动画
- **结果展示**: 标签云布局，圆角药丸样式，翡翠绿配色（`bg-emerald-500/10 text-emerald-400`）
- **错误展示**: 红色错误信息

状态管理与现有 AI 操作保持一致：
- `aiTopicsLoading` / `aiTopicsResult` / `aiTopicsError`
- 文章切换时自动重置
- 执行前检查 API Key 配置

## 测试覆盖

共 9 条测试用例：

1. Skill 元数据验证（name、description）
2. inputSchema 接受合法输入
3. inputSchema 拒绝缺少 articleId
4. inputSchema 拒绝非字符串 articleId
5. execute 返回 topics 数组
6. execute 在内容为空时抛出错误
7. execute 调用 getArticleContent
8. execute 调用 getModel("fast")
9. getArticleContent 未定义时抛出错误

## Linear Issue

- **ID**: ZYB-202
- **URL**: https://linear.app/zybwork/issue/ZYB-202
- **状态**: Done
