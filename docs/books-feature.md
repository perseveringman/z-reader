# Books 功能实现文档

> Linear Issue: [ZYB-155](https://linear.app/zybwork/issue/ZYB-155)

## 功能概述

支持 EPUB 电子书的导入与管理，交互对齐 Readwise Reader 的 Books 模块。

## 架构设计

### 数据库层
- `books` 表：`src/main/db/schema.ts`
- 字段：id, title, author, cover, filePath, fileSize, language, publisher, description, readStatus, readProgress, totalLocations, currentLocation, isShortlisted, createdAt, updatedAt, deletedFlg

### IPC 通道
| 通道 | 功能 |
|------|------|
| `book:list` | 查询书籍列表（支持 readStatus / isShortlisted 过滤）|
| `book:get` | 获取单本书详情 |
| `book:import` | 打开文件选择器，导入 EPUB 文件 |
| `book:delete` | 软删除 |
| `book:update` | 更新书籍信息（状态、进度等）|
| `book:getContent` | 返回文件路径（供渲染进程 epubjs 使用）|
| `book:permanentDelete` | 永久删除（含文件）|
| `book:restore` | 恢复已删除书籍 |

### 文件存储
EPUB 文件复制到 `userData/books/` 目录，以 UUID 命名避免冲突。

### UI 组件
- `BookList` — 书籍列表，INBOX/LATER/ARCHIVE 三标签页
- `BookUploadPanel` — 空状态下的 EPUB 上传引导面板
- `BookDetailPanel` — 选中书籍时的详情面板
- Sidebar 中 Library 分区下新增 "Books" 导航项

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/main/db/schema.ts` | 新增 books 表定义 |
| `src/main/db/index.ts` | 新增 books 表 DDL + 索引 |
| `src/shared/ipc-channels.ts` | 新增 8 个 Book 通道 |
| `src/shared/types.ts` | 新增 Book/BookListQuery/UpdateBookInput 类型 + ElectronAPI 方法 |
| `src/main/ipc/book-handlers.ts` | 新建，实现所有 Book IPC handler |
| `src/main/ipc/index.ts` | 注册 registerBookHandlers |
| `src/preload.ts` | 新增 Book IPC bridge |
| `src/renderer/components/BookList.tsx` | 新建 |
| `src/renderer/components/BookUploadPanel.tsx` | 新建 |
| `src/renderer/components/BookDetailPanel.tsx` | 新建 |
| `src/renderer/components/Sidebar.tsx` | 新增 Books 导航项 |
| `src/renderer/App.tsx` | 集成 books 视图路由 |

## 依赖
- `epubjs ^0.3.93`（已安装，后续 EPUB 阅读器视图使用）

## 后续迭代
- EPUB 阅读器视图（集成 epubjs 渲染引擎）
- 封面和元数据自动提取
- 拖拽上传支持
- 书籍高亮与笔记
