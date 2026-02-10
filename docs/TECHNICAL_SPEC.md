# Z-Reader 技术实现方案 (Technical Specification)

本项目旨在通过 Electron 实现一个对标 Readwise Reader 的本地优先 RSS 阅读器。

## 1. 技术栈选型 (Tech Stack)

*   **框架**: Electron + React + TypeScript
*   **构建工具**: Vite (Electron Forge)
*   **样式**: Tailwind CSS + Shadcn/UI (极简、高信噪比暗色主题设计)
*   **数据库**: SQLite (本地存储)
*   **ORM**: Drizzle ORM (类型安全、轻量、Local-first 友好)
*   **RSS 解析**: rss-parser
*   **正文提取**: @postlight/parser (或 mozilla/readability) - 用于从原始网页提取净值正文
*   **状态管理**: React Context / Jotai (轻量级原子状态)

## 2. 系统架构 (Architecture)

### 2.1 进程分工
*   **Main Process (主进程)**:
    *   管理 SQLite 数据库连接 (`better-sqlite3`)。
    *   执行 RSS 定时抓取与解析任务 (每15分钟增量拉取，缓存 Etag/Last-Modified)。
    *   处理文件系统操作 (OPML 导入/导出)。
    *   管理全局快捷键与系统托盘。
    *   管理窗口生命周期、全局菜单。
*   **Renderer Process (渲染进程)**:
    *   UI 渲染与交互 (三栏布局)。
    *   捕获视图内快捷键。
    *   通过 IPC 向主进程请求数据。
*   **Preload Script**:
    *   安全的 IPC 桥接，渲染进程通过 `window.electronAPI` 调用主进程方法。

### 2.2 Local-First 数据流
*   所有数据优先存储在本地 SQLite。
*   渲染进程不直接连接数据库，通过 `window.electronAPI` 调用主进程封装好的 `db` 方法。
*   预留 `updated_at` 和 `deleted_flg` 字段，为二期 CRDT 同步打下基础。

## 3. UI 布局与功能模块 (对齐 Readwise Reader)

### 3.1 整体布局：三栏式暗色主题

```
┌──────────┬─────────────────────┬──────────────────────┐
│ Sidebar  │   Content List      │   Detail Panel       │
│ (导航栏)  │   (内容列表)         │   (详情/笔记面板)     │
│ ~200px   │   ~350px            │   自适应剩余宽度       │
│ 可折叠    │                     │   可切换 Tab          │
└──────────┴─────────────────────┴──────────────────────┘
```

### 3.2 左侧导航栏 (Sidebar)

#### 顶部区域
- **应用 Logo / 名称**: Z-Reader 品牌标识
- **折叠/展开按钮**: 收起侧边栏仅显示图标
- **Save URL 按钮 (Link 图标)**: 手动保存 URL 到 Library
- **Add Feed 按钮 (+)**: 快速添加 RSS 订阅 URL

#### Library (高信噪比 - 用户策划内容)
用户主动添加或从 Feed 提升的文章，永久存储：
- **Inbox**: 新保存的未处理内容 (手动 URL 保存 / Feed 提升)
- **Later**: 用户标记稍后阅读的内容
- **Archive**: 已处理完毕的内容
- **Tags**: 标签管理与筛选

> 详见 [Library/Feed 二元分离架构](./library-feed-separation.md)

#### Feed (低信噪比 - RSS 自动抓取)
RSS 自动抓取的内容，轻量级两态管理：
- **Unseen**: 尚未浏览的新文章
- **Seen**: 已浏览过的文章 (hover 自动标记)
- **All Feeds**: 按订阅源浏览
- **[订阅源列表]**: 按分类展示各订阅源，带 Favicon

用户可将有价值的 Feed 文章通过 `B` 键或右键菜单"Save to Library"提升到 Library。

#### Pinned Views (固定视图 - 跨 Library/Feed 共享)
- **Shortlist**: 精选/收藏列表 (用户手动标记的高价值内容)
- **Trash**: 已删除内容，支持恢复

#### 底部操作区
- **Search (全局搜索)**: 打开全文搜索面板 (FTS5)
- **Preferences (设置)**: 应用配置 (主题、快捷键、抓取频率等)
- **User Profile**: 用户信息与数据统计

### 3.3 中间内容列表 (Content List)

#### 顶部导航栏
- **分类标题**: 当前所在区域 (Library / Feed / Shortlist / Trash / Tag)
- **状态切换 Tab (Library 视图)**: `INBOX` / `LATER` / `ARCHIVE` 三态切换
  - **Inbox (收件箱)**: 新保存的未处理内容
  - **Later (稍后读)**: 用户标记稍后阅读的内容
  - **Archive (已归档)**: 已处理完毕的内容
- **状态切换 Tab (Feed 视图)**: `UNSEEN` / `SEEN` 两态切换
  - **Unseen**: 尚未浏览的新文章
  - **Seen**: 已浏览过的文章
- **排序控制**: 按 `Date saved` / `Date published` 排序，支持升序/降序切换

#### 文章卡片 (Article Card)
每篇文章以卡片形式展示：
- **缩略图**: 文章封面图 (左侧或上方)
- **标题**: 文章标题 (粗体，单行截断)
- **摘要**: 正文前两行预览
- **元数据行**:
  - 网站 Favicon
  - 域名 (来源)
  - 作者名
  - 预估阅读时长 (如 "5 min left")
- **时间戳**: 右上角显示保存/发布时间
- **阅读进度条**: 选中条目底部显示紫色/蓝色进度条
- **选中态样式**: 左侧蓝色高亮边框 + 背景色加深
- **Hover 快捷操作**: 显示操作图标
  - `...` 更多操作
  - 移到 Inbox
  - 移到 Later (稍后读)
  - Archive (归档)

#### 底部状态栏
- 显示当前列表条目总数 (如 "Count: 42")

### 3.4 右侧详情面板 (Detail Panel)

#### Tab 切换
- **Info (详情)**: 文章元数据与摘要
- **Notebook (笔记本)**: 高亮与笔记汇总
- **Chat (对话)**: 预留 AI 对话接口 (二期实现)

#### Info Tab 内容
- **完整标题**: 文章全标题
- **来源链接**: 可点击跳转原文
- **作者信息**: 头像、姓名、社交账号 ID
- **Summary (摘要)**: 文章自动摘要 (一期使用 RSS 描述字段，二期接入 AI)
- **结构化 Metadata**:
  - Type: 内容类型 (Article)
  - Domain: 来源域名
  - Published: 发布日期
  - Length: 字数 & 预估阅读时长
  - Saved: 保存时间
  - Progress: 阅读进度百分比 & 剩余分钟
  - Language: 语言
- **Edit Metadata**: 手动编辑元数据按钮

#### Notebook Tab 内容
- 该文章所有高亮段落列表
- 每条高亮附带：颜色标记、笔记内容、创建时间
- 支持导出笔记 (Markdown 格式)

### 3.5 阅读视图 (Reader View)

从列表双击/回车进入沉浸阅读模式：
- **净化正文**: 使用 @postlight/parser 提取纯净正文
- **段落焦点**: 当前聚焦段落左侧显示蓝色焦点条
- **高亮交互**: 选中文本后弹出工具栏 (高亮颜色、添加笔记)
- **导航面包屑**: 顶部显示 Feed 名称 > 文章标题
- **返回列表**: ESC 或快捷键返回

## 4. 数据库建模 (Data Modeling - Drizzle)

### 核心表结构：

#### feeds 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| url | TEXT | RSS 订阅地址 |
| title | TEXT | 订阅源名称 |
| description | TEXT | 订阅源描述 |
| favicon | TEXT | 网站图标 URL |
| category | TEXT | 分类/分组 |
| etag | TEXT | HTTP Etag 缓存 |
| last_modified | TEXT | HTTP Last-Modified 缓存 |
| fetch_interval | INTEGER | 拉取间隔 (分钟，默认15) |
| last_fetched_at | TEXT | 上次抓取时间 |
| error_count | INTEGER | 连续错误计数 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| deleted_flg | INTEGER | 软删除标记 |

#### articles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| feed_id | TEXT | 外键关联 feeds |
| guid | TEXT | RSS 条目唯一标识 |
| url | TEXT | 原文链接 |
| title | TEXT | 文章标题 |
| author | TEXT | 作者 |
| summary | TEXT | 摘要/描述 |
| content | TEXT | 正文 HTML |
| content_text | TEXT | 正文纯文本 (用于 FTS) |
| thumbnail | TEXT | 封面图 URL |
| word_count | INTEGER | 字数 |
| reading_time | INTEGER | 预估阅读时长 (分钟) |
| language | TEXT | 语言 |
| published_at | TEXT | 发布时间 |
| saved_at | TEXT | 保存时间 |
| read_status | TEXT | Library: inbox / later / archive; Feed: unseen / seen |
| read_progress | REAL | 阅读进度 (0.0 ~ 1.0) |
| is_shortlisted | INTEGER | 是否加入 Shortlist |
| source | TEXT | 来源: library / feed (默认 feed) |
| domain | TEXT | 来源域名 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| deleted_flg | INTEGER | 软删除标记 |

#### highlights 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| article_id | TEXT | 外键关联 articles |
| text | TEXT | 高亮文本内容 |
| note | TEXT | 用户笔记 |
| color | TEXT | 高亮颜色 (yellow/blue/green/red) |
| start_offset | INTEGER | 起始偏移量 |
| end_offset | INTEGER | 结束偏移量 |
| paragraph_index | INTEGER | 段落索引 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| deleted_flg | INTEGER | 软删除标记 |

#### tags 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | 标签名 |
| parent_id | TEXT | 父标签 ID (嵌套标签) |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| deleted_flg | INTEGER | 软删除标记 |

#### article_tags 表 (多对多关联)
| 字段 | 类型 | 说明 |
|------|------|------|
| article_id | TEXT | 外键关联 articles |
| tag_id | TEXT | 外键关联 tags |
| created_at | TEXT | 创建时间 |

#### views 表 (自定义视图/过滤器)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | 视图名称 |
| filter_json | TEXT | 过滤条件 JSON |
| sort_field | TEXT | 排序字段 |
| sort_order | TEXT | asc / desc |
| is_pinned | INTEGER | 是否固定到侧边栏 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## 5. Feed-Library 二元架构与生命周期

### 架构说明

Z-Reader 采用 Library/Feed 二元分离架构，对齐 Readwise Reader 的核心设计：

- **Library（高信噪比）**: 用户主动策划的内容，支持 Inbox/Later/Archive 三态管理
- **Feed（低信噪比）**: RSS 自动抓取的内容，仅有 Unseen/Seen 两态

详见 [Library/Feed 二元分离架构](./library-feed-separation.md)

### 状态流转

```
                   ┌──────────────────┐
                   │    RSS 定时抓取   │
                   └────────┬─────────┘
                            │
                            ▼
                   Feed (Unseen)              用户手动保存 URL
                   source='feed'              Cmd+Shift+S
                            │                       │
              ┌─────────────┼──────────┐            │
              │             │          │            ▼
         hover/选中      按 B       按 D     Library (Inbox)
              │             │          │     source='library'
              ▼             ▼          ▼            │
         Feed (Seen)  Library (Inbox)  Trash   ┌────┼────┐
                            │                  │    │    │
                     ┌──────┼──────┐          按L  按E  按S
                     │      │      │           │    │    │
                    按L    按E    按S          ▼    ▼    ▼
                     │      │      │        Later Archive Shortlist
                     ▼      ▼      ▼
                  Later  Archive  Shortlist
```

- 所有状态变更支持 `Z` 撤销 (Undo Stack)
- Feed 文章保存到 Library 后从 Feed 视图消失（干净分离）
- Shortlist 和 Trash 跨 Library/Feed 共享

## 6. 键盘交互系统设计

### 6.1 全局焦点管理器
- 始终追踪当前选中的"段落"或"条目"
- 聚焦段落左侧显示蓝色焦点条 (Readwise 风格)

### 6.2 快捷键映射

#### 导航
| 快捷键 | 功能 |
|--------|------|
| `j` / `↓` | 下一项/下一段落 |
| `k` / `↑` | 上一项/上一段落 |
| `Home` | 跳到列表顶部 |
| `End` | 跳到列表底部 |
| `PageUp/PageDown` | 翻页 |
| `Enter` | 打开文章/进入阅读视图 |
| `ESC` | 返回列表/关闭面板 |
| `Tab` | 在三栏之间切换焦点 |

#### 内容操作
| 快捷键 | 功能 |
|--------|------|
| `E` | 归档 (Archive) — 仅 Library 视图 |
| `D` | 删除 (移入废纸篓) |
| `L` | 标记稍后阅读 (Later) — 仅 Library 视图 |
| `S` | 加入 Shortlist |
| `B` | 保存到 Library — 仅 Feed 视图 |
| `Z` | 撤销上一步操作 |
| `Shift + 方向键` | 批量选中 |
| `Ctrl/Cmd + E` | 批量归档 |
| `Ctrl/Cmd + D` | 批量删除 |

#### 阅读与笔记
| 快捷键 | 功能 |
|--------|------|
| `H` | 高亮当前聚焦段落 |
| `Shift + H` | 取消高亮 |
| `N` | 对高亮添加笔记 |

#### 全局
| 快捷键 | 功能 |
|--------|------|
| `/` | 全文搜索 |
| `Cmd/Ctrl + K` | 命令面板 (Command Palette) |
| `Cmd/Ctrl + ,` | 打开设置 |
| `Cmd/Ctrl + Shift + S` | 保存 URL 到 Library |
| `1` / `2` / `3` | Library: 切换 Inbox / Later / Archive; Feed: 切换 Unseen / Seen |

### 6.3 命令面板 (Command Palette)
- `Cmd/Ctrl + K` 呼出
- 支持模糊搜索所有可用操作
- 显示对应快捷键提示
- 支持自然语言搜索 (如输入 "archive" 显示归档操作)
- 用户可自定义快捷键映射

## 7. 搜索与数据组织

### 7.1 全文搜索 (SQLite FTS5)
- 索引字段: 标题、正文、作者、标签名
- 支持联合过滤: `in:inbox tag:tech type:article`
- 搜索结果高亮跳转

### 7.2 标签系统
- 支持嵌套标签 (树形结构)
- 通过命令面板快速添加/删除标签
- 标签支持颜色标记
- 侧边栏显示标签树

### 7.3 自定义视图 (Views)
- 基于过滤条件创建视图 (如 "本周未读技术文章")
- 视图可固定到侧边栏 Pinned 区域
- 支持保存排序偏好

## 8. 内容源接入与 RSS 解析

- **RSS/OPML 批量导入**: 支持标准 OPML 文件一键迁移；单 RSS URL 逐条添加
- **手动 URL 保存**: 通过 `Cmd+Shift+S` 或侧边栏按钮，将任意 URL 保存到 Library（使用 @postlight/parser 解析正文）
- **定时拉取**: 每15分钟增量拉取，缓存 Etag/Last-Modified 避免重复。新文章自动进入 Feed (source='feed', readStatus='unseen')
- **正文提取**: RSS 摘要不完整时，使用 @postlight/parser 抓取全文
- **解析失败降级**: 解析出错时降级为原文网页模式，用户可手动编辑元数据
- **Feed 健康监控**: 连续失败计数，超过阈值标记为异常并通知用户

## 9. 开发路线图 (Roadmap)

### Sprint 1: 基础设施与数据流 (当前阶段)
1. [x] 项目脚手架搭建 (Electron + Vite + React)
2. [ ] 数据库层实现: Drizzle + SQLite + 全部表结构
3. [ ] IPC 通信层: 主进程 ↔ 渲染进程 API 定义
4. [ ] RSS 抓取服务: 支持添加订阅、OPML 导入、定时解析入库
5. [ ] 基础三栏 UI 框架: 侧边栏导航 + 内容列表 + 详情面板
6. [ ] 文章卡片组件: 缩略图、标题、摘要、元数据、阅读进度
7. [ ] 状态切换: Inbox / Later / Archive 三态 Tab

### Sprint 2: 极致阅读体验 (已完成)
1. [x] 正文提取引擎 (@postlight/parser 集成)
2. [x] 沉浸阅读视图 (Reader View)
3. [x] 完整的键盘导航系统 (Vim-like)
4. [x] 焦点系统与段落级蓝色焦点条
5. [x] 高亮与批注功能 (多色高亮 + 笔记)
6. [x] 命令面板 (Command Palette)
7. [x] 操作撤销栈 (Undo Stack)
8. [x] Toast 操作反馈提示

### Sprint 3: 搜索与组织
1. [ ] SQLite FTS5 全文搜索
2. [ ] 标签系统 (嵌套标签树 + 多对多关联)
3. [ ] 自定义视图与过滤器
4. [ ] Shortlist (精选列表) 功能
5. [ ] Trash (废纸篓) 与恢复
6. [ ] 排序选项 (Date saved / Date published)
7. [ ] 性能优化 (虚拟列表、懒加载)
8. [ ] 笔记导出 (Markdown 格式)

### Sprint 4 (二期): 进阶功能
1. [ ] 多内容源扩展 (Newsletters, PDFs 等)
2. [ ] AI 摘要 / Ghostreader 对话 (Chat Tab)
3. [ ] CRDT 云端同步
4. [ ] 系统托盘集成
5. [ ] 自定义快捷键映射
6. [ ] 主题切换 (暗色/亮色)

## 10. 质量保证

- **性能基准**: 首次载入 < 2s，批量 Feed 处理 < 200ms，搜索响应 < 100ms
- **离线可用**: 断网状态下所有本地操作正常
- **数据安全**: 支持数据库手动导出/导入备份
