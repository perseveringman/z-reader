/**
 * ToolContext 接口定义
 * 定义 AI Chat Tool Calling 所需的所有数据操作方法
 * 由主进程注入具体实现，解耦 AI 模块与数据库层
 */

/** AI Tool 的数据访问上下文 */
export interface ToolContext {
  // ==================== 文章操作 ====================

  /** 搜索文章，按关键词匹配标题和摘要 */
  searchArticles: (
    query: string,
    limit?: number,
  ) => Promise<{ id: string; title: string; summary: string | null }[]>;

  /** 获取文章完整内容 */
  getArticleContent: (articleId: string) => Promise<string | null>;

  /** 将文章标记为已读 */
  markAsRead: (articleId: string) => Promise<void>;

  /** 归档文章 */
  archiveArticle: (articleId: string) => Promise<void>;

  // ==================== 标签操作 ====================

  /** 获取所有标签列表 */
  listTags: () => Promise<{ id: string; name: string }[]>;

  /** 为文章添加标签 */
  addTag: (articleId: string, tagName: string) => Promise<void>;

  /** 移除文章标签 */
  removeTag: (articleId: string, tagName: string) => Promise<void>;

  // ==================== 订阅源操作 ====================

  /** 获取所有订阅源列表 */
  listFeeds: () => Promise<{ id: string; title: string | null; url: string }[]>;

  /** 获取阅读统计数据 */
  getReadingStats: (
    days?: number,
  ) => Promise<{ totalRead: number; totalArticles: number }>;

  // ==================== 高亮操作 ====================

  /** 获取文章的高亮列表 */
  listHighlights: (
    articleId: string,
  ) => Promise<{ id: string; text: string | null; note: string | null }[]>;

  /** 创建高亮 */
  createHighlight: (
    articleId: string,
    text: string,
    note?: string,
  ) => Promise<void>;

  // ==================== 研究操作 ====================

  /** 在指定 sourceIds 范围内进行混合检索 */
  searchResearchSources: (
    query: string,
    sourceIds: string[],
    topK?: number,
  ) => Promise<{
    text: string;
    references: Array<{
      sourceType: string;
      sourceId: string;
      title: string | null;
      chunkIndex: number;
    }>;
    tokenCount: number;
  }>;

  /** 获取源材料摘要（标题 + 前 500 字） */
  getSourceSummary: (
    sourceType: string,
    sourceId: string,
  ) => Promise<{
    title: string;
    summary: string;
    wordCount: number;
  } | null>;

  /** 获取研究空间内所有启用的 sourceIds */
  getResearchSpaceSourceIds: (spaceId: string) => Promise<string[]>;

  /** 保存研究产物到数据库 */
  saveResearchArtifact: (input: {
    spaceId: string;
    type: string;
    title: string;
    content: string;
    prompt?: string;
  }) => Promise<{ id: string }>;

  /** 聚合研究空间内所有源材料的知识图谱数据 */
  aggregateKnowledgeGraph: (sourceIds: string[]) => Promise<{
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      mentionCount: number;
      sourceCount: number;
      description?: string;
    }>;
    edges: Array<{
      source: string;
      target: string;
      relationType: string;
      strength: number;
      evidenceCount: number;
    }>;
  }>;

  /** 当前研究空间 ID（仅在 research 模式下有值） */
  _researchSpaceId?: string;
}
