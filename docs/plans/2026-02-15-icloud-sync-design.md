# iCloud 同步设计

## 目标

通过 iCloud Drive 实现多 Mac 设备间的数据同步，同时提供自动备份能力，并为未来跨平台（iOS/iPadOS）打下基础。

## 方案选型

采用 **iCloud Drive 文件同步 + SQLite 变更日志** 方案。

- 本地 SQLite 数据库保持不变，避免 iCloud 直接同步 SQLite 文件导致的数据损坏风险
- 通过 iCloud Drive 目录下的 JSONL 变更日志文件实现增量同步
- 大文件（电子书、音频）可选放入 iCloud Drive 目录

放弃的方案：
- **直接同步 SQLite 文件**：iCloud 无法保证 WAL 模式下多文件的原子同步，Apple 官方明确不推荐
- **CloudKit 原生 API**：需要 Objective-C/Swift native module + Apple Developer 账号，Electron 社区支持极差

## 架构

```
本地 SQLite ←→ 同步引擎 ←→ iCloud Drive 目录 ←(iCloud 自动同步)→ 其他设备
```

### iCloud Drive 目录结构

```
~/Library/Mobile Documents/iCloud~com~z-reader/
├── devices/
│   ├── {deviceId}.json              # 设备注册信息
│   └── ...
├── changelog/
│   ├── {deviceId}/
│   │   ├── 2026-02-15T10-00-00.jsonl  # 变更日志（按小时分片）
│   │   └── ...
│   └── ...
├── snapshots/
│   ├── latest-{deviceId}.json       # 全量快照（用于新设备首次同步）
│   └── ...
├── files/                           # 可选：大文件同步
│   ├── books/
│   │   ├── {bookId}.epub
│   │   └── ...
│   └── podcasts/
│       ├── {articleId}.mp3
│       └── ...
└── meta.json                        # 同步元数据（版本号、格式版本等）
```

### 设备标识

每台设备首次启动时生成唯一 `deviceId`（UUID v4），存储在本地 `Application Support/z-reader-device.json`，不放在 iCloud 目录中。

## 同步范围

| 数据类型 | 默认同步 | 可选 | 说明 |
|---------|---------|------|------|
| feeds（订阅源） | 是 | - | 结构化数据 |
| articles（文章元数据+正文） | 是 | - | 含 contentText、AI 摘要等 |
| highlights（高亮批注） | 是 | - | |
| tags + 关联表 | 是 | - | |
| transcripts（转写文本） | 是 | - | JSON 格式 |
| ai_settings | 是 | - | 键值对 |
| ai_task_logs | 是 | - | AI 对话/摘要记录 |
| app_tasks | 否 | - | 本地任务状态 |
| notifications | 否 | - | 本地通知 |
| downloads | 否 | - | 各设备独立 |
| 电子书文件（EPUB/PDF） | 否 | 是 | 用户设置中开启 |
| 播客音频文件 | 否 | 是 | 用户设置中开启 |
| 设置文件 | 否 | 是 | 含敏感信息，默认不同步 |

## 变更追踪

### 本地 changelog 表

```sql
CREATE TABLE sync_changelog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,         -- 'insert' | 'update' | 'delete'
  changed_fields TEXT,             -- JSON
  timestamp TEXT NOT NULL,         -- ISO-8601 精确到毫秒
  synced INTEGER DEFAULT 0        -- 0=未推送, 1=已推送
);
```

### 消费位置记录

```sql
CREATE TABLE sync_cursors (
  device_id TEXT PRIMARY KEY,
  last_file TEXT,
  last_id INTEGER,
  updated_at TEXT
);
```

### JSONL 日志格式

```jsonl
{"id":1,"deviceId":"abc-123","table":"articles","recordId":"art-456","op":"update","fields":{"readProgress":0.5},"ts":"2026-02-15T10:30:00.123Z"}
```

- 按小时分片文件，每台设备写自己的目录
- 变更追踪通过封装 `trackChange()` 函数注入现有 IPC handler

### 推送/拉取节奏

- **推送**：每次本地写操作后实时追加到 JSONL 文件，30 秒批量兜底
- **拉取**：60 秒轮询其他设备 changelog 目录，`fs.watch` 监听作为加速手段

## 冲突解决

偶尔并发场景，采用字段级 last-write-wins + 语义合并：

| 字段类型 | 策略 |
|---------|------|
| `readProgress` | 取最大值 |
| `readStatus` | 优先级：archive > later > inbox > unseen |
| `isShortlisted` | OR 合并（任一为 1 则为 1） |
| `deletedFlg` | OR 合并 |
| 高亮/批注 | 仅新增不覆盖，同 ID 的 note 取最新 |
| 标签关联 | 并集合并 |
| 普通文本字段 | last-write-wins |

### 合并流程

1. 收到其他设备变更，按 timestamp 排序
2. 逐条查本地记录当前值和是否有更晚的本地变更
3. 按字段级合并规则处理
4. 合并产生的变更不生成新 changelog（避免回声）

### 冲突记录（防御性）

```sql
CREATE TABLE sync_conflicts (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_value TEXT,
  remote_value TEXT,
  resolved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
```

## 首次同步与新设备加入

### 全量快照

- 开启同步时生成全量快照写入 `snapshots/latest-{deviceId}.json`
- 每天最多更新一次快照，只保留最新一份
- changelog 文件保留 30 天，超过自动清理

### 新设备流程

1. 生成 deviceId → 注册到 `devices/`
2. 找到最新快照 → 导入到本地数据库
3. 从快照时间戳开始消费所有 changelog
4. 生成自己的全量快照

### iCloud 可用性检测

- 检查 `~/Library/Mobile Documents/` 可访问性
- 不可用时同步功能灰显，不影响本地使用

## 模块划分

```
src/main/services/sync/
├── sync-engine.ts          # 同步引擎主入口
├── change-tracker.ts       # 变更追踪 trackChange()
├── changelog-writer.ts     # 写入 iCloud JSONL 文件
├── changelog-reader.ts     # 读取其他设备变更
├── merge-strategy.ts       # 合并规则定义与执行
├── snapshot-manager.ts     # 快照生成、导入、清理
├── icloud-detector.ts      # iCloud 可用性检测
└── device-identity.ts      # 设备标识管理
```

### 对现有代码改动

1. **IPC handlers**：写操作后调用 `trackChange()`，通过高阶函数封装减少侵入
2. **数据库 schema**：新增 `sync_changelog`、`sync_cursors`、`sync_conflicts` 三张表
3. **Preload**：新增 `window.electronAPI.sync` 模块（getStatus, enable, disable, syncNow, getDevices, getConflicts）

### 文件监听

使用 `fs.watch` 监听 iCloud Drive 目录变更，定时轮询（60 秒）作为兜底。不引入 native module。

### 错误处理

- iCloud 不可用：变更继续写入本地，恢复后补推
- 写入失败：重试 3 次，失败后通知用户
- 合并异常：记录到 sync_conflicts，不阻塞其他变更
- 原则：同步故障不影响本地正常使用

## UI 设计

### 偏好设置 - 同步板块

- 总开关：启用/禁用 iCloud 同步
- 同步内容勾选：结构化数据（默认开）、电子书文件（默认关）、播客音频（默认关）
- 已连接设备列表
- 同步状态显示（最近同步时间）
- 操作按钮：立即同步、重置同步数据

### 状态栏指示

侧边栏底部简洁显示：同步中（旋转图标）/ 已同步（对勾）/ 失败（警告）/ 不可用（灰色）

### 不做的 UI

- 冲突手动解决界面（YAGNI）
- 同步历史日志查看（YAGNI）
- 单条记录级别同步控制（YAGNI）
