import type { DomainEvent } from './types';

/**
 * Emit a domain event. TODO: persist to an events table and fan out to
 * subscribers (Supabase realtime). No-op stub for now.
 */
export function emit(_event: Omit<DomainEvent, 'id' | 'at'>): void {
  // intentionally empty until the event store exists
}
