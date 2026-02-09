# 键盘导航系统

**Linear Issue**: [ZYB-132](https://linear.app/zybwork/issue/ZYB-132/键盘导航系统-vim-like-keyboard-navigation)

## 概述

为 Z-Reader 添加 Vim 风格键盘导航，覆盖 ContentList 文章列表和 ReaderView 阅读视图。

## ContentList 快捷键

| 快捷键 | 功能 |
|--------|------|
| `j` / `↓` | 选择下一篇文章 |
| `k` / `↑` | 选择上一篇文章 |
| `Enter` | 打开阅读器 |
| `1` | 切换到 Inbox |
| `2` | 切换到 Later |
| `3` | 切换到 Archive |
| `e` / `E` | 归档选中文章 |
| `l` / `L` | 标记为稍后阅读 |
| `d` / `D` | 删除选中文章 |

选中文章自动滚动到可视区域 (`scrollIntoView({ block: 'nearest' })`)。通过 `data-article-id` 属性定位 DOM 元素。

当焦点在 `<input>` 或 `<textarea>` 上时，快捷键不生效。

## ReaderView 段落聚焦

| 快捷键 | 功能 |
|--------|------|
| `j` / `↓` | 聚焦下一段落 |
| `k` / `↑` | 聚焦上一段落 |
| `Escape` | 关闭阅读器 |

聚焦段落通过 `data-focused="true"` 属性标记，CSS 渲染蓝色左边框 (`#3b82f6`)。

## 修改文件

- `src/renderer/components/ContentList.tsx` — 列表键盘导航 + 自动滚动
- `src/renderer/components/ReaderView.tsx` — 段落级聚焦导航
- `src/index.css` — `[data-focused="true"]` 样式
