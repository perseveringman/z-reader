import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { eq, and, desc, or } from 'drizzle-orm';
import { getDatabase, getSqlite } from '../db';
import * as schema from '../db/schema';
import { AIDatabase } from '../../ai/providers/db';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { createTranslationEngine } from './factory';
import type {
  Translation,
  TranslationParagraph,
  TranslationSettings,
  TranslationStartInput,
  TranslationGetInput,
  TranslationProgressEvent,
  TranslationProvider,
} from '../../shared/types';

// ==================== 常量 ====================

/** 每批翻译的段落数 */
const BATCH_SIZE = 10;

/** 默认翻译设置 */
const DEFAULT_SETTINGS: TranslationSettings = {
  provider: 'llm',
  llm: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    style: 'professional',
    customPrompt: '',
  },
  google: {
    apiKey: '',
  },
  microsoft: {
    apiKey: '',
    region: 'eastasia',
  },
  defaultTargetLang: 'zh-CN',
  autoDetectLang: true,
  autoTranslateFeeds: [],
  display: {
    fontSize: 14,
    color: '#9ca3af',
    opacity: 0.85,
    showOriginal: true,
  },
  shortcut: 'CmdOrCtrl+Shift+T',
};

// ==================== HTML 段落提取 ====================

/** 匹配块级标签内容的正则 */
const BLOCK_TAG_RE = /<(p|li|blockquote|h[1-6])(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

/** 去除 HTML 标签的正则 */
const STRIP_TAGS_RE = /<[^>]+>/g;

/**
 * 从 HTML 内容中提取段落文本
 *
 * 匹配 <p>, <li>, <blockquote>, <h1>~<h6> 标签的内容，
 * 去除内部 HTML 标签得到纯文本。
 * 注意：运行在 Node.js 主进程环境，没有真实 DOM，使用正则匹配。
 */
function extractFromHtml(html: string): string[] {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  // 重置 lastIndex 避免全局正则的有状态问题
  BLOCK_TAG_RE.lastIndex = 0;
  while ((match = BLOCK_TAG_RE.exec(html)) !== null) {
    const text = match[2].replace(STRIP_TAGS_RE, '').trim();
    if (text) results.push(text);
  }
  return results;
}

// ==================== 内部工具 ====================

/** 获取 AIDatabase 实例（用于 aiSettings 键值存储） */
function getAIDatabase(): AIDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  return new AIDatabase(sqlite);
}

/** 向所有窗口广播翻译进度事件 */
function broadcastProgress(event: TranslationProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TRANSLATION_ON_PROGRESS, event);
    }
  }
}

/**
 * 根据 provider 确定模型名称（记录到 translations.model 字段）
 */
function resolveModelName(provider: TranslationProvider, settings: TranslationSettings): string {
  switch (provider) {
    case 'google':
      return 'google';
    case 'microsoft':
      return 'microsoft';
    case 'llm':
    default:
      return settings.llm.model || 'gpt-4o-mini';
  }
}

// ==================== 进行中翻译的 AbortController 存储 ====================

/** 存储进行中翻译的 AbortController，key 为 translationId */
const runningTranslations = new Map<string, AbortController>();

// ==================== 翻译设置管理 ====================

/**
 * 从 aiSettings 键值存储中加载翻译配置
 * 不存在时返回默认值，存在时与默认值合并确保字段完整
 */
export function loadTranslationSettings(): TranslationSettings {
  const aiDb = getAIDatabase();
  const saved = aiDb.getSetting('translationConfig') as Partial<TranslationSettings> | null;

  if (!saved) return { ...DEFAULT_SETTINGS };

  // 深度合并：确保所有字段都有默认值
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    llm: { ...DEFAULT_SETTINGS.llm, ...(saved.llm || {}) },
    google: { ...DEFAULT_SETTINGS.google, ...(saved.google || {}) },
    microsoft: { ...DEFAULT_SETTINGS.microsoft, ...(saved.microsoft || {}) },
    display: { ...DEFAULT_SETTINGS.display, ...(saved.display || {}) },
    autoTranslateFeeds: saved.autoTranslateFeeds ?? DEFAULT_SETTINGS.autoTranslateFeeds,
  };
}

/**
 * 保存翻译配置（支持部分更新）
 * 先加载当前配置，再合并传入的部分字段
 */
export function saveTranslationSettings(partial: Partial<TranslationSettings>): void {
  const current = loadTranslationSettings();
  const merged: TranslationSettings = {
    ...current,
    ...partial,
    llm: { ...current.llm, ...(partial.llm || {}) },
    google: { ...current.google, ...(partial.google || {}) },
    microsoft: { ...current.microsoft, ...(partial.microsoft || {}) },
    display: { ...current.display, ...(partial.display || {}) },
  };

  const aiDb = getAIDatabase();
  aiDb.setSetting('translationConfig', merged);
}

// ==================== 段落提取 ====================

/**
 * 根据 sourceType 提取原文段落
 *
 * - article: 从 articles 表读取 content 字段，用正则提取段落文本
 * - transcript: 从 transcripts 表读取 segments JSON，提取每个 segment 的 text
 * - book: 暂时预留，返回空数组
 */
export async function extractParagraphs(input: TranslationStartInput): Promise<string[]> {
  const db = getDatabase();

  switch (input.sourceType) {
    case 'article': {
      if (!input.articleId) throw new Error('翻译文章时必须提供 articleId');
      const [article] = await db
        .select({ content: schema.articles.content })
        .from(schema.articles)
        .where(eq(schema.articles.id, input.articleId));

      if (!article?.content) {
        throw new Error('文章内容为空，无法翻译');
      }

      return extractFromHtml(article.content);
    }

    case 'transcript': {
      if (!input.articleId) throw new Error('翻译转录时必须提供 articleId');
      const [row] = await db
        .select({ segments: schema.transcripts.segments })
        .from(schema.transcripts)
        .where(eq(schema.transcripts.articleId, input.articleId));

      if (!row?.segments) {
        throw new Error('转录数据为空，无法翻译');
      }

      const segments = JSON.parse(row.segments) as Array<{ text: string }>;
      return segments.map((s) => s.text).filter((t) => t.trim());
    }

    case 'book': {
      // 预留：目前直接返回空数组
      return [];
    }

    default:
      throw new Error(`不支持的翻译源类型: ${input.sourceType}`);
  }
}

// ==================== 翻译执行 ====================

/**
 * 启动翻译任务
 *
 * 核心流程：
 * 1. 加载翻译设置 + 创建翻译引擎
 * 2. 提取原文段落
 * 3. 创建 translations 记录
 * 4. 逐批翻译（每批 BATCH_SIZE 段）
 * 5. 每完成一批通过 BrowserWindow 推送进度
 * 6. 完成后更新 status: 'completed'
 * 7. 出错时保留已翻译段落，status: 'failed'
 * 8. 支持 AbortController 取消
 */
export async function startTranslation(input: TranslationStartInput): Promise<Translation> {
  const db = getDatabase();
  const settings = loadTranslationSettings();
  const provider = input.provider ?? settings.provider;

  // 创建翻译引擎（使用指定或默认 provider）
  const engineSettings: TranslationSettings = { ...settings, provider };
  const engine = createTranslationEngine(engineSettings);

  // 提取原文段落
  const paragraphTexts = await extractParagraphs(input);
  if (paragraphTexts.length === 0) {
    throw new Error('未提取到可翻译的段落');
  }

  // 自动检测源语言
  let sourceLang: string | null = null;
  if (settings.autoDetectLang && paragraphTexts.length > 0) {
    try {
      // 取前几段文本作为检测样本
      const sample = paragraphTexts.slice(0, 3).join(' ');
      sourceLang = await engine.detectLanguage(sample);
    } catch {
      // 检测失败不阻塞翻译流程
      console.warn('语言自动检测失败，将由翻译引擎自行判断');
    }
  }

  // 构建段落数组
  const paragraphs: TranslationParagraph[] = paragraphTexts.map((text, index) => ({
    index,
    original: text,
    translated: '',
  }));

  const modelName = resolveModelName(provider, settings);

  // ==================== 断点续传：检查已有的失败/进行中记录 ====================
  const resumeConditions = [
    eq(schema.translations.targetLang, input.targetLang),
    eq(schema.translations.deletedFlg, 0),
    or(
      eq(schema.translations.status, 'failed'),
      eq(schema.translations.status, 'translating'),
    ),
  ];
  if (input.articleId) {
    resumeConditions.push(eq(schema.translations.articleId, input.articleId));
  }
  if (input.bookId) {
    resumeConditions.push(eq(schema.translations.bookId, input.bookId));
  }

  const existingRows = await db
    .select()
    .from(schema.translations)
    .where(and(...resumeConditions))
    .orderBy(desc(schema.translations.createdAt))
    .limit(1);

  const existing = existingRows[0];
  if (existing && (existing.status === 'failed' || existing.status === 'translating')) {
    // 解析已有段落数据，找到最后一个已翻译的 index
    const existingParagraphs: TranslationParagraph[] = existing.paragraphs
      ? JSON.parse(existing.paragraphs)
      : [];
    const lastTranslatedIndex = existingParagraphs.reduceRight(
      (found: number, p: TranslationParagraph, i: number) =>
        found === -1 && p.translated ? i : found,
      -1,
    );

    // 如果有已翻译的段落，从断点继续
    if (lastTranslatedIndex >= 0) {
      // 将已翻译的段落合并到新的 paragraphs 中
      for (let i = 0; i <= lastTranslatedIndex && i < paragraphs.length; i++) {
        if (existingParagraphs[i]?.translated) {
          paragraphs[i].translated = existingParagraphs[i].translated;
        }
      }

      const resumeNow = new Date().toISOString();
      const resumeProgress = (lastTranslatedIndex + 1) / paragraphs.length;

      // 更新已有记录状态为 translating
      await db
        .update(schema.translations)
        .set({
          status: 'translating',
          progress: resumeProgress,
          paragraphs: JSON.stringify(paragraphs),
          updatedAt: resumeNow,
        })
        .where(eq(schema.translations.id, existing.id));

      // 使用已有记录 ID 开始后台翻译（从断点处开始）
      const abortController = new AbortController();
      runningTranslations.set(existing.id, abortController);

      translateInBackground(
        existing.id,
        paragraphs,
        engine,
        sourceLang,
        input.targetLang,
        abortController,
        lastTranslatedIndex + 1, // 从断点处开始
      ).catch((err) => {
        console.error(`翻译任务（续传）${existing.id} 异常:`, err);
      });

      return mapRowToTranslation({
        ...existing,
        status: 'translating',
        progress: resumeProgress,
        paragraphs: JSON.stringify(paragraphs),
        updatedAt: resumeNow,
      });
    }
  }

  // ==================== 正常流程：创建新翻译记录 ====================
  const now = new Date().toISOString();
  const translationId = randomUUID();

  // 创建 translations 记录
  await db.insert(schema.translations).values({
    id: translationId,
    articleId: input.articleId ?? null,
    bookId: input.bookId ?? null,
    sourceType: input.sourceType,
    sourceLang,
    targetLang: input.targetLang,
    paragraphs: JSON.stringify(paragraphs),
    model: modelName,
    promptTemplate: null,
    tokenCount: 0,
    status: 'translating',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    deletedFlg: 0,
  });

  // 创建 AbortController 用于取消控制
  const abortController = new AbortController();
  runningTranslations.set(translationId, abortController);

  // 异步执行翻译（不阻塞返回）
  translateInBackground(
    translationId,
    paragraphs,
    engine,
    sourceLang,
    input.targetLang,
    abortController,
  ).catch((err) => {
    console.error(`翻译任务 ${translationId} 异常:`, err);
  });

  // 立即返回翻译记录
  return {
    id: translationId,
    articleId: input.articleId ?? null,
    bookId: input.bookId ?? null,
    sourceType: input.sourceType,
    sourceLang,
    targetLang: input.targetLang,
    paragraphs,
    model: modelName,
    promptTemplate: null,
    tokenCount: 0,
    status: 'translating',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 后台逐批翻译执行
 *
 * 每批完成后更新数据库并推送进度，支持中断取消。
 * @param startIndex 从第几个段落开始翻译（断点续传时使用），默认为 0
 */
async function translateInBackground(
  translationId: string,
  paragraphs: TranslationParagraph[],
  engine: import('./engine').TranslationEngine,
  sourceLang: string | null,
  targetLang: string,
  abortController: AbortController,
  startIndex = 0,
): Promise<void> {
  const db = getDatabase();
  const total = paragraphs.length;
  let completedCount = startIndex; // 从断点处开始计数

  try {
    // 逐批翻译（从 startIndex 开始）
    for (let i = startIndex; i < total; i += BATCH_SIZE) {
      // 检查是否已取消
      if (abortController.signal.aborted) {
        await updateTranslationStatus(translationId, 'failed', paragraphs, completedCount / total);
        return;
      }

      const batchEnd = Math.min(i + BATCH_SIZE, total);
      const batchTexts = paragraphs.slice(i, batchEnd).map((p) => p.original);

      // 调用翻译引擎批量翻译
      const translatedTexts = await engine.translateBatch(batchTexts, sourceLang, targetLang);

      // 校验返回数量与输入一致
      if (translatedTexts.length !== batchTexts.length) {
        throw new Error(
          `翻译引擎返回数量不匹配: 期望 ${batchTexts.length}, 实际 ${translatedTexts.length}`
        );
      }

      // 更新段落翻译结果
      for (let j = 0; j < translatedTexts.length; j++) {
        paragraphs[i + j].translated = translatedTexts[j];
      }

      completedCount = batchEnd;
      const progress = completedCount / total;

      // 更新数据库
      const now = new Date().toISOString();
      await db
        .update(schema.translations)
        .set({
          paragraphs: JSON.stringify(paragraphs),
          progress,
          updatedAt: now,
        })
        .where(eq(schema.translations.id, translationId));

      // 广播进度事件（推送最后一段的翻译结果）
      broadcastProgress({
        translationId,
        index: batchEnd - 1,
        translated: translatedTexts[translatedTexts.length - 1],
        progress,
      });
    }

    // 全部完成
    await updateTranslationStatus(translationId, 'completed', paragraphs, 1);
  } catch (err) {
    // 出错时保留已翻译段落，标记为失败
    console.error(`翻译任务 ${translationId} 出错:`, err);
    await updateTranslationStatus(translationId, 'failed', paragraphs, completedCount / total);
  } finally {
    // 清理 AbortController 引用
    runningTranslations.delete(translationId);
  }
}

/**
 * 更新翻译记录的状态、段落和进度
 */
async function updateTranslationStatus(
  translationId: string,
  status: 'completed' | 'failed',
  paragraphs: TranslationParagraph[],
  progress: number,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db
    .update(schema.translations)
    .set({
      status,
      paragraphs: JSON.stringify(paragraphs),
      progress,
      updatedAt: now,
    })
    .where(eq(schema.translations.id, translationId));
}

// ==================== 取消翻译 ====================

/**
 * 取消进行中的翻译任务
 * 通过 AbortController.abort() 通知翻译循环中断
 */
export function cancelTranslation(translationId: string): void {
  const controller = runningTranslations.get(translationId);
  if (controller) {
    controller.abort();
    runningTranslations.delete(translationId);
  }
}

// ==================== 内容变更检测 ====================

/**
 * 检测文章内容是否在翻译后发生了变更
 *
 * 比较策略：
 * 1. 段落数量是否一致
 * 2. 首段和末段原文文本是否一致
 * 如果以上任一不同，认为内容已变更，翻译可能需要更新。
 */
function checkContentChanged(
  currentParagraphs: string[],
  savedParagraphs: TranslationParagraph[],
): boolean {
  // 段落数量不同
  if (currentParagraphs.length !== savedParagraphs.length) return true;

  if (currentParagraphs.length > 0) {
    // 首段文本不同
    if (currentParagraphs[0] !== savedParagraphs[0]?.original) return true;
    // 末段文本不同
    const last = currentParagraphs.length - 1;
    if (currentParagraphs[last] !== savedParagraphs[last]?.original) return true;
  }

  return false;
}

// ==================== 查询翻译 ====================

/**
 * 查询指定文章/书籍 + 目标语言的最新已完成翻译
 *
 * 对于文章类型的翻译，会额外检测内容是否在翻译后发生变更，
 * 通过返回值的 contentChanged 字段标识。
 */
export async function getTranslation(
  input: TranslationGetInput,
): Promise<(Translation & { contentChanged?: boolean }) | null> {
  if (!input.articleId && !input.bookId) {
    throw new Error('必须提供 articleId 或 bookId');
  }

  const db = getDatabase();
  const conditions = [
    eq(schema.translations.targetLang, input.targetLang),
    eq(schema.translations.deletedFlg, 0),
    eq(schema.translations.status, 'completed'),
  ];

  if (input.articleId) {
    conditions.push(eq(schema.translations.articleId, input.articleId));
  }
  if (input.bookId) {
    conditions.push(eq(schema.translations.bookId, input.bookId));
  }

  const rows = await db
    .select()
    .from(schema.translations)
    .where(and(...conditions))
    .orderBy(desc(schema.translations.createdAt))
    .limit(1);

  if (rows.length === 0) return null;

  const translation = mapRowToTranslation(rows[0]);

  // 对文章类型的翻译进行内容变更检测
  if (input.articleId && translation.sourceType === 'article') {
    try {
      const [article] = await db
        .select({ content: schema.articles.content })
        .from(schema.articles)
        .where(eq(schema.articles.id, input.articleId));

      if (article?.content) {
        const currentParagraphs = extractFromHtml(article.content);
        const contentChanged = checkContentChanged(currentParagraphs, translation.paragraphs);
        return { ...translation, contentChanged };
      }
    } catch {
      // 检测失败不影响返回翻译结果
      console.warn('内容变更检测失败，跳过');
    }
  }

  return translation;
}

/**
 * 查询文章的所有翻译版本
 */
export async function listTranslations(articleId: string): Promise<Translation[]> {
  const db = getDatabase();

  const rows = await db
    .select()
    .from(schema.translations)
    .where(
      and(
        eq(schema.translations.articleId, articleId),
        eq(schema.translations.deletedFlg, 0),
      ),
    )
    .orderBy(desc(schema.translations.createdAt));

  return rows.map(mapRowToTranslation);
}

/**
 * 软删除翻译记录
 */
export async function deleteTranslation(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db
    .update(schema.translations)
    .set({
      deletedFlg: 1,
      updatedAt: now,
    })
    .where(eq(schema.translations.id, id));
}

// ==================== 翻译设置对外接口 ====================

/**
 * 获取翻译设置
 */
export function getTranslationSettings(): TranslationSettings {
  return loadTranslationSettings();
}

/**
 * 保存翻译设置（支持部分更新）
 */
export function saveTranslationSettingsPartial(partial: Partial<TranslationSettings>): void {
  saveTranslationSettings(partial);
}

// ==================== 内部工具函数 ====================

/**
 * 将数据库行映射为 Translation 类型
 */
function mapRowToTranslation(row: typeof schema.translations.$inferSelect): Translation {
  return {
    id: row.id,
    articleId: row.articleId,
    bookId: row.bookId,
    sourceType: row.sourceType as Translation['sourceType'],
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    paragraphs: row.paragraphs ? JSON.parse(row.paragraphs) : [],
    model: row.model,
    promptTemplate: row.promptTemplate,
    tokenCount: row.tokenCount ?? 0,
    status: (row.status ?? 'pending') as Translation['status'],
    progress: row.progress ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
