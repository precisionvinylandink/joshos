/**
 * JobOS integration CONTRACT — types only.
 *
 * JobOS is a separate repository and a separately sellable product. JoshOS may
 * CONSUME JobOS information but must never depend on JoshOS from inside JobOS,
 * and must never embed JobOS logic here. We hold only references + summaries and
 * deep-link back into JobOS. No JobOS production data is duplicated or fabricated.
 */

export type JobOSEntityType =
  | 'job'
  | 'quote'
  | 'invoice'
  | 'customer'
  | 'production'
  | 'deadline'
  | 'campaign';

/** A pointer into JobOS. JoshOS renders the context; clicking deep-links across. */
export interface JobOSReference {
  source: 'jobos';
  entityType: JobOSEntityType;
  entityId: string;
  title: string;
  /** joshos://… or an https deep link into the JobOS app. */
  url?: string;
  businessId?: string;
  /** Optional urgency hint surfaced in Today/WorkOS. */
  urgency?: 'critical' | 'high' | 'normal' | 'low';
  dueDate?: string; // ISO
}

/** Aggregate business snapshot WorkOS shows. Populated by a live JobOS API later. */
export interface JobOSBusinessSummary {
  businessId: string;
  businessName: string;
  jobsDueToday: number;
  customerFollowUps: number;
  productionBlockers: number;
  overdueInvoices: number;
  openQuotes: number;
  /** The handful of items that actually need attention right now. */
  attention: JobOSReference[];
  /** True only when backed by a real JobOS connection (never for dev data). */
  live: boolean;
}

/**
 * The contract JoshOS depends on. A real implementation talks to the JobOS API;
 * until then a clearly-labelled dev provider returns `live: false` data.
 */
export interface JobOSIntegration {
  getBusinessSummaries(): Promise<JobOSBusinessSummary[]>;
  getAttention(): Promise<JobOSReference[]>;
}
