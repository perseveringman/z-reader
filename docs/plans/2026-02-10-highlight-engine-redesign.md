# 高亮引擎重新设计

## 概述

重写文章高亮系统，修复现有 bug（划线没反应、offset 漂移、重复文字匹配错误），支持鼠标单击选中整段、拖拽划线选中文字、H 键统一高亮。

## 现有 Bug

1. **划线高亮没反应**：`handleMouseUp` 在 target 是 `<mark>` 时 early return；`textFallbackSearch` 用 `indexOf` 只匹配第一次出现
2. **`applyHighlights` 清除重建导致 offset 漂移**：每次都 unwrap 全部 mark 再重建，DOM text node 结构被破坏
3. **H 键只对 `<p>` 有效**：`querySelectorAll('p')` 不覆盖 `li`、`blockquote` 等块级元素
4. **`textFallbackSearch` 只匹配第一次出现**：相同文字多次出现时定位到错误位置

## 设计

### 1. 新的高亮定位模型

**存储结构：**
- `anchorPath`: CSS 选择器路径（如 `p:nth-of-type(3)`），定位到段落级
- `startOffset` / `endOffset`: 段内文本偏移（相对于 anchorPath 元素）
- 复用现有数据库字段，新增 `anchorPath` 列（nullable，兼容旧数据）

**定位算法 — 创建时：**
1. 从选中 Range 的 startContainer 向上找最近的块级元素（p, li, blockquote）
2. 计算该元素相对于 contentRef 的 CSS 路径
3. 计算选中文字在该块内的 text offset

**定位算法 — 恢复时：**
1. 有 anchorPath → 查找目标元素 → 段内 offsetsToRange → 校验 text
2. 校验失败 → 在目标元素内 indexOf fallback
3. 无 anchorPath（旧数据）→ 全文 offset + 全文 indexOf fallback

### 2. 高亮渲染引擎 — 增量渲染

不再清除重建 DOM，改为增量操作：

| 场景 | 行为 |
|------|------|
| 文章加载完成 | 全量 `applyHighlights`，从数据库恢复所有高亮 |
| 用户划线创建 | 直接在当前 DOM 上 `wrapRangeWithMark` |
| 用户删除高亮 | `unwrapHighlight(hlId)` 移除对应 mark |
| H 键整段高亮 | 同创建流程 |

新增 `unwrapHighlight(hlId)` 函数：找到所有 `mark[data-highlight-id="xxx"]`，unwrap 并 normalize。

### 3. 交互模式

**三种操作统一：**

| 操作 | 行为 | 判断条件 |
|------|------|----------|
| 单击段落 | 选中整段，显示蓝色左边框 | mouseup 时 selection.isCollapsed |
| 拖拽划线 | 选中文字，弹出高亮工具栏 | mouseup 时 !selection.isCollapsed |
| j/k 导航 | 键盘切换聚焦段落 | 同现有逻辑 |

**单击选中段落：**
- mouseup + selection.isCollapsed → 找 target 最近的块级祖先
- 计算 index，设置 focusedParagraphIndex
- 再次点击同一段落 toggle 取消

**H 键统一行为：**
- 有文字选中 → 高亮选中文字
- 无文字选中但有聚焦段落 → 高亮整段
- 两者都没有 → 无操作

**划线高亮修复：**
- 移除 handleMouseUp 中对 mark 的 early return
- mouseup 只关心是否有有效 selection

**块级元素选择器：**
- 统一常量 `BLOCK_SELECTOR = 'p, li, blockquote'`
- j/k 导航、H 键高亮、单击选中、焦点样式共用

### 4. 数据库 schema 变更

**schema.ts — highlights 表新增：**
```
anchorPath: text('anchor_path')  // nullable
```

**types.ts：**
- Highlight 接口新增 `anchorPath: string | null`
- CreateHighlightInput 接口新增 `anchorPath?: string`

旧数据无 anchorPath，走 fallback 兼容逻辑，无需数据迁移。

## 改动范围

| 文件 | 改动 |
|------|------|
| `schema.ts` | highlights 表加 anchorPath 字段 |
| `types.ts` | Highlight / CreateHighlightInput 加 anchorPath |
| `ReaderView.tsx` | 重写高亮引擎（定位、渲染、交互） |
| `index.css` | 块级元素焦点样式选择器扩展 |
