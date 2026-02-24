/**
 * 微信公众号核心服务
 * 
 * 移植自 Access_wechat_article 项目，使用 TypeScript 重写 HTTP 请求逻辑，
 * 包含：Token 解析、文章列表获取、文章详情获取、反封禁策略
 */
import { randomUUID } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { getDatabase, schema } from '../db';
import { eq } from 'drizzle-orm';
import type { WechatTokenParams, WechatParseResult, WechatStats, WechatComment } from '../../shared/types';

// ==================== 反封禁：User-Agent 池 ====================
const CHROME_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export function getRandomUA(): string {
  return CHROME_USER_AGENTS[Math.floor(Math.random() * CHROME_USER_AGENTS.length)];
}

// ==================== 反封禁：延时策略 ====================

/** 短延时 0.1 - 1.5 秒（单篇文章请求） */
export function delayShortTime(): Promise<void> {
  const ms = (0.1 + Math.random() * 1.4) * 1000;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 长延时 3 - 7 秒（翻页/详情请求） */
export function delayLongTime(): Promise<void> {
  const ms = (3 + Math.random() * 4) * 1000;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 自适应延时：检测到限制时加倍 */
let adaptiveMultiplier = 1;
export function delayAdaptive(): Promise<void> {
  const ms = (3 + Math.random() * 4) * 1000 * adaptiveMultiplier;
  return new Promise(resolve => setTimeout(resolve, ms));
}
export function increaseDelay() { adaptiveMultiplier = Math.min(adaptiveMultiplier * 1.5, 5); }
export function resetDelay() { adaptiveMultiplier = 1; }

// ==================== 取消控制 ====================
const cancelledTasks = new Set<string>();
export function cancelTask(feedId: string) { cancelledTasks.add(feedId); }
export function isCancelled(feedId: string): boolean { return cancelledTasks.has(feedId); }
export function clearCancel(feedId: string) { cancelledTasks.delete(feedId); }

// ==================== Token 管理 ====================

/** 递归解码多层 URL 编码（Fiddler 抓包 URL 常常多次编码） */
function fullyDecode(value: string): string {
  let prev = value;
  // 循环解码直到稳定（最多 5 次防无限循环）
  for (let i = 0; i < 5; i++) {
    const decoded = decodeURIComponent(prev);
    if (decoded === prev) break;
    prev = decoded;
  }
  return prev;
}

/** 从 Fiddler 抓取的 URL 中解析 Token 参数 */
export function parseTokenUrl(tokenUrl: string): WechatTokenParams | null {
  try {
    const url = new URL(tokenUrl);
    const params = url.searchParams;
    const biz = params.get('__biz');
    const uin = params.get('uin');
    const key = params.get('key');
    const passTicket = params.get('pass_ticket');

    if (!biz || !uin || !key || !passTicket) {
      return null;
    }
    // 对所有参数做完整解码，应对 Fiddler 等工具的多层编码
    return {
      biz: fullyDecode(biz),
      uin: fullyDecode(uin),
      key: fullyDecode(key),
      passTicket: fullyDecode(passTicket),
    };
  } catch {
    return null;
  }
}

/** 将 Token 保存到 Feed 记录 */
export async function saveToken(feedId: string, tokenUrl: string): Promise<WechatTokenParams | null> {
  const params = parseTokenUrl(tokenUrl);
  if (!params) return null;

  const db = getDatabase();
  const now = new Date().toISOString();
  await db.update(schema.feeds).set({
    wechatTokenUrl: tokenUrl,
    wechatBiz: params.biz,
    wechatTokenExpiry: now, // 记录设置时间，Token 有效期大约 2-6 小时
    updatedAt: now,
  }).where(eq(schema.feeds.id, feedId));

  return params;
}

/** 获取 Feed 的 Token 参数 */
export async function getTokenParams(feedId: string): Promise<WechatTokenParams | null> {
  const db = getDatabase();
  const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, feedId));
  if (!feed?.wechatTokenUrl) return null;
  return parseTokenUrl(feed.wechatTokenUrl);
}

// ==================== HTTP 请求基础 ====================

interface FetchResult {
  ok: boolean;
  text: string;
  status: number;
}

async function wechatFetch(url: string, options?: RequestInit): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': getRandomUA(),
        ...(options?.headers || {}),
      },
    });
    const text = await res.text();
    return { ok: res.ok, text, status: res.status };
  } catch (err) {
    return { ok: false, text: '', status: 0 };
  }
}

// ==================== 功能 1: 解析文章 URL，提取公众号信息 ====================

export async function parseArticleUrl(articleUrl: string): Promise<WechatParseResult | null> {
  await delayShortTime();

  const res = await wechatFetch(articleUrl);
  if (!res.ok || !res.text) return null;

  // 检测异常
  if (res.text.includes('>当前环境异常, 完成验证后即可继续访问 <')) {
    throw new Error('当前环境异常，需要完成人机验证后才能继续访问');
  }
  if (res.text.includes('操作频繁, 请稍后再试')) {
    throw new Error('操作频繁，请稍后再试或更换 IP');
  }

  if (!res.text.includes('wx_follow_nickname')) {
    throw new Error('无法获取文章内容，可能是纯图片文章或链接无效');
  }

  // 提取公众号名称（多种方式兼容）
  let nickname = '未知公众号';
  const nicknamePatterns = [
    /class="wx_follow_nickname"[^>]*>([^<]+)</,
    /id="js_name"[^>]*>([^<]+)</,
    /aria-labelledby="js_wx_follow_nickname"[^>]*>([^<]+)</,
  ];
  for (const pattern of nicknamePatterns) {
    const match = res.text.match(pattern);
    if (match) {
      nickname = match[1].trim();
      break;
    }
  }

  // 提取文章标题
  const titleMatch = res.text.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  const articleTitle = titleMatch ? titleMatch[1].trim() : '未知标题';

  // 提取 biz 值
  const bizMatch = res.text.match(/biz:\s*["']([^"']+)["']/);
  if (!bizMatch) {
    throw new Error('无法提取公众号 biz 值');
  }
  const biz = bizMatch[1];

  const homeUrl = `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${biz}&scene=124#wechat_redirect`;

  return { nickname, biz, homeUrl, articleTitle };
}

// ==================== 功能 2: 获取文章列表 ====================

export interface WechatArticleListItem {
  page: number;
  localTime: string;
  publishTime: string;
  title: string;
  cover: string;
  originalUrl: string;
  directUrl: string;
}

/** 安全构建带 Token 参数的微信 API URL */
function buildWechatApiUrl(basePath: string, token: WechatTokenParams, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    __biz: token.biz,
    uin: token.uin,
    key: token.key,
    pass_ticket: token.passTicket,
    ...extra,
  });
  return `https://mp.weixin.qq.com${basePath}?${params.toString()}`;
}

/** 获取单页文章列表 */
async function fetchOnePage(
  token: WechatTokenParams,
  page: number,
  userAgent: string,
): Promise<{ hasMore: boolean; articles: WechatArticleListItem[] }> {
  const offset = page * 10;
  const url = buildWechatApiUrl('/mp/profile_ext', token, {
    action: 'getmsg',
    f: 'json',
    offset: String(offset),
    count: '10',
    is_ok: '1',
    scene: '124',
    wxtoken: '',
    appmsg_token: '',
    x5: '0',
  });

  const res = await wechatFetch(url, {
    headers: { 'User-Agent': userAgent },
  });

  if (!res.ok) return { hasMore: false, articles: [] };

  // 尝试解析 JSON 判断 API 返回状态
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(res.text);
  } catch {
    console.error('[wechat] fetchOnePage: 响应非 JSON, page=', page, ', 前200字:', res.text.slice(0, 200));
    return { hasMore: false, articles: [] };
  }

  // 微信 API 返回 ret != 0 表示错误（Token 过期、频率限制等）
  if (json.ret !== undefined && json.ret !== 0) {
    increaseDelay();
    const errMsg = (json.errmsg as string) || '';
    console.error('[wechat] fetchOnePage: ret=', json.ret, ', errmsg=', errMsg);
    throw new Error(`微信 API 返回错误 (ret=${json.ret})：${errMsg || 'Token 可能已过期，请更新 Token 后重试'}`);
  }

  // 检查 home_page_list 为空（另一种 Token 失效的信号）
  if (res.text.includes('"home_page_list":[]') && !res.text.includes('app_msg_ext_info')) {
    increaseDelay();
    throw new Error('Token 已过期或操作频繁，请更新 Token 后重试');
  }

  if (!res.text.includes('app_msg_ext_info')) {
    return { hasMore: false, articles: [] };
  }

  try {
    const list = JSON.parse(json.general_msg_list as string).list;
    const articles: WechatArticleListItem[] = [];
    const localTime = new Date().toISOString();

    for (const item of list) {
      const timestamp = item.comm_msg_info.datetime;
      const publishTime = new Date(timestamp * 1000).toISOString().split('T')[0];
      const ext = item.app_msg_ext_info;

      // 首篇文章
      const contentUrl = ext.content_url.replace('#wechat_redirect', '');
      const directUrl = contentUrl.replace(/amp;/g, '');
      articles.push({
        page: page + 1,
        localTime,
        publishTime,
        title: ext.title,
        cover: ext.cover,
        originalUrl: contentUrl,
        directUrl,
      });

      // 多图文子文章
      if (ext.multi_app_msg_item_list) {
        for (const sub of ext.multi_app_msg_item_list) {
          const subUrl = sub.content_url.replace('#wechat_redirect', '');
          const subDirectUrl = subUrl.replace(/amp;/g, '');
          articles.push({
            page: page + 1,
            localTime,
            publishTime,
            title: sub.title,
            cover: sub.cover,
            originalUrl: subUrl,
            directUrl: subDirectUrl,
          });
        }
      }
    }

    resetDelay();
    return { hasMore: articles.length > 0, articles };
  } catch {
    return { hasMore: false, articles: [] };
  }
}

/** 获取指定页码范围的文章列表，并保存到数据库 */
export async function fetchArticleList(
  feedId: string,
  pagesStart: number,
  pagesEnd: number,
  onProgress: (current: number, total: number, title: string) => void,
): Promise<number> {
  const token = await getTokenParams(feedId);
  if (!token) throw new Error('未配置 Token，请先设置 Token');

  const userAgent = getRandomUA();
  let totalSaved = 0;
  const totalPages = pagesEnd - pagesStart + 1;

  clearCancel(feedId);

  for (let page = pagesStart - 1; page < pagesEnd; page++) {
    if (isCancelled(feedId)) break;

    onProgress(page - pagesStart + 2, totalPages, `正在获取第 ${page + 1} 页...`);

    const result = await fetchOnePage(token, page, userAgent);

    if (!result.hasMore && result.articles.length === 0) break;

    // 保存到数据库
    const db = getDatabase();
    const now = new Date().toISOString();

    for (const article of result.articles) {
      // 检查是否已存在（用 URL 去重）
      const existing = await db.select({ id: schema.articles.id })
        .from(schema.articles)
        .where(eq(schema.articles.url, article.directUrl))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.articles).values({
          id: randomUUID(),
          feedId,
          guid: article.directUrl,
          url: article.directUrl,
          title: article.title,
          thumbnail: article.cover,
          publishedAt: article.publishTime,
          savedAt: now,
          readStatus: 'unseen',
          source: 'feed',
          domain: 'mp.weixin.qq.com',
          mediaType: 'article',
          createdAt: now,
          updatedAt: now,
        });
        totalSaved++;
      }
    }

    // 反封禁：长延时
    if (page < pagesEnd - 1) {
      await delayAdaptive();
    }
  }

  clearCancel(feedId);
  return totalSaved;
}

// ==================== 功能 4: 获取文章详情（行为数据） ====================

interface ArticleDetailResult {
  readNum: number | null;
  likeNum: number | null;
  shareNum: number | null;
  showRead: number | null;
  comments: { content: string; likeNum: number; nickname?: string }[];
}

/** 获取单篇文章的详情数据 */
async function fetchArticleDetail(
  token: WechatTokenParams,
  articleUrl: string,
  articleTitle: string,
  htmlContent: string,
): Promise<ArticleDetailResult | null> {
  // 构建随机数 r
  let r = '0.';
  for (let i = 0; i < 16; i++) r += Math.floor(Math.random() * 10).toString();

  // 从 URL 提取参数
  const midMatch = articleUrl.match(/mid=([^&]+)/);
  const snMatch = articleUrl.match(/sn=([^&]+)/);
  const idxMatch = articleUrl.match(/idx=([^&]+)/);
  if (!midMatch || !snMatch || !idxMatch) return null;

  const mid = midMatch[1];
  const sn = snMatch[1];
  const idx = idxMatch[1];

  // 从 HTML 提取 comment_id 和 req_id
  const commentIdMatch = htmlContent.match(/var comment_id = '([^']+)'/);
  const commentId = commentIdMatch ? commentIdMatch[1] : '';

  const reqIdMatch = htmlContent.match(/var req_id = ['"]?([^'";]+)/);
  const reqId = reqIdMatch ? reqIdMatch[1] : '';

  // 获取文章详情 API
  const detailUrl = buildWechatApiUrl('/mp/getappmsgext', token, {
    f: 'json',
    mock: '',
    fasttmplajax: '1',
  });

  const formData = new URLSearchParams({
    r,
    sn,
    mid,
    idx,
    req_id: reqId,
    title: articleTitle,
    comment_id: commentId,
    appmsg_type: '9',
    __biz: token.biz,
    pass_ticket: token.passTicket,
    devicetype: 'Windows 10 x64',
    version: '63090b13',
    is_need_ticket: '0',
    is_need_ad: '0',
    is_need_reward: '0',
    both_ad: '0',
    reward_uin_count: '0',
    send_time: '',
    msg_daily_idx: '1',
    is_original: '0',
    is_only_read: '1',
    scene: '38',
    is_temp_url: '0',
    item_show_type: '0',
    tmp_version: '1',
    more_read_type: '0',
    appmsg_like_type: '2',
    related_video_sn: '',
    related_video_num: '5',
    vid: '',
    is_pay_subscribe: '0',
    pay_subscribe_uin_count: '0',
    has_red_packet_cover: '0',
    business_type: '0',
  });

  const detailRes = await wechatFetch(detailUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': getRandomUA(),
    },
    body: formData.toString(),
  });

  if (!detailRes.ok) return null;

  let readNum: number | null = null;
  let likeNum: number | null = null;
  let shareNum: number | null = null;
  let showRead: number | null = null;

  try {
    const detailJson = JSON.parse(detailRes.text);
    readNum = detailJson?.appmsgstat?.read_num ?? null;
    likeNum = detailJson?.appmsgstat?.old_like_num ?? null;
    shareNum = detailJson?.appmsgstat?.share_num ?? null;
    showRead = detailJson?.appmsgstat?.show_read ?? null;
  } catch { /* ignore parse error */ }

  // 获取评论
  const comments: ArticleDetailResult['comments'] = [];
  if (commentId) {
    const commentUrl = buildWechatApiUrl('/mp/appmsg_comment', token, {
      action: 'getcomment',
      comment_id: commentId,
      offset: '0',
      limit: '100',
      wxtoken: '',
      devicetype: 'Windows 10',
      clientversion: '62060833',
      appmsg_token: '',
    });
    const commentRes = await wechatFetch(commentUrl);
    if (commentRes.ok) {
      try {
        const commentJson = JSON.parse(commentRes.text);
        const elected = commentJson?.elected_comment || [];
        for (const c of elected) {
          comments.push({
            content: c.content || '',
            likeNum: c.like_num || 0,
            nickname: c.nick_name || '',
          });
        }
      } catch { /* ignore */ }
    }
  }

  return { readNum, likeNum, shareNum, showRead, comments };
}

/** 批量获取文章的行为数据并保存 */
export async function fetchArticleStats(
  feedId: string,
  articleIds: string[] | undefined,
  onProgress: (current: number, total: number, title: string) => void,
): Promise<number> {
  const token = await getTokenParams(feedId);
  if (!token) throw new Error('未配置 Token，请先设置 Token');

  const db = getDatabase();

  // 获取需要处理的文章列表
  let articles;
  if (articleIds && articleIds.length > 0) {
    articles = [];
    for (const id of articleIds) {
      const [a] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
      if (a) articles.push(a);
    }
  } else {
    articles = await db.select().from(schema.articles)
      .where(eq(schema.articles.feedId, feedId));
  }

  clearCancel(feedId);
  let saved = 0;

  for (let i = 0; i < articles.length; i++) {
    if (isCancelled(feedId)) break;

    const article = articles[i];
    onProgress(i + 1, articles.length, article.title || '未知标题');

    if (!article.url) continue;

    // 先获取文章 HTML（获取 comment_id 和 req_id）
    await delayShortTime();
    const htmlRes = await wechatFetch(article.url);
    if (!htmlRes.ok || !htmlRes.text.includes('wx_follow_nickname')) {
      continue; // 跳过失败的文章
    }

    // 获取详情
    const detail = await fetchArticleDetail(token, article.url, article.title || '', htmlRes.text);

    if (detail) {
      const now = new Date().toISOString();
      const statId = randomUUID();

      // 保存统计数据（upsert: 先删后插）
      const existing = await db.select({ id: schema.wechatStats.id })
        .from(schema.wechatStats)
        .where(eq(schema.wechatStats.articleId, article.id))
        .limit(1);

      if (existing.length > 0) {
        await db.update(schema.wechatStats).set({
          readCount: detail.readNum,
          likeCount: detail.likeNum,
          shareCount: detail.shareNum,
          wowCount: detail.showRead,
          fetchedAt: now,
          updatedAt: now,
        }).where(eq(schema.wechatStats.articleId, article.id));
      } else {
        await db.insert(schema.wechatStats).values({
          id: statId,
          articleId: article.id,
          readCount: detail.readNum,
          likeCount: detail.likeNum,
          shareCount: detail.shareNum,
          wowCount: detail.showRead,
          fetchedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      // 保存评论
      if (detail.comments.length > 0) {
        // 删除旧评论
        await db.delete(schema.wechatComments)
          .where(eq(schema.wechatComments.articleId, article.id));

        for (const comment of detail.comments) {
          await db.insert(schema.wechatComments).values({
            id: randomUUID(),
            articleId: article.id,
            content: comment.content,
            likeCount: comment.likeNum,
            nickname: comment.nickname || null,
            createdAt: now,
          });
        }
      }

      saved++;
    }

    // 反封禁：长延时
    if (i < articles.length - 1) {
      await delayAdaptive();
    }
  }

  clearCancel(feedId);
  return saved;
}

// ==================== 查询功能 ====================

/** 获取文章的统计数据 */
export async function getArticleStats(articleId: string): Promise<WechatStats | null> {
  const db = getDatabase();
  const [stats] = await db.select().from(schema.wechatStats)
    .where(eq(schema.wechatStats.articleId, articleId));
  if (!stats) return null;
  return {
    id: stats.id,
    articleId: stats.articleId || '',
    readCount: stats.readCount,
    likeCount: stats.likeCount,
    shareCount: stats.shareCount,
    wowCount: stats.wowCount,
    fetchedAt: stats.fetchedAt || null,
    createdAt: stats.createdAt,
    updatedAt: stats.updatedAt,
  };
}

/** 获取文章的评论 */
export async function getArticleComments(articleId: string): Promise<WechatComment[]> {
  const db = getDatabase();
  const comments = await db.select().from(schema.wechatComments)
    .where(eq(schema.wechatComments.articleId, articleId));
  return comments.map(c => ({
    id: c.id,
    articleId: c.articleId || '',
    content: c.content,
    likeCount: c.likeCount,
    nickname: c.nickname,
    createdAt: c.createdAt,
  }));
}

// ==================== 工具函数 ====================

/** 检查 URL 是否为微信公众号文章 */
export function isWechatArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'mp.weixin.qq.com' || parsed.hostname === 'weixin.qq.com';
  } catch {
    return false;
  }
}
