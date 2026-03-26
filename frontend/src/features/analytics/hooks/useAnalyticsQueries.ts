'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '180d' | '365d';

export type AnalyticsBundle = {
  overview: unknown;
  funnel: unknown[];
  trends: unknown[];
  team: unknown[];
  sources: unknown[];
  campaigns: unknown[];
  activities: unknown;
  scoreDistrib: unknown[];
  divisionComp: unknown[];
  taskSlaReport: unknown;
  taskSlaUnavailable: boolean;
  callDispositionReport: unknown;
  callReportUnavailable: boolean;
  forecastReportUnavailable: boolean;
  pipelineForecastReport: unknown;
  phase1Report: unknown;
  phase1ReportUnavailable: boolean;
  callReportLegacyFallback: boolean;
};

function emptyBundle(): AnalyticsBundle {
  return {
    overview: null,
    funnel: [],
    trends: [],
    team: [],
    sources: [],
    campaigns: [],
    activities: null,
    scoreDistrib: [],
    divisionComp: [],
    taskSlaReport: null,
    taskSlaUnavailable: true,
    callDispositionReport: null,
    callReportUnavailable: true,
    forecastReportUnavailable: true,
    pipelineForecastReport: null,
    phase1Report: null,
    phase1ReportUnavailable: true,
    callReportLegacyFallback: false,
  };
}

type FetchCtx = {
  period: AnalyticsPeriod;
  divId: string | undefined;
  callDrillMode: 'latest' | 'any';
  isSuperAdmin: boolean;
  queryClient: QueryClient;
};

export async function fetchAnalyticsBundle(ctx: FetchCtx): Promise<AnalyticsBundle> {
  const { period: p, divId, callDrillMode, isSuperAdmin, queryClient } = ctx;
  const key = queryKeys.analytics.bundle(p, divId ?? 'all', callDrillMode);

  const [
    ov,
    fn,
    tr,
    tm,
    src,
    cam,
    act,
    sd,
    taskSla,
    callDisp,
    forecast,
    phase1,
  ] = await Promise.allSettled([
    api.getAnalyticsOverview(p, divId),
    api.getFunnel(divId),
    api.getTrends(p, divId),
    api.getTeamPerformance(divId),
    api.getSourcePerformance(p, divId),
    api.getCampaignPerformance(divId),
    api.getActivitiesAnalytics(p, divId),
    api.getScoreDistribution(divId),
    api.getTaskSLAReport(p, divId),
    api.getCallDispositionReport(p, divId, callDrillMode),
    api.getPipelineForecastReport(p, divId),
    api.getPhase1Report(p, divId),
  ]);

  const bundle = emptyBundle();

  if (ov.status === 'fulfilled') bundle.overview = ov.value;
  if (fn.status === 'fulfilled') bundle.funnel = Array.isArray(fn.value) ? fn.value : [];
  if (tr.status === 'fulfilled') bundle.trends = Array.isArray(tr.value) ? tr.value : [];
  if (tm.status === 'fulfilled') bundle.team = Array.isArray(tm.value) ? tm.value : [];
  if (src.status === 'fulfilled') bundle.sources = Array.isArray(src.value) ? src.value : [];
  if (cam.status === 'fulfilled') bundle.campaigns = Array.isArray(cam.value) ? cam.value : [];
  if (act.status === 'fulfilled') bundle.activities = act.value;
  if (sd.status === 'fulfilled') bundle.scoreDistrib = Array.isArray(sd.value) ? sd.value : [];

  if (taskSla.status === 'fulfilled') {
    bundle.taskSlaReport = taskSla.value || null;
    bundle.taskSlaUnavailable = false;
  } else {
    bundle.taskSlaReport = null;
    bundle.taskSlaUnavailable = true;
  }

  if (callDisp.status === 'fulfilled') {
    bundle.callDispositionReport = callDisp.value || null;
    bundle.callReportUnavailable = false;
    bundle.callReportLegacyFallback = false;
  } else {
    bundle.callDispositionReport = null;
    bundle.callReportUnavailable = true;
    bundle.callReportLegacyFallback = false;
    void (async () => {
      const legacy = await api.getDashboardFull(p, divId).catch(() => null);
      const k = (legacy as { kpis?: Record<string, unknown> } | null)?.kpis || {};
      const totalCalls = Number(k.totalCalls || 0);
      const reachedCalls = Number(k.reachedCalls || 0);
      const notReachedCalls = Number(k.notReachedCalls || 0);
      const reachabilityRatio = Number(k.reachabilityRatio || 0);
      if (legacy) {
        queryClient.setQueryData(key, (old: AnalyticsBundle | undefined) => {
          if (!old) return old;
          return {
            ...old,
            callDispositionReport: {
              summary: {
                totalCalls,
                reachedCalls,
                notReachedCalls,
                reachabilityRatio,
                uniqueLeadsTouched: 0,
                avgDurationSeconds: 0,
              },
              byDisposition: [],
              notInterested: { total: 0, reasons: [] },
              alreadyCompletedServices: { total: 0, locations: [] },
              willCallAgain: { total: 0, expectedCallbackWindows: [] },
              meta: {
                legacyFallback: true,
                fallbackReason: 'CALL_DISPOSITION_ENDPOINT_UNAVAILABLE',
                periodFallback: false,
              },
            },
            callReportUnavailable: false,
            callReportLegacyFallback: true,
          };
        });
      }
    })();
  }

  if (forecast.status === 'fulfilled') {
    bundle.pipelineForecastReport = forecast.value || null;
    bundle.forecastReportUnavailable = false;
  } else {
    bundle.pipelineForecastReport = null;
    bundle.forecastReportUnavailable = true;
  }

  if (phase1.status === 'fulfilled') {
    bundle.phase1Report = phase1.value || null;
    bundle.phase1ReportUnavailable = false;
  } else {
    bundle.phase1Report = null;
    bundle.phase1ReportUnavailable = true;
  }

  if (isSuperAdmin && !divId) {
    void api
      .getDivisionComparison()
      .then((d) => {
        queryClient.setQueryData(key, (old: AnalyticsBundle | undefined) => {
          if (!old) return old;
          return { ...old, divisionComp: Array.isArray(d) ? d : [] };
        });
      })
      .catch(() => {});
  }

  return bundle;
}

export function useAnalyticsBundleQuery(
  period: AnalyticsPeriod,
  divId: string | undefined,
  callDrillMode: 'latest' | 'any',
  isSuperAdmin: boolean
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.analytics.bundle(period, divId ?? 'all', callDrillMode),
    queryFn: () =>
      fetchAnalyticsBundle({
        period,
        divId,
        callDrillMode,
        isSuperAdmin,
        queryClient,
      }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
