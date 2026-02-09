# Content Parser Service (ZYB-129)

## 概述

使用 `@postlight/parser` 实现文章全文提取，通过 IPC 通道供渲染进程调用。

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/main/services/parser-service.ts` | 新增 parser 服务 |
| `src/shared/ipc-channels.ts` | 新增 `ARTICLE_PARSE_CONTENT` 通道 |
| `src/shared/types.ts` | ElectronAPI 新增 `articleParseContent` |
| `src/main/ipc/article-handlers.ts` | 新增解析 handler |
| `src/preload.ts` | 新增 preload 桥接 |

## 使用方式

渲染进程调用：

```typescript
const article = await window.electronAPI.articleParseContent(articleId);
```

流程：
1. 根据 `id` 从数据库获取文章
2. 使用 `@postlight/parser` 解析文章 URL 获取全文
3. 更新数据库中的 `content`、`contentText`、`wordCount`、`readingTime`、`thumbnail`
4. 返回更新后的文章对象

## 注意事项

- 解析失败返回 `null`（优雅降级）
- `thumbnail` 仅在文章尚无缩略图时从 `leadImageUrl` 填充
- 阅读时间按 200 词/分钟计算，最低 1 分钟
