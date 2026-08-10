import type { JobStatus, ProductType } from '../../../../shared/lib/constants';

/**
 * The Job — THE central object of JobOS. Every domain (estimating, production,
 * fulfillment, accounting…) exists only because it serves the Job, and every
 * module attaches to one. This is the anchor type; the full aggregate (line
 * items, proofs, money, timeline of events) is TODO in a later prompt.
 */
export interface Job {
  id: string;
  /** Human number, e.g. "PVI-1044". */
  number: string;
  clientId: string;
  status: JobStatus;
  productType: ProductType;
  title?: string;
  dueDate?: string; // ISO
  createdAt: string; // ISO
}

// TODO(jobos:core/job): JobLineItem, JobProof, JobMoney, JobTimeline, etc.
