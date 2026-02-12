/**
 * 网页 RSS 自动发现服务
 * 请求网页 HTML，解析 <link rel="alternate"> 标签发现 RSS/Atom 链接
 */

export interface DiscoveredFeed {
  title: string | null;
  url: string;
  type: 'rss' | 'atom';
}

/**
 * 从网页 URL 自动发现 RSS/Atom 订阅链接
 */
export async function discoverFeeds(pageUrl: string): Promise<DiscoveredFeed[]> {
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Z-Reader/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`请求失败: ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || '';

  // 如果 URL 本身就是 RSS/Atom feed
  if (
    contentType.includes('application/rss+xml') ||
    contentType.includes('application/atom+xml') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  ) {
    return [{ title: null, url: pageUrl, type: 'rss' }];
  }

  if (!contentType.includes('text/html')) {
    return [];
  }

  const html = await res.text();
  return parseFeedLinks(html, pageUrl);
}

/**
 * 从 HTML 中解析 <link rel="alternate" type="application/rss+xml"> 标签
 */
function parseFeedLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  // 匹配 <link> 标签（含自闭合和非自闭合）
  const linkRegex = /<link\s+[^>]*?(?:rel\s*=\s*["']alternate["'][^>]*?type\s*=\s*["'](application\/(?:rss|atom)\+xml)["']|type\s*=\s*["'](application\/(?:rss|atom)\+xml)["'][^>]*?rel\s*=\s*["']alternate["'])[^>]*?\/?>/gi;

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const type = match[1] || match[2];

    // 提取 href
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    // 提取 title
    const titleMatch = tag.match(/title\s*=\s*["']([^"']+)["']/i);

    let feedUrl = hrefMatch[1];
    // 处理相对路径
    try {
      feedUrl = new URL(feedUrl, baseUrl).href;
    } catch {
      continue;
    }

    feeds.push({
      title: titleMatch ? titleMatch[1] : null,
      url: feedUrl,
      type: type.includes('atom') ? 'atom' : 'rss',
    });
  }

  return feeds;
}
