'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useImportHistoryQuery(page: number) {
  return useQuery({
    queryKey: queryKeys.import.history(page),
    queryFn: () => api.getImportHistory(page),
    staleTime: 30_000,
  });
}
