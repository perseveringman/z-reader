/**
 * 微信公众号 IPC 处理器
 */
import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { eq } from 'drizzle-orm';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  parseArticleUrl,
  parseTokenUrl,
  saveToken,
  getTokenParams,
  fetchArticleList,
  fetchArticleStats,
  getArticleStats,
  getArticleComments,
  isWechatArticleUrl,
  cancelTask,
} from '../services/wechat-service';
import { downloadArticleContents } from '../services/wechat-html-saver';
import type {
  WechatFetchListInput,
  WechatDownloadContentInput,
  WechatFetchStatsInput,
  WechatProgressEvent,
} from '../../shared/types';

/** 向所有渲染进程发送进度事件 */
function sendProgress(event: WechatProgressEvent) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.WECHAT_PROGRESS, event);
  }
}

export function registerWechatHandlers() {
  const {
    WECHAT_PARSE_ARTICLE_URL,
    WECHAT_SET_TOKEN,
    WECHAT_GET_TOKEN_STATUS,
    WECHAT_FETCH_ARTICLE_LIST,
    WECHAT_DOWNLOAD_CONTENT,
    WECHAT_FETCH_STATS,
    WECHAT_GET_STATS,
    WECHAT_GET_COMMENTS,
    WECHAT_CANCEL_TASK,
  } = IPC_CHANNELS;

  // 解析微信文章 URL，提取公众号信息
  ipcMain.handle(WECHAT_PARSE_ARTICLE_URL, async (_event, url: string) => {
    return parseArticleUrl(url);
  });

  // 设置 Token
  ipcMain.handle(WECHAT_SET_TOKEN, async (_event, feedId: string, tokenUrl: string) => {
    const params = await saveToken(feedId, tokenUrl);
    if (!params) throw new Error('Token URL 格式不正确，请确认包含 __biz, uin, key, pass_ticket 参数');
    return {
      hasToken: true,
      biz: params.biz,
      expiry: new Date().toISOString(),
      isExpired: false,
    };
  });

  // 获取 Token 状态
  ipcMain.handle(WECHAT_GET_TOKEN_STATUS, async (_event, feedId: string) => {
    const params = await getTokenParams(feedId);
    if (!params) {
      return { hasToken: false, biz: null, expiry: null, isExpired: true };
    }
    const db = getDatabase();
    const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, feedId));
    return {
      hasToken: true,
      biz: params.biz,
      expiry: feed?.wechatTokenExpiry || null,
      isExpired: false, // Token 有效性只有实际请求时才能确认
    };
  });

  // 拉取文章列表（异步任务，通过进度事件通知）
  ipcMain.handle(WECHAT_FETCH_ARTICLE_LIST, async (_event, input: WechatFetchListInput) => {
    // 异步执行，不阻塞 IPC
    fetchArticleList(
      input.feedId,
      input.pagesStart,
      input.pagesEnd,
      (current, total, title) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-list',
          current,
          total,
          currentTitle: title,
          status: 'running',
        });
      },
    )
      .then((count) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-list',
          current: input.pagesEnd - input.pagesStart + 1,
          total: input.pagesEnd - input.pagesStart + 1,
          currentTitle: `完成，共保存 ${count} 篇文章`,
          status: 'completed',
        });
      })
      .catch((err) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-list',
          current: 0,
          total: 0,
          currentTitle: '',
          status: 'error',
          error: err.message,
        });
      });
  });

  // 下载文章内容（异步任务）
  ipcMain.handle(WECHAT_DOWNLOAD_CONTENT, async (_event, input: WechatDownloadContentInput) => {
    downloadArticleContents(
      input.feedId,
      input.articleIds,
      (current, total, title) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'download-content',
          current,
          total,
          currentTitle: title,
          status: 'running',
        });
      },
    )
      .then((count) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'download-content',
          current: 0,
          total: 0,
          currentTitle: `完成，共下载 ${count} 篇文章内容`,
          status: 'completed',
        });
      })
      .catch((err) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'download-content',
          current: 0,
          total: 0,
          currentTitle: '',
          status: 'error',
          error: err.message,
        });
      });
  });

  // 获取文章行为数据（异步任务）
  ipcMain.handle(WECHAT_FETCH_STATS, async (_event, input: WechatFetchStatsInput) => {
    fetchArticleStats(
      input.feedId,
      input.articleIds,
      (current, total, title) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-stats',
          current,
          total,
          currentTitle: title,
          status: 'running',
        });
      },
    )
      .then((count) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-stats',
          current: 0,
          total: 0,
          currentTitle: `完成，共获取 ${count} 篇文章数据`,
          status: 'completed',
        });
      })
      .catch((err) => {
        sendProgress({
          feedId: input.feedId,
          taskType: 'fetch-stats',
          current: 0,
          total: 0,
          currentTitle: '',
          status: 'error',
          error: err.message,
        });
      });
  });

  // 获取文章统计数据
  ipcMain.handle(WECHAT_GET_STATS, async (_event, articleId: string) => {
    return getArticleStats(articleId);
  });

  // 获取文章评论
  ipcMain.handle(WECHAT_GET_COMMENTS, async (_event, articleId: string) => {
    return getArticleComments(articleId);
  });

  // 取消任务
  ipcMain.handle(WECHAT_CANCEL_TASK, async (_event, feedId: string) => {
    cancelTask(feedId);
  });
}
