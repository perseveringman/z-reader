# 添加 RSS 订阅功能实现

## 概述

实现了 RSS 订阅添加的完整 UI 交互，用户现在可以通过图形界面添加 RSS 订阅源和导入 OPML 文件。

## 实现功能

### 1. 添加 Feed 对话框 (`AddFeedDialog.tsx`)

**功能特性**:
- 单个 RSS URL 添加
- 可选的订阅名称和分类设置
- OPML 文件批量导入
- 表单验证和加载状态
- ESC 键快速关闭
- 自动聚焦输入框

**UI 设计**:
- 暗色主题对话框，背景模糊效果
- 必填字段标记 (红色星号)
- 操作按钮: "添加订阅" + "导入 OPML"
- 加载状态显示 (Spinner + 禁用按钮)
- 友好的提示信息

**交互流程**:
1. 用户点击侧边栏 "+" 按钮打开对话框
2. 输入 RSS URL (必填)
3. 可选填写订阅名称和分类
4. 点击 "添加订阅" 或 "导入 OPML"
5. 显示 Toast 提示操作结果
6. 自动刷新文章列表

### 2. Sidebar 更新

**新增功能**:
- 顶部添加 "+" 按钮
- 按钮与折叠按钮并排显示
- Hover 状态和工具提示

**代码变更**:
```tsx
// 新增 onAddFeed 回调
interface SidebarProps {
  // ...existing props
  onAddFeed: () => void;
}

// 顶部按钮区域
<div className="flex items-center gap-1 no-drag">
  <button onClick={onAddFeed} title="添加 RSS 订阅">
    <Plus size={16} />
  </button>
  <button onClick={onToggleCollapse}>
    {collapsed ? <PanelLeft /> : <PanelLeftClose />}
  </button>
</div>
```

### 3. App.tsx 集成

**状态管理**:
- `addFeedDialogOpen`: 控制对话框显示/隐藏
- `refreshTrigger`: 触发文章列表刷新

**回调处理**:
```tsx
const handleFeedAdded = useCallback(() => {
  // 添加成功后刷新文章列表
  setRefreshTrigger((prev) => prev + 1);
}, []);
```

### 4. ContentList 更新

**新增 Props**:
- `refreshTrigger?: number` - 外部触发刷新的信号

**刷新机制**:
```tsx
useEffect(() => {
  fetchArticles();
}, [fetchArticles, refreshTrigger]);
```

## 技术细节

### 表单验证
- URL 字段使用 HTML5 `type="url"` 验证
- 必填字段使用 `required` 属性
- 提交前检查 URL 是否为空

### 错误处理
- Try-catch 包裹 IPC 调用
- 失败时显示友好的错误提示
- 不影响应用稳定性

### 用户体验优化
1. **自动聚焦**: 对话框打开时自动聚焦 URL 输入框
2. **键盘支持**: ESC 键关闭对话框
3. **加载反馈**: 操作进行中禁用按钮并显示 Spinner
4. **Toast 通知**: 操作成功/失败后显示提示
5. **表单重置**: 每次打开对话框重置表单状态

### OPML 导入
- 调用 `window.electronAPI.feedImportOpml()`
- 后端使用 Electron 的 `dialog.showOpenDialog` 选择文件
- 支持 `.opml` 和 `.xml` 文件格式
- 导入完成后显示导入数量

## 文件清单

### 新增文件
- `src/renderer/components/AddFeedDialog.tsx` - 添加 Feed 对话框组件

### 修改文件
- `src/renderer/components/Sidebar.tsx` - 添加 "+" 按钮
- `src/renderer/App.tsx` - 集成对话框和刷新逻辑
- `src/renderer/components/ContentList.tsx` - 支持外部刷新触发

## 使用方法

### 添加单个 RSS 订阅
1. 点击左侧边栏顶部的 "+" 按钮
2. 在对话框中输入 RSS URL
3. (可选) 填写订阅名称和分类
4. 点击 "添加订阅" 按钮
5. 等待后台抓取文章

### 批量导入 OPML
1. 点击左侧边栏顶部的 "+" 按钮
2. 点击 "导入 OPML" 按钮
3. 选择 OPML 文件 (通常从其他 RSS 阅读器导出)
4. 系统自动导入所有订阅源

## 后续优化方向

1. **RSS 自动发现**: 输入网站首页 URL 时自动查找 RSS 地址
2. **订阅源预览**: 添加前预览订阅源的文章
3. **分类管理**: 提供分类的下拉选择或创建界面
4. **导入进度**: OPML 导入时显示进度条
5. **失败重试**: 抓取失败时提供重试选项
6. **Feed 验证**: 添加前验证 RSS URL 是否有效

## 相关 Issue

- 解决了用户无法添加 RSS 订阅的问题
- 完善了 Sprint 1 的 RSS 抓取服务集成

## 测试要点

- [x] 点击 "+" 按钮打开对话框
- [x] 输入有效 RSS URL 后成功添加
- [x] 表单验证工作正常
- [x] OPML 导入功能可用
- [x] Toast 提示显示正确
- [x] 添加后文章列表自动刷新
- [x] ESC 键关闭对话框
- [x] 加载状态正确显示
- [ ] 添加无效 URL 时错误提示 (待测试)
- [ ] 网络错误时的降级处理 (待测试)

## 截图

(建议添加对话框和添加流程的截图)

## 更新日志

- 2026-02-09: 初始实现，支持单个 RSS 添加和 OPML 导入
