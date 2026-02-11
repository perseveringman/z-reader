# Book Reader (EPUB + PDF) 实现计划

## 概述

为 Books 模块实现完整的 EPUB/PDF 阅读器，布局、交互、体验对齐文章阅读器（ReaderView），支持目录导航、高亮标注、阅读进度追踪。

## 技术选型

### EPUB 渲染：epubjs

| 维度 | 说明 |
|------|------|
| 选型原因 | 高亮 API 最成熟（`rendition.annotations.highlight(cfiRange)`）；基于 EPUB CFI 标准定位，与 DB `currentLocation` 字段天然匹配；TOC 通过 `book.navigation.toc` 获取；支持主题切换 `rendition.themes`；Electron 社区主流方案 |
| 对比 foliate-js | foliate-js 更新但作者声明 API 不稳定、无 npm 发布、需 git submodule，不适合 Vite + Electron Forge 工作流 |
| 对比 Readium | 过于重型，多包架构，适合企业级而非桌面阅读器 |

### PDF 渲染：pdfjs-dist (Mozilla PDF.js)

| 维度 | 说明 |
|------|------|
| 选型原因 | 唯一免费方案同时支持文本选择+高亮；Canvas + Text Layer + Annotation Layer 三层架构；Text Layer 提供 DOM 文本节点可自定义高亮；TOC 通过 `pdf.getOutline()` 获取；Web Worker 离线渲染不阻塞 UI；Mozilla 持续维护 |
| 对比 react-pdf | react-pdf 是 pdfjs-dist 的薄封装，封装层限制 Text Layer 直接控制，不利于自定义高亮 |
| 对比商业方案 | Nutrient/PSPDFKit 功能全面但需商业授权，费用高 |

### 高亮统一方案

扩展现有 `highlights` 表，增加 `bookId` 列（nullable，与 `articleId` 互斥）。
- EPUB 高亮：CFI range 存储在 `anchorPath` 字段
- PDF 高亮：`page:startOffset-endOffset` 格式存储在 `anchorPath` 字段
- 选中文本存储在 `text` 字段
- Notebook 侧边栏组件可复用

## 架构设计

### 三栏布局（对齐 ReaderView）

```
┌──────────┬─────────────────────────┬──────────┐
│  TOC     │   Book Content          │  Detail  │
│  目录     │   (EPUB/PDF 渲染区)     │  Info    │
│          │                         │  Notebook│
│          │                         │  Chat    │
│  可折叠   │   排版设置 / 进度条      │  可折叠   │
└──────────┴─────────────────────────┴──────────┘
```

### 组件结构

```
BookReaderView.tsx              # 主容器，根据文件类型分发
├── EpubReader.tsx              # EPUB 渲染核心（epubjs）
├── PdfReader.tsx               # PDF 渲染核心（pdfjs-dist）
├── BookReaderToc.tsx           # 左侧目录栏（EPUB TOC / PDF Outline）
├── BookReaderDetailPanel.tsx   # 右侧详情面板（复用 ReaderDetailPanel 模式）
└── BookReaderSettings.tsx      # 排版设置（字体、字号、行高、主题）
```

### IPC 扩展

| 新增通道 | 功能 |
|---------|------|
| `book:getFilePath` | 返回书籍文件的绝对路径（区分 EPUB/PDF） |
| `highlight:listByBook` | 按 bookId 查询高亮列表 |
| `highlight:createForBook` | 为书籍创建高亮（bookId + cfiRange/pageOffset） |

### 数据库变更

```sql
-- highlights 表新增 bookId 列
ALTER TABLE highlights ADD COLUMN book_id TEXT REFERENCES books(id);
-- 新增索引
CREATE INDEX idx_highlights_book_id ON highlights(book_id);
```

- `articleId` 和 `bookId` 互斥，分别对应文章高亮和书籍高亮
- `anchorPath` 复用：EPUB 存 CFI range，PDF 存 `page:start-end`

### 导入流程扩展

当前 `book:import` 仅支持 EPUB。扩展为同时接受 `.epub` 和 `.pdf` 文件：
- books 表新增 `fileType` 列 (`epub` | `pdf`)
- 导入时根据扩展名自动识别
- EPUB 导入时解析元数据（作者、封面、语言、出版社）
- PDF 导入时通过 pdfjs-dist 解析元数据

## 实施计划

### 任务 1：数据层扩展

**目标**：为书籍阅读器准备数据基础

1. `books` 表新增 `fileType` 列，默认 `epub`
2. `highlights` 表新增 `bookId` 列（nullable）
3. 扩展 `shared/types.ts`：`Book` 增加 `fileType`，新增 `CreateBookHighlightInput`
4. 扩展 IPC channels 和 handlers：`highlight:listByBook`、`highlight:createForBook`
5. 修改 `book:import` 支持 `.pdf` 文件选择
6. PDF 导入时通过 pdfjs-dist 在主进程解析元数据

### 任务 2：BookReaderView 核心框架 + App 路由集成

**目标**：搭建阅读器三栏布局骨架

1. 创建 `BookReaderView.tsx` 主容器
2. 根据 `book.fileType` 分发到 `EpubReader` 或 `PdfReader` 占位
3. 实现 `BookReaderToc.tsx` 左侧目录栏（可折叠）
4. 实现 `BookReaderDetailPanel.tsx` 右侧详情面板
5. 实现 `BookReaderSettings.tsx` 排版设置面板
6. App.tsx 中 `bookReaderMode` 分支接入 `BookReaderView`

### 任务 3：EPUB 阅读器

**目标**：完整 EPUB 阅读体验

1. `EpubReader.tsx`：使用 epubjs 渲染 EPUB 内容
2. TOC：解析 `book.navigation.toc`，点击跳转章节
3. 进度追踪：监听 `relocated` 事件，记录 CFI 和百分比进度
4. 排版设置：字体、字号、行高、主题通过 `rendition.themes` 应用
5. 高亮：监听 `selected` 事件，弹出工具栏，`rendition.annotations.highlight()` 渲染
6. 高亮持久化：创建时写入 DB，重新打开时从 DB 加载并应用
7. Notebook 面板集成：展示高亮列表，点击导航到高亮位置

### 任务 4：PDF 阅读器

**目标**：完整 PDF 阅读体验

1. `PdfReader.tsx`：使用 pdfjs-dist 渲染（Canvas + Text Layer）
2. 滚动模式：连续滚动渲染所有页面，懒加载可视区域
3. TOC：通过 `pdf.getOutline()` 解析目录，点击跳转页面
4. 进度追踪：监听滚动位置计算百分比
5. 高亮：监听 Text Layer 上的选区事件，弹出工具栏，wrap mark 标签
6. 高亮持久化：`anchorPath` 存储 `page:startOffset-endOffset`，重新打开时恢复
7. Notebook 面板集成

### 任务 5：EPUB 元数据提取

**目标**：导入时自动填充书籍信息

1. 在主进程使用 epubjs 解析 EPUB 元数据
2. 提取：title、author、cover（base64）、language、publisher、description
3. 导入后自动更新 books 表
4. BookDetailPanel 展示完整信息

## 依赖安装

```bash
pnpm add pdfjs-dist
```

`epubjs` 已安装（v0.3.93）。

## 测试策略

- 单元测试：高亮锚点序列化/反序列化
- 集成测试：EPUB/PDF 导入流程
- 手动验证：阅读体验、高亮交互、进度恢复
