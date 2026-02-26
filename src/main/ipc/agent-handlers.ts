import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { AgentService } from '../../ai/services/agent-service';
import { createToolContext } from '../ai/tool-context-factory';
import { createLLMProvider } from '../../ai/providers/llm';
import { getDatabase, getSqlite } from '../db';
import { getAIDatabase, loadAIConfig, mapChatSessionRow } from './ai-handlers';
import { RAGDatabase } from '../../ai/providers/rag-db';
import { createEmbeddingService } from '../../ai/services/embedding';
import { createHybridRetriever } from '../../ai/services/retriever';
import { getEmbeddingConfig } from '../../ai/providers/config';
import type { AgentSendInput, AgentConfirmResponse } from '../../shared/types';

/** 模块级 AgentService 实例（懒初始化，跨请求复用以保持 ActionRouter 状态） */
let agentService: AgentService | null = null;

function getOrCreateAgentService(): AgentService {
  const aiDb = getAIDatabase();
  const config = loadAIConfig(aiDb);
  if (!config.apiKey) throw new Error('请先配置 AI API Key');

  if (!agentService) {
    const llm = createLLMProvider(config);

    // 创建 RAG 依赖（如果 embedding 已配置）
    let ragDeps: Parameters<typeof createToolContext>[1];
    try {
      const sqlite = getSqlite();
      if (sqlite) {
        const embeddingConfig = getEmbeddingConfig(sqlite);
        if (embeddingConfig) {
          const ragDb = new RAGDatabase(sqlite, embeddingConfig.dimensions);
          ragDb.initTables();
          const embeddingService = createEmbeddingService(embeddingConfig);
          const retriever = createHybridRetriever(sqlite, ragDb, embeddingService);
          ragDeps = { retriever };
        }
      }
    } catch (err) {
      console.warn('Failed to init RAG deps for Agent:', err);
    }

    const toolCtx = createToolContext(getDatabase(), ragDeps);
    agentService = new AgentService({
      getModel: llm.getModel.bind(llm),
      toolContext: toolCtx,
      aiDb,
    });
  }
  return agentService;
}

export function registerAgentHandlers() {
  // ==================== Agent 流式通信 ====================

  // 流式 Agent 发送（使用 ipcMain.on，支持持续推送 chunk）
  ipcMain.on(IPC_CHANNELS.AGENT_SEND, async (event, input: AgentSendInput) => {
    try {
      const service = getOrCreateAgentService();
      await service.handleMessage(
        input.sessionId,
        input.message,
        input.viewState,
        (chunk) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AGENT_STREAM, chunk);
          }
        },
      );
    } catch (err) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.AGENT_STREAM, {
          type: 'error',
          error: String(err),
        });
      }
    }
  });

  // 操作确认响应
  ipcMain.on(IPC_CHANNELS.AGENT_CONFIRM, (_event, response: AgentConfirmResponse) => {
    if (agentService) {
      agentService.getActionRouter().handleConfirmResponse(
        response.confirmId,
        response.confirmed,
        response.trust,
      );
    }
  });

  // ==================== Agent Session CRUD ====================

  // 创建 Agent 会话（不关联文章）
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_CREATE, async () => {
    const aiDb = getAIDatabase();
    aiDb.initTables();
    const row = aiDb.createChatSession();
    return mapChatSessionRow(row);
  });

  // 查询 Agent 会话列表
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_LIST, async () => {
    const aiDb = getAIDatabase();
    return aiDb.listChatSessions().map(mapChatSessionRow);
  });

  // 获取单个 Agent 会话
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_GET, async (_event, id: string) => {
    const aiDb = getAIDatabase();
    const row = aiDb.getChatSession(id);
    return row ? mapChatSessionRow(row) : null;
  });

  // 删除 Agent 会话
  ipcMain.handle(IPC_CHANNELS.AGENT_SESSION_DELETE, async (_event, id: string) => {
    const aiDb = getAIDatabase();
    aiDb.deleteChatSession(id);
  });

  // ==================== Trusted Actions ====================

  // 获取白名单 tool 列表
  ipcMain.handle(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_GET, async () => {
    const service = getOrCreateAgentService();
    return service.getActionRouter().getTrustedActions();
  });

  // 设置白名单 tool 列表
  ipcMain.handle(IPC_CHANNELS.AGENT_TRUSTED_ACTIONS_SET, async (_event, actions: string[]) => {
    const service = getOrCreateAgentService();
    service.getActionRouter().setTrustedActions(actions);
  });
}
