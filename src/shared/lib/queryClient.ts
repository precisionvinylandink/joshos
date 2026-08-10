import { QueryClient } from '@tanstack/react-query';

/** App-wide React Query defaults. All server state flows through this client. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
