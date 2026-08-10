import type { JobOSBusinessSummary, JobOSIntegration, JobOSReference } from './types';

/**
 * DEV provider for the JobOS integration contract. Every payload is marked
 * `live: false` and must be rendered as clearly-labelled sample data — JoshOS
 * never presents this as real business data. Swap this for a real JobOS API
 * client (in the JobOS repo's public surface) without touching consumers.
 */
const now = new Date();
const iso = (h: number) => {
  const d = new Date(now);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

const SAMPLE_REFS: JobOSReference[] = [
  { source: 'jobos', entityType: 'production', entityId: 'PVI-1039', title: 'Beaver Shredding tees ship today', urgency: 'critical', businessId: 'pvi', dueDate: iso(15), url: 'joshos://jobos/job/PVI-1039' },
  { source: 'jobos', entityType: 'invoice', entityId: 'PVI-1041', title: 'Invoice overdue 4 days ($1,850)', urgency: 'critical', businessId: 'pvi', url: 'joshos://jobos/invoice/PVI-1041' },
  { source: 'jobos', entityType: 'deadline', entityId: 'PVI-1044', title: 'Proof due to Murphy Paving', urgency: 'high', businessId: 'pvi', dueDate: iso(8), url: 'joshos://jobos/job/PVI-1044' },
  { source: 'jobos', entityType: 'customer', entityId: 'finuccios', title: "Follow up: Finuccio's Deli reorder", urgency: 'normal', businessId: 'pvi', url: 'joshos://jobos/customer/finuccios' },
];

export const devJobOSIntegration: JobOSIntegration = {
  async getBusinessSummaries(): Promise<JobOSBusinessSummary[]> {
    return [
      {
        businessId: 'pvi',
        businessName: 'Precision Vinyl & Ink',
        jobsDueToday: 3,
        customerFollowUps: 2,
        productionBlockers: 1,
        overdueInvoices: 1,
        openQuotes: 4,
        attention: SAMPLE_REFS,
        live: false,
      },
    ];
  },
  async getAttention(): Promise<JobOSReference[]> {
    return SAMPLE_REFS;
  },
};
