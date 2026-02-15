# iCloud 同步功能 — 实现文档

## 概述

通过 iCloud Drive 实现多 Mac 设备间的 Z-Reader 数据同步。采用 **iCloud Drive 文件同步 + SQLite 变更日志** 架构，本地 SQLite 保持不变，通过 JSONL 变更日志文件实现增量同步。

## 架构

```
本地 SQLite ←→ 同步引擎 ←→ iCloud Drive 目录 ←(iCloud 自动同步)→ 其他设备
```

### iCloud Drive 目录

**实际使用路径**：`~/Library/Mobile Documents/com~apple~CloudDocs/Z-Reader/`

> 设计文档原定使用 `iCloud~com~z-reader` 容器目录，但该目录需要 Apple Developer 签名才能创建。当前阶段改用 iCloud Drive 公共目录 `com~apple~CloudDocs` 下的 `Z-Reader` 子目录，后续签名后可切换回容器目录。

```
~/Library/Mobile Documents/com~apple~CloudDocs/Z-Reader/
├── devices/{deviceId}.json
├── changelog/{deviceId}/2026-02-15T10-00-00.jsonl
├── snapshots/latest-{deviceId}.json
├── files/books/
├── files/podcasts/
└── meta.json
```

## 模块清单

```
src/main/services/sync/
├── device-identity.ts      # 设备标识（UUID v4，持久化到 Application Support）
├── icloud-detector.ts      # iCloud 可用性检测 + 目录结构创建
├── sync-tables.ts          # sync_changelog / sync_cursors / sync_conflicts 表
├── change-tracker.ts       # trackChange() 变更追踪
├── changelog-writer.ts     # 写入 JSONL 文件（按小时分片、per-device 目录）
├── changelog-reader.ts     # 基于游标增量读取其他设备变更
├── merge-strategy.ts       # 字段级合并策略
├── snapshot-manager.ts     # 全量快照创建/导入
└── sync-engine.ts          # 组合所有子模块：push/pull/syncNow/getStatus
```

### 被修改的已有文件

| 文件 | 改动内容 |
|------|---------|
| `src/main/db/index.ts` | 导入 `initSyncTables`，在 `initTables()` 末尾初始化同步表 |
| `src/main.ts` | 导入 `initSyncOnStartup`，在 `createWindow()` 后调用 |
| `src/main/ipc/index.ts` | 注册 `registerSyncHandlers` |
| `src/shared/ipc-channels.ts` | 新增 5 个 SYNC_* 通道 |
| `src/shared/types.ts` | 新增 `SyncStatus`、`SyncDevice` 接口，`AppSettings` 增加 sync 字段 |
| `src/preload.ts` | 新增 5 个 sync API 桥接方法 |
| `src/renderer/components/PreferencesDialog.tsx` | 新增同步设置面板 |
| `src/renderer/components/preferences-layout.ts` | 新增 `sync` section |
| `src/locales/zh.json` / `en.json` | 新增 `sync.*` i18n 键 |
| `src/main/ipc/feed-handlers.ts` | 4 处 trackChange 注入 |
| `src/main/ipc/article-handlers.ts` | 7 处 trackChange 注入 |
| `src/main/ipc/highlight-handlers.ts` | 5 处 trackChange 注入 |
| `src/main/ipc/tag-handlers.ts` | 4 处 trackChange 注入 |
| `src/main/ipc/book-handlers.ts` | 4 处 trackChange 注入 |
| `src/main/ipc/transcript-handlers.ts` | 2 处 trackChange 注入 |
| `src/main/ipc/highlight-tag-handlers.ts` | 2 处 trackChange 注入 |

## 关键设计决策

### 1. 变更追踪方式

在每个 IPC handler 的写操作后显式调用 `getGlobalTracker()?.trackChange()`，而非使用 SQLite 触发器。原因：
- 触发器无法获取业务上下文（如哪些字段变更了）
- 显式调用更可控，避免同步变更产生回声

### 2. 合并策略（字段级）

| 字段类型 | 策略 | 示例 |
|---------|------|------|
| 进度类 | 取最大值 | `readProgress` |
| 状态类 | 优先级比较 | `readStatus`: archive > later > inbox |
| 布尔标记 | OR 合并 | `isShortlisted`、`deletedFlg` |
| 普通字段 | last-write-wins | `title`、`content`、`note` 等 |

### 3. iCloud 目录选择

- `iCloud~com~z-reader` 容器：需要 Apple Developer 签名 → 后续签名后启用
- `com~apple~CloudDocs/Z-Reader` 公共目录：无需签名，当前阶段使用
- `~/Library/Mobile Documents/` 目录本身在 macOS 上是只读的（`dr-x------`），只检查 `R_OK`

### 4. SQL 注入防护

远程 changelog 中的字段名来自其他设备，需要校验。在 `sync-engine.ts` 中使用列名白名单正则：

```typescript
const VALID_COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
```

### 5. 排除同步的表

`app_tasks`、`notifications`、`downloads`、`sync_changelog`、`sync_cursors`、`sync_conflicts` — 这些表的数据是设备本地的，不参与跨设备同步。

## 同步流程

### 启动

1. `src/main.ts` → `initSyncOnStartup()` → 检查 electron-store 中 `syncEnabled` 标记
2. 若已启用，初始化 `SyncEngine` 实例，启动 60 秒轮询拉取循环
3. 全局 `ChangeTracker` 实例注入到各 IPC handler 中

### 推送（Push）

1. IPC handler 写操作 → `trackChange()` 写入 `sync_changelog` 表
2. `SyncEngine.push()` → 查询未同步记录 → `ChangelogWriter.write()` 追加到 JSONL 文件
3. 标记已推送记录为 `synced = 1`

### 拉取（Pull）

1. 60 秒定时器 → `SyncEngine.pull()`
2. `ChangelogReader.readSince(cursor)` → 读取其他设备 changelog 目录
3. 逐条通过 `MergeStrategy` 合并到本地数据库
4. 更新 `sync_cursors` 游标位置

### 新设备加入

1. 生成 deviceId → 注册到 `devices/` 目录
2. `SnapshotManager` 查找最新快照 → 导入到本地数据库
3. 从快照时间戳开始消费 changelog
4. 生成自己的全量快照

## Commit 历史

| Commit | 说明 |
|--------|------|
| `76dd287` | docs: iCloud 同步设计文档 |
| `9363113` | docs: iCloud 同步实施计划 |
| `3bdece8` | feat(sync): 设备标识模块 |
| `5d67132` | feat(sync): iCloud 目录检测与管理 |
| `bc34fdb` | feat(sync): 新增同步表 |
| `a4af070` | feat(sync): 变更追踪器 |
| `32a96d4` | feat(sync): Changelog 写入器 |
| `b718a21` | feat(sync): Changelog 读取器 |
| `49de78b` | feat(sync): 字段级合并策略 |
| `14e1589` | feat(sync): 快照管理器 |
| `f790ea3` | feat(sync): 同步引擎 |
| `e854606` | feat(sync): IPC handlers + Preload + 类型定义 |
| `a081467` | feat(sync): 偏好设置同步面板 UI |
| `e3ad8dc` | feat(sync): IPC handlers 注入变更追踪 |
| `227834f` | feat(sync): 启动自动初始化同步 + changelog 清理 |
| `208319f` | fix(sync): 修复代码审查发现的 CRITICAL 问题 |
| `a5628fd` | fix(sync): require 改为 ESM import 修复 Vite 打包 |
| `be1977e` | fix(sync): iCloud 可用性检测改为只检查可读性 |
| `67af537` | fix(sync): 使用 iCloud Drive 公共目录替代 iCloud 容器 |

## 运行时问题与修复

### 1. Vite 打包无法解析 `require()`

- **现象**：`Cannot find module '../services/sync/sync-tables'`
- **原因**：`src/main/db/index.ts` 使用了 CJS `require()`，Vite 打包时未处理
- **修复**：改为 ESM `import` 静态导入

### 2. iCloud 可用性误判

- **现象**：启动后显示"iCloud Drive 不可用，请登录 iCloud"
- **原因**：`~/Library/Mobile Documents/` 在 macOS 上权限为 `dr-x------`，`W_OK` 检查失败
- **修复**：`checkICloudAvailability` 只检查 `R_OK`，写入操作发生在子目录中

### 3. iCloud 容器目录创建失败

- **现象**：`EACCES: permission denied, mkdir 'iCloud~com~z-reader'`
- **原因**：`iCloud~` 前缀的容器目录只能由 Apple Developer 签名的应用创建
- **修复**：改用 `com~apple~CloudDocs/Z-Reader` 公共目录

## 待后续迭代（V2）

以下为代码审查中发现的 IMPORTANT 级别改进项，不影响当前功能，留待后续版本：

| 项目 | 说明 |
|------|------|
| Changelog 文件原子写入 | 使用 write-then-rename 防止写入中断导致文件损坏 |
| syncNow 并发互斥锁 | 防止多次快速点击"立即同步"产生并发 |
| Insert 操作 changedFields 完整性 | 部分 insert 的 changedFields 只包含关键字段，理想情况应包含全部字段 |
| 设备标识随机因子 | 当前纯 UUID v4，可增加主机名 hash 等信息辅助调试 |
| UI 同步面板 i18n | 部分文案硬编码中文，应使用 `t()` 函数 |
| ARTICLE_PARSE_CONTENT 变更追踪 | 正文解析更新 content/wordCount 等字段时未追踪变更 |
| Apple Developer 签名 | 签名后可切换回 `iCloud~com~z-reader` 容器目录，获得更好的隔离性 |
| fs.watch 实时监听 | 当前仅使用 60 秒轮询，后续可增加 `fs.watch` 加速拉取 |

## 相关文档

- 设计文档：`docs/plans/2026-02-15-icloud-sync-design.md`
- 实施计划：`docs/plans/2026-02-15-icloud-sync-implementation-plan.md`
