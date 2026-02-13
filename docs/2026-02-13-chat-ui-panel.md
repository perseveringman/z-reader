# Chat UI 组件 - ChatPanel 对话界面

## Linear Issue
- ZYB-201: Chat UI 组件 - ChatPanel 对话界面

## 概述
实现 AI Chat 对话 UI 组件 `ChatPanel`，替换 `DetailPanel` 中的 Chat 占位符，提供完整的对话交互功能。

## 实现内容

### 新增文件
- `src/renderer/components/ChatPanel.tsx` - 对话 UI 组件

### 修改文件
- `src/renderer/components/DetailPanel.tsx` - 引入 ChatPanel 替换占位符
- `src/locales/zh.json` - 新增 `chat.*` 翻译键
- `src/locales/en.json` - 对应英文翻译

## ChatPanel 功能

### 消息展示
- 用户消息：右对齐，蓝色背景 (`bg-blue-600`)
- AI 消息：左对齐，深色背景 (`bg-[#1a1a1a]`)，支持简单 Markdown 渲染
- 消息列表自动滚动到底部

### 流式回复
- 打字机效果：蓝色光标动画 (`animate-pulse`)
- 思考状态：显示加载动画 + "思考中..." 文字
- 使用 `useRef` 保存 `toolCalls` 最新值避免 `useEffect` 依赖循环

### Tool Calling 展示
- 折叠式显示工具调用信息
- 流式阶段默认展开，完成后默认折叠
- 显示工具名称、参数 JSON、结果（截断超过 200 字符）

### 会话管理
- 顶部会话管理栏：会话列表下拉 + 新建会话按钮
- 按 articleId 自动创建或恢复会话
- 支持切换会话、删除会话
- 点击外部自动关闭下拉列表

### Markdown 渲染
使用简单正则 + `dangerouslySetInnerHTML`，不引入 react-markdown：
- `**bold**` -> `<strong>`
- `` `code` `` -> `<code>`
- 代码块 -> `<pre><code>`
- `- list items` -> `<ul><li>`
- HTML 转义防 XSS

### 错误处理
- API Key 未配置：显示提示引导用户到偏好设置
- 加载中状态：Loader2 动画
- 错误消息：红色提示条

## i18n 键
```json
"chat": {
  "title": "对话",
  "placeholder": "输入消息...",
  "send": "发送",
  "newSession": "新对话",
  "thinking": "思考中...",
  "toolCalling": "正在执行: {{name}}",
  "empty": "开始和 AI 聊天吧",
  "sessionList": "对话历史",
  "error": "发生错误，请重试"
}
```

## 技术细节

### DetailPanel 集成
Chat tab 使用 `-m-4` 负边距抵消父容器的 `p-4` 内边距，使 ChatPanel 占满整个内容区域并自行管理滚动。

### 流式监听
使用 `window.electronAPI.aiChatOnStream` 注册监听器，返回取消订阅函数，在组件卸载时自动清理防止内存泄漏。

### 依赖关系
- 依赖 Task 1-4 中实现的 IPC 通道 (`aiChatSend`, `aiChatOnStream`, `aiChatSession*`)
- 使用 `shared/types.ts` 中的 `ChatMessage`, `ChatSession`, `ChatStreamChunk` 类型
