'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export type ReportBuilderDataset =
  | 'leads'
  | 'tasks'
  | 'call_logs'
  | 'contacts'
  | 'deals'
  | 'campaigns'
  | 'campaign_assignments'
  | 'lead_activities'
  | 'pipelines';

export function useReportCatalogQuery(dataset: ReportBuilderDataset, divisionId?: string) {
  return useQuery({
    queryKey: queryKeys.reports.catalog(dataset, divisionId),
    queryFn: () => api.getReportCatalog(dataset, divisionId),
    staleTime: 120_000,
  });
}

export function useReportDefinitionsQuery(dataset: ReportBuilderDataset, divisionId?: string) {
  return useQuery({
    queryKey: queryKeys.reports.definitions(dataset, divisionId),
    queryFn: () => api.getReportDefinitions({ dataset, divisionId }),
    staleTime: 60_000,
  });
}
