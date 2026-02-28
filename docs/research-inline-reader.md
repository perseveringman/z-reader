# 研究空间内联阅读器

## 功能概述

在研究空间中，用户可以直接点击源材料列表的文章标题，在右侧栏就地阅读，无需切换到全屏阅读模式。阅读器完全复用现有的翻译、高亮、批注、AI 对话等能力。

## 交互方式

### 触发阅读器
- **SourcesPanel**：点击文章标题 → 右侧栏切换为阅读器
- **ResearchChat**：AI 回复中的引用来源链接 → 点击打开阅读器
- 复选框点击仅切换启用/禁用状态，不会打开阅读器

### 返回
- 点击阅读器顶部的返回按钮 → 右侧栏恢复为 StudioPanel
- ESC 键：先关闭浮层侧边栏，再关闭阅读器

### 辅助功能
- 翻译按钮：全文翻译 / 显示/隐藏翻译
- 笔记按钮：打开浮层侧边栏的笔记 Tab
- AI 对话按钮：打开浮层侧边栏的 AI 对话 Tab
- 语言学习按钮：打开浮层侧边栏的语言学习 Tab
- 设置按钮：打开排版设置面板

## 核心架构

### 内容类型注册表 (ReaderRegistry)

```
ContentType: 'article' | 'video' | 'podcast' | 'book' | 'note'

registerReader(type, Component) → 注册阅读器
getReader(type) → 获取阅读器组件
```

新增内容类型只需调用 `registerReader` 即可。

### 组件层级

```
ResearchLayout
├── SourcesPanel (onOpenReader)
├── ResearchChat (onOpenReader)
└── readingItem 存在时 → ResearchReader
    └── ArticleReaderCore (embedded=true)
        ├── 顶部工具栏
        ├── 正文区域（高亮+翻译+批注）
        ├── 悬浮工具栏
        └── ReaderSlidePanel → ReaderDetailPanel

    readingItem 为空时 → StudioPanel
```

### ArticleReaderCore 双模式

- `embedded=false`（全屏模式）：三栏布局，TOC + 正文 + ReaderDetailPanel
- `embedded=true`（嵌入模式）：单栏布局，正文 + 浮层侧边栏

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/renderer/components/reader/ReaderRegistry.ts` | 内容类型注册表 |
| `src/renderer/components/reader/ReaderSlidePanel.tsx` | 浮层侧边栏 |
| `src/renderer/components/reader/ArticleReaderCore.tsx` | 文章阅读核心（双模式） |
| `src/renderer/components/research/ResearchReader.tsx` | 研究空间阅读器容器 |
| `src/renderer/components/research/ResearchLayout.tsx` | readingItem 状态管理 |
| `src/renderer/components/research/SourcesPanel.tsx` | 标题点击触发 |
| `src/renderer/components/research/ResearchChat.tsx` | 引用来源链接 |
| `src/renderer/components/ReaderView.tsx` | 薄壳，委托给 ArticleReaderCore |

## 如何新增内容类型

以视频为例：

1. 创建 `src/renderer/components/reader/VideoReaderCore.tsx`
2. 实现 `ReaderComponentProps` 接口（contentId, onClose, embedded）
3. 文件末尾调用 `registerReader('video', VideoReaderCore)`
4. 在 `ResearchReader.tsx` 中导入 `'./VideoReaderCore'` 确保注册

## 已知限制

- 嵌入模式下没有 TOC 目录栏
- 浮层侧边栏宽度固定为 min(360px, 80%)，不可拖拽调整
- 第一阶段只支持 article 类型，video/podcast/book 需要后续实现
