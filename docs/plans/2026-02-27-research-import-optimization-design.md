# 研究空间文章导入优化设计

## 问题

当前 `ImportDialog` 存在以下问题：
1. 一次性加载全量文章到前端（`articleList({})`）
2. 搜索在前端用 `String.includes()` 实现，性能差且无法利用索引
3. 没有筛选维度，只有一个文本搜索框
4. 没有分页，文章量大时内存和渲染开销高

## 方案

### 1. 后端 - FTS5 全文检索

新增 SQLite FTS5 虚拟表：

```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, author, contentText, domain,
  content='articles',
  content_rowid='rowid'
);
```

- 插入/更新/删除文章时通过触发器自动同步 FTS 索引
- 初始化时对已有数据做一次全量索引构建
- 搜索使用 FTS5 `MATCH` 语法

### 2. 后端 - 新增 IPC 通道 `RESEARCH_ARTICLE_QUERY`

专为研究空间导入设计的查询接口：

**请求参数 `ResearchArticleQueryParams`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| search | string? | FTS5 关键词搜索 |
| source | 'feed' \| 'library'? | 来源类型 |
| readStatus | string[]? | 阅读状态（多选） |
| mediaType | string[]? | 媒体类型（多选） |
| feedId | string? | 指定 Feed 源 |
| tagIds | string[]? | 标签（多选，AND） |
| language | string? | 语言 |
| domain | string? | 域名 |
| dateFrom | string? | 时间范围起始 |
| dateTo | string? | 时间范围截止 |
| excludeIds | string[]? | 排除已导入的文章 ID |
| page | number | 页码（从 1 开始） |
| pageSize | number | 每页条数（默认 50） |
| sortBy | string | 排序字段 |
| sortOrder | 'asc' \| 'desc' | 排序方向 |

**返回值 `ResearchArticleQueryResult`：**

```typescript
{
  articles: Article[];
  total: number;
  page: number;
  pageSize: number;
}
```

### 3. 前端 - ImportDialog 重构

**UI 布局：** 搜索框 + 筛选栏 + 文章列表 + 分页控件

**筛选下拉菜单：**
- 来源：Feed / Library
- 状态：Inbox / 稍后阅读 / 已归档 / 未读 / 已读（多选）
- 标签：从数据库拉取，支持搜索和多选
- 媒体类型：文章 / 视频 / 播客（多选）
- 更多：Feed 源、语言、域名、时间范围

**交互逻辑：**
- 搜索 300ms 防抖，触发后端查询
- 筛选变化立即查询，重置到第一页
- 已选条件显示为 chips，可移除
- 勾选状态跨页保持（`Set<string>`）
- 全选只选当前页
- 每页 50 条，底部传统分页

**组件拆分：**
- `ImportDialog` — 主容器
- `ImportFilterBar` — 筛选栏
- `FilterDropdown` — 通用下拉组件
- `ImportArticleList` — 文章列表
- `Pagination` — 分页控件

## 实现步骤

1. 后端：创建 FTS5 表和触发器，添加迁移逻辑
2. 后端：新增 `RESEARCH_ARTICLE_QUERY` IPC 通道和处理器
3. 后端：新增获取筛选选项（标签列表、Feed 列表、语言列表、域名列表）的 IPC
4. 前端：实现 `FilterDropdown` 通用组件
5. 前端：实现 `ImportFilterBar` 筛选栏
6. 前端：实现 `Pagination` 分页组件
7. 前端：重构 `ImportDialog` 整体组件
8. 类型定义更新（shared/types.ts, ipc-channels.ts）
