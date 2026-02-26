# 划词翻译蓝色下划线标记 — 设计文档

日期：2026-02-26

## 背景

划词翻译功能已实现翻译结果存储（`selection_translations` 表）和 Learn Tab 展示，但文章正文中被翻译的词没有任何视觉标记，用户无法感知哪些词翻译过，也无法在正文和 Learn Tab 之间双向跳转。

## 目标

1. 翻译过的词在文章正文中显示蓝色下划线（类似高亮的黄色标记）
2. 点击文章中的蓝色下划线 → 切换到 Learn Tab 并展开该词最新一条翻译记录
3. 点击 Learn Tab 中的翻译条目 → 文章中对应词滚动到视口中央并闪烁提示
4. 同一词去重：文章中只显示一条蓝线，对应该词所有翻译记录中最新的一条
5. 删除翻译记录时：只有该词的所有记录都删完，蓝线才消失

## 设计决策

### 数据层

**`selection_translations` 表新增 3 个可选字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `anchor_path` | text | 段落锚点路径，与 highlights 表同格式 |
| `start_offset` | integer | 段内起始字符偏移 |
| `end_offset` | integer | 段内结束字符偏移 |

字段均可为 null，兼容历史无位置信息的旧记录。

**`SelectionTranslation` 共享类型同步新增 3 个可选字段：**
```ts
anchorPath?: string | null
startOffset?: number | null
endOffset?: number | null
```

### 保存翻译时记录位置

在 `handleSelectionTranslate`（`ReaderView.tsx`）中，**先计算位置，再清除选区**（修正现有的时序问题）：

```
1. getSelection() → Range
2. getBlockAncestor(range.startContainer) → blockEl
3. computeAnchorPath(contentRef.current, blockEl) → anchorPath
4. rangeToBlockOffsets(blockEl, range) → { startOffset, endOffset }
5. 清除选区
6. 调用 selectionTranslate IPC，携带位置信息
```

IPC handler 将位置信息写入数据库。

### 渲染翻译标记

新增 `applyTranslationMarks(contentEl, translations)` 函数（参考 `applyHighlights`）：

1. 按 `sourceText` 去重，同一词只取最新一条记录
2. 对每条记录，位置解析策略：
   - 策略 1：anchorPath + startOffset/endOffset（精确）
   - 策略 2：全文 text search fallback（历史记录兜底）
3. 用 `<mark data-translation-id="..." data-translation-word="...">` 包裹文本
4. 应用蓝色下划线样式（CSS class `translation-mark`）

**触发时机：** 文章内容渲染完成后，与 `applyHighlights` 同步调用；翻译刷新时（`selectionTranslationRefresh` 变化）重新调用。

### DOM 标记结构

```html
<mark
  data-translation-id="<最新记录ID>"
  data-translation-word="<sourceText>"
  class="translation-mark"
>apple</mark>
```

样式（蓝色下划线，不遮挡高亮背景色）：
```css
.translation-mark {
  background: transparent;
  border-bottom: 2px solid #3b82f6;
  cursor: pointer;
}
```

### 正文 → Learn Tab 跳转

在 `ReaderView.tsx` 的 `mousedown`/`click` 事件处理中，检查 `target.closest('mark[data-translation-id]')`：
- 若命中，取 `data-translation-id`
- 调用 `setForceTab({ tab: 'learn', ts: Date.now() })`
- 同时向 `LanguageLearningTab` 传递 `focusTranslationId` prop，让对应条目自动展开并滚动到视口

### Learn Tab → 正文跳转

`LanguageLearningTab` 的每个条目新增"定位"按钮（或点击原词标题触发），向父组件回调 `onLocateTranslation(sourceText: string)`。

`ReaderView` 实现 `handleLocateTranslation`：
```
1. 在 contentRef 中查找 mark[data-translation-word="${sourceText}"]
2. scrollIntoView({ behavior: 'smooth', block: 'center' })
3. 短暂添加闪烁动画 class，300ms 后移除
```

### 删除时的蓝线同步

`LanguageLearningTab` 删除条目后，通过 `onTranslationDeleted` 回调通知 `ReaderView`。
`ReaderView` 重新查询该 `articleId` 的翻译列表，判断 `sourceText` 是否还有剩余记录：
- 有剩余 → 更新 `data-translation-id` 为最新记录 ID，保留蓝线
- 无剩余 → 移除对应 `<mark>` 标签

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `src/main/db/schema.ts` | 新增 3 个字段 |
| `src/main/db/migrations/` | 新增迁移文件 |
| `src/shared/types.ts` | `SelectionTranslation` 类型扩展 |
| `src/shared/ipc-channels.ts` | （可能无需改动） |
| `src/main/ipc/article-handlers.ts` 或 translation handlers | IPC 保存位置信息 |
| `src/preload.ts` | `selectionTranslate` 参数类型扩展 |
| `src/renderer/highlight-engine.ts` | 新增 `applyTranslationMarks` / `unwrapTranslationMark` |
| `src/renderer/components/ReaderView.tsx` | 保存位置、渲染标记、双向跳转逻辑 |
| `src/renderer/components/LanguageLearningTab.tsx` | 定位按钮、`focusTranslationId` prop、删除回调 |
| `src/index.css` | `.translation-mark` 样式 |
