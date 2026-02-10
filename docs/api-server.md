# HTTP API Server

> Linear Issue: [ZYB-153](https://linear.app/zybwork/issue/ZYB-153)

## 概述

在 Electron 主进程中创建 HTTP API Server，监听端口 `21897`，供 Chrome 扩展通过 REST API 与 Z-Reader 交互。使用 Node.js 原生 `http` 模块，未引入新依赖。

## 文件

- `src/main/services/api-server.ts` — API Server 实现
- `src/main.ts` — 在 `app.on('ready')` 中启动，`app.on('will-quit')` 中停止

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 连通性检查，返回 `{ status: "ok", version: "1.0.0" }` |
| POST | `/api/articles` | 保存文章（URL 去重），后台异步解析补充内容 |
| POST | `/api/highlights` | 创建高亮 |
| GET | `/api/highlights?url=xxx` | 按文章 URL 查询所有高亮 |
| PUT | `/api/highlights/:id` | 更新高亮（note/color） |
| DELETE | `/api/highlights/:id` | 删除高亮（软删除） |

## CORS 配置

允许所有来源的跨域请求，支持 OPTIONS 预检：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## 设计要点

1. **文章去重**: `POST /api/articles` 先查询 URL 是否已存在，已存在则直接返回
2. **异步解析**: 创建文章后，后台异步调用 `parseArticleContent` 补充正文、字数、阅读时间等信息
3. **复用数据库逻辑**: 直接使用 Drizzle ORM 操作，与 IPC handler 保持一致的模式
4. **端口固定**: `21897`，Chrome 扩展写死此端口
5. **监听地址**: `127.0.0.1`，仅本机可访问
