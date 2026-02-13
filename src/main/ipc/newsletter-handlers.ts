import { ipcMain } from 'electron';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase, schema } from '../db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { createNewsletter } from '../services/newsletter-service';
import { fetchFeed } from '../services/rss-service';
import type { CreateNewsletterInput } from '../../shared/types';

export function registerNewsletterHandlers() {
  const { NEWSLETTER_CREATE } = IPC_CHANNELS;

  ipcMain.handle(NEWSLETTER_CREATE, async (_event, input: CreateNewsletterInput) => {
    const db = getDatabase();
    const now = new Date().toISOString();

    // 1. 调用 kill-the-newsletter.com 创建订阅
    const result = await createNewsletter(input.name);

    // 2. 将生成的 Atom feed URL 作为 feed 存入数据库
    const id = randomUUID();
    await db.insert(schema.feeds).values({
      id,
      url: result.feedUrl,
      title: input.name.trim(),
      category: input.category ?? null,
      feedType: 'newsletter',
      createdAt: now,
      updatedAt: now,
    });

    // 3. 立即拉取一次（虽然新建的 feed 通常没有内容）
    await fetchFeed(id).catch(console.error);

    // 4. 返回创建结果
    const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, id));

    return {
      email: result.email,
      feedUrl: result.feedUrl,
      name: result.name,
      feed,
    };
  });
}
