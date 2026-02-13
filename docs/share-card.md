# 分享卡片功能

## 功能概述

分享卡片功能允许用户将高亮笔记生成精美的图片卡片，支持保存为图片文件或复制到剪贴板。

## 三种卡片类型

| 类型 | 说明 | 触发方式 |
|------|------|----------|
| 单条高亮卡片 | 展示单条高亮引用 + 笔记 + 文章信息 | 高亮列表分享按钮 / 阅读视图浮动工具栏 |
| 多条高亮合集 | 展示多条高亮引用列表 | Notebook 全局分享按钮 |
| 文章摘要卡片 | 文章标题突出 + 精选高亮列表 | Notebook 全局分享按钮切换类型 |

## 5 种主题

| 主题 | 风格 | 视觉特征 |
|------|------|----------|
| Swiss Design | 经典 | 网格布局、红色强调线、高对比 |
| Minimalism | 经典 | 大量留白、单色、极简 |
| Ink Wash 水墨风 | 艺术 | 宣纸纹理、书法字体、墨色渐变 |
| Cyberpunk | 数字 | 深色底、霓虹强调色、等宽字体 |
| Risograph | 复古 | 双色叠印、颗粒纹理 |

## 入口位置

1. **Notebook 标签页** - 每条高亮右上角的分享图标按钮（Share2）
2. **Notebook 标签页** - 顶部操作栏的「生成卡片」按钮（ImageIcon）
3. **阅读视图浮动工具栏** - 点击已有高亮后弹出的工具栏中的卡片按钮

## 导出方式

- **保存图片**: 弹出系统保存对话框，导出 2x Retina PNG 图片（840px 宽）
- **复制剪贴板**: 直接复制图片到系统剪贴板

## 技术实现

- 使用 `html-to-image` 库将 React 渲染的卡片 DOM 截图为 PNG
- 主题系统基于 CSS 类 + 配置对象，扩展方便
- 图片操作通过 Electron IPC 调用主进程（dialog.showSaveDialog, clipboard.writeImage）

## 如何扩展主题

1. 在 `src/renderer/components/share-card/themes/` 目录创建新文件（如 `new-theme.ts`）
2. 导出一个 `CardTheme` 对象，定义 id、name、category、styles、cssClass
3. 在 `share-card.css` 中添加 `.theme-{id}` CSS 类定义视觉效果
4. 在 `themes/index.ts` 中 import 并添加到 `themes` 数组

## 文件结构

```
src/renderer/components/share-card/
├── ShareCardModal.tsx         # 主入口 Modal
├── CardPreview.tsx            # 预览区
├── CardRenderer.tsx           # 卡片渲染器（被截图的 DOM）
├── CardControls.tsx           # 控制面板
├── ThemeSelector.tsx          # 主题选择器
├── HighlightPicker.tsx        # 高亮多选器
├── cards/
│   ├── SingleHighlightCard.tsx
│   ├── MultiHighlightCard.tsx
│   └── ArticleSummaryCard.tsx
├── themes/
│   ├── index.ts               # 主题注册表
│   ├── swiss-design.ts
│   ├── minimalism.ts
│   ├── ink-wash.ts
│   ├── cyberpunk.ts
│   └── risograph.ts
└── share-card.css             # 主题专用样式
```

## 已知限制

- 高亮文本超过 300 字（单条）/ 150 字（列表）会被截断
- 多条高亮最多展示 10 条
- html-to-image 截图对某些复杂 CSS 效果（如 SVG 滤镜）可能有偏差
- 暂不支持自定义字体（使用系统字体回退）
