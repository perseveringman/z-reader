# 内联注释（Margin Annotation）功能文档

> Linear Issue: [ZYB-160](https://linear.app/zybwork/issue/ZYB-160)

## 功能概述

在高亮行的右侧空白区域（margin）显示笔记和标签注释，参考 Readwise Reader 的交互模式。支持：
- 点击工具栏按钮添加笔记 / 标签
- 笔记保存后以灰色小字常驻显示，点击可重新编辑
- 标签以药丸（pill）样式常驻显示
- 三种主题（dark / light / sepia）适配

## 架构设计

### 数据层

新增 `highlight_tags` 关联表，将标签与高亮关联（多对多）：

```sql
CREATE TABLE highlight_tags (
  highlight_id TEXT NOT NULL REFERENCES highlights(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (highlight_id, tag_id)
);
```

复用已有的 `tags` 表和 `highlights.note` 字段，无需新增列。

### IPC 通道

| 通道 | 功能 |
|------|------|
| `highlightTag:add` | 高亮添加标签 |
| `highlightTag:remove` | 高亮移除标签 |
| `highlightTag:forHighlight` | 获取单个高亮的标签 |
| `highlightTag:batch` | 批量获取多个高亮的标签 |

### 组件结构

```
ReaderView.tsx (状态管理 + 回调)
  └── AnnotationLayer.tsx (注释层容器)
        ├── NoteDisplay (已保存笔记，点击编辑)
        ├── NoteEditor (textarea + Save/Cancel)
        ├── TagDisplay (药丸样式标签)
        └── HighlightTagPicker.tsx (标签搜索/选择/创建)
```

### 定位策略

- 注释层 `position: absolute` 覆盖整个滚动内容区域
- 默认 `pointer-events: none`，注释项 `pointer-events: auto`
- 每个注释项通过 mark 元素的 `offsetTop` 计算垂直位置
- 水平位置：内容区域 `max-w-680px` 右边缘 + 24px 间距
- 多注释防重叠：按 top 排序，最小间距 40px

### 状态管理

ReaderView 新增：
- `editingAnnotation: { highlightId, type: 'note' | 'tag' } | null` — 控制编辑状态
- `highlightTagsMap: Record<string, Tag[]>` — 所有高亮的标签缓存

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/components/AnnotationLayer.tsx` | 新建 | 注释层主组件 |
| `src/renderer/components/HighlightTagPicker.tsx` | 新建 | 高亮标签选择器 |
| `src/renderer/components/ReaderView.tsx` | 修改 | 集成注释层、状态、回调 |
| `src/main/db/schema.ts` | 修改 | highlight_tags 表定义 |
| `src/main/db/index.ts` | 修改 | migration 创建表 |
| `src/shared/ipc-channels.ts` | 修改 | 新增通道常量 |
| `src/shared/types.ts` | 修改 | HighlightTagsMap 类型、API 声明 |
| `src/preload.ts` | 修改 | 暴露新 API |
| `src/main/ipc/highlight-tag-handlers.ts` | 新建 | IPC handler |
| `src/main/ipc/index.ts` | 修改 | 注册 handler |
| `src/index.css` | 修改 | 注释层样式 + 三主题适配 |

## 交互流程

1. 高亮文字 → 悬浮工具栏出现
2. 点击笔记按钮 → 工具栏关闭 → 右侧出现 NoteEditor
3. 输入文字 → Save（或 Cmd+Enter）→ 笔记常驻显示为 NoteDisplay
4. 点击 NoteDisplay → 重新进入编辑
5. 点击标签按钮 → 右侧出现 HighlightTagPicker
6. 选择/创建标签 → 药丸样式标签常驻显示
7. Escape → 关闭编辑器
8. 删除高亮 → 注释一并消失

## 快捷键

- `Escape` → 关闭注释编辑器 > 关闭工具栏 > 返回列表
- `Cmd/Ctrl + Enter` → 保存笔记
