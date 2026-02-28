# 研究空间侧栏快捷键收折 — 设计文档

**日期**: 2026-02-28
**功能**: 研究空间支持 `[` / `]` 快捷键收折左右侧栏

## 背景

阅读模式已支持 `[` 收折左侧边栏、`]` 收折右侧详情面板。研究空间（research mode）尚未支持同样的快捷键，导致体验不一致。

## 目标

在研究空间中，按 `[` 完全隐藏左侧 SourcesPanel，按 `]` 完全隐藏右侧 StudioPanel，中间 ResearchChat 自动扩展填满空间。

## 决策

| 问题 | 决策 |
|------|------|
| 收折行为 | 完全隐藏（宽度归零，空间释放给中间栏） |
| 状态管理位置 | ResearchLayout 内部（不上提到 App.tsx） |
| 持久化 | 无（内存状态，切换模式后重置） |
| 动画 | 无（直接显隐） |

## 实现方案

### 状态

在 `ResearchLayout.tsx` 中添加：

```ts
const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
const [studioCollapsed, setStudioCollapsed] = useState(false);
```

### 快捷键监听

```ts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === '[') {
      e.preventDefault();
      setSourcesCollapsed(prev => !prev);
    }
    if (e.key === ']') {
      e.preventDefault();
      setStudioCollapsed(prev => !prev);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 布局渲染

```tsx
<div className="flex flex-1 min-h-0 overflow-hidden">
  {!sourcesCollapsed && <SourcesPanel ... />}
  <ResearchChat ... />
  {!studioCollapsed && <StudioPanel ... />}
</div>
```

## 文件改动范围

| 文件 | 改动 |
|------|------|
| `src/renderer/components/research/ResearchLayout.tsx` | 添加状态、快捷键 listener、条件渲染 |
| `src/renderer/components/KeyboardShortcutsHelp.tsx` | 在研究模式区域补充 `[` / `]` 快捷键说明 |
