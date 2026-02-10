# Web Highlighter 浏览器扩展

**Linear Issue**: [ZYB-154](https://linear.app/zybwork/issue/ZYB-154)

## 概述

实现 Chrome 浏览器扩展，在任意网页上划线高亮并保存到 Z-Reader。通过 HTTP API 与 Electron 主进程通信。

## 架构

```
Chrome 扩展 (Content Script)
    ↓ HTTP REST API
Z-Reader Electron 主进程 (api-server.ts, 端口 21897)
    ↓ Drizzle ORM
SQLite 数据库 (articles + highlights 表)
```

## Z-Reader HTTP API Server

**文件**: `src/main/services/api-server.ts`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 连通性检查 |
| `/api/articles` | POST | 保存文章（URL 去重，后台异步解析） |
| `/api/highlights?url=xxx` | GET | 按文章 URL 查询所有高亮 |
| `/api/highlights` | POST | 创建高亮 |
| `/api/highlights/:id` | PUT | 更新高亮（笔记/颜色） |
| `/api/highlights/:id` | DELETE | 删除高亮（软删除） |

- 端口: `21897`，仅监听 `127.0.0.1`
- CORS 全开放（允许 Chrome 扩展跨域）
- 使用 Node.js 原生 `http` 模块，无新依赖

## Chrome 扩展

**目录**: `extensions/chrome-highlighter/`

### 文件结构

| 文件 | 说明 |
|------|------|
| `manifest.json` | Manifest V3 配置 |
| `build.mjs` | esbuild 打包脚本 |
| `src/api.ts` | HTTP API 通信层 |
| `src/content.ts` | Content Script 入口（选中监听、高亮流程） |
| `src/highlighter.ts` | DOM 高亮渲染引擎（创建 + 恢复 + 删除） |
| `src/toolbar.ts` | 浮动工具栏（4 色高亮 + 笔记 + 保存） |
| `src/background.ts` | Service Worker（右键菜单） |
| `src/popup.ts` | 弹窗逻辑（连接状态、保存页面） |
| `src/styles.css` | 注入页面的高亮/工具栏样式 |

### 核心功能

1. **选中文本高亮**: 选中文本后弹出工具栏，支持 4 色高亮（黄/蓝/绿/红）
2. **添加笔记**: 高亮时可附加笔记
3. **保存文章**: 自动或手动保存网页到 Z-Reader articles 表
4. **持久化渲染**: 重新访问页面时通过文本匹配恢复已有高亮
5. **右键菜单**: 右键保存页面 / 高亮选中文本
6. **Popup**: 显示与 Z-Reader 的连接状态

### 开发命令

```bash
cd extensions/chrome-highlighter
pnpm install
pnpm run build      # 构建
pnpm run watch      # 开发模式
```

### 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extensions/chrome-highlighter/` 目录

## 修改的文件

| 文件 | 变更 |
|------|------|
| `src/main.ts` | 启动/停止 API Server |
| `src/main/services/api-server.ts` | 新增 HTTP API Server |
