# Command Palette, Undo Stack & Toast Integration

**Linear Issue**: [ZYB-135](https://linear.app/zybwork/issue/ZYB-135/command-palette-undo-stack-toast-integration)

## 新增文件

- `src/renderer/components/CommandPalette.tsx` — 命令面板组件
- `src/renderer/hooks/useUndoStack.ts` — 撤销栈 Hook

## 修改文件

- `src/renderer/App.tsx` — 集成 CommandPalette，添加 Cmd/Ctrl+K 快捷键
- `src/renderer/components/ContentList.tsx` — 集成 useToast + useUndoStack

## 功能说明

### Command Palette
- `Cmd/Ctrl+K` 打开/关闭
- 模糊搜索过滤命令列表
- 方向键导航，Enter 执行，Escape 关闭
- 通过 `dispatchEvent(KeyboardEvent)` 复用现有快捷键处理逻辑

### Undo Stack
- 最多保存 20 条撤销操作
- 归档/稍后阅读操作可撤销（恢复原状态）
- 按 `Z` 触发撤销
- 删除操作记录在栈中但不可逆

### Toast 通知
- 归档: "已归档"
- 稍后阅读: "已加入稍后阅读"
- 删除: "已删除"
- 撤销: "已撤销"
