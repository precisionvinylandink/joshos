import { useQuery } from '@tanstack/react-query';
import { devJobOSIntegration } from './devAdapter';
import type { JobOSIntegration } from './types';

export * from './types';

/**
 * The active JobOS integration. Points at the dev provider until a real JobOS API
 * client is wired. Consumers depend only on the JobOSIntegration contract, so
 * JobOS stays independently deployable and JoshOS stays decoupled.
 */
export const jobosIntegration: JobOSIntegration = devJobOSIntegration;

/** True when the integration is a real JobOS connection (not sample data). */
export function useJobOSSummaries() {
  return useQuery({
    queryKey: ['jobos', 'summaries'],
    queryFn: () => jobosIntegration.getBusinessSummaries(),
    staleTime: 60_000,
  });
}

export function useJobOSAttention() {
  return useQuery({
    queryKey: ['jobos', 'attention'],
    queryFn: () => jobosIntegration.getAttention(),
    staleTime: 60_000,
  });
}
