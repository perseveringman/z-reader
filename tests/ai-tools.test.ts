/**
 * AI Tools 单元测试
 * 测试 ToolContext mock 注入、各 tool 的参数校验和 execute 调用
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createArticleTools } from '../src/ai/tools/article-tools';
import { createTagTools } from '../src/ai/tools/tag-tools';
import { createFeedTools } from '../src/ai/tools/feed-tools';
import { createHighlightTools } from '../src/ai/tools/highlight-tools';
import { createAllTools } from '../src/ai/tools';
import type { ToolContext } from '../src/ai/tools/types';

/** 创建 mock ToolContext，所有方法使用 vi.fn() */
function createMockContext(): ToolContext {
  return {
    searchArticles: vi.fn().mockResolvedValue([
      { id: 'art-1', title: '测试文章一', summary: '摘要内容' },
      { id: 'art-2', title: '测试文章二', summary: null },
    ]),
    getArticleContent: vi.fn().mockResolvedValue('<p>文章正文</p>'),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    archiveArticle: vi.fn().mockResolvedValue(undefined),
    listTags: vi.fn().mockResolvedValue([
      { id: 'tag-1', name: '科技' },
      { id: 'tag-2', name: '设计' },
    ]),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
    listFeeds: vi.fn().mockResolvedValue([
      { id: 'feed-1', title: 'Hacker News', url: 'https://hn.example.com/rss' },
    ]),
    getReadingStats: vi.fn().mockResolvedValue({ totalRead: 42, totalArticles: 100 }),
    listHighlights: vi.fn().mockResolvedValue([
      { id: 'hl-1', text: '重要内容', note: '笔记' },
    ]),
    createHighlight: vi.fn().mockResolvedValue(undefined),
  };
}

// ==================== 文章工具测试 ====================

describe('createArticleTools', () => {
  let ctx: ToolContext;
  let tools: ReturnType<typeof createArticleTools>;

  beforeEach(() => {
    ctx = createMockContext();
    tools = createArticleTools(ctx);
  });

  it('应包含所有文章工具', () => {
    expect(tools).toHaveProperty('search_articles');
    expect(tools).toHaveProperty('get_article_content');
    expect(tools).toHaveProperty('mark_as_read');
    expect(tools).toHaveProperty('archive_article');
  });

  describe('search_articles', () => {
    it('应正确调用 searchArticles 并返回结果', async () => {
      const result = await tools.search_articles.execute(
        { query: 'AI', limit: 3 },
        { toolCallId: 'call-1', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.searchArticles).toHaveBeenCalledWith('AI', 3);
      expect(result).toEqual({
        articles: [
          { id: 'art-1', title: '测试文章一', summary: '摘要内容' },
          { id: 'art-2', title: '测试文章二', summary: null },
        ],
        count: 2,
      });
    });

    it('limit 不传时默认为 5', async () => {
      await tools.search_articles.execute(
        { query: '技术' },
        { toolCallId: 'call-2', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.searchArticles).toHaveBeenCalledWith('技术', 5);
    });

    it('工具应有 description', () => {
      expect(tools.search_articles.description).toBeTruthy();
      expect(tools.search_articles.description).toContain('搜索');
    });
  });

  describe('get_article_content', () => {
    it('应返回文章内容', async () => {
      const result = await tools.get_article_content.execute(
        { articleId: 'art-1' },
        { toolCallId: 'call-3', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.getArticleContent).toHaveBeenCalledWith('art-1');
      expect(result).toEqual({ content: '<p>文章正文</p>' });
    });

    it('内容为空时返回提示文本', async () => {
      (ctx.getArticleContent as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await tools.get_article_content.execute(
        { articleId: 'art-none' },
        { toolCallId: 'call-4', messages: [], abortSignal: new AbortController().signal },
      );

      expect(result).toEqual({ content: '（文章内容为空）' });
    });
  });

  describe('mark_as_read', () => {
    it('应调用 markAsRead 并返回 success', async () => {
      const result = await tools.mark_as_read.execute(
        { articleId: 'art-1' },
        { toolCallId: 'call-5', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.markAsRead).toHaveBeenCalledWith('art-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('archive_article', () => {
    it('应调用 archiveArticle 并返回 success', async () => {
      const result = await tools.archive_article.execute(
        { articleId: 'art-1' },
        { toolCallId: 'call-6', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.archiveArticle).toHaveBeenCalledWith('art-1');
      expect(result).toEqual({ success: true });
    });
  });
});

// ==================== 标签工具测试 ====================

describe('createTagTools', () => {
  let ctx: ToolContext;
  let tools: ReturnType<typeof createTagTools>;

  beforeEach(() => {
    ctx = createMockContext();
    tools = createTagTools(ctx);
  });

  it('应包含所有标签工具', () => {
    expect(tools).toHaveProperty('list_tags');
    expect(tools).toHaveProperty('add_tag');
    expect(tools).toHaveProperty('remove_tag');
  });

  describe('list_tags', () => {
    it('应返回标签列表', async () => {
      const result = await tools.list_tags.execute(
        {},
        { toolCallId: 'call-7', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.listTags).toHaveBeenCalled();
      expect(result).toEqual({
        tags: [
          { id: 'tag-1', name: '科技' },
          { id: 'tag-2', name: '设计' },
        ],
        count: 2,
      });
    });
  });

  describe('add_tag', () => {
    it('应调用 addTag 并返回 success', async () => {
      const result = await tools.add_tag.execute(
        { articleId: 'art-1', tagName: '新标签' },
        { toolCallId: 'call-8', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.addTag).toHaveBeenCalledWith('art-1', '新标签');
      expect(result).toEqual({ success: true });
    });
  });

  describe('remove_tag', () => {
    it('应调用 removeTag 并返回 success', async () => {
      const result = await tools.remove_tag.execute(
        { articleId: 'art-1', tagName: '科技' },
        { toolCallId: 'call-9', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.removeTag).toHaveBeenCalledWith('art-1', '科技');
      expect(result).toEqual({ success: true });
    });
  });
});

// ==================== 订阅源工具测试 ====================

describe('createFeedTools', () => {
  let ctx: ToolContext;
  let tools: ReturnType<typeof createFeedTools>;

  beforeEach(() => {
    ctx = createMockContext();
    tools = createFeedTools(ctx);
  });

  it('应包含所有订阅源工具', () => {
    expect(tools).toHaveProperty('list_feeds');
    expect(tools).toHaveProperty('get_reading_stats');
  });

  describe('list_feeds', () => {
    it('应返回订阅源列表', async () => {
      const result = await tools.list_feeds.execute(
        {},
        { toolCallId: 'call-10', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.listFeeds).toHaveBeenCalled();
      expect(result).toEqual({
        feeds: [
          { id: 'feed-1', title: 'Hacker News', url: 'https://hn.example.com/rss' },
        ],
        count: 1,
      });
    });
  });

  describe('get_reading_stats', () => {
    it('应返回阅读统计数据', async () => {
      const result = await tools.get_reading_stats.execute(
        { days: 30 },
        { toolCallId: 'call-11', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.getReadingStats).toHaveBeenCalledWith(30);
      expect(result).toEqual({ totalRead: 42, totalArticles: 100 });
    });

    it('days 不传时默认为 7', async () => {
      await tools.get_reading_stats.execute(
        {},
        { toolCallId: 'call-12', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.getReadingStats).toHaveBeenCalledWith(7);
    });
  });
});

// ==================== 高亮工具测试 ====================

describe('createHighlightTools', () => {
  let ctx: ToolContext;
  let tools: ReturnType<typeof createHighlightTools>;

  beforeEach(() => {
    ctx = createMockContext();
    tools = createHighlightTools(ctx);
  });

  it('应包含所有高亮工具', () => {
    expect(tools).toHaveProperty('list_highlights');
    expect(tools).toHaveProperty('create_highlight');
  });

  describe('list_highlights', () => {
    it('应返回高亮列表', async () => {
      const result = await tools.list_highlights.execute(
        { articleId: 'art-1' },
        { toolCallId: 'call-13', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.listHighlights).toHaveBeenCalledWith('art-1');
      expect(result).toEqual({
        highlights: [
          { id: 'hl-1', text: '重要内容', note: '笔记' },
        ],
        count: 1,
      });
    });
  });

  describe('create_highlight', () => {
    it('应调用 createHighlight 并返回 success', async () => {
      const result = await tools.create_highlight.execute(
        { articleId: 'art-1', text: '精彩段落', note: '我的笔记' },
        { toolCallId: 'call-14', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.createHighlight).toHaveBeenCalledWith('art-1', '精彩段落', '我的笔记');
      expect(result).toEqual({ success: true });
    });

    it('note 为可选参数', async () => {
      const result = await tools.create_highlight.execute(
        { articleId: 'art-1', text: '高亮文本' },
        { toolCallId: 'call-15', messages: [], abortSignal: new AbortController().signal },
      );

      expect(ctx.createHighlight).toHaveBeenCalledWith('art-1', '高亮文本', undefined);
      expect(result).toEqual({ success: true });
    });
  });
});

// ==================== createAllTools 整合测试 ====================

describe('createAllTools', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('应合并所有模块的 tools', () => {
    const allTools = createAllTools(ctx);

    // 文章工具
    expect(allTools).toHaveProperty('search_articles');
    expect(allTools).toHaveProperty('get_article_content');
    expect(allTools).toHaveProperty('mark_as_read');
    expect(allTools).toHaveProperty('archive_article');

    // 标签工具
    expect(allTools).toHaveProperty('list_tags');
    expect(allTools).toHaveProperty('add_tag');
    expect(allTools).toHaveProperty('remove_tag');

    // 订阅源工具
    expect(allTools).toHaveProperty('list_feeds');
    expect(allTools).toHaveProperty('get_reading_stats');

    // 高亮工具
    expect(allTools).toHaveProperty('list_highlights');
    expect(allTools).toHaveProperty('create_highlight');
  });

  it('合并后总共应有 11 个工具', () => {
    const allTools = createAllTools(ctx);
    expect(Object.keys(allTools)).toHaveLength(11);
  });

  it('每个工具都应有 description 和 inputSchema', () => {
    const allTools = createAllTools(ctx);

    for (const [name, t] of Object.entries(allTools)) {
      expect(t.description, `${name} 缺少 description`).toBeTruthy();
      expect(t.inputSchema, `${name} 缺少 inputSchema`).toBeDefined();
    }
  });

  it('每个工具都应有 execute 函数', () => {
    const allTools = createAllTools(ctx);

    for (const [name, t] of Object.entries(allTools)) {
      expect(typeof t.execute, `${name} 缺少 execute`).toBe('function');
    }
  });

  it('不同的 ctx 实例互不影响', async () => {
    const ctx1 = createMockContext();
    const ctx2 = createMockContext();

    const tools1 = createAllTools(ctx1);
    const tools2 = createAllTools(ctx2);

    await tools1.search_articles.execute(
      { query: 'test' },
      { toolCallId: 'call-a', messages: [], abortSignal: new AbortController().signal },
    );

    expect(ctx1.searchArticles).toHaveBeenCalledTimes(1);
    expect(ctx2.searchArticles).toHaveBeenCalledTimes(0);
  });
});
