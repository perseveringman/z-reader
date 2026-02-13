/**
 * ChatService — 多轮对话 + Tool Calling 核心服务
 *
 * 负责：
 * - 组装 system prompt（包含当前文章上下文）
 * - 调用 AI SDK v6 streamText() 进行流式对话，传入 tools
 * - 通过回调函数（onChunk）逐块推送数据
 * - 对话完成后持久化消息到 ai_chat_sessions
 */

import { streamText, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { ToolContext } from '../tools/types';
import type { AIDatabase } from '../providers/db';
import { createAllTools } from '../tools';
import type { ChatStreamChunk, ChatMessage } from '../../shared/types';

/** ChatService 的依赖注入接口 */
export interface ChatServiceDeps {
  /** 根据任务类型获取对应的语言模型 */
  getModel: (task: 'fast' | 'smart' | 'cheap') => LanguageModel;
  /** Tool Calling 所需的数据访问上下文 */
  toolContext: ToolContext;
  /** AI 模块数据库操作层 */
  aiDb: AIDatabase;
}

/**
 * ChatService 核心类
 *
 * 管理多轮对话的生命周期：
 * 1. 加载历史消息
 * 2. 构建 system prompt
 * 3. 调用 streamText 流式生成
 * 4. 逐块推送到前端
 * 5. 持久化消息记录
 */
export class ChatService {
  constructor(private deps: ChatServiceDeps) {}

  /**
   * 发送消息并流式返回结果
   *
   * @param sessionId - 会话 ID
   * @param userMessage - 用户输入的消息
   * @param articleContext - 当前文章上下文（如有）
   * @param onChunk - 流式 Chunk 回调
   */
  async sendMessage(
    sessionId: string,
    userMessage: string,
    articleContext: string | null,
    onChunk: (chunk: ChatStreamChunk) => void,
  ): Promise<void> {
    // 1. 加载历史消息
    const session = this.deps.aiDb.getChatSession(sessionId);
    let history: ChatMessage[] = [];
    if (session) {
      try {
        history = JSON.parse(session.messages_json);
      } catch {
        // 消息记录损坏时重置为空
        history = [];
      }
    }

    // 2. 构建 system prompt
    const systemPrompt = this.buildSystemPrompt(articleContext);

    // 3. 构建 messages 数组（转为 AI SDK 格式）
    const messages = this.toSDKMessages(history, userMessage);

    // 4. 调用 streamText（AI SDK v6 API）
    const tools = createAllTools(this.deps.toolContext);
    const result = streamText({
      model: this.deps.getModel('smart'),
      system: systemPrompt,
      messages,
      tools,
      // AI SDK v6 使用 stopWhen + stepCountIs 控制最大步数
      stopWhen: stepCountIs(5),
    });

    // 5. 消费 fullStream，逐块推送
    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          // AI SDK v6 的 text-delta 事件使用 `text` 字段
          fullText += part.text;
          onChunk({ type: 'text-delta', textDelta: part.text });
        } else if (part.type === 'tool-call') {
          // Tool Call 事件：包含工具名称和输入参数
          onChunk({
            type: 'tool-call',
            toolCall: {
              name: part.toolName,
              args: part.input as Record<string, unknown>,
            },
          });
        } else if (part.type === 'tool-result') {
          // Tool Result 事件：包含工具名称和执行结果
          onChunk({
            type: 'tool-result',
            toolResult: {
              name: part.toolName,
              result: JSON.stringify(part.output),
            },
          });
        }
        // 忽略其他类型（reasoning-delta、start-step、finish-step 等）
      }

      // 6. 获取 totalUsage，发送 done chunk
      const totalUsage = await result.totalUsage;
      onChunk({
        type: 'done',
        tokenCount: totalUsage?.totalTokens ?? 0,
        fullText,
      });
    } catch (error) {
      // 流式过程中出错，发送 error chunk
      const errMsg = error instanceof Error ? error.message : String(error);
      onChunk({ type: 'error', error: errMsg });
      // 即使出错也尝试持久化已收到的消息
    }

    // 7. 持久化消息（用户消息 + AI 回复）
    this.persistMessages(sessionId, history, userMessage, fullText);
  }

  /**
   * 构建 system prompt
   * 包含基础角色描述 + 当前文章上下文（如有）
   */
  buildSystemPrompt(articleContext: string | null): string {
    let prompt = `你是 Z-Reader 的 AI 助手，帮助用户管理和理解他们的 RSS 订阅内容。
你可以搜索文章、获取文章内容、管理标签、查看订阅源、创建高亮等。
回答请使用用户的语言。`;

    if (articleContext) {
      // 截取前 4000 字符，避免上下文过长
      prompt += `\n\n当前文章上下文：\n${articleContext.slice(0, 4000)}`;
    }
    return prompt;
  }

  /**
   * 将历史消息 + 新消息转为 AI SDK CoreMessage[] 格式
   * 只保留 user 和 assistant 角色的消息
   */
  toSDKMessages(
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

  /**
   * 持久化消息到数据库
   * 将用户消息和 AI 回复追加到历史记录
   */
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
}
