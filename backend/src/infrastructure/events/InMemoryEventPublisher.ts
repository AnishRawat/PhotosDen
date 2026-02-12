/**
 * In-Memory Event Publisher (for MVP)
 * In production, this would use EventBridge or SQS
 */

import { EventPublisher, BillingDomainEvent } from '../../domain/billing/events/DomainEvents';

export class InMemoryEventPublisher implements EventPublisher {
  private handlers: Map<string, Array<(event: BillingDomainEvent) => Promise<void>>> = new Map();

  async publish(event: BillingDomainEvent): Promise<void> {
    console.log('[EVENT PUBLISHED]:', event.eventType, event);
    
    const handlers = this.handlers.get(event.eventType) || [];
    
    // Execute all handlers (in production, this would be async/queued)
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EVENT HANDLER ERROR]:`, error);
      }
    }
  }

  /**
   * Register an event handler
   */
  on(eventType: string, handler: (event: BillingDomainEvent) => Promise<void>): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }
}
