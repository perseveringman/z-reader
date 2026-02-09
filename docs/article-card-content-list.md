# ArticleCard 组件与 ContentList 真实数据集成

**Linear Issue**: [ZYB-125](https://linear.app/zybwork/issue/ZYB-125)

## 变更文件

### 新增: `src/renderer/components/ArticleCard.tsx`

ArticleCard 组件，用于在 ContentList 中渲染单篇文章卡片。

功能:
- 缩略图 (48x48) 或域名首字母 fallback
- 标题单行截断 + 相对时间戳
- 摘要 2 行 clamp
- 元数据行: 域名、作者、阅读时长
- 阅读进度条 (底部蓝色细条，仅 readProgress > 0 时显示)
- 选中态: 左 border-blue-500 + bg-white/5
- Hover 快捷操作: Inbox / Later / Archive (不显示当前状态按钮)

### 修改: `src/renderer/components/ContentList.tsx`

- 通过 `window.electronAPI.articleList(query)` 获取文章数据
- `activeTab` / `sortBy` / `sortOrder` 变化时自动重新获取
- 排序控制: Date saved / Date published 切换 + asc/desc 切换
- 快捷操作状态变更后自动刷新列表
- 底部状态栏显示实际文章计数

## 依赖

- `lucide-react`: Archive, Clock, Inbox, ArrowUpDown, ArrowUp, ArrowDown
- `window.electronAPI.articleList` / `window.electronAPI.articleUpdate`
- 共享类型: `Article`, `ArticleListQuery` from `src/shared/types.ts`

## 相对时间格式

内联实现 `formatRelativeTime`，无外部依赖:
- < 1m → "just now"
- < 1h → "Xm ago"
- < 1d → "Xh ago"
- < 30d → "Xd ago"
- < 12mo → "Xmo ago"
- else → "Xy ago"
