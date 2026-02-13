# 分享卡片编辑系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为高亮笔记系统添加分享卡片生成功能，支持单条高亮、多条合集、文章摘要三种卡片类型，5 种视觉主题，导出为图片或复制到剪贴板。

**Architecture:** React 组件渲染卡片 + `html-to-image` 截图导出。ShareCardModal 全屏弹窗包含左侧实时预览和右侧控制面板。主题系统基于 CSS 类 + 配置对象，扩展只需添加新文件。

**Tech Stack:** React, TypeScript, Tailwind CSS, html-to-image, Electron IPC (clipboard/dialog)

---

## Task 1: 安装依赖 + 添加 IPC 通道和类型定义

**Files:**
- Modify: `package.json` (添加 html-to-image)
- Modify: `src/shared/ipc-channels.ts` (添加 2 个通道)
- Modify: `src/shared/types.ts` (添加 CardTheme, ShareCardData 等类型)
- Modify: `src/shared/global.d.ts` (如果 ElectronAPI 在此声明)

**Step 1: 安装 html-to-image**

```bash
pnpm add html-to-image
```

**Step 2: 添加 IPC 通道**

在 `src/shared/ipc-channels.ts` 的 `IPC_CHANNELS` 对象中添加：

```typescript
// Share Card
SHARE_CARD_EXPORT_IMAGE: 'shareCard:exportImage',
SHARE_CARD_COPY_CLIPBOARD: 'shareCard:copyClipboard',
```

**Step 3: 添加类型定义**

在 `src/shared/types.ts` 末尾添加：

```typescript
// ==================== 分享卡片类型 ====================

export type CardType = 'single' | 'multi' | 'summary';
export type QuoteStyle = 'border-left' | 'quotation-marks' | 'highlight-bg' | 'minimal';
export type ThemeCategory = 'classic' | 'retro' | 'digital' | 'artistic';

export interface CardThemeStyles {
  background: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  quoteStyle: QuoteStyle;
  cardRadius: string;
  padding: string;
}

export interface CardTheme {
  id: string;
  name: string;
  category: ThemeCategory;
  styles: CardThemeStyles;
  cssClass: string;
}

export interface ShareCardData {
  cardType: CardType;
  themeId: string;
  highlights: Highlight[];
  article: Pick<Article, 'id' | 'title' | 'author' | 'url' | 'domain' | 'publishedAt'>;
}
```

**Step 4: 添加 ElectronAPI 方法类型**

在 `src/shared/types.ts` 的 `ElectronAPI` 接口中添加：

```typescript
shareCardExportImage: (dataUrl: string, defaultName: string) => Promise<string>;
shareCardCopyClipboard: (dataUrl: string) => Promise<void>;
```

**Step 5: 提交**

```bash
git add -A && git commit -m "feat(share-card): 添加依赖、IPC 通道和类型定义"
```

---

## Task 2: 主进程 IPC Handler + Preload 桥接

**Files:**
- Create: `src/main/ipc/share-card-handlers.ts`
- Modify: `src/main/ipc/index.ts` (注册 handler)
- Modify: `src/preload.ts` (暴露 API)

**Step 1: 创建 share-card-handlers.ts**

```typescript
import { ipcMain, dialog, clipboard, nativeImage } from 'electron';
import { writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

const { SHARE_CARD_EXPORT_IMAGE, SHARE_CARD_COPY_CLIPBOARD } = IPC_CHANNELS;

export function registerShareCardHandlers() {
  // 保存图片到磁盘
  ipcMain.handle(SHARE_CARD_EXPORT_IMAGE, async (_event, dataUrl: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (canceled || !filePath) return '';
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    await writeFile(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  });

  // 复制图片到剪贴板
  ipcMain.handle(SHARE_CARD_COPY_CLIPBOARD, async (_event, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(img);
  });
}
```

**Step 2: 在 index.ts 注册**

在 `src/main/ipc/index.ts` 中 import 并调用 `registerShareCardHandlers()`。

**Step 3: 在 preload.ts 暴露 API**

```typescript
shareCardExportImage: (dataUrl: string, defaultName: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.SHARE_CARD_EXPORT_IMAGE, dataUrl, defaultName),
shareCardCopyClipboard: (dataUrl: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.SHARE_CARD_COPY_CLIPBOARD, dataUrl),
```

**Step 4: 提交**

```bash
git add -A && git commit -m "feat(share-card): 主进程图片导出 IPC handler + preload 桥接"
```

---

## Task 3: 主题系统

**Files:**
- Create: `src/renderer/components/share-card/themes/index.ts`
- Create: `src/renderer/components/share-card/themes/swiss-design.ts`
- Create: `src/renderer/components/share-card/themes/minimalism.ts`
- Create: `src/renderer/components/share-card/themes/ink-wash.ts`
- Create: `src/renderer/components/share-card/themes/cyberpunk.ts`
- Create: `src/renderer/components/share-card/themes/risograph.ts`
- Create: `src/renderer/components/share-card/share-card.css`

**Step 1: 创建 5 个主题配置文件**

每个主题文件导出一个 `CardTheme` 对象。示例 (`swiss-design.ts`)：

```typescript
import type { CardTheme } from '../../../../shared/types';

export const swissDesign: CardTheme = {
  id: 'swiss-design',
  name: '瑞士国际主义',
  category: 'classic',
  styles: {
    background: '#ffffff',
    textColor: '#1a1a1a',
    accentColor: '#e60012',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    quoteStyle: 'border-left',
    cardRadius: '0px',
    padding: '40px',
  },
  cssClass: 'theme-swiss-design',
};
```

其他主题类似，根据设计文档中的视觉特征配置。

**Step 2: 创建 themes/index.ts 注册表**

```typescript
import type { CardTheme } from '../../../../shared/types';
import { swissDesign } from './swiss-design';
import { minimalism } from './minimalism';
import { inkWash } from './ink-wash';
import { cyberpunk } from './cyberpunk';
import { risograph } from './risograph';

export const themes: CardTheme[] = [swissDesign, minimalism, inkWash, cyberpunk, risograph];
export const getTheme = (id: string) => themes.find(t => t.id === id) ?? themes[0];
```

**Step 3: 创建 share-card.css**

为每个主题定义 CSS 类，处理渐变背景、纹理、特殊排版效果等。每个类名格式为 `.theme-{id}`。

**Step 4: 提交**

```bash
git add -A && git commit -m "feat(share-card): 5 套主题配置 + CSS 样式"
```

---

## Task 4: 三种卡片渲染组件

**Files:**
- Create: `src/renderer/components/share-card/cards/SingleHighlightCard.tsx`
- Create: `src/renderer/components/share-card/cards/MultiHighlightCard.tsx`
- Create: `src/renderer/components/share-card/cards/ArticleSummaryCard.tsx`

**Step 1: SingleHighlightCard**

Props: `{ highlight: Highlight, article: ShareCardData['article'], theme: CardTheme }`

布局：文章标题 → 作者·来源 → 高亮引用块 → 笔记（如有）→ 分隔线 → Z-Reader + 日期

关键：
- 引用块样式根据 `theme.styles.quoteStyle` 切换（border-left / quotation-marks / highlight-bg / minimal）
- 高亮文本超过 300 字截断 + 省略号
- 宽度固定 420px

**Step 2: MultiHighlightCard**

Props: `{ highlights: Highlight[], article: ShareCardData['article'], theme: CardTheme }`

布局：文章标题 → 作者·来源 → 高亮列表（每条带引用标记 + 笔记）→ 分隔线 → Z-Reader + 高亮数 + 日期

关键：
- 最多展示 10 条，超出显示「还有 N 条高亮」
- 每条高亮文本截断 150 字

**Step 3: ArticleSummaryCard**

Props: `{ highlights: Highlight[], article: ShareCardData['article'], theme: CardTheme }`

布局：文章标题（大号）→ 作者·来源·日期 → 分隔线 → 精选笔记列表 → 分隔线 → Z-Reader + 高亮总数

**Step 4: 提交**

```bash
git add -A && git commit -m "feat(share-card): 三种卡片布局组件"
```

---

## Task 5: CardRenderer + CardPreview

**Files:**
- Create: `src/renderer/components/share-card/CardRenderer.tsx`
- Create: `src/renderer/components/share-card/CardPreview.tsx`

**Step 1: CardRenderer**

根据 `cardType` 分发到对应卡片组件。用 `React.forwardRef` 暴露 DOM ref（供截图用）。应用主题的 `cssClass` 和内联样式。

```typescript
interface CardRendererProps {
  cardType: CardType;
  theme: CardTheme;
  highlights: Highlight[];
  article: ShareCardData['article'];
}
```

渲染逻辑：
- 外层 div 应用 `theme.cssClass`，设置 `width: 420px`，背景/颜色/字体/圆角/内边距从 `theme.styles` 取
- 根据 `cardType` 渲染 SingleHighlightCard / MultiHighlightCard / ArticleSummaryCard

**Step 2: CardPreview**

包裹 CardRenderer，添加缩放预览功能（卡片可能很长，预览区域需要 `transform: scale()` 适配）。

背景用棋盘格或浅灰色表示「画布」区域。

**Step 3: 提交**

```bash
git add -A && git commit -m "feat(share-card): CardRenderer 渲染器 + CardPreview 预览区"
```

---

## Task 6: 控制面板组件

**Files:**
- Create: `src/renderer/components/share-card/ThemeSelector.tsx`
- Create: `src/renderer/components/share-card/HighlightPicker.tsx`
- Create: `src/renderer/components/share-card/CardControls.tsx`

**Step 1: ThemeSelector**

网格展示所有主题，每个主题显示一个小色块预览（用主题的 background + accentColor 组成缩略方块）+ 名称。选中态高亮边框。

**Step 2: HighlightPicker**

列出所有传入的高亮，每条带复选框。支持「全选/取消全选」。只在多选模式下显示。

**Step 3: CardControls**

整合：
- CardTypeSwitch（三个 tab：单条 / 合集 / 摘要）
- ThemeSelector
- HighlightPicker（仅 multi/summary 模式显示）
- ExportActions（两个按钮：保存图片 / 复制剪贴板）

**Step 4: 提交**

```bash
git add -A && git commit -m "feat(share-card): 控制面板（主题选择、高亮选择、导出按钮）"
```

---

## Task 7: ShareCardModal 主容器 + 导出逻辑

**Files:**
- Create: `src/renderer/components/share-card/ShareCardModal.tsx`

**Step 1: ShareCardModal**

全屏 Modal（参考项目现有 Dialog 组件），左右分栏布局：
- 左侧 60%: CardPreview
- 右侧 40%: CardControls

State 管理：
```typescript
const [cardType, setCardType] = useState<CardType>(initialCardType);
const [themeId, setThemeId] = useState('swiss-design');
const [selectedHighlightIds, setSelectedHighlightIds] = useState<Set<string>>(initialIds);
```

`initialCardType` 逻辑：传入单条高亮 → 'single'；传入多条 → 'multi'。

**Step 2: 导出逻辑**

```typescript
import { toPng } from 'html-to-image';

async function handleExport(mode: 'file' | 'clipboard') {
  const node = cardRendererRef.current;
  if (!node) return;
  try {
    const dataUrl = await toPng(node, { pixelRatio: 2 });
    if (mode === 'file') {
      const name = `z-reader-${article.title || 'card'}-${Date.now()}.png`;
      await window.electronAPI.shareCardExportImage(dataUrl, name);
    } else {
      await window.electronAPI.shareCardCopyClipboard(dataUrl);
    }
    // toast 成功提示
  } catch (err) {
    // toast 错误提示
  }
}
```

**Step 3: 提交**

```bash
git add -A && git commit -m "feat(share-card): ShareCardModal 主容器 + 图片导出逻辑"
```

---

## Task 8: 接入入口 — Notebook 面板

**Files:**
- Modify: `src/renderer/components/ReaderDetailPanel.tsx`
- Modify: `src/renderer/components/DetailPanel.tsx`（如果也需要）

**Step 1: 单条高亮分享按钮**

在 Notebook 标签页的高亮列表中，每条高亮项添加一个分享图标按钮（`Share2` from lucide-react）。点击打开 ShareCardModal，传入该条高亮 + 文章信息。

**Step 2: Notebook 全局分享按钮**

在 Notebook 标签页顶部导出按钮区域，添加「生成卡片」按钮（`Image` from lucide-react）。点击打开 ShareCardModal，传入全部高亮 + 文章信息。

**Step 3: 提交**

```bash
git add -A && git commit -m "feat(share-card): Notebook 面板接入分享卡片入口"
```

---

## Task 9: 接入入口 — 阅读视图浮动工具栏

**Files:**
- Modify: `src/renderer/components/ReaderView.tsx`

**Step 1: 工具栏添加分享按钮**

在 `toolbar.mode === 'highlight'` 分支（点击已有高亮时的工具栏）中，添加一个卡片分享按钮（`Image` from lucide-react）。点击打开 ShareCardModal，传入该高亮 + 文章信息。

需要在 ReaderView 中添加 `<ShareCardModal>` 的渲染和状态控制。

**Step 2: 提交**

```bash
git add -A && git commit -m "feat(share-card): 阅读视图浮动工具栏接入分享卡片"
```

---

## Task 10: 手动测试 + 修复 + 文档

**Step 1: 启动应用手动测试**

```bash
pnpm start
```

测试清单：
- [ ] 单条高亮 → 生成卡片 → 切换 5 种主题 → 预览正确
- [ ] 多条高亮合集 → 选择/取消高亮 → 预览更新
- [ ] 文章摘要卡片 → 信息完整
- [ ] 保存图片 → 文件写入磁盘、可正常打开
- [ ] 复制剪贴板 → 粘贴到其他应用可见
- [ ] 3 个入口都能正常打开 Modal
- [ ] 高亮文本过长 → 截断正确
- [ ] 无笔记的高亮 → 笔记区域不显示
- [ ] 空高亮列表 → 合理降级

**Step 2: 修复发现的问题**

**Step 3: 沉淀文档**

在 `docs/` 目录创建 `share-card.md`，记录功能说明、主题扩展方法、已知限制。

**Step 4: 提交**

```bash
git add -A && git commit -m "docs: 分享卡片功能文档"
```
