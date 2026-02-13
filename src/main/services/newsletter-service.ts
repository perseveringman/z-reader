/**
 * Newsletter 服务：通过 kill-the-newsletter.com 将邮件 Newsletter 转换为 Atom feed
 *
 * 流程：
 * 1. POST /feeds 到 kill-the-newsletter.com，带 CSRF-Protection header
 * 2. 使用 Accept: application/json 直接获取 JSON 响应
 * 3. 返回专用邮箱地址和 Atom feed URL
 */

const KTN_BASE_URL = 'https://kill-the-newsletter.com';

export interface KtnCreateResult {
  /** 用于订阅 newsletter 的专用邮箱地址 */
  email: string;
  /** 对应的 Atom feed URL */
  feedUrl: string;
  /** 用户提供的 newsletter 名称 */
  name: string;
}

/**
 * kill-the-newsletter.com JSON API 响应格式
 */
interface KtnJsonResponse {
  feedId: string;
  email: string;
  feed: string;
}

/**
 * 调用 kill-the-newsletter.com 创建一个新的 newsletter-to-feed 转换。
 *
 * kill-the-newsletter.com 的 API：
 * - POST /feeds  with form body: title=<newsletter title>
 * - 需要 CSRF-Protection: true header（框架级别的 CSRF 保护）
 * - 设置 Accept: application/json 返回 JSON 而非 HTML 重定向
 * - 响应格式: { feedId, email, feed }
 * - email 格式: <id>@kill-the-newsletter.com
 * - feed URL 格式: https://kill-the-newsletter.com/feeds/<id>.xml
 */
export async function createNewsletter(name: string): Promise<KtnCreateResult> {
  if (!name.trim()) {
    throw new Error('Newsletter 名称不能为空');
  }

  const formBody = new URLSearchParams({ title: name.trim() });

  const response = await fetch(`${KTN_BASE_URL}/feeds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'CSRF-Protection': 'true',
      'User-Agent': 'Z-Reader/1.0',
    },
    body: formBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `kill-the-newsletter.com 返回错误: HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`,
    );
  }

  const data = await response.json() as KtnJsonResponse;

  if (!data.feedId || !data.email || !data.feed) {
    throw new Error('kill-the-newsletter.com 返回了不完整的响应');
  }

  return {
    email: data.email,
    feedUrl: data.feed,
    name: name.trim(),
  };
}
