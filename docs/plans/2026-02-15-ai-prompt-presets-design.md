# AI 快捷提示词中心设计（ai_prompt_presets）

## 背景

当前 AI 会话只提供 5 个前端硬编码的内置提示词（分析框架），无法由用户自定义，也无法复用于其他 AI 场景。该实现满足了初期可用性，但在扩展性上存在明显限制：新增场景需要重复定义提示词，提示词生命周期（创建、编辑、启用、排序、复用）缺乏统一治理能力。

本设计目标是将“快捷提示词”升级为可复用的系统能力：建立独立数据表作为提示词中心，支持用户完全自定义，并提供“按场景选择展示项”的控制能力。AI 会话（Chat）是第一批接入场景，但架构需要天然支持未来在摘要、翻译、标签、工作流等能力中复用。

## 已确认产品决策

- 生效范围：全局生效（一次配置，全局可用）
- 定制模式：完全自定义
- 默认模板：提供 5 个默认项，可选可不选，可删除
- 管理入口：仅在「偏好设置 > AI」统一管理
- 展示顺序：由用户拖拽排序决定
- 存储方案：独立表 `ai_prompt_presets`，不与 settings/aiConfig 耦合

## 目标与非目标

### 目标

- 建立独立提示词模型与 CRUD 能力
- 允许默认项与自定义项统一管理
- 支持“是否展示”与“展示到哪些场景”的精细控制
- Chat 页面只消费“目标场景 + 已启用 + 排序后”提示词
- 为后续多场景接入提供稳定扩展点

### 非目标

- 本期不实现提示词版本历史
- 本期不实现云同步冲突合并策略（沿用本地最后写入）
- 本期不实现跨用户共享模板市场

## 数据模型

新增表：`ai_prompt_presets`

```sql
CREATE TABLE IF NOT EXISTS ai_prompt_presets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  targets_json TEXT NOT NULL,         -- JSON array, e.g. ["chat"]
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_presets_enabled ON ai_prompt_presets(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_presets_order ON ai_prompt_presets(display_order);
```

字段说明：

- `title`：展示名称
- `prompt`：发送给模型的完整提示词
- `enabled`：是否启用（用于“显示/隐藏”）
- `display_order`：用户拖拽后持久化顺序
- `targets_json`：目标场景集合，例如 `["chat"]`，后续可扩展 `["chat","summarize"]`
- `is_builtin`：是否系统默认模板（用于恢复默认模板等能力）

类型约束建议：

- `title`: 1~40 字符
- `prompt`: 1~2000 字符
- `targets_json`: 非空数组，元素属于受支持目标枚举

## 默认模板策略

系统内置 5 个默认模板（沿用现有框架：价值澄清、六顶思考帽、第一性原理、苏格拉底提问、费曼教学法），但不再前端硬编码渲染。

初始化策略：

- 懒初始化：读取提示词列表时，若表为空则一次性写入 5 个默认模板
- 允许删除与停用内置项
- 提供“恢复默认模板”操作：补齐缺失内置项，不覆盖用户已编辑项

该策略既满足“可选可不选”，又保留可恢复能力。

## IPC 与主进程接口

新增 IPC 通道（建议）：

- `ai:promptPreset:list`
- `ai:promptPreset:create`
- `ai:promptPreset:update`
- `ai:promptPreset:delete`
- `ai:promptPreset:reorder`
- `ai:promptPreset:resetBuiltins`

核心语义：

- `list` 支持过滤参数：`target?: string`, `enabledOnly?: boolean`
- `update` 支持局部更新：标题、内容、启用状态、targets
- `reorder` 接收 `[{id, displayOrder}]` 批量更新，确保排序原子性
- 所有写操作均执行参数校验，失败返回可读错误

## 前端交互设计

### 设置页（唯一管理入口）

在「偏好设置 > AI」新增“快捷提示词”子页，提供：

- 列表展示（标题、目标场景、启用开关、内置标识）
- 新增提示词
- 编辑标题与 prompt
- 删除提示词（包含内置项）
- 勾选目标场景（当前至少 `chat`）
- 拖拽排序（落库 `display_order`）
- 恢复默认模板

### Chat 页消费规则

- 不再维护硬编码 5 项
- 读取：`list({ target: 'chat', enabledOnly: true })`
- 空状态卡片与会话中 pills 共用同一数据源
- 若读取失败或列表为空：降级为普通输入引导，不阻断聊天

## 数据流

```text
Preferences(AI Prompt Presets)
  -> IPC CRUD/Reorder
  -> ai_prompt_presets

ChatPanel open
  -> list(target=chat, enabledOnly=true)
  -> render EmptyState + Pills
  -> click preset -> send preset.prompt
```

排序与状态一致性：

- 设置页拖拽后一次提交 `reorder`
- 聊天页每次进入/切换会话时刷新列表
- 如需实时性可在后续迭代加入事件广播

## 错误处理与边界策略

- 输入校验失败：前端即时提示 + 阻止提交
- IPC 写入失败：设置页回滚本地乐观更新，并 toast 错误
- 并发更新：采用最后写入生效；`reorder` 使用事务式批量更新避免顺序错乱
- 无可用提示词：聊天页不报错，仅隐藏快捷提示区
- 内置项删除后可通过“恢复默认模板”补齐

## 测试策略

单元测试（main）：

- `ai_prompt_presets` CRUD
- `targets_json` 校验与过滤
- `reorder` 原子更新与顺序正确性
- `resetBuiltins` 补齐逻辑

组件测试（renderer）：

- 设置页新增/编辑/删除/开关/拖拽排序
- Chat 页仅渲染 `target=chat && enabled=true` 项
- 空列表与加载失败降级行为

回归测试：

- 旧版本升级后首次进入 AI 功能，默认 5 项自动初始化
- 删除全部提示词后聊天仍可正常发送自由输入

## 实施计划（高层）

1. 数据层：新增表与访问层方法（含默认模板初始化）
2. IPC 层：新增 prompt preset 通道与参数类型
3. 预加载/类型：暴露 `electronAPI` 新方法
4. 设置页：新增“快捷提示词”管理界面
5. Chat 页：替换硬编码 preset 为动态读取
6. 测试与回归

## 验收标准

- 用户可在设置页完全管理提示词
- 默认 5 项存在但可不选、可删除、可恢复
- Chat 页展示内容严格由设置页控制
- 排序与启用状态在重启后保持
- 不依赖 `ai_settings` 键值配置即可运行
