import type { AIDatabase } from '../providers/db';
import type { AgentStreamChunk } from '../../shared/types';
import crypto from 'node:crypto';

export interface ActionRouterDeps {
  aiDb: AIDatabase;
}

interface PendingConfirmation {
  resolve: (response: { confirmed: boolean; trust: boolean }) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * ActionRouter — 分级控制 + 白名单
 * read: 直接执行
 * write: 需用户确认（支持白名单跳过）
 * navigate: 返回导航卡片
 */
export class ActionRouter {
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  constructor(private deps: ActionRouterDeps) {}

  /** 检查某个 tool 是否在白名单中 */
  isActionTrusted(toolName: string): boolean {
    const trusted = this.deps.aiDb.getSetting('trusted_actions');
    if (!Array.isArray(trusted)) return false;
    return (trusted as string[]).includes(toolName);
  }

  /** 将 tool 加入白名单 */
  trustAction(toolName: string): void {
    const raw = this.deps.aiDb.getSetting('trusted_actions');
    const trusted: string[] = Array.isArray(raw) ? (raw as string[]) : [];
    if (!trusted.includes(toolName)) {
      trusted.push(toolName);
      this.deps.aiDb.setSetting('trusted_actions', trusted);
    }
  }

  /** 获取全部白名单 tool */
  getTrustedActions(): string[] {
    const raw = this.deps.aiDb.getSetting('trusted_actions');
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  /** 覆盖白名单 */
  setTrustedActions(actions: string[]): void {
    this.deps.aiDb.setSetting('trusted_actions', actions);
  }

  /** 发送确认请求并等待用户响应，超时 60s 自动拒绝 */
  async requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
    preview: string,
    onChunk: (chunk: AgentStreamChunk) => void,
  ): Promise<{ confirmed: boolean; trust: boolean }> {
    const confirmId = crypto.randomUUID();

    onChunk({
      type: 'action-confirm',
      actionConfirm: {
        toolName,
        preview,
        confirmId,
        allowTrust: true,
        args,
      },
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingConfirmations.delete(confirmId);
        resolve({ confirmed: false, trust: false });
      }, 60_000);

      this.pendingConfirmations.set(confirmId, { resolve, timeout });
    });
  }

  /** 处理用户对确认弹窗的响应 */
  handleConfirmResponse(confirmId: string, confirmed: boolean, trust: boolean): void {
    const pending = this.pendingConfirmations.get(confirmId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingConfirmations.delete(confirmId);
      pending.resolve({ confirmed, trust });
    }
  }

  /** 清理所有待处理的确认（应用退出时调用） */
  cleanup(): void {
    for (const [, pending] of this.pendingConfirmations) {
      clearTimeout(pending.timeout);
      pending.resolve({ confirmed: false, trust: false });
    }
    this.pendingConfirmations.clear();
  }
}
