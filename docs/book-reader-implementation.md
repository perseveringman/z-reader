# Book Reader（EPUB + PDF）实现补充文档

> 基于 `docs/book-reader.md` 的继续实现补齐记录。

## 本次完成项

### 1) 导入流程与元数据

- `book:import` 已支持 `.epub` + `.pdf` 统一导入（此前已接入选择器，本次补齐 PDF 元数据写入）。
- EPUB：继续使用 `extractEpubMetadata` 提取 `title/author/cover/language/publisher/description`。
- PDF：新增 `extractPdfMetadata`，提取并写入：
  - `title`
  - `author`
  - `publisher`（优先 `info.Producer`，再看 XMP）
  - `description`（优先 `info.Subject`，再看 XMP）
  - `language`（来自 XMP metadata）

实现位置：
- `src/main/ipc/book-handlers.ts`
- `src/main/services/epub-metadata.ts`

### 2) IPC 通道对齐（兼容命名）

为与 `docs/book-reader.md` 保持一致，补充文档中提到的通道别名：

- `book:getFilePath`（新增，返回与 `book:getContent` 一致的 `filePath`）
- `highlight:listByBook`（新增，语义等同 `bookHighlight:list`）
- `highlight:createForBook`（新增，语义等同 `bookHighlight:create`）
- `book:readFile`（新增，返回原始文件二进制，供 PDF 渲染绕过 `file://` 限制）

说明：
- 旧通道继续保留，避免现有调用方受影响。
- 新旧通道共存，后续可逐步统一命名。

实现位置：
- `src/shared/ipc-channels.ts`
- `src/main/ipc/book-handlers.ts`
- `src/main/ipc/highlight-handlers.ts`
- `src/preload.ts`
- `src/shared/types.ts`

### 2.1) PDF 本地文件加载修复

问题：
- 在渲染进程中直接用 `file://...pdf` 调用 `pdfjs-dist`，会触发 Electron/Chromium 的本地资源访问限制，报错：
  - `Not allowed to load local resource`
  - `ResponseException`

修复方案：
- 主进程通过 `book:readFile` 读取 PDF 二进制（ArrayBuffer）
- 渲染进程 `PdfReader` 使用 `pdfjsLib.getDocument({ data: Uint8Array })` 打开
- 避免在渲染进程请求 `file://` URL

实现位置：
- `src/main/ipc/book-handlers.ts`
- `src/shared/ipc-channels.ts`
- `src/shared/types.ts`
- `src/preload.ts`
- `src/renderer/components/PdfReader.tsx`

### 2.2) EPUB 本地文件加载修复

问题：
- EPUB 阅读器原先同样通过 `file://...epub` 加载，触发本地资源限制。
- 同时，高亮重绘时使用 `rendition.annotations.each()` + `remove(..., 'highlight')`，在当前实现下存在类型/实现不一致，导致运行时异常（`apply` 相关报错）。

修复方案：
- 与 PDF 同步：改为通过 `book:readFile` 获取二进制，再 `ePub(binary)` 初始化。
- 高亮重绘改为“显式跟踪已应用 CFI”：
  - 新增 `appliedHighlightAnchorsRef`
  - 每次重绘先按 `epub-highlight` 类型清理，再重新应用
- 避免依赖 `annotations.each()` 的不稳定返回结构。

实现位置：
- `src/renderer/components/EpubReader.tsx`

### 3) EPUB 高亮逻辑实现（可用版）

实现目标：
- 选中文本后可创建高亮
- 高亮可持久化并在重开时恢复
- 同一锚点避免重复创建
- 已存在高亮支持改色
- 工具栏在 iframe 场景下位置正确

关键行为：
- 监听 `rendition.on('selected')` 获取 `cfiRange`
- 通过 `anchorPath(cfiRange)` 与已存高亮去重
- 新增高亮：`bookHighlight:create` 持久化后回写本地列表
- 已存在高亮：调用 `highlight:update` 更新颜色
- 重绘高亮：维护 `appliedHighlightAnchorsRef`，先清理后应用，避免重复叠加
- 创建/改色后清理选择区，避免遗留选中态
- 点击正文中已有高亮：自动联动右侧 `Notebook` 并滚动定位对应高亮卡片
- PDF 同样支持点击正文中的高亮 `mark`，触发同样的右侧联动

实现位置：
- `src/renderer/components/EpubReader.tsx`
- `src/renderer/components/BookReaderView.tsx`
- `src/renderer/components/BookReaderDetailPanel.tsx`

### 3) 类型收敛与一致性

- `Book.fileType` 收敛为联合类型：`'epub' | 'pdf'`。
- `Highlight.articleId` 改为 `string | null`，匹配书籍高亮场景。
- `Highlight.bookId` 明确为 `string | null`。
- `ElectronAPI` 新增：
  - `bookGetFilePath(id)`
  - `highlightListByBook(bookId)`
  - `highlightCreateForBook(input)`
- `bookGetContent/bookGetFilePath` 返回值修正为 `Promise<string | null>`，匹配 handler 实际行为。

实现位置：
- `src/shared/types.ts`
- `src/preload.ts`

### 4) 阅读器 UI 小修

- `BookUploadPanel` 文案从“仅 EPUB”更新为“EPUB/PDF”。
- `BookReaderDetailPanel` 的进度展示改为使用 `BookReaderView` 的实时 `readProgress`，避免右侧详情与顶部进度条不一致。

实现位置：
- `src/renderer/components/BookUploadPanel.tsx`
- `src/renderer/components/BookReaderDetailPanel.tsx`
- `src/renderer/components/BookReaderView.tsx`

## 与 `docs/book-reader.md` 的对齐状态

- 任务 1（数据层扩展）：**已对齐并补齐关键缺口**。
- 任务 2（BookReaderView 框架）：**已具备**（已有三栏布局 + 路由集成）。
- 任务 3（EPUB 阅读器）：**已具备核心能力**（渲染/TOC/进度/主题/高亮/持久化/导航）。
- 任务 4（PDF 阅读器）：**已具备核心能力**（Canvas+TextLayer、滚动渲染、TOC、进度、高亮、恢复）。
- 任务 5（EPUB 元数据提取）：**已具备**。

## 验证记录

- `pnpm lint`：通过（仓库内存在既有 warning，非本次引入）。
- `pnpm exec tsc --noEmit`：当前仓库有既有错误（`@postlight/parser` 类型声明缺失），与本次改动无直接关系。

## 后续建议

- 将前端调用逐步从 `bookHighlight:*` 迁移到 `highlight:*ByBook/*ForBook` 或反向统一，减少双命名维护成本。
- 为 PDF 元数据增加更多字段映射（如创建时间、关键词）。
- 补一组书籍导入与高亮 IPC 的集成测试。
