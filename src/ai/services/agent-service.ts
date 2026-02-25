/**
 * AgentService — 上下文感知的 Agent 核心服务
 *
 * 在 ChatService 基础上升级：
 * - 根据 viewState 动态注入活跃模块
 * - 工具分级控制（read / write / navigate）
 * - 通过 ActionRouter 实现 write 操作确认
 * - 导航卡片支持
 */

import { streamText, generateText, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { ToolContext } from '../tools/types';
import type { AIDatabase } from '../providers/db';
import { ActionRouter } from './action-router';
import { createAllTools } from '../tools';
import type {
  AgentStreamChunk,
  AgentViewState,
  AgentActionLevel,
  ChatMessage,
} from '../../shared/types';

/** Agent 模块后端定义 */
export interface AgentModuleBackend {
  /** 模块唯一标识 */
  id: string;
  /** 激活条件：根据 viewState 判断是否启用 */
  activeWhen: (viewState: AgentViewState) => boolean;
  /** 注入到 system prompt 的模块描述 */
  systemPromptSegment: string;
  /** 该模块下各 tool 的操作分级 */
  actionLevels: Record<string, AgentActionLevel>;
}

/** AgentService 的依赖注入接口 */
export interface AgentServiceDeps {
  /** 根据任务类型获取对应的语言模型 */
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
  /** Tool Calling 所需的数据访问上下文 */
  toolContext: ToolContext;
  /** AI 模块数据库操作层 */
  aiDb: AIDatabase;
}

/**
 * AgentService 核心类
 *
 * 管理上下文感知的多轮 Agent 对话：
 * 1. 根据 viewState 激活对应模块
 * 2. 动态构建 system prompt
 * 3. 工具分级控制（read 直接执行 / write 需确认）
 * 4. 流式输出到前端
 */
export class AgentService {
  private modules: AgentModuleBackend[] = [];
  private actionRouter: ActionRouter;

  constructor(private deps: AgentServiceDeps) {
    this.actionRouter = new ActionRouter({ aiDb: deps.aiDb });
    this.registerDefaultModules();
  }

  /** 获取 ActionRouter 实例（供 IPC handler 使用） */
  getActionRouter(): ActionRouter {
    return this.actionRouter;
  }

  /** 注册默认模块 */
  private registerDefaultModules(): void {
    this.modules = [
      {
        id: 'articles',
        activeWhen: (vs) => {
          const page = vs.pageState.page;
          return ['library-articles', 'reader', 'feeds'].includes(page);
        },
        systemPromptSegment:
          '你可以搜索文章、获取文章内容、标记已读、归档文章。',
        actionLevels: {
          search_articles: 'read',
          get_article_content: 'read',
          mark_as_read: 'write',
          archive_article: 'write',
        },
      },
      {
        id: 'tags',
        activeWhen: () => true,
        systemPromptSegment: '你可以查看、添加和移除标签。',
        actionLevels: {
          list_tags: 'read',
          add_tag: 'write',
          remove_tag: 'write',
        },
      },
      {
        id: 'feeds',
        activeWhen: (vs) => {
          const page = vs.pageState.page;
          return ['feeds', 'library-articles'].includes(page);
        },
        systemPromptSegment: '你可以查看订阅源列表和阅读统计。',
        actionLevels: {
          list_feeds: 'read',
          get_reading_stats: 'read',
        },
      },
      {
        id: 'highlights',
        activeWhen: (vs) => vs.pageState.page === 'reader',
        systemPromptSegment: '你可以查看和创建高亮标注。',
        actionLevels: {
          list_highlights: 'read',
          create_highlight: 'write',
        },
      },
    ];
  }

  /** 根据 viewState 过滤出活跃模块 */
  resolveActiveModules(viewState: AgentViewState): AgentModuleBackend[] {
    return this.modules.filter((m) => m.activeWhen(viewState));
  }

  /** 构建上下文感知的 system prompt */
  buildSystemPrompt(
    activeModules: AgentModuleBackend[],
    viewState: AgentViewState,
    articleContext?: string | null,
  ): string {
    let prompt = `你是 Z-Reader 的 AI 助手，帮助用户管理和理解他们的 RSS 订阅内容。
回答请使用用户的语言。`;

    // 注入当前页面上下文
    prompt += `\n\n当前页面：${viewState.pageState.page}`;

    // 注入当前文章/内容上下文
    if (articleContext) {
      prompt += `\n\n当前正在阅读的文章内容：\n${articleContext.slice(0, 6000)}`;
    }

    if (viewState.common.selectedText) {
      prompt += `\n\n用户选中的文本：${viewState.common.selectedText.slice(0, 500)}`;
    }

    // 注入活跃模块的能力描述
    if (activeModules.length > 0) {
      prompt += '\n\n你当前可以使用以下能力：';
      for (const mod of activeModules) {
        prompt += `\n- [${mod.id}] ${mod.systemPromptSegment}`;
      }
    }

    return prompt;
  }

  /** 查询某个 tool 的操作分级 */
  getActionLevel(
    toolName: string,
    activeModules: AgentModuleBackend[],
  ): AgentActionLevel {
    for (const mod of activeModules) {
      if (toolName in mod.actionLevels) {
        return mod.actionLevels[toolName];
      }
    }
    return 'read';
  }

  /**
   * 处理用户消息 — Agent 主入口
   *
   * @param sessionId - 会话 ID
   * @param userMessage - 用户输入
   * @param viewState - 当前视图状态
   * @param onChunk - 流式 Chunk 回调
   */
  async handleMessage(
    sessionId: string,
    userMessage: string,
    viewState: AgentViewState,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<void> {
    // 1. 解析活跃模块，推送 context-hint
    const activeModules = this.resolveActiveModules(viewState);
    onChunk({
      type: 'context-hint',
      contextHint: { activeModules: activeModules.map((m) => m.id) },
    });

    // 2. 加载历史消息
    const session = this.deps.aiDb.getChatSession(sessionId);
    let history: ChatMessage[] = [];
    if (session) {
      try {
        history = JSON.parse(session.messages_json);
      } catch {
        history = [];
      }
    }

    // 3. 自动拉取当前文章上下文（Pull 模式）
    let articleContext: string | null = null;
    const ps = viewState.pageState;
    if (ps.page === 'reader' || ps.page === 'video-reader' || ps.page === 'podcast-reader') {
      const articleId = 'articleId' in ps ? (ps as { articleId: string }).articleId : null;
      if (articleId) {
        try {
          articleContext = await this.deps.toolContext.getArticleContent(articleId);
        } catch {
          // 拉取失败不影响对话
        }
      }
    }

    // 4. 构建 system prompt（含文章上下文）
    const systemPrompt = this.buildSystemPrompt(activeModules, viewState, articleContext);

    // 4. 构建 messages 数组
    const messages = this.toSDKMessages(history, userMessage);

    // 5. 创建 tools
    const tools = createAllTools(this.deps.toolContext);

    // 6. 调用 streamText（AI SDK v6 API）
    const result = streamText({
      model: this.deps.getModel('smart'),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });

    // 7. 消费 fullStream，逐块推送
    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.text;
          onChunk({ type: 'text-delta', textDelta: part.text });
        } else if (part.type === 'tool-call') {
          // 查询操作分级，附加到 chunk
          const actionLevel = this.getActionLevel(
            part.toolName,
            activeModules,
          );
          onChunk({
            type: 'tool-call',
            toolCall: {
              name: part.toolName,
              args: part.input as Record<string, unknown>,
            },
          });

          // write 操作：通过 ActionRouter 请求确认（MVP 阶段仅发送通知，不阻塞流）
          if (
            actionLevel === 'write' &&
            !this.actionRouter.isActionTrusted(part.toolName)
          ) {
            const preview = `执行 ${part.toolName}(${JSON.stringify(part.input)})`;
            onChunk({
              type: 'action-confirm',
              actionConfirm: {
                toolName: part.toolName,
                preview,
                confirmId: '', // MVP 阶段不阻塞，仅通知
                allowTrust: true,
                args: part.input as Record<string, unknown>,
              },
            });
          }
        } else if (part.type === 'tool-result') {
          // 检查是否需要构建导航卡片
          const navCard = this.buildNavCard(
            part.toolName,
            part.output as Record<string, unknown>,
          );
          onChunk({
            type: 'tool-result',
            toolResult: {
              name: part.toolName,
              result: JSON.stringify(part.output),
              cardType: navCard ? 'navigation-card' : undefined,
            },
          });

          // 如果有导航卡片，额外推送
          if (navCard) {
            onChunk({ type: 'navigation-card', navigationCard: navCard });
          }
        }
      }

      // 8. 获取 totalUsage，发送 done chunk
      const totalUsage = await result.totalUsage;
      onChunk({
        type: 'done',
        tokenCount: totalUsage?.totalTokens ?? 0,
        fullText,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      onChunk({ type: 'error', error: errMsg });
    }

    // 9. 持久化消息
    this.persistMessages(sessionId, history, userMessage, fullText);

    // 10. 首次对话后自动生成标题
    const isFirstMessage = history.length === 0;
    if (isFirstMessage && fullText) {
      this.generateTitle(sessionId, userMessage, fullText, onChunk).catch(
        () => {
          // 标题生成失败不影响主流程
        },
      );
    }
  }

  /**
   * 将历史消息 + 新消息转为 AI SDK CoreMessage[] 格式
   */
  private toSDKMessages(
    history: ChatMessage[],
    userMessage: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const sdkMessages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    sdkMessages.push({ role: 'user', content: userMessage });
    return sdkMessages;
  }

  /** 持久化消息到数据库 */
  private persistMessages(
    sessionId: string,
    history: ChatMessage[],
    userMessage: string,
    aiReply: string,
  ): void {
    const now = new Date().toISOString();
    const newMessages: ChatMessage[] = [
      ...history,
      { role: 'user' as const, content: userMessage, timestamp: now },
      { role: 'assistant' as const, content: aiReply, timestamp: now },
    ];
    this.deps.aiDb.updateChatSession(sessionId, {
      messagesJson: JSON.stringify(newMessages),
    });
  }

  /** 根据首轮对话内容自动生成会话标题 */
  private async generateTitle(
    sessionId: string,
    userMessage: string,
    aiReply: string,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<void> {
    const snippet = (userMessage + '\n' + aiReply).slice(0, 500);
    const { text } = await generateText({
      model: this.deps.getModel('fast'),
      messages: [
        {
          role: 'user',
          content: `请根据以下对话内容，生成一个简短的对话标题（不超过20个字，不要加引号和标点）：\n\n${snippet}`,
        },
      ],
    });
    const title = text.trim().slice(0, 30);
    if (title) {
      this.deps.aiDb.updateChatSession(sessionId, { title });
      onChunk({ type: 'title-generated', title });
    }
  }

  /**
   * 从工具输出构建导航卡片
   * 当 tool-result 包含可导航的目标时生成卡片数据
   */
  private buildNavCard(
    toolName: string,
    output: Record<string, unknown>,
  ): {
    title: string;
    subtitle?: string;
    targetType: string;
    targetId: string;
    thumbnail?: string;
  } | null {
    if (!output || typeof output !== 'object') return null;

    // search_articles / get_article_content 返回文章信息时生成导航卡片
    if (toolName === 'search_articles' && Array.isArray(output)) {
      // 搜索结果不生成单个卡片
      return null;
    }

    if (
      toolName === 'get_article_content' &&
      typeof output.id === 'string' &&
      typeof output.title === 'string'
    ) {
      return {
        title: output.title as string,
        subtitle: (output.summary as string) ?? undefined,
        targetType: 'article',
        targetId: output.id as string,
      };
    }

    return null;
  }
}
