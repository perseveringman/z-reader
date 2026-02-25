import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  startTranslation,
  cancelTranslation,
  getTranslation,
  deleteTranslation,
  listTranslations,
  getTranslationSettings,
  saveTranslationSettingsPartial,
} from '../translation/service';
import type { TranslationStartInput, TranslationGetInput, TranslationSettings } from '../../shared/types';
import { getDatabase } from '../db';
import * as schema from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

/** 注册翻译相关 IPC handler */
export function registerTranslationHandlers() {
  // 启动翻译
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_START, async (_event, input: TranslationStartInput) => {
    return startTranslation(input);
  });

  // 取消翻译
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_CANCEL, async (_event, id: string) => {
    cancelTranslation(id);
  });

  // 查询翻译
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_GET, async (_event, input: TranslationGetInput) => {
    return getTranslation(input);
  });

  // 删除翻译
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_DELETE, async (_event, id: string, confirmed?: boolean) => {
    // 如果未确认，先检查是否有关联高亮
    if (!confirmed) {
      const db = getDatabase();
      // 查询高亮表中 anchorPath 包含 'data-translation' 的记录
      // 这些高亮是在翻译文本上创建的
      const highlights = await db.select()
        .from(schema.highlights)
        .where(
          and(
            // anchorPath 中包含 data-translation 表示是翻译文本上的高亮
            sql`${schema.highlights.anchorPath} LIKE '%data-translation%'`,
            eq(schema.highlights.deletedFlg, 0),
          )
        );

      // 过滤出属于该翻译对应文章的高亮
      // 需要先获取翻译记录来知道 articleId
      const [translation] = await db.select()
        .from(schema.translations)
        .where(eq(schema.translations.id, id));

      if (translation?.articleId) {
        const relatedHighlights = highlights.filter(h => h.articleId === translation.articleId);
        if (relatedHighlights.length > 0) {
          return { needConfirm: true, highlightCount: relatedHighlights.length };
        }
      }
    }

    await deleteTranslation(id);
    return { needConfirm: false, highlightCount: 0 };
  });

  // 列出翻译版本
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_LIST, async (_event, articleId: string) => {
    return listTranslations(articleId);
  });

  // 获取翻译设置
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_SETTINGS_GET, async () => {
    return getTranslationSettings();
  });

  // 保存翻译设置
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_SETTINGS_SET, async (_event, partial: Partial<TranslationSettings>) => {
    saveTranslationSettingsPartial(partial);
  });
}
