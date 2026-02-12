import type { AgentTaskContext, IToolRegistry, IToolSandbox, ToolExecutionRequest, ToolSandboxDecision } from '../contracts';

export interface ToolPermissionSandboxOptions {
  allowedPermissions?: string[];
  deniedPermissions?: string[];
}

export class ToolPermissionSandbox implements IToolSandbox {
  private readonly deniedPermissions: Set<string>;
  private readonly allowedPermissions?: Set<string>;

  constructor(
    private readonly registry: IToolRegistry,
    options: ToolPermissionSandboxOptions,
  ) {
    this.deniedPermissions = new Set(options.deniedPermissions ?? []);
    this.allowedPermissions = options.allowedPermissions ? new Set(options.allowedPermissions) : undefined;
  }

  async authorize(request: ToolExecutionRequest, context: AgentTaskContext): Promise<ToolSandboxDecision> {
    void context;

    const tool = this.registry.get(request.toolName);
    if (!tool) {
      return {
        allowed: false,
        reason: `Tool not found: ${request.toolName}`,
      };
    }

    const requiredPermissions = tool.definition.requiredPermissions;
    for (const permission of requiredPermissions) {
      if (this.deniedPermissions.has(permission)) {
        return {
          allowed: false,
          reason: `Permission denied: ${permission}`,
        };
      }

      if (this.allowedPermissions && !this.allowedPermissions.has(permission)) {
        return {
          allowed: false,
          reason: `Permission not allowed: ${permission}`,
        };
      }
    }

    return {
      allowed: true,
    };
  }
}
