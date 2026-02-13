import { describe, it, expect, vi } from 'vitest';
import { extractTopicsSkill } from '../src/ai/skills/extract-topics';
import type { AIContext } from '../src/ai/skills/types';

// mock generateObject — 在 skill 的 execute 中被调用
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { topics: ['人工智能', '深度学习', '自然语言处理', '机器学习', '大模型'] },
    usage: { totalTokens: 120 },
  }),
}));

describe('extractTopicsSkill', () => {
  /** 构建模拟 AIContext */
  function createMockCtx(content: string | null = '这是一篇关于人工智能的文章...'): AIContext {
    return {
      getModel: vi.fn().mockReturnValue({} as never),
      getArticleContent: vi.fn().mockResolvedValue(content),
    };
  }

  it('skill 元数据正确', () => {
    expect(extractTopicsSkill.name).toBe('extract_topics');
    expect(extractTopicsSkill.description).toBe('从文章内容提取主题关键词');
  });

  it('inputSchema 验证合法输入', () => {
    const valid = extractTopicsSkill.inputSchema.safeParse({ articleId: 'abc-123' });
    expect(valid.success).toBe(true);
  });

  it('inputSchema 拒绝缺少 articleId 的输入', () => {
    const invalid = extractTopicsSkill.inputSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it('inputSchema 拒绝非字符串 articleId', () => {
    const invalid = extractTopicsSkill.inputSchema.safeParse({ articleId: 123 });
    expect(invalid.success).toBe(false);
  });

  it('execute 返回 topics 数组', async () => {
    const ctx = createMockCtx();
    const result = await extractTopicsSkill.execute({ articleId: 'test-1' }, ctx);

    expect(result.topics).toBeDefined();
    expect(Array.isArray(result.topics)).toBe(true);
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topics).toContain('人工智能');
  });

  it('execute 在内容为空时抛出错误', async () => {
    const ctx = createMockCtx(null);

    await expect(
      extractTopicsSkill.execute({ articleId: 'test-empty' }, ctx),
    ).rejects.toThrow('文章内容为空');
  });

  it('execute 调用 getArticleContent 获取文章内容', async () => {
    const ctx = createMockCtx();
    await extractTopicsSkill.execute({ articleId: 'test-2' }, ctx);

    expect(ctx.getArticleContent).toHaveBeenCalledWith('test-2');
  });

  it('execute 调用 getModel("fast")', async () => {
    const ctx = createMockCtx();
    await extractTopicsSkill.execute({ articleId: 'test-3' }, ctx);

    expect(ctx.getModel).toHaveBeenCalledWith('fast');
  });

  it('getArticleContent 未定义时抛出错误', async () => {
    const ctx: AIContext = {
      getModel: vi.fn().mockReturnValue({} as never),
      // 不定义 getArticleContent
    };

    await expect(
      extractTopicsSkill.execute({ articleId: 'test-no-fn' }, ctx),
    ).rejects.toThrow('文章内容为空');
  });
});
