import type { ITool, IToolRegistry, ToolDefinition } from '../contracts';

export class InMemoryToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ITool>();

  register(tool: ITool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }
}
