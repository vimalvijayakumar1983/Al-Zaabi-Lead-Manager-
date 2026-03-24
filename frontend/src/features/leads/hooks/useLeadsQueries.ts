'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { FilterState } from '@/app/(dashboard)/leads/components/advanced-filters';
import type { Lead, User } from '@/types';

/** Build GET /leads query params (must match previous fetchLeads behavior). */
export function buildLeadsListParams(
  pagination: { page: number; limit: number },
  filters: FilterState,
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  currentUser: User | null,
  analyticsScope: string | null
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: pagination.page,
    limit: pagination.limit,
    sortBy,
    sortOrder,
  };
  const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
  if (filters.divisionId && filters.divisionId !== 'all') {
    params.divisionId = filters.divisionId;
  } else if (activeDivisionId && analyticsScope !== 'all') {
    params.divisionId = activeDivisionId;
  }
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.source) params.source = filters.source;
  if (filters.assignedToId === '__unassigned__') {
    params.assignedToId = 'unassigned';
  } else if (filters.assignedToId === '__current_user__' && currentUser) {
    params.assignedToId = currentUser.id;
  } else if (filters.assignedToId && filters.assignedToId !== '__current_user__') {
    params.assignedToId = filters.assignedToId;
  }
  if (filters.minScore) params.minScore = filters.minScore;
  if (filters.maxScore) params.maxScore = filters.maxScore;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.company) params.company = filters.company;
  if (filters.jobTitle) params.jobTitle = filters.jobTitle;
  if (filters.location) params.location = filters.location;
  if (filters.campaign) params.campaign = filters.campaign;
  if (filters.productInterest) params.productInterest = filters.productInterest;
  if (filters.budgetMin) params.budgetMin = filters.budgetMin;
  if (filters.budgetMax) params.budgetMax = filters.budgetMax;
  if (filters.tags) params.tags = filters.tags;
  if (filters.hasEmail) params.hasEmail = filters.hasEmail;
  if (filters.hasPhone) params.hasPhone = filters.hasPhone;
  if (filters.conversionMin) params.conversionMin = filters.conversionMin;
  if (filters.conversionMax) params.conversionMax = filters.conversionMax;
  if (filters.stageId) params.stageId = filters.stageId;
  if (filters.callOutcome) params.callOutcome = filters.callOutcome;
  if (filters.callOutcomeReason) params.callOutcomeReason = filters.callOutcomeReason;
  if (filters.callOutcomeMode) params.callOutcomeMode = filters.callOutcomeMode;
  if (filters.minCallCount) params.minCallCount = filters.minCallCount;
  if (filters.maxCallCount) params.maxCallCount = filters.maxCallCount;
  if (filters.divisionId) params.divisionId = filters.divisionId;
  if (filters.showBlocked) params.showBlocked = filters.showBlocked;
  return params;
}

export function useLeadsListQuery(
  params: Record<string, string | number>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.leads.list(params),
    queryFn: () => api.getLeads(params),
    /** No placeholderData: keepPreviousData — it showed the previous page/filters until the new request finished (stale rows on pagination). */
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useLeadDetailQuery(leadId: string | undefined) {
  return useQuery<Lead>({
    queryKey: queryKeys.leads.detail(leadId!),
    queryFn: () => api.getLead(leadId!) as Promise<Lead>,
    enabled: !!leadId,
    staleTime: 5_000,
  });
}

export function usePipelineStagesAllQuery() {
  return useQuery({
    queryKey: queryKeys.leads.pipelineStagesAll,
    queryFn: () => api.getPipelineStages(),
    staleTime: 120_000,
  });
}

export function useLeadAssignmentHistoryQuery(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.leads.assignmentHistory(leadId!),
    queryFn: () => api.getAssignmentHistory(leadId!),
    enabled: !!leadId,
    staleTime: 60_000,
  });
}

export function useLeadCallLogsQuery(leadId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leads.callLogs(leadId!),
    queryFn: () => api.getCallLogs(leadId!),
    enabled: !!leadId && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useLeadsMeQuery() {
  return useQuery({
    queryKey: queryKeys.leads.me,
    queryFn: () => api.getMe(),
    staleTime: 5 * 60_000,
  });
}

export function useLeadsUsersQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.leads.users(divisionId),
    queryFn: () => api.getUsers(divisionId || undefined),
    staleTime: 120_000,
  });
}

export function useLeadsDashboardQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.leads.dashboard(divisionId),
    queryFn: () => api.getDashboard(divisionId || undefined),
    staleTime: 60_000,
  });
}

export function useLeadsCustomFieldsQuery(divisionId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leads.customFields(divisionId),
    queryFn: () => api.getCustomFields(divisionId || undefined),
    staleTime: 120_000,
    enabled: options?.enabled ?? true,
  });
}

export function useLeadSourcesQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.leads.leadSources(divisionId),
    queryFn: () => api.getLeadSources(divisionId || undefined),
    staleTime: 120_000,
  });
}

export function useDispositionStudioQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.leads.disposition(divisionId),
    queryFn: () => api.getDispositionStudio(divisionId || undefined),
    staleTime: 120_000,
  });
}

export function useLeadsTagsQuery(scopeKey: string, organizationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leads.tags(scopeKey),
    queryFn: () => api.getTags(organizationId || undefined),
    staleTime: 120_000,
    enabled: options?.enabled ?? true,
  });
}

export function useLeadsPipelineStagesQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.leads.pipelineStages(divisionId),
    queryFn: () => api.getPipelineStages(divisionId || undefined),
    staleTime: 120_000,
  });
}

export function useLeadsFieldConfigQuery(divisionId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leads.fieldConfig(divisionId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (divisionId) params.append('divisionId', divisionId);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
      const r = await fetch(`/api/settings/field-config?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useLeadsInvalidate() {
  const queryClient = useQueryClient();

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.leads.listRoot }),
    [queryClient]
  );

  const invalidateLeadDetail = useCallback(
    (leadId: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(leadId) }),
    [queryClient]
  );

  /** Keeps list + dashboard cards in sync after lead field/stage/assignment changes. */
  const invalidateListAndDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.leads.listRoot });
    queryClient.invalidateQueries({ queryKey: ['leads', 'dashboard'] });
  }, [queryClient]);

  const invalidateAllLeadsData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.leads.root });
  }, [queryClient]);

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['leads', 'dashboard'] });
  }, [queryClient]);

  return {
    invalidateList,
    invalidateLeadDetail,
    invalidateListAndDashboard,
    invalidateAllLeadsData,
    invalidateDashboard,
  };
}

export function useCallOutcomeOptions(dispositionData: unknown) {
  return useMemo(() => {
    const data = dispositionData as { dispositions?: any[] } | null | undefined;
    const options = Array.isArray(data?.dispositions)
      ? [...data.dispositions]
          .sort((a: any, b: any) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
          .map((d: any) => ({
            value: String(d?.key || ''),
            label: String(d?.label || d?.key || ''),
            icon: d?.icon || '📝',
            group: d?.category || 'Other',
            isActive: d?.isActive !== false,
          }))
          .filter((d: any) => d.value && d.label)
      : [];
    return options;
  }, [dispositionData]);
}
