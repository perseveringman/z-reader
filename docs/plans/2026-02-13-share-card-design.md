# 分享卡片编辑系统设计

## 概述

为 Z-Reader 的高亮笔记系统添加分享卡片生成功能。用户可以将高亮引用、笔记和文章信息生成精美的图片卡片，用于保存或分享到社交平台。

## 需求

### 三种卡片类型

| 类型 | 触发入口 | 内容 |
|------|----------|------|
| **单条高亮卡片** | 高亮列表分享按钮 / 阅读视图浮动工具栏 | 一条高亮引用 + 笔记 + 文章信息 |
| **多条高亮合集** | Notebook 全局分享按钮（多选模式） | 多条高亮引用 + 各自笔记 + 文章信息 |
| **文章摘要卡片** | Notebook 全局分享按钮（一键生成） | 文章标题/作者/来源 + 精选高亮列表 |

### 卡片元素

- 高亮文本引用（核心内容）
- 用户笔记内容
- 文章元信息（标题、作者、来源）
- 应用水印/Logo（Z-Reader 品牌标识）

### 输出方式

- 导出为图片文件（PNG，2x Retina）
- 复制图片到系统剪贴板

## 技术方案：React 组件 + Modal 编辑器

选择在渲染进程中用 React 组件渲染卡片实时预览 + 侧边栏控制面板的方案。导出时用 `html-to-image` 截图。

理由：
- 与现有 Shadcn/UI 组件体系一致，开发效率高
- 主题用 CSS 变量 + Tailwind 实现，扩展方便
- 实时预览天然支持（React 状态变更即刷新）

## 架构设计

### 用户流程

```
触发入口 → ShareCardModal → 选择主题/卡片类型 → 实时预览 → 导出图片/复制剪贴板
```

### 组件结构

```
ShareCardModal (全屏 Modal)
├── CardPreview (左侧: 实时预览区)
│   └── CardRenderer (根据主题+类型渲染卡片)
│       ├── SingleHighlightCard
│       ├── MultiHighlightCard
│       └── ArticleSummaryCard
├── CardControls (右侧: 控制面板)
│   ├── ThemeSelector (主题网格选择器)
│   ├── CardTypeSwitch (卡片类型切换)
│   ├── HighlightPicker (高亮选择器，多选/全选)
│   └── ExportActions (导出按钮: 保存图片 / 复制剪贴板)
```

### 数据流

```
入口传入 { highlights, article }
→ ShareCardModal 管理编辑状态 (selectedTheme, cardType, selectedHighlights)
→ CardRenderer 接收 { theme, cardType, highlights, article }
→ 用户调整主题/选择高亮 → React 状态更新 → 预览实时刷新
→ 点击导出 → html-to-image 截取 CardRenderer DOM → 输出图片
```

## 主题系统

### 主题数据结构

```typescript
interface CardTheme {
  id: string;                    // 如 'swiss-design'
  name: string;                  // 如 '瑞士国际主义'
  category: 'classic' | 'retro' | 'digital' | 'artistic';
  thumbnail: string;             // 主题缩略图
  styles: {
    background: string;          // CSS 背景
    textColor: string;           // 正文颜色
    accentColor: string;         // 强调色
    fontFamily: string;          // 字体族
    quoteStyle: 'border-left' | 'quotation-marks' | 'highlight-bg' | 'minimal';
    cardRadius: string;          // 圆角
    padding: string;             // 内边距
  };
  cssClass: string;              // 附加 CSS 类名
}
```

### MVP 主题（5 种）

| 主题 | 分类 | 视觉特征 |
|------|------|----------|
| **Swiss Design** | classic | 网格布局、无衬线字体、红色强调线、高对比 |
| **Minimalism** | classic | 大量留白、单色、极细分隔线、克制 |
| **Ink Wash 水墨风** | artistic | 宣纸纹理背景、书法字体、墨色渐变引用条 |
| **Cyberpunk** | digital | 深色底、霓虹青/紫强调色、单像素边框、等宽字体 |
| **Risograph** | retro | 双色叠印效果、颗粒纹理、略带错位的排版 |

### 扩展机制

新增主题只需：
1. 在 `themes/` 目录添加主题配置文件
2. 定义对应 CSS 样式
3. 准备缩略图

无需修改卡片渲染逻辑。

## 卡片布局

### 单条高亮卡片

```
┌──────────────────────────────┐
│  [文章标题]                    │
│  [作者] · [来源]              │
│                              │
│  ┌─ 引用标记 ─────────────┐  │
│  │                        │  │
│  │  "高亮文本内容..."      │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  📝 用户笔记内容（如有）       │
│                              │
│  ─────────────────────────── │
│  Z-Reader            日期    │
└──────────────────────────────┘
```

### 多条高亮合集卡片

```
┌──────────────────────────────┐
│  [文章标题]                    │
│  [作者] · [来源]              │
│                              │
│  ● "第一条高亮文本..."         │
│    📝 笔记内容                │
│                              │
│  ● "第二条高亮文本..."         │
│                              │
│  ● "第三条高亮文本..."         │
│    📝 笔记内容                │
│                              │
│  ─────────────────────────── │
│  Z-Reader   共3条高亮   日期  │
└──────────────────────────────┘
```

### 文章摘要卡片

```
┌──────────────────────────────┐
│                              │
│  [文章标题 - 大号字体]         │
│                              │
│  [作者] · [来源] · [日期]     │
│  ─────────────────────────── │
│                              │
│  精选笔记                     │
│                              │
│  ● "高亮 1..."               │
│  ● "高亮 2..."               │
│  ● "高亮 3..."               │
│                              │
│  ─────────────────────────── │
│  Z-Reader         共N条高亮   │
└──────────────────────────────┘
```

### 尺寸规范

- 卡片宽度: 420px（适合手机竖屏分享）
- 高度: 根据内容自适应
- 导出缩放: 2x（输出 840px 宽度 Retina 图片）

## 技术实现

### 图片生成流程

1. 用户点击导出按钮
2. 获取 CardRenderer DOM 节点引用
3. `html-to-image` 以 2x pixelRatio 生成 PNG data URL
4. **保存图片**: IPC → 主进程 `dialog.showSaveDialog` + `fs.writeFile`
5. **复制剪贴板**: IPC → 主进程 `clipboard.writeImage(nativeImage)`

### 新增 IPC 通道

```typescript
SHARE_CARD_EXPORT_IMAGE: 'shareCard:exportImage'
SHARE_CARD_COPY_CLIPBOARD: 'shareCard:copyClipboard'
```

### 新增文件结构

```
src/renderer/components/share-card/
├── ShareCardModal.tsx         # 模态框容器
├── CardPreview.tsx            # 预览区
├── CardRenderer.tsx           # 卡片渲染器 (被截图的 DOM)
├── CardControls.tsx           # 右侧控制面板
├── ThemeSelector.tsx          # 主题网格选择器
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

src/main/ipc/
└── share-card-handlers.ts     # 图片导出 IPC handler
```

### 新增依赖

- `html-to-image`: DOM → PNG 截图

### 错误处理

- 截图失败时显示 toast 提示
- 高亮文本过长时自动截断 + 省略号
- 多条高亮限制最大展示数量（10 条），超出提示

## 入口位置

1. **单条高亮分享按钮**: Notebook 标签页高亮列表每条右侧
2. **Notebook 全局分享按钮**: Notebook 标签页顶部
3. **阅读视图工具栏**: 高亮浮动工具栏新增「生成卡片」选项
