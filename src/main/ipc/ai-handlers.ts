import { ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getDatabase, getSqlite } from '../db';
import { articles, transcripts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AIDatabase } from '../../ai/providers/db';
import { createLLMProvider } from '../../ai/providers/llm';
import { DEFAULT_AI_CONFIG } from '../../ai/providers/config';
import { ChatService } from '../../ai/services/chat';
import { createToolContext } from '../ai/tool-context-factory';
import type { AIProviderConfig } from '../../ai/providers/config';
import type {
  AICreatePromptPresetInput,
  AIMindmapGenerateInput,
  AIMindmapRecord,
  AIPromptPreset,
  AIPromptPresetListQuery,
  AIPromptPresetTarget,
  AIReorderPromptPresetsInput,
  AIUpdatePromptPresetInput,
  AISummarizeInput,
  AITranslateInput,
  AIAutoTagInput,
  AIExtractTopicsInput,
  AITaskLogItem,
  AITaskLogDetail,
  ChatSendInput,
  ChatSession,
} from '../../shared/types';
import type { TaskLogRow, ChatSessionRow, PromptPresetRow, CreatePromptPresetInput, UpdatePromptPresetInput, MindmapRow } from '../../ai/providers/db';

/** 获取 AI 数据库实例 */
export function getAIDatabase(): AIDatabase {
  const sqlite = getSqlite();
  if (!sqlite) throw new Error('数据库未初始化');
  return new AIDatabase(sqlite);
}

/** 加载 AI 配置（合并默认值与用户保存的配置） */
export function loadAIConfig(aiDb: AIDatabase): AIProviderConfig {
  const saved = aiDb.getSetting('aiConfig');
  if (saved && typeof saved === 'object') {
    return { ...DEFAULT_AI_CONFIG, ...(saved as Partial<AIProviderConfig>) };
  }
  return DEFAULT_AI_CONFIG;
}

/** 将 snake_case 的 TaskLogRow 转换为 camelCase 的 AITaskLogItem */
function mapTaskLogRow(row: TaskLogRow): AITaskLogItem {
  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    tokenCount: row.token_count,
    costUsd: row.cost_usd,
    createdAt: row.created_at,
  };
}

/** 将 TaskLogRow 转换为包含完整详情的 AITaskLogDetail */
function mapTaskLogDetail(row: TaskLogRow): AITaskLogDetail {
  return {
    ...mapTaskLogRow(row),
    inputJson: row.input_json,
    outputJson: row.output_json,
    tracesJson: row.traces_json,
    errorText: row.error_text,
  };
}

/** 将 snake_case 的 ChatSessionRow 转换为 camelCase 的 ChatSession */
export function mapChatSessionRow(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    articleId: row.article_id,
    messages: JSON.parse(row.messages_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMindmapRow(row: MindmapRow): AIMindmapRecord {
  return {
    articleId: row.article_id,
    title: row.title,
    sourceType: row.source_type as AIMindmapRecord['sourceType'],
    sourceHash: row.source_hash,
    promptVersion: row.prompt_version,
    model: row.model,
    mindmapMarkdown: row.mindmap_markdown,
    tokenCount: row.token_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUPPORTED_PROMPT_TARGETS: AIPromptPresetTarget[] = ['chat', 'summarize', 'translate', 'autoTag', 'extractTopics'];
const SUPPORTED_PROMPT_ICON_KEYS = [
  'message-square',
  'compass',
  'lightbulb',
  'atom',
  'help-circle',
  'graduation-cap',
  'brain',
  'target',
  'scale',
  'book-open',
  'briefcase',
  'sparkles',
] as const;
type PromptIconKey = (typeof SUPPORTED_PROMPT_ICON_KEYS)[number];

async function suggestPromptIconByAI(
  aiDb: AIDatabase,
  title: string,
  prompt: string,
): Promise<PromptIconKey> {
  const config = loadAIConfig(aiDb);
  if (!config.apiKey) return 'message-square';

  try {
    const llm = createLLMProvider(config);
    const { generateObject } = await import('ai');
    const { z } = await import('zod');

    const result = await generateObject({
      model: llm.getModel('fast'),
      schema: z.object({
        iconKey: z.enum(SUPPORTED_PROMPT_ICON_KEYS),
      }),
      prompt: `你是图标选择助手。请根据提示词语义，从候选图标中选择最合适的一个。

标题：${title}
提示词内容：${prompt}

候选图标：
- message-square: 通用对话/默认
- compass: 方向、价值、探索
- lightbulb: 创意、洞察、思考
- atom: 第一性原理、科学、底层原理
- help-circle: 提问、反思、质疑
- graduation-cap: 教学、解释、学习
- brain: 深度分析、认知、复杂推理
- target: 目标、聚焦、行动计划
- scale: 权衡、利弊、决策
- book-open: 阅读、总结、知识提炼
- briefcase: 商业、职业、策略
- sparkles: 灵感、优化、改写

仅返回 iconKey。`,
    });

    return result.object.iconKey;
  } catch {
    return 'message-square';
  }
}

const DEFAULT_CHAT_PROMPT_PRESETS: CreatePromptPresetInput[] = [
  {
    id: 'builtin-value-clarification',
    title: '价值澄清',
    prompt: '请用**价值澄清法**分析这篇文章：识别文章传达的核心价值观，分析这些价值观之间是否存在冲突，帮我厘清哪些是我真正认同的。',
    iconKey: 'compass',
    enabled: true,
    displayOrder: 0,
    targets: ['chat'],
    isBuiltin: true,
  },
  {
    id: 'builtin-six-thinking-hats',
    title: '六顶思考帽',
    prompt: '请用**六顶思考帽**方法分析这篇文章：分别从白帽（事实）、红帽（情感）、黑帽（风险）、黄帽（价值）、绿帽（创新）、蓝帽（全局）六个角度展开分析。',
    iconKey: 'lightbulb',
    enabled: true,
    displayOrder: 1,
    targets: ['chat'],
    isBuiltin: true,
  },
  {
    id: 'builtin-first-principles',
    title: '第一性原理',
    prompt: '请用**第一性原理**分析这篇文章：剥离表面假设，回归最基本的事实和原理，重新推导文章的核心论点是否成立。',
    iconKey: 'atom',
    enabled: true,
    displayOrder: 2,
    targets: ['chat'],
    isBuiltin: true,
  },
  {
    id: 'builtin-socratic-method',
    title: '苏格拉底提问',
    prompt: '请用**苏格拉底提问法**分析这篇文章：通过层层追问的方式，挑战文章的假设、证据和推理逻辑，帮我深入思考。',
    iconKey: 'help-circle',
    enabled: true,
    displayOrder: 3,
    targets: ['chat'],
    isBuiltin: true,
  },
  {
    id: 'builtin-feynman-technique',
    title: '费曼教学法',
    prompt: '请用**费曼教学法**解读这篇文章：用最简单易懂的语言重新解释文章的核心概念，指出我可能存在的理解盲区。',
    iconKey: 'graduation-cap',
    enabled: true,
    displayOrder: 4,
    targets: ['chat'],
    isBuiltin: true,
  },
];

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error('提示词标题不能为空');
  if (title.length > 40) throw new Error('提示词标题不能超过 40 字符');
  return title;
}

function normalizePrompt(value: string): string {
  const prompt = value.trim();
  if (!prompt) throw new Error('提示词内容不能为空');
  if (prompt.length > 2000) throw new Error('提示词内容不能超过 2000 字符');
  return prompt;
}

function normalizeTargets(
  targets: unknown,
  mode: 'create' | 'update',
): AIPromptPresetTarget[] | undefined {
  if (targets === undefined) {
    return mode === 'create' ? ['chat'] : undefined;
  }
  if (!Array.isArray(targets)) {
    throw new Error('提示词目标场景格式错误');
  }

  const normalized = targets
    .filter((item): item is string => typeof item === 'string')
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .filter((item): item is AIPromptPresetTarget => SUPPORTED_PROMPT_TARGETS.includes(item as AIPromptPresetTarget));

  if (normalized.length === 0) {
    throw new Error('至少选择一个目标场景');
  }
  return normalized;
}

function mapPromptPresetRow(row: PromptPresetRow): AIPromptPreset {
  let targets: AIPromptPresetTarget[] = ['chat'];
  try {
    const parsed = JSON.parse(row.targets_json) as unknown;
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .filter((item): item is string => typeof item === 'string')
        .filter((item): item is AIPromptPresetTarget => SUPPORTED_PROMPT_TARGETS.includes(item as AIPromptPresetTarget));
      if (normalized.length > 0) {
        targets = normalized;
      }
    }
  } catch {
    targets = ['chat'];
  }

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    iconKey: row.icon_key || 'message-square',
    enabled: row.enabled === 1,
    displayOrder: row.display_order,
    targets,
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureBuiltinPromptPresets(aiDb: AIDatabase): void {
  aiDb.upsertBuiltinPromptPresets(DEFAULT_CHAT_PROMPT_PRESETS);
}

const MINDMAP_PROMPT_VERSION = 'mindmap-v1';

function parseTranscriptText(segmentsJson: string | null | undefined): string {
  if (!segmentsJson) return '';
  try {
    const segments = JSON.parse(segmentsJson) as Array<{ text?: unknown }>;
    if (!Array.isArray(segments)) return '';
    return segments
      .map((segment) => (typeof segment?.text === 'string' ? segment.text.trim() : ''))
      .filter((text) => text.length > 0)
      .join('\n');
  } catch {
    return '';
  }
}

function pickMindmapSource(input: {
  mediaType: string | null | undefined;
  contentText: string | null | undefined;
  content: string | null | undefined;
  summary: string | null | undefined;
  transcriptSegments: string | null | undefined;
}): { sourceType: AIMindmapRecord['sourceType']; sourceText: string } {
  const transcriptText = parseTranscriptText(input.transcriptSegments);
  const articleBody = input.contentText || input.content || '';
  const summary = input.summary || '';

  if ((input.mediaType === 'video' || input.mediaType === 'podcast') && transcriptText) {
    return { sourceType: 'transcript', sourceText: transcriptText };
  }
  if (articleBody) {
    return { sourceType: 'article', sourceText: articleBody };
  }
  if (summary) {
    return { sourceType: 'summary', sourceText: summary };
  }
  if (transcriptText) {
    return { sourceType: 'transcript', sourceText: transcriptText };
  }

  return { sourceType: 'article', sourceText: '' };
}

function hashMindmapSource(sourceText: string): string {
  return createHash('sha256').update(sourceText).digest('hex');
}

export function registerAIHandlers() {
  // 获取 AI 设置
  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_GET, async () => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    return {
      provider: config.provider,
      apiKey: config.apiKey,
      models: config.models,
    };
  });

  // 保存 AI 设置
  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_SET, async (_event, partial) => {
    const aiDb = getAIDatabase();
    const current = loadAIConfig(aiDb);
    const updated = { ...current, ...partial };
    aiDb.setSetting('aiConfig', updated);
  });

  // 列出快捷提示词
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_LIST,
    async (_event, query?: AIPromptPresetListQuery) => {
      const aiDb = getAIDatabase();
      aiDb.initTables();
      ensureBuiltinPromptPresets(aiDb);
      const rows = aiDb.listPromptPresets({
        target: query?.target,
        enabledOnly: query?.enabledOnly,
      });
      return rows.map(mapPromptPresetRow);
    },
  );

  // 创建快捷提示词
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_CREATE,
    async (_event, input: AICreatePromptPresetInput) => {
      const aiDb = getAIDatabase();
      aiDb.initTables();

      const title = normalizeTitle(input.title);
      const prompt = normalizePrompt(input.prompt);
      const targets = normalizeTargets(input.targets, 'create')!;
      const iconKey = await suggestPromptIconByAI(aiDb, title, prompt);

      let displayOrder = input.displayOrder;
      if (displayOrder === undefined || displayOrder === null) {
        const rows = aiDb.listPromptPresets();
        const maxOrder = rows.reduce((max, row) => Math.max(max, row.display_order), -1);
        displayOrder = maxOrder + 1;
      }

      const row = aiDb.createPromptPreset({
        title,
        prompt,
        iconKey,
        enabled: input.enabled !== false,
        targets,
        displayOrder,
        isBuiltin: false,
      });
      return mapPromptPresetRow(row);
    },
  );

  // 更新快捷提示词
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_UPDATE,
    async (_event, input: AIUpdatePromptPresetInput) => {
      const aiDb = getAIDatabase();
      aiDb.initTables();

      if (!input.id) {
        throw new Error('提示词 ID 不能为空');
      }

      const existing = aiDb.getPromptPreset(input.id);
      if (!existing) {
        throw new Error('提示词不存在');
      }

      const updates: UpdatePromptPresetInput = {};
      if (input.title !== undefined) {
        updates.title = normalizeTitle(input.title);
      }
      if (input.prompt !== undefined) {
        updates.prompt = normalizePrompt(input.prompt);
      }
      if (input.enabled !== undefined) {
        updates.enabled = input.enabled;
      }
      if (input.displayOrder !== undefined) {
        updates.displayOrder = input.displayOrder;
      }
      if (input.targets !== undefined) {
        updates.targets = normalizeTargets(input.targets, 'update');
      }
      if (updates.prompt !== undefined || updates.title !== undefined) {
        const nextTitle = updates.title ?? existing.title;
        const nextPrompt = updates.prompt ?? existing.prompt;
        updates.iconKey = await suggestPromptIconByAI(aiDb, nextTitle, nextPrompt);
      }

      aiDb.updatePromptPreset(input.id, updates);
    },
  );

  // 删除快捷提示词
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_DELETE,
    async (_event, id: string) => {
      const aiDb = getAIDatabase();
      aiDb.initTables();
      aiDb.deletePromptPreset(id);
    },
  );

  // 批量重排快捷提示词
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_REORDER,
    async (_event, items: AIReorderPromptPresetsInput[]) => {
      const aiDb = getAIDatabase();
      aiDb.initTables();

      if (!Array.isArray(items)) {
        throw new Error('排序参数格式错误');
      }

      const normalized = items.map((item, idx) => ({
        id: item.id,
        displayOrder: Number.isFinite(item.displayOrder) ? item.displayOrder : idx,
      }));

      aiDb.reorderPromptPresets(normalized);
    },
  );

  // 恢复默认提示词模板（补齐缺失内置项）
  ipcMain.handle(
    IPC_CHANNELS.AI_PROMPT_PRESET_RESET_BUILTINS,
    async () => {
      const aiDb = getAIDatabase();
      aiDb.initTables();
      ensureBuiltinPromptPresets(aiDb);
      return aiDb.listPromptPresets().map(mapPromptPresetRow);
    },
  );

  // 摘要生成
  ipcMain.handle(IPC_CHANNELS.AI_SUMMARIZE, async (_event, input: AISummarizeInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    // 获取文章内容
    const { getDatabase } = await import('../db');
    const { articles, transcripts } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    // 检查是否有播客转写内容
    const transcript = await db.select().from(transcripts)
      .where(eq(transcripts.articleId, input.articleId)).get();

    let prompt: string;
    let schemaDesc: string;

    if (transcript && transcript.segments) {
      // 播客模式：基于转写全文生成摘要
      const segments = JSON.parse(transcript.segments) as Array<{ text: string; speakerId?: number }>;
      const speakerMap: Record<string, string> = transcript.speakerMap
        ? JSON.parse(transcript.speakerMap) : {};

      // 拼接转写文本，带说话人标签
      let lastSpeaker = '';
      const lines: string[] = [];
      for (const seg of segments) {
        const speakerKey = seg.speakerId != null ? String(seg.speakerId) : '';
        const speakerName = speakerKey
          ? (speakerMap[speakerKey] || `说话人${seg.speakerId! + 1}`)
          : '';
        if (speakerName && speakerName !== lastSpeaker) {
          lines.push(`\n[${speakerName}]: ${seg.text}`);
          lastSpeaker = speakerName;
        } else {
          lines.push(seg.text);
        }
      }
      const transcriptText = lines.join('').slice(0, 20000);

      prompt = `你是一位专业的播客内容编辑。请根据以下播客转写全文，撰写一份结构化的内容摘要，目标是让读者不用收听原节目就能完整了解本期内容。

要求：
1. 先用 1-2 句话概括本期主题
2. 按讨论顺序梳理核心话题和关键观点（每个话题 2-3 句），标注是谁提出的
3. 如有具体数据、案例或金句，请保留
4. 最后总结嘉宾的主要共识或分歧

篇幅：400-800 字
语言：中文

标题：${article.title}

--- 转写内容 ---
${transcriptText}`;

      schemaDesc = '播客内容摘要，400-800字';
    } else {
      // 文章模式：原有逻辑
      const contentText = article.contentText || article.content || article.summary || '';
      const lang = input.language || 'zh-CN';
      prompt = `请用${lang === 'zh-CN' ? '中文' : lang}为以下文章写一段 200-400 字的摘要：\n\n标题：${article.title}\n\n${contentText.slice(0, 8000)}`;
      schemaDesc = '文章摘要，200-400字';
    }

    const result = await generateObject({
      model: llm.getModel('smart'),
      schema: z.object({
        summary: z.string().describe(schemaDesc),
      }),
      prompt,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;

    // 将摘要写回文章
    await db.update(articles).set({ summary: result.object.summary }).where(eq(articles.id, input.articleId));

    aiDb.insertTaskLog({
      taskType: 'summarize',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { summary: result.object.summary, tokenCount };
  });

  // 翻译
  ipcMain.handle(IPC_CHANNELS.AI_TRANSLATE, async (_event, input: AITranslateInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    const { getDatabase } = await import('../db');
    const { articles } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    const contentText = article.contentText || article.content || '';

    const result = await generateObject({
      model: llm.getModel('cheap'),
      schema: z.object({
        translatedTitle: z.string(),
        translatedContent: z.string(),
      }),
      prompt: `将以下内容翻译为${input.targetLanguage}。保持原文格式。\n\n标题：${article.title}\n\n${contentText.slice(0, 8000)}`,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;
    aiDb.insertTaskLog({
      taskType: 'translate',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { ...result.object, tokenCount };
  });

  // 自动标签
  ipcMain.handle(IPC_CHANNELS.AI_AUTO_TAG, async (_event, input: AIAutoTagInput) => {
    const aiDb = getAIDatabase();
    const config = loadAIConfig(aiDb);
    if (!config.apiKey) throw new Error('请先配置 AI API Key');

    const { generateObject } = await import('ai');
    const { z } = await import('zod');
    const llm = createLLMProvider(config);

    const { getDatabase } = await import('../db');
    const { articles, tags, articleTags } = await import('../db/schema');
    const { eq, and } = await import('drizzle-orm');
    const db = getDatabase();
    const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
    if (!article) throw new Error('文章不存在');

    // 获取已有标签列表供 AI 参考
    const existingTags = await db.select().from(tags).all();
    const tagNames = existingTags.map(t => t.name);

    const contentText = article.contentText || article.content || article.summary || '';

    const result = await generateObject({
      model: llm.getModel('fast'),
      schema: z.object({
        tags: z.array(z.string()).describe('3-5 个最相关的标签'),
      }),
      prompt: `基于以下文章内容，推荐 3-5 个最相关的标签。${tagNames.length > 0 ? `优先从已有标签中选择：[${tagNames.join(', ')}]。` : ''}如果已有标签不够匹配，可以建议新标签。\n\n标题：${article.title}\n\n${contentText.slice(0, 4000)}`,
    });

    const tokenCount = result.usage?.totalTokens ?? 0;

    // 将推荐标签关联到文章
    const { randomUUID } = await import('node:crypto');
    const now = new Date().toISOString();
    const allExistingTags = await db.select().from(tags).where(eq(tags.deletedFlg, 0)).all();
    const tagMap = new Map(allExistingTags.map(t => [t.name.toLowerCase(), t.id]));

    for (const tagName of result.object.tags) {
      let tagId = tagMap.get(tagName.toLowerCase());
      // 标签不存在则创建
      if (!tagId) {
        tagId = randomUUID();
        await db.insert(tags).values({
          id: tagId,
          name: tagName,
          parentId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      // 检查关联是否已存在
      const existing = await db.select().from(articleTags)
        .where(and(eq(articleTags.articleId, input.articleId), eq(articleTags.tagId, tagId)));
      if (existing.length === 0) {
        await db.insert(articleTags).values({
          articleId: input.articleId,
          tagId,
          createdAt: now,
        });
      }
    }

    aiDb.insertTaskLog({
      taskType: 'auto_tag',
      status: 'completed',
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(result.object),
      tokenCount,
      costUsd: 0,
    });

    return { tags: result.object.tags, tokenCount };
  });

  // 获取文章思维导图（只保留最新一版）
  ipcMain.handle(IPC_CHANNELS.AI_MINDMAP_GET, async (_event, articleId: string) => {
    const aiDb = getAIDatabase();
    aiDb.initTables();
    if (!articleId) throw new Error('文章 ID 不能为空');
    const row = aiDb.getMindmapByArticleId(articleId);
    return row ? mapMindmapRow(row) : null;
  });

  // 生成文章思维导图（Markdown for Markmap）
  ipcMain.handle(IPC_CHANNELS.AI_MINDMAP_GENERATE, async (_event, input: AIMindmapGenerateInput) => {
    const aiDb = getAIDatabase();
    aiDb.initTables();
    const inputJson = JSON.stringify(input);

    try {
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');
      if (!input.articleId) throw new Error('文章 ID 不能为空');

      const db = getDatabase();
      const article = await db.select().from(articles).where(eq(articles.id, input.articleId)).get();
      if (!article) throw new Error('文章不存在');

      const transcript = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.articleId, input.articleId))
        .get();

      const { sourceType, sourceText } = pickMindmapSource({
        mediaType: article.mediaType,
        contentText: article.contentText,
        content: article.content,
        summary: article.summary,
        transcriptSegments: transcript?.segments,
      });

      if (!sourceText.trim()) {
        throw new Error('正文/转写/摘要均为空，无法生成思维导图');
      }

      const llm = createLLMProvider(config);
      const { generateObject } = await import('ai');
      const { z } = await import('zod');

      const result = await generateObject({
        model: llm.getModel('smart'),
        schema: z.object({
          mindmapMarkdown: z
            .string()
            .describe('可直接用于 Markmap 的 Markdown，必须是标题+层级列表'),
        }),
        prompt: `你是思维导图助手。请将以下内容整理为适合 Markmap 渲染的 Markdown 思维导图。

要求：
1. 输出只能是 Markdown，不要解释、不要代码围栏。
2. 第一行必须是一级标题（# 标题），作为导图中心节点。
3. 使用二级及以下标题或列表表示层级结构，建议总深度不超过 4 层。
4. 每个节点用简短短语表达，避免长句（建议 6-18 字）。
5. 优先按“主题 -> 关键观点 -> 证据/例子 -> 行动建议”组织。
6. 不要杜撰不存在的信息。

标题：${article.title || '未命名内容'}
内容类型：${sourceType}

原文：
${sourceText.slice(0, 24000)}`,
      });

      const markdown = result.object.mindmapMarkdown.trim();
      if (!markdown) throw new Error('模型返回空导图');

      const tokenCount = result.usage?.totalTokens ?? 0;
      const row = aiDb.upsertMindmap({
        articleId: input.articleId,
        title: article.title,
        sourceType,
        sourceHash: hashMindmapSource(sourceText),
        promptVersion: MINDMAP_PROMPT_VERSION,
        model: config.models.smart,
        mindmapMarkdown: markdown,
        tokenCount,
      });

      aiDb.insertTaskLog({
        taskType: 'mindmap',
        status: 'completed',
        inputJson,
        outputJson: JSON.stringify({ articleId: input.articleId, tokenCount }),
        tokenCount,
        costUsd: 0,
      });

      return mapMindmapRow(row);
    } catch (error) {
      aiDb.insertTaskLog({
        taskType: 'mindmap',
        status: 'failed',
        inputJson,
        outputJson: null,
        tokenCount: 0,
        costUsd: 0,
        errorText: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // 任务日志查询
  ipcMain.handle(IPC_CHANNELS.AI_TASK_LOGS, async (_event, limit?: number) => {
    const aiDb = getAIDatabase();
    const rows = aiDb.listTaskLogs(limit ?? 20);
    return rows.map(mapTaskLogRow);
  });

  // 任务日志详情
  ipcMain.handle(IPC_CHANNELS.AI_TASK_LOG_DETAIL, async (_event, logId: string) => {
    const aiDb = getAIDatabase();
    const row = aiDb.getTaskLog(logId);
    return row ? mapTaskLogDetail(row) : null;
  });

  // ==================== AI Chat 流式通信 ====================

  // 流式 Chat 发送（使用 ipcMain.on 而非 handle，支持持续推送 chunk）
  ipcMain.on(IPC_CHANNELS.AI_CHAT_SEND, async (event, input: ChatSendInput) => {
    try {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const llm = createLLMProvider(config);
      const toolCtx = createToolContext(getDatabase());
      const chatService = new ChatService({
        getModel: llm.getModel.bind(llm),
        toolContext: toolCtx,
        aiDb,
      });

      // 获取文章上下文（如有），video/podcast 优先使用转写文本
      let articleContext: string | null = null;
      if (input.articleId) {
        const db = getDatabase();
        const article = await db
          .select()
          .from(articles)
          .where(eq(articles.id, input.articleId))
          .get();
        if (article) {
          if (article.mediaType === 'video' || article.mediaType === 'podcast') {
            const transcript = await db
              .select()
              .from(transcripts)
              .where(eq(transcripts.articleId, input.articleId))
              .get();
            const transcriptText = parseTranscriptText(transcript?.segments);
            if (transcriptText) {
              articleContext = transcriptText;
            }
          }
          if (!articleContext) {
            articleContext = article.contentText || article.summary || null;
          }
        }
      }

      await chatService.sendMessage(
        input.sessionId,
        input.message,
        articleContext,
        (chunk) => {
          // 通过 event.sender.send 逐块推送到渲染进程
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AI_CHAT_STREAM, chunk);
          }
        },
      );
    } catch (err) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AI_CHAT_STREAM, {
          type: 'error',
          error: String(err),
        });
      }
    }
  });

  // Chat Session CRUD（使用 ipcMain.handle，返回 Promise）

  // 创建 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_CREATE,
    async (_event, articleId?: string) => {
      const aiDb = getAIDatabase();
      // 初始化 chat sessions 表（如尚未创建）
      aiDb.initTables();
      const row = aiDb.createChatSession(articleId);
      return mapChatSessionRow(row);
    },
  );

  // 查询 Chat 会话列表
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_SESSION_LIST, async () => {
    const aiDb = getAIDatabase();
    return aiDb.listChatSessions().map(mapChatSessionRow);
  });

  // 获取单个 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_GET,
    async (_event, id: string) => {
      const aiDb = getAIDatabase();
      const row = aiDb.getChatSession(id);
      return row ? mapChatSessionRow(row) : null;
    },
  );

  // 删除 Chat 会话
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_DELETE,
    async (_event, id: string) => {
      const aiDb = getAIDatabase();
      aiDb.deleteChatSession(id);
    },
  );

  // 按文章查询 Chat 会话列表
  ipcMain.handle(
    IPC_CHANNELS.AI_CHAT_SESSION_LIST_BY_ARTICLE,
    async (_event, articleId: string) => {
      const aiDb = getAIDatabase();
      return aiDb.listChatSessionsByArticle(articleId).map(mapChatSessionRow);
    },
  );

  // ==================== AI 主题提取 ====================

  ipcMain.handle(
    IPC_CHANNELS.AI_EXTRACT_TOPICS,
    async (_event, input: AIExtractTopicsInput) => {
      const aiDb = getAIDatabase();
      const config = loadAIConfig(aiDb);
      if (!config.apiKey) throw new Error('请先配置 AI API Key');

      const { generateObject } = await import('ai');
      const { z } = await import('zod');
      const llm = createLLMProvider(config);

      const db = getDatabase();
      const article = await db
        .select()
        .from(articles)
        .where(eq(articles.id, input.articleId))
        .get();
      if (!article) throw new Error('文章不存在');

      const contentText =
        article.contentText || article.content || article.summary || '';

      const result = await generateObject({
        model: llm.getModel('fast'),
        schema: z.object({
          topics: z
            .array(z.string())
            .describe('文章的 3-5 个核心主题关键词'),
        }),
        prompt: `提取以下文章的 3-5 个核心主题关键词，返回简短的词组。\n\n标题：${article.title}\n\n${contentText.slice(0, 4000)}`,
      });

      const tokenCount = result.usage?.totalTokens ?? 0;

      aiDb.insertTaskLog({
        taskType: 'extract_topics',
        status: 'completed',
        inputJson: JSON.stringify(input),
        outputJson: JSON.stringify(result.object),
        tokenCount,
        costUsd: 0,
      });

      return { topics: result.object.topics, tokenCount };
    },
  );
}
