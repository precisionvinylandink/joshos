import type { DomainEvent } from './types';

/**
 * Subscribe to the event stream for a job/domain. TODO: back with Supabase
 * realtime. Returns an empty list until the event store exists.
 */
export function useEventStream(_filter?: { jobId?: string; type?: string }): DomainEvent[] {
  return [];
}
