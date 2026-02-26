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
  translateText,
  listSelectionTranslations,
  deleteSelectionTranslation,
} from '../translation/service';
import type { TranslationStartInput, TranslationGetInput, TranslationSettings, TranslateTextInput } from '../../shared/types';
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

      // 先获取翻译记录
      const [translation] = await db.select()
        .from(schema.translations)
        .where(eq(schema.translations.id, id));

      if (translation) {
        // 构建条件：anchorPath 包含 data-translation + 未软删除 + 匹配 articleId 或 bookId
        const conditions = [
          sql`${schema.highlights.anchorPath} LIKE '%data-translation%'`,
          eq(schema.highlights.deletedFlg, 0),
        ];

        if (translation.articleId) {
          conditions.push(eq(schema.highlights.articleId, translation.articleId));
        } else if (translation.bookId) {
          conditions.push(eq(schema.highlights.bookId, translation.bookId));
        }

        const relatedHighlights = await db.select({ id: schema.highlights.id })
          .from(schema.highlights)
          .where(and(...conditions));

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

  // 划词翻译
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATE, async (_event, input: TranslateTextInput) => {
    return translateText(input);
  });

  // 划词翻译列表
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATION_LIST, async (_event, articleId: string) => {
    return listSelectionTranslations(articleId);
  });

  // 删除划词翻译
  ipcMain.handle(IPC_CHANNELS.SELECTION_TRANSLATION_DELETE, async (_event, id: string) => {
    return deleteSelectionTranslation(id);
  });
}
