export interface BusinessCapability {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface BusinessCapabilityContext {
  sessionId: string;
  taskId: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessCapabilityResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface IBusinessCapabilityProvider {
  listCapabilities(): Promise<BusinessCapability[]>;
  invoke(
    name: string,
    input: Record<string, unknown>,
    context: BusinessCapabilityContext,
  ): Promise<BusinessCapabilityResult>;
}
