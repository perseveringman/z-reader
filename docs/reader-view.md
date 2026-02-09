# ReaderView 沉浸式阅读组件

**Linear Issue**: [ZYB-130](https://linear.app/zybwork/issue/ZYB-130/readerview-沉浸式阅读组件)

## 概述

ReaderView 是一个全屏覆盖组件，提供沉浸式文章阅读体验，灵感来自 Readwise Reader。

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/components/ReaderView.tsx` | 新增 | 阅读器组件 |
| `src/index.css` | 修改 | 新增 `.article-content` 排版样式 |
| `src/shared/ipc-channels.ts` | 修改 | 新增 `ARTICLE_PARSE_CONTENT` 通道 |
| `src/shared/types.ts` | 修改 | ElectronAPI 新增 `articleParseContent` 方法 |
| `src/preload.ts` | 修改 | 新增 `articleParseContent` 桥接 |
| `src/main/ipc/article-handlers.ts` | 修改 | 新增解析 handler，按需调用 @postlight/parser |

## 使用方式

```tsx
import { ReaderView } from './components/ReaderView';

// 在父组件中条件渲染
{readerArticleId && (
  <ReaderView
    articleId={readerArticleId}
    onClose={() => setReaderArticleId(null)}
  />
)}
```

## 数据流

1. 组件挂载 → `articleGet(id)` 获取文章基本信息
2. 同时通过 `feedList()` 查找对应 Feed 名称用于面包屑
3. 若文章 `content` 为空，自动调用 `articleParseContent(id)` 按需解析
4. 解析结果写入 SQLite，下次打开无需重复解析

## 快捷键

- `ESC` → 关闭阅读器

## 样式说明

`.article-content` 类在 `src/index.css` 中定义，覆盖所有常见 HTML 元素：p, h1-h6, a, img, blockquote, code, pre, ul, ol, table, hr, figure/figcaption。
