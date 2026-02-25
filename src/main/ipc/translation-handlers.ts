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
  ipcMain.handle(IPC_CHANNELS.TRANSLATION_DELETE, async (_event, id: string) => {
    await deleteTranslation(id);
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
