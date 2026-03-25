export const queryKeys = {
  inbox: {
    root: ['inbox'] as const,
    conversationsRoot: ['inbox', 'conversations'] as const,
    conversations: (params?: Record<string, unknown>) =>
      ['inbox', 'conversations', params || {}] as const,
    messagesRoot: ['inbox', 'messages'] as const,
    messages: (leadId: string, params?: Record<string, unknown>) =>
      ['inbox', 'messages', leadId, params || {}] as const,
    notes: (leadId: string) => ['inbox', 'notes', leadId] as const,
    attachments: (leadId: string) => ['inbox', 'attachments', leadId] as const,
    stats: (divisionId?: string | null) => ['inbox', 'stats', divisionId || 'all'] as const,
    cannedResponses: ['inbox', 'canned-responses'] as const,
    pipelineStages: ['inbox', 'pipeline-stages'] as const,
  },
  leads: {
    root: ['leads'] as const,
    listRoot: ['leads', 'list'] as const,
    list: (params: Record<string, string | number>) => ['leads', 'list', params] as const,
    detail: (leadId: string) => ['leads', 'detail', leadId] as const,
    assignmentHistory: (leadId: string) => ['leads', 'assignment-history', leadId] as const,
    /** All pipeline stages (no organizationId filter) — matches GET /pipeline/stages */
    pipelineStagesAll: ['leads', 'pipeline-stages', '__all__'] as const,
    dashboard: (divisionId?: string | null) => ['leads', 'dashboard', divisionId || 'all'] as const,
    users: (divisionId?: string | null) => ['leads', 'users', divisionId || 'all'] as const,
    me: ['leads', 'me'] as const,
    customFields: (divisionId?: string | null) => ['leads', 'custom-fields', divisionId || 'all'] as const,
    leadSources: (divisionId?: string | null) => ['leads', 'lead-sources', divisionId || 'all'] as const,
    disposition: (divisionId?: string | null) => ['leads', 'disposition', divisionId || 'all'] as const,
    tags: (scopeKey: string) => ['leads', 'tags', scopeKey] as const,
    pipelineStages: (divisionId?: string | null) => ['leads', 'pipeline-stages', divisionId || 'all'] as const,
    fieldConfig: (divisionId?: string | null) => ['leads', 'field-config', divisionId || 'all'] as const,
    callLogs: (leadId: string) => ['leads', 'call-logs', leadId] as const,
  },
  /** Custom roles & module visibility (settings/roles UI) */
  roles: {
    root: ['roles'] as const,
    list: ['roles', 'list'] as const,
    /** GET /api/users/permissions — module visibility matrix */
    moduleVisibility: ['roles', 'module-visibility'] as const,
  },
  import: {
    root: ['import'] as const,
    history: (page: number) => ['import', 'history', page] as const,
  },
  /** Analytics dashboard (parallel API bundle) */
  analytics: {
    root: ['analytics'] as const,
    bundle: (period: string, divisionKey: string, callDrillMode: string) =>
      ['analytics', 'bundle', period, divisionKey, callDrillMode] as const,
    /** GET /analytics/dashboard-full — home dashboard page */
    dashboardFull: (period: string, divisionKey: string) =>
      ['analytics', 'dashboard-full', period, divisionKey] as const,
  },
  reports: {
    root: ['reports'] as const,
    catalog: (dataset: string, divisionId?: string | null) =>
      ['reports', 'catalog', dataset, divisionId ?? 'all'] as const,
    definitions: (dataset: string, divisionId?: string | null) =>
      ['reports', 'definitions', dataset, divisionId ?? 'all'] as const,
  },
} as const;
