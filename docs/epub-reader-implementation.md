# EPUB 阅读器实现文档

## 概述

使用 epubjs 库实现了完整的 EPUB 阅读器组件，支持渲染、目录导航、进度追踪、排版设置、高亮标注等功能。

## 修改文件

- `src/renderer/components/EpubReader.tsx` — 完整实现 EPUB 阅读器
- `src/renderer/components/BookReaderView.tsx` — 添加 ref 支持 TOC/高亮导航

## 功能清单

### 1. EPUB 渲染
- 使用 `ePub(filePath)` 加载文件（支持 `file://` 协议）
- 使用滚动模式 `flow: 'scrolled'` 渲染
- 支持恢复上次阅读位置（`initialLocation`）

### 2. 目录导航
- 从 `book.navigation.toc` 提取 NavItem 并转换为 TocItem 格式
- 通过 `forwardRef` + `useImperativeHandle` 暴露 `navigateTo(href)` 方法
- BookReaderView 通过 `readerRef` 调用子组件导航

### 3. 进度追踪
- `book.locations.generate(1600)` 生成位置索引
- 监听 `rendition.on('relocated')` 事件获取百分比进度和 CFI 位置

### 4. 排版设置
- 字体、字号、行高、主题颜色实时响应 `settings` prop 变化
- 主题支持 dark/light/sepia 三种模式

### 5. 高亮标注
- 监听 `rendition.on('selected')` 事件，显示浮动颜色选择工具栏
- 支持 4 种颜色：yellow/blue/green/red
- 创建高亮后通过 `bookHighlightCreate` IPC 持久化
- 打开书籍时从 `highlights` prop 恢复已有高亮

### 6. 高亮导航
- BookReaderView 通过 `readerRef.navigateToHighlight(anchorPath)` 跳转到高亮位置

### 7. 键盘导航
- 左右方向键翻页

## 架构

```
BookReaderView
  ├── readerRef: BookReaderHandle
  ├── handleTocNavigate → readerRef.navigateTo(href)
  ├── handleHighlightNavigate → readerRef.navigateToHighlight(anchorPath)
  └── EpubReader (forwardRef)
       ├── useImperativeHandle → { navigateTo, navigateToHighlight }
       ├── epubjs Book + Rendition 实例 (useRef)
       └── 高亮浮动工具栏 (内部 state)
```

## 导出接口

```typescript
export interface BookReaderHandle {
  navigateTo: (href: string) => void;
  navigateToHighlight: (anchorPath: string) => void;
}
```

PdfReader 后续实现时也应遵循此接口。
