# 文章高亮标注与笔记功能

**Linear Issue**: [ZYB-136](https://linear.app/zybwork/issue/ZYB-136/文章高亮标注与笔记功能)

## 概述

实现了 ReaderView 中的文本高亮标注和 DetailPanel Notebook 标签页的高亮笔记展示。

## 变更文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/ipc/highlight-handlers.ts` | 新增 | Highlight IPC handlers (list/create/delete) |
| `src/main/ipc/index.ts` | 修改 | 注册 highlight handlers |
| `src/renderer/components/ReaderView.tsx` | 修改 | 文本选择浮动工具栏、H 键高亮、正文高亮渲染 |
| `src/renderer/components/DetailPanel.tsx` | 修改 | Notebook 标签页高亮列表 |

## 功能说明

### IPC Handlers (`highlight-handlers.ts`)
- `HIGHLIGHT_LIST`: 根据 articleId 查询未删除的高亮
- `HIGHLIGHT_CREATE`: 创建高亮记录，返回完整对象
- `HIGHLIGHT_DELETE`: 软删除（设置 deletedFlg = 1）

### ReaderView 高亮交互
- **鼠标选择**: 选中文字后出现浮动工具栏，提供 4 种颜色（黄/蓝/绿/红）
- **H 键**: 高亮当前聚焦段落（默认黄色）
- **正文渲染**: 加载文章后，通过 TreeWalker 遍历文本节点，用 `<mark>` 标签包裹匹配文本

### DetailPanel Notebook 标签页
- 显示当前文章的所有高亮
- 每条高亮包含：左侧颜色条、引用文本、笔记内容、相对时间
- 悬停显示删除按钮
- 空状态："暂无高亮笔记"

## 数据流

```
用户选中文字 → 点击颜色按钮 → highlightCreate IPC → SQLite 写入 → 更新 React state → 正文 mark 渲染 + Notebook 列表更新
```
