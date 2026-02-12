import { beforeEach, describe, expect, it, vi } from 'vitest';
import Parser from '@postlight/parser';
import { parseArticleContent } from '../src/main/services/parser-service';

vi.mock('@postlight/parser', () => ({
  default: {
    parse: vi.fn(),
  },
}));

const mockedParse = vi.mocked(Parser.parse);

describe('parseArticleContent', () => {
  beforeEach(() => {
    mockedParse.mockReset();
  });

  it('会将文章内容中的图片相对路径转换为绝对路径', async () => {
    mockedParse.mockResolvedValue({
      title: '测试文章',
      content: '<article><img src="/images/cover.jpg" /><img src="media/photo.png" /><img srcset="/img/one.jpg 1x, img/two.jpg 2x" /></article>',
      author: '作者',
      excerpt: '摘要',
      lead_image_url: '/images/lead.jpg',
    } as Awaited<ReturnType<typeof Parser.parse>>);

    const result = await parseArticleContent('https://example.com/posts/read-this');

    expect(result).not.toBeNull();
    expect(result?.content).toContain('src="https://example.com/images/cover.jpg"');
    expect(result?.content).toContain('src="https://example.com/posts/media/photo.png"');
    expect(result?.content).toContain(
      'srcset="https://example.com/img/one.jpg 1x, https://example.com/posts/img/two.jpg 2x"'
    );
    expect(result?.leadImageUrl).toBe('https://example.com/images/lead.jpg');
  });
});
