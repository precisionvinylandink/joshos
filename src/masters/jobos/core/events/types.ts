/**
 * Event-driven backbone. Every JobOS action emits an event; domains subscribe.
 * This is the shape; the full event union + transport are TODO.
 */
export interface DomainEvent<T = unknown> {
  id: string;
  /** Dotted type, e.g. 'job.created', 'estimate.sent', 'invoice.paid'. */
  type: string;
  jobId?: string;
  payload: T;
  at: string; // ISO
}
