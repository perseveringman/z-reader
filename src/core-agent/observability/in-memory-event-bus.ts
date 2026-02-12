import type { AgentDomainEvent, EventHandler, IEventBus } from '../contracts';

export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish<TPayload = Record<string, unknown>>(event: AgentDomainEvent<TPayload>): Promise<void> {
    const listeners = this.handlers.get(event.type);

    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const handler of listeners) {
      await handler(event as AgentDomainEvent<Record<string, unknown>>);
    }
  }

  subscribe(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    this.handlers.get(type)?.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }
}
