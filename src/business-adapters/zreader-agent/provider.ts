import type {
  BusinessCapability,
  BusinessCapabilityContext,
  BusinessCapabilityResult,
  IBusinessCapabilityProvider,
} from '../../core-agent/contracts';

export class ZReaderBusinessCapabilityProvider implements IBusinessCapabilityProvider {
  async listCapabilities(): Promise<BusinessCapability[]> {
    return [
      {
        name: 'zreader.execute-workflow',
        description: '执行 Z-Reader 业务工作流（由业务适配层提供实现）',
      },
    ];
  }

  async invoke(
    name: string,
    input: Record<string, unknown>,
    context: BusinessCapabilityContext,
  ): Promise<BusinessCapabilityResult> {
    return {
      success: true,
      data: {
        capability: name,
        acceptedInput: input,
        sessionId: context.sessionId,
        taskId: context.taskId,
      },
    };
  }
}
