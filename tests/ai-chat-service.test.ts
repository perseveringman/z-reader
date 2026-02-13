/**
 * ChatService 单元测试
 *
 * 测试覆盖：
 * - 基础文本流式对话
 * - Tool Calling 流式事件
 * - 历史消息加载与持久化
 * - 文章上下文 system prompt
 * - 流式错误处理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../src/ai/services/chat';
import type { ChatServiceDeps } from '../src/ai/services/chat';
import type { AIDatabase, ChatSessionRow } from '../src/ai/providers/db';
import type { ToolContext } from '../src/ai/tools/types';
import type { ChatStreamChunk, ChatMessage } from '../src/shared/types';

// ==================== Mock streamText ====================
// 使用 vi.mock 拦截 'ai' 模块的 streamText
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: vi.fn(),
  };
});

// 获取 mock 后的 streamText
import { streamText } from 'ai';
const mockStreamText = vi.mocked(streamText);

// ==================== 工具函数 ====================

/**
 * 创建模拟的 fullStream 异步可迭代对象
 * 将 TextStreamPart 数组转为 AsyncIterable
 */
function createMockFullStream(parts: Array<Record<string, unknown>>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const part of parts) {
        yield part;
      }
    },
  };
}

/** 创建模拟的 AIDatabase */
function createMockAiDb(overrides?: Partial<AIDatabase>): AIDatabase {
  return {
    initTables: vi.fn(),
    getSetting: vi.fn().mockReturnValue(null),
    setSetting: vi.fn(),
    insertTaskLog: vi.fn(),
    listTaskLogs: vi.fn().mockReturnValue([]),
    getTaskLog: vi.fn().mockReturnValue(null),
    createChatSession: vi.fn(),
    getChatSession: vi.fn().mockReturnValue(null),
    updateChatSession: vi.fn(),
    listChatSessions: vi.fn().mockReturnValue([]),
    deleteChatSession: vi.fn(),
    ...overrides,
  } as unknown as AIDatabase;
}

/** 创建模拟的 ToolContext */
function createMockToolContext(): ToolContext {
  return {
    searchArticles: vi.fn().mockResolvedValue([]),
    getArticleContent: vi.fn().mockResolvedValue(null),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    archiveArticle: vi.fn().mockResolvedValue(undefined),
    listTags: vi.fn().mockResolvedValue([]),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
    listFeeds: vi.fn().mockResolvedValue([]),
    getReadingStats: vi.fn().mockResolvedValue({ totalRead: 0, totalArticles: 0 }),
    listHighlights: vi.fn().mockResolvedValue([]),
    createHighlight: vi.fn().mockResolvedValue(undefined),
  };
}

/** 创建模拟的 ChatServiceDeps */
function createMockDeps(overrides?: {
  aiDb?: AIDatabase;
  toolContext?: ToolContext;
}): ChatServiceDeps {
  return {
    getModel: vi.fn().mockReturnValue({ modelId: 'test-model' }),
    toolContext: overrides?.toolContext ?? createMockToolContext(),
    aiDb: overrides?.aiDb ?? createMockAiDb(),
  };
}

/**
 * 设置 mockStreamText 返回模拟的流式结果
 */
function setupStreamTextMock(
  parts: Array<Record<string, unknown>>,
  totalUsage = { totalTokens: 42, inputTokens: 20, outputTokens: 22 },
) {
  mockStreamText.mockReturnValue({
    fullStream: createMockFullStream(parts),
    totalUsage: Promise.resolve(totalUsage),
    // 其他属性（测试中不使用）
    textStream: createMockFullStream([]),
    usage: Promise.resolve(totalUsage),
    text: Promise.resolve(''),
    steps: Promise.resolve([]),
    request: Promise.resolve({}),
    response: Promise.resolve({ messages: [] }),
    providerMetadata: Promise.resolve(undefined),
    consumeStream: vi.fn(),
  } as unknown as ReturnType<typeof streamText>);
}

// ==================== 测试用例 ====================

describe('ChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendMessage — 基础文本流式对话', () => {
    it('接收 text-delta 并推送 onChunk', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const chunks: ChatStreamChunk[] = [];

      // 模拟流式文本返回
      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '你好' },
        { type: 'text-delta', id: '2', text: '世界' },
      ]);

      await service.sendMessage('session-1', '你好', null, (chunk) => {
        chunks.push(chunk);
      });

      // 应该收到 2 个 text-delta + 1 个 done
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: '你好' });
      expect(chunks[1]).toEqual({ type: 'text-delta', textDelta: '世界' });
      expect(chunks[2]).toEqual({
        type: 'done',
        tokenCount: 42,
        fullText: '你好世界',
      });
    });

    it('空回复时 fullText 为空字符串', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const chunks: ChatStreamChunk[] = [];

      setupStreamTextMock([]);

      await service.sendMessage('session-1', '测试', null, (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'done',
        tokenCount: 42,
        fullText: '',
      });
    });
  });

  describe('sendMessage — Tool Calling 事件', () => {
    it('接收 tool-call 和 tool-result 并推送 onChunk', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const chunks: ChatStreamChunk[] = [];

      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '让我搜索一下...' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'search_articles',
          input: { query: 'AI', limit: 5 },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'search_articles',
          input: { query: 'AI', limit: 5 },
          output: { articles: [{ id: '1', title: 'AI文章' }], count: 1 },
        },
        { type: 'text-delta', id: '2', text: '找到了一篇文章。' },
      ]);

      await service.sendMessage('session-1', '搜索AI文章', null, (chunk) => {
        chunks.push(chunk);
      });

      // 2 text-delta + 1 tool-call + 1 tool-result + 1 done = 5
      expect(chunks).toHaveLength(5);

      // 验证 tool-call chunk
      expect(chunks[1]).toEqual({
        type: 'tool-call',
        toolCall: {
          name: 'search_articles',
          args: { query: 'AI', limit: 5 },
        },
      });

      // 验证 tool-result chunk
      expect(chunks[2]).toEqual({
        type: 'tool-result',
        toolResult: {
          name: 'search_articles',
          result: JSON.stringify({
            articles: [{ id: '1', title: 'AI文章' }],
            count: 1,
          }),
        },
      });

      // 验证 done chunk 的 fullText 只包含文本部分
      expect(chunks[4]).toEqual({
        type: 'done',
        tokenCount: 42,
        fullText: '让我搜索一下...找到了一篇文章。',
      });
    });
  });

  describe('sendMessage — 历史消息加载', () => {
    it('有历史消息时加载并传入 messages', async () => {
      const historyMessages: ChatMessage[] = [
        { role: 'user', content: '你是谁', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: '我是 AI 助手', timestamp: '2024-01-01T00:00:01Z' },
      ];

      const mockSession: ChatSessionRow = {
        id: 'session-1',
        title: null,
        article_id: null,
        messages_json: JSON.stringify(historyMessages),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:01Z',
      };

      const aiDb = createMockAiDb({
        getChatSession: vi.fn().mockReturnValue(mockSession),
      });
      const deps = createMockDeps({ aiDb });
      const service = new ChatService(deps);

      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '好的' },
      ]);

      await service.sendMessage('session-1', '谢谢', null, () => {});

      // 验证 streamText 被调用时 messages 包含历史 + 新消息
      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      const messages = callArgs.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: 'user', content: '你是谁' });
      expect(messages[1]).toEqual({ role: 'assistant', content: '我是 AI 助手' });
      expect(messages[2]).toEqual({ role: 'user', content: '谢谢' });
    });

    it('无历史消息时只传入新消息', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '你好' },
      ]);

      await service.sendMessage('session-1', '你好', null, () => {});

      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      const messages = callArgs.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'user', content: '你好' });
    });

    it('只保留 user 和 assistant 角色消息，过滤 tool 角色', async () => {
      const historyMessages: ChatMessage[] = [
        { role: 'user', content: '搜索文章', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'tool', content: '工具结果', timestamp: '2024-01-01T00:00:01Z' },
        { role: 'assistant', content: '找到了', timestamp: '2024-01-01T00:00:02Z' },
      ];

      const mockSession: ChatSessionRow = {
        id: 'session-1',
        title: null,
        article_id: null,
        messages_json: JSON.stringify(historyMessages),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:02Z',
      };

      const aiDb = createMockAiDb({
        getChatSession: vi.fn().mockReturnValue(mockSession),
      });
      const deps = createMockDeps({ aiDb });
      const service = new ChatService(deps);

      setupStreamTextMock([{ type: 'text-delta', id: '1', text: '好' }]);

      await service.sendMessage('session-1', '继续', null, () => {});

      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      const messages = callArgs.messages as Array<{ role: string; content: string }>;
      // user + assistant + 新的 user = 3（tool 被过滤）
      expect(messages).toHaveLength(3);
      expect(messages.every((m) => m.role !== 'tool')).toBe(true);
    });
  });

  describe('sendMessage — 持久化消息', () => {
    it('对话完成后将消息持久化到数据库', async () => {
      const aiDb = createMockAiDb();
      const deps = createMockDeps({ aiDb });
      const service = new ChatService(deps);

      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '你好！' },
      ]);

      await service.sendMessage('session-1', '你好', null, () => {});

      // 验证 updateChatSession 被调用
      expect(aiDb.updateChatSession).toHaveBeenCalledTimes(1);
      const [id, updates] = (aiDb.updateChatSession as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { messagesJson: string },
      ];
      expect(id).toBe('session-1');

      // 解析保存的消息
      const savedMessages = JSON.parse(updates.messagesJson) as ChatMessage[];
      expect(savedMessages).toHaveLength(2);
      expect(savedMessages[0]!.role).toBe('user');
      expect(savedMessages[0]!.content).toBe('你好');
      expect(savedMessages[1]!.role).toBe('assistant');
      expect(savedMessages[1]!.content).toBe('你好！');
    });

    it('有历史消息时追加新消息', async () => {
      const historyMessages: ChatMessage[] = [
        { role: 'user', content: '之前的消息', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: '之前的回复', timestamp: '2024-01-01T00:00:01Z' },
      ];

      const mockSession: ChatSessionRow = {
        id: 'session-1',
        title: null,
        article_id: null,
        messages_json: JSON.stringify(historyMessages),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:01Z',
      };

      const aiDb = createMockAiDb({
        getChatSession: vi.fn().mockReturnValue(mockSession),
      });
      const deps = createMockDeps({ aiDb });
      const service = new ChatService(deps);

      setupStreamTextMock([
        { type: 'text-delta', id: '1', text: '新回复' },
      ]);

      await service.sendMessage('session-1', '新消息', null, () => {});

      const [, updates] = (aiDb.updateChatSession as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { messagesJson: string },
      ];
      const savedMessages = JSON.parse(updates.messagesJson) as ChatMessage[];
      // 2 历史 + 1 user + 1 assistant = 4
      expect(savedMessages).toHaveLength(4);
      expect(savedMessages[2]!.content).toBe('新消息');
      expect(savedMessages[3]!.content).toBe('新回复');
    });
  });

  describe('buildSystemPrompt', () => {
    it('无文章上下文时返回基础 prompt', () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const prompt = service.buildSystemPrompt(null);

      expect(prompt).toContain('Z-Reader');
      expect(prompt).toContain('AI 助手');
      expect(prompt).not.toContain('当前文章上下文');
    });

    it('有文章上下文时拼接到 prompt', () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const prompt = service.buildSystemPrompt('这是一篇关于 TypeScript 的文章...');

      expect(prompt).toContain('当前文章上下文');
      expect(prompt).toContain('TypeScript');
    });

    it('文章上下文超过 4000 字符时截断', () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const longContent = 'A'.repeat(5000);
      const prompt = service.buildSystemPrompt(longContent);

      // 基础 prompt + 上下文标签 + 截断后的内容
      // 上下文部分应该被截取为 4000 字符
      const contextPart = prompt.split('当前文章上下文：\n')[1]!;
      expect(contextPart.length).toBe(4000);
    });
  });

  describe('toSDKMessages', () => {
    it('将 ChatMessage[] 转换为 SDK 格式', () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Q1', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'A1', timestamp: '2024-01-01T00:00:01Z' },
      ];

      const result = service.toSDKMessages(history, 'Q2');

      expect(result).toEqual([
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
      ]);
    });

    it('空历史时只包含新消息', () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      const result = service.toSDKMessages([], '你好');

      expect(result).toEqual([{ role: 'user', content: '你好' }]);
    });
  });

  describe('sendMessage — streamText 调用参数', () => {
    it('使用 smart 模型', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      setupStreamTextMock([]);

      await service.sendMessage('session-1', '测试', null, () => {});

      expect(deps.getModel).toHaveBeenCalledWith('smart');
    });

    it('传入 system prompt', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      setupStreamTextMock([]);

      await service.sendMessage('session-1', '测试', '文章内容', () => {});

      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.system).toContain('Z-Reader');
      expect(callArgs.system).toContain('文章内容');
    });

    it('传入 stopWhen 参数', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      setupStreamTextMock([]);

      await service.sendMessage('session-1', '测试', null, () => {});

      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      // stopWhen 应该是一个函数（stepCountIs 的返回值）
      expect(callArgs.stopWhen).toBeDefined();
      expect(typeof callArgs.stopWhen).toBe('function');
    });

    it('传入 tools', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);

      setupStreamTextMock([]);

      await service.sendMessage('session-1', '测试', null, () => {});

      const callArgs = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
      const tools = callArgs.tools as Record<string, unknown>;
      // 应该包含所有 tool 模块的 tools
      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
    });
  });

  describe('sendMessage — 错误处理', () => {
    it('流式过程中出错时发送 error chunk', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const chunks: ChatStreamChunk[] = [];

      // 模拟流中间出错
      const errorStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'text-delta', id: '1', text: '开始...' };
          throw new Error('网络连接中断');
        },
      };

      mockStreamText.mockReturnValue({
        fullStream: errorStream,
        totalUsage: Promise.resolve({ totalTokens: 0, inputTokens: 0, outputTokens: 0 }),
        textStream: createMockFullStream([]),
        usage: Promise.resolve({ totalTokens: 0, inputTokens: 0, outputTokens: 0 }),
        text: Promise.resolve(''),
        steps: Promise.resolve([]),
        request: Promise.resolve({}),
        response: Promise.resolve({ messages: [] }),
        providerMetadata: Promise.resolve(undefined),
        consumeStream: vi.fn(),
      } as unknown as ReturnType<typeof streamText>);

      await service.sendMessage('session-1', '测试', null, (chunk) => {
        chunks.push(chunk);
      });

      // 应该收到 1 text-delta + 1 error
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: '开始...' });
      expect(chunks[1]).toEqual({ type: 'error', error: '网络连接中断' });
    });

    it('出错后仍然持久化已收到的消息', async () => {
      const aiDb = createMockAiDb();
      const deps = createMockDeps({ aiDb });
      const service = new ChatService(deps);

      const errorStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'text-delta', id: '1', text: '部分回复' };
          throw new Error('中断');
        },
      };

      mockStreamText.mockReturnValue({
        fullStream: errorStream,
        totalUsage: Promise.resolve({ totalTokens: 0, inputTokens: 0, outputTokens: 0 }),
        textStream: createMockFullStream([]),
        usage: Promise.resolve({ totalTokens: 0, inputTokens: 0, outputTokens: 0 }),
        text: Promise.resolve(''),
        steps: Promise.resolve([]),
        request: Promise.resolve({}),
        response: Promise.resolve({ messages: [] }),
        providerMetadata: Promise.resolve(undefined),
        consumeStream: vi.fn(),
      } as unknown as ReturnType<typeof streamText>);

      await service.sendMessage('session-1', '测试', null, () => {});

      // 即使出错也应该持久化
      expect(aiDb.updateChatSession).toHaveBeenCalledTimes(1);
      const [, updates] = (aiDb.updateChatSession as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { messagesJson: string },
      ];
      const savedMessages = JSON.parse(updates.messagesJson) as ChatMessage[];
      expect(savedMessages[1]!.content).toBe('部分回复');
    });
  });

  describe('sendMessage — 忽略非关注事件', () => {
    it('忽略 start-step、finish-step、reasoning-delta 等事件', async () => {
      const deps = createMockDeps();
      const service = new ChatService(deps);
      const chunks: ChatStreamChunk[] = [];

      setupStreamTextMock([
        { type: 'start' },
        { type: 'start-step', request: {}, warnings: [] },
        { type: 'text-delta', id: '1', text: '内容' },
        { type: 'reasoning-delta', id: '2', text: '思考...' },
        { type: 'finish-step', response: {}, usage: { totalTokens: 10 }, finishReason: 'stop' },
        { type: 'finish', finishReason: 'stop', totalUsage: { totalTokens: 42 } },
      ]);

      await service.sendMessage('session-1', '测试', null, (chunk) => {
        chunks.push(chunk);
      });

      // 只应该收到 1 text-delta + 1 done
      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.type).toBe('text-delta');
      expect(chunks[1]!.type).toBe('done');
    });
  });
});
