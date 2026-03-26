'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { queryKeys } from '@/lib/query-keys';
import { useReportCatalogQuery, useReportDefinitionsQuery } from '@/features/reports/hooks/useReportBuilderQueries';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  Save,
  Play,
  Trash2,
  RefreshCw,
  BarChart3,
  Table2,
  Sigma,
  Filter,
} from 'lucide-react';
import { api } from '@/lib/api';

type Dataset = 'leads' | 'tasks' | 'call_logs' | 'contacts' | 'deals' | 'campaigns' | 'campaign_assignments' | 'lead_activities' | 'pipelines';
type Visualization = 'table' | 'bar' | 'line' | 'pie' | 'kpi' | 'pivot' | 'funnel' | 'cohort';
type FilterOperator =
  | 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'is_null' | 'is_not_null';
type MeasureAgg = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';

interface CatalogField {
  key: string;
  label: string;
  kind: 'dimension' | 'measure';
  dataType: 'string' | 'number' | 'date' | 'boolean';
  source?: string;
}

interface ReportFilter {
  field: string;
  operator: FilterOperator;
  value?: string;
  valueTo?: string;
}

interface ReportMeasure {
  key: string;
  agg: MeasureAgg;
  field?: string;
  label?: string;
}

interface CalculatedField {
  key: string;
  label?: string;
  formula: string;
  scope?: 'row' | 'aggregate';
}

interface ReportConfig {
  dimensions: string[];
  measures: ReportMeasure[];
  filters: ReportFilter[];
  calculatedFields: CalculatedField[];
  timeGrain?: 'day' | 'week' | 'month' | 'quarter';
  visualization: Visualization;
  mode?: 'latest' | 'any';
  sort?: { field: string; direction: 'asc' | 'desc' };
  options?: Record<string, string>;
  limit?: number;
}

interface ReportDefinition {
  id: string;
  name: string;
  description?: string | null;
  dataset: Dataset;
  config: ReportConfig;
  visibility?: 'everyone' | 'private' | 'specific_users' | 'specific_roles';
  visibleToUsers?: string[];
  visibleToRoles?: string[];
  createdById?: string;
}

interface PreviewResponse {
  dataset: Dataset;
  visualization: Visualization;
  columns: Array<{ key: string; label: string; kind: string; dataType: string }>;
  rows: Array<Record<string, unknown>>;
  meta: {
    totalRows: number;
    returnedRows: number;
    rawRows: number;
    filteredRows: number;
    generatedAt: string;
    mode: 'latest' | 'any';
  };
  blocks?: {
    pivot?: {
      rowField: string;
      columnField: string;
      valueField: string;
      columns: string[];
      rows: Array<{ rowKey: string; cells: Record<string, number>; total: number }>;
    } | null;
    funnel?: Array<{ step: string; value: number; conversionFromPrev: number }> | null;
    cohort?: Array<{ cohort: string; leads: number; won: number; lost: number; winRate: number }> | null;
  };
}

type GuidedPresetId =
  | 'offer_performance'
  | 'lead_funnel'
  | 'pipeline_value'
  | 'task_backlog';

interface GuidedPreset {
  id: GuidedPresetId;
  label: string;
  description: string;
  dataset: Dataset;
  defaultVisualization: Visualization;
  dimensions: string[];
  measures: ReportMeasure[];
  options?: Record<string, string>;
}

type QuickDatePreset = 'all' | 'last7' | 'last30' | 'last90' | 'this_month';

const EMPTY_CONFIG: ReportConfig = {
  dimensions: [],
  measures: [{ key: 'm_count', agg: 'count', field: 'id', label: 'Count' }],
  filters: [],
  calculatedFields: [],
  visualization: 'table',
  mode: 'any',
  timeGrain: 'month',
  limit: 200,
  options: {},
};

const DATASET_OPTIONS: Array<{ value: Dataset; label: string }> = [
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'deals', label: 'Deals' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'campaign_assignments', label: 'Campaign Offer Assignments' },
  { value: 'lead_activities', label: 'Lead Activities' },
  { value: 'pipelines', label: 'Pipelines' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'call_logs', label: 'Call Logs' },
];

const GUIDED_PRESETS: GuidedPreset[] = [
  {
    id: 'offer_performance',
    label: 'Offer Performance Funnel',
    description: 'Track how assigned offers move through contacted, accepted, and redeemed stages.',
    dataset: 'campaign_assignments',
    defaultVisualization: 'funnel',
    dimensions: ['status'],
    measures: [{ key: 'm_count', agg: 'count', field: 'id', label: 'Assignments' }],
    options: { stepField: 'status', valueField: 'm_count' },
  },
  {
    id: 'lead_funnel',
    label: 'Lead Status Funnel',
    description: 'See lead movement from NEW to WON/LOST with conversion visibility.',
    dataset: 'leads',
    defaultVisualization: 'funnel',
    dimensions: ['status'],
    measures: [{ key: 'm_count', agg: 'count', field: 'id', label: 'Leads' }],
    options: { stepField: 'status', valueField: 'm_count' },
  },
  {
    id: 'pipeline_value',
    label: 'Pipeline Value by Stage',
    description: 'Understand which stages hold the most open value right now.',
    dataset: 'pipelines',
    defaultVisualization: 'bar',
    dimensions: ['name'],
    measures: [{ key: 'm_value', agg: 'sum', field: 'pipelineValue', label: 'Pipeline Value' }],
  },
  {
    id: 'task_backlog',
    label: 'Task Backlog by Status',
    description: 'Monitor pending vs completed workload across your team.',
    dataset: 'tasks',
    defaultVisualization: 'bar',
    dimensions: ['status'],
    measures: [{ key: 'm_count', agg: 'count', field: 'id', label: 'Tasks' }],
  },
];

const AGG_OPTIONS: MeasureAgg[] = ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'];
const FILTER_OPS: FilterOperator[] = ['eq', 'neq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'];

function titleFromDataset(dataset: Dataset): string {
  if (dataset === 'contacts') return 'Contacts';
  if (dataset === 'deals') return 'Deals';
  if (dataset === 'campaigns') return 'Campaigns';
  if (dataset === 'campaign_assignments') return 'Campaign Offer Assignments';
  if (dataset === 'lead_activities') return 'Lead Activities';
  if (dataset === 'pipelines') return 'Pipelines';
  if (dataset === 'tasks') return 'Tasks';
  if (dataset === 'call_logs') return 'Call Logs';
  return 'Leads';
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function nextMeasureKey(existing: ReportMeasure[]): string {
  let i = existing.length + 1;
  let key = `m_${i}`;
  const used = new Set(existing.map((m) => m.key));
  while (used.has(key)) {
    i += 1;
    key = `m_${i}`;
  }
  return key;
}

export default function ReportBuilderPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const prefillAppliedRef = useRef<string>('');
  const [dataset, setDataset] = useState<Dataset>('leads');
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [name, setName] = useState<string>('New Report');
  const [description, setDescription] = useState<string>('');
  const [config, setConfig] = useState<ReportConfig>(EMPTY_CONFIG);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewRunning, setPreviewRunning] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [guidedMode, setGuidedMode] = useState<boolean>(true);
  const [selectedPresetId, setSelectedPresetId] = useState<GuidedPresetId>('lead_funnel');
  const [guidedVisualization, setGuidedVisualization] = useState<Visualization>('funnel');
  const [quickDatePreset, setQuickDatePreset] = useState<QuickDatePreset>('last30');
  const [guidedSearch, setGuidedSearch] = useState<string>('');
  const [guidedStatus, setGuidedStatus] = useState<string>('');
  const [guidedOwner, setGuidedOwner] = useState<string>('');
  const prefillDataset = searchParams.get('dataset');
  const prefillCampaignId = searchParams.get('campaignId') || '';
  const prefillCampaignName = searchParams.get('campaignName') || '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const activeDivisionId = window.localStorage.getItem('activeDivisionId') || undefined;
    setDivisionId(activeDivisionId);
  }, []);

  const catalogQuery = useReportCatalogQuery(dataset, divisionId);
  const definitionsQuery = useReportDefinitionsQuery(dataset, divisionId);
  const catalog = (catalogQuery.data?.fields || []) as CatalogField[];
  const definitions = (definitionsQuery.data || []) as ReportDefinition[];
  const bootstrapLoading = catalogQuery.isPending || definitionsQuery.isPending;
  const loading = bootstrapLoading || previewRunning;

  const dimensionFields = useMemo(
    () => catalog.filter((f) => f.kind === 'dimension' || f.dataType !== 'number'),
    [catalog]
  );
  const measureCandidateFields = useMemo(
    () => catalog.filter((f) => f.dataType === 'number' || f.key === 'id'),
    [catalog]
  );
  const measureKeyOptions = useMemo(
    () => config.measures.map((m) => ({ key: m.key, label: m.label || m.key })),
    [config.measures]
  );
  const sortFieldOptions = useMemo(
    () => [
      ...config.dimensions.map((d) => ({ key: d, label: d })),
      ...measureKeyOptions.map((m) => ({ key: m.key, label: m.label })),
      ...config.calculatedFields.map((c) => ({ key: `calc.${c.key}`, label: c.label || c.key })),
    ],
    [config.calculatedFields, config.dimensions, measureKeyOptions]
  );

  const openNew = useCallback(() => {
    setSelectedReportId('');
    setPreview(null);
    if (guidedMode) {
      const preset = GUIDED_PRESETS.find((item) => item.id === selectedPresetId) || GUIDED_PRESETS[0];
      setName(`New ${preset.label} Report`);
      setDescription(preset.description);
      setQuickDatePreset('last30');
      setGuidedSearch('');
      setGuidedStatus('');
      setGuidedOwner('');
      setGuidedVisualization(preset.defaultVisualization);
      if (dataset !== preset.dataset) {
        setDataset(preset.dataset);
      }
      setConfig({
        ...EMPTY_CONFIG,
        dimensions: [...preset.dimensions],
        measures: preset.measures.map((measure) => ({ ...measure })),
        visualization: preset.defaultVisualization,
        options: { ...(preset.options || {}) },
        mode: preset.dataset === 'call_logs' ? 'any' : undefined,
      });
      return;
    }

    setName(`New ${titleFromDataset(dataset)} Report`);
    setDescription('');
    setConfig({
      ...EMPTY_CONFIG,
      measures: [{ key: 'm_count', agg: 'count', field: dataset === 'tasks' ? 'id' : 'id', label: 'Count' }],
      mode: dataset === 'call_logs' ? 'any' : undefined,
      visualization: 'table',
    });
  }, [dataset, guidedMode, selectedPresetId]);

  useEffect(() => {
    if (guidedMode) return;
    openNew();
  }, [dataset, guidedMode, openNew]);

  useEffect(() => {
    if (prefillDataset !== 'campaign_assignments') return;
    if (dataset !== 'campaign_assignments') return;
    if (!prefillCampaignId) return;

    const prefillKey = `${prefillDataset}:${prefillCampaignId}`;
    if (prefillAppliedRef.current === prefillKey) return;

    setConfig((prev) => {
      const existingFilters = Array.isArray(prev.filters) ? prev.filters : [];
      const hasCampaignFilter = existingFilters.some(
        (f) => f.field === 'campaign.id' && f.operator === 'eq' && String(f.value || '') === prefillCampaignId
      );
      const nextFilters = hasCampaignFilter
        ? existingFilters
        : [...existingFilters, { field: 'campaign.id', operator: 'eq' as const, value: prefillCampaignId }];
      return {
        ...prev,
        visualization: prev.visualization || 'table',
        filters: nextFilters,
      };
    });

    if (prefillCampaignName) {
      setName(`Offer Insights — ${prefillCampaignName}`);
    }
    prefillAppliedRef.current = prefillKey;
  }, [prefillDataset, dataset, prefillCampaignId, prefillCampaignName]);

  const onSelectReport = useCallback((report: ReportDefinition) => {
    setSelectedReportId(report.id);
    setName(report.name);
    setDescription(report.description || '');
    setConfig({
      ...EMPTY_CONFIG,
      ...(report.config || {}),
      visualization: report.config?.visualization || 'table',
      dimensions: report.config?.dimensions || [],
      measures: report.config?.measures?.length ? report.config.measures : [{ key: 'm_count', agg: 'count', field: 'id', label: 'Count' }],
      filters: report.config?.filters || [],
      calculatedFields: report.config?.calculatedFields || [],
      options: report.config?.options || {},
    });
    setPreview(null);
  }, []);

  const runPreview = useCallback(async () => {
    try {
      setPreviewRunning(true);
      const result = await api.previewReport({
        dataset,
        divisionId,
        config,
      });
      setPreview(result as PreviewResponse);
      toast.success('Preview generated');
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Preview failed');
    } finally {
      setPreviewRunning(false);
    }
  }, [config, dataset, divisionId]);

  const saveDefinition = useCallback(async () => {
    try {
      setSaving(true);
      const payload = {
        name: name.trim() || `Untitled ${titleFromDataset(dataset)} report`,
        description: description.trim() || null,
        dataset,
        config,
        visibility: 'everyone',
      };
      if (selectedReportId) {
        await api.updateReportDefinition(selectedReportId, payload);
        toast.success('Report updated');
      } else {
        const created = await api.createReportDefinition(payload);
        setSelectedReportId((created as ReportDefinition).id);
        toast.success('Report saved');
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.reports.definitions(dataset, divisionId) });
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config, dataset, description, divisionId, name, queryClient, selectedReportId]);

  const deleteDefinition = useCallback(async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Delete this report definition?')) return;
    try {
      await api.deleteReportDefinition(selectedReportId);
      toast.success('Report deleted');
      await queryClient.invalidateQueries({ queryKey: queryKeys.reports.definitions(dataset, divisionId) });
      openNew();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Delete failed');
    }
  }, [dataset, divisionId, openNew, queryClient, selectedReportId]);

  const toggleDimension = useCallback((fieldKey: string) => {
    setConfig((prev) => {
      const exists = prev.dimensions.includes(fieldKey);
      return {
        ...prev,
        dimensions: exists
          ? prev.dimensions.filter((d) => d !== fieldKey)
          : [...prev.dimensions, fieldKey],
      };
    });
  }, []);

  const addMeasure = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      measures: [
        ...prev.measures,
        {
          key: nextMeasureKey(prev.measures),
          agg: 'count',
          field: 'id',
          label: 'Count',
        },
      ],
    }));
  }, []);

  const updateMeasure = useCallback((idx: number, patch: Partial<ReportMeasure>) => {
    setConfig((prev) => {
      const next = [...prev.measures];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, measures: next };
    });
  }, []);

  const removeMeasure = useCallback((idx: number) => {
    setConfig((prev) => {
      const next = prev.measures.filter((_, i) => i !== idx);
      return { ...prev, measures: next.length ? next : [{ key: 'm_count', agg: 'count', field: 'id', label: 'Count' }] };
    });
  }, []);

  const addFilter = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      filters: [...prev.filters, { field: 'createdAt', operator: 'gte', value: '' }],
    }));
  }, []);

  const updateFilter = useCallback((idx: number, patch: Partial<ReportFilter>) => {
    setConfig((prev) => {
      const next = [...prev.filters];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, filters: next };
    });
  }, []);

  const removeFilter = useCallback((idx: number) => {
    setConfig((prev) => ({ ...prev, filters: prev.filters.filter((_, i) => i !== idx) }));
  }, []);

  const addCalculatedField = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      calculatedFields: [
        ...prev.calculatedFields,
        {
          key: `metric_${prev.calculatedFields.length + 1}`,
          label: `Metric ${prev.calculatedFields.length + 1}`,
          formula: `{${prev.measures[0]?.key || 'm_count'}} * 1`,
          scope: 'aggregate',
        },
      ],
    }));
  }, []);

  const updateCalculatedField = useCallback((idx: number, patch: Partial<CalculatedField>) => {
    setConfig((prev) => {
      const next = [...prev.calculatedFields];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, calculatedFields: next };
    });
  }, []);

  const removeCalculatedField = useCallback((idx: number) => {
    setConfig((prev) => ({ ...prev, calculatedFields: prev.calculatedFields.filter((_, i) => i !== idx) }));
  }, []);

  const handleVisualizationChange = useCallback((value: Visualization) => {
    setConfig((prev) => {
      const nextOptions = { ...(prev.options || {}) };
      if (value === 'pivot') {
        nextOptions.rowField = nextOptions.rowField || prev.dimensions[0] || '';
        nextOptions.columnField = nextOptions.columnField || prev.dimensions[1] || prev.dimensions[0] || '';
        nextOptions.valueField = nextOptions.valueField || prev.measures[0]?.key || '';
      } else if (value === 'funnel') {
        nextOptions.stepField = nextOptions.stepField || prev.dimensions[0] || '';
        nextOptions.valueField = nextOptions.valueField || prev.measures[0]?.key || '';
      }
      return { ...prev, visualization: value, options: nextOptions };
    });
  }, []);

  const applyGuidedPreset = useCallback((presetId: GuidedPresetId) => {
    const preset = GUIDED_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    const nextDataset = preset.dataset;
    setSelectedPresetId(presetId);
    setDataset(nextDataset);
    setGuidedVisualization(preset.defaultVisualization);
    setName(preset.label);
    setDescription(preset.description);
    setConfig((prev) => ({
      ...EMPTY_CONFIG,
      ...prev,
      visualization: preset.defaultVisualization,
      dimensions: [...preset.dimensions],
      measures: preset.measures.map((m) => ({ ...m })),
      filters: [],
      calculatedFields: [],
      options: { ...(preset.options || {}) },
      mode: nextDataset === 'call_logs' ? 'any' : undefined,
    }));
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!guidedMode) return;
    if (selectedReportId) return;
    if (prefillDataset === 'campaign_assignments') return;
    applyGuidedPreset(selectedPresetId);
  }, [applyGuidedPreset, guidedMode, prefillDataset, selectedPresetId, selectedReportId]);

  const applyGuidedFilters = useCallback(() => {
    const nextFilters: ReportFilter[] = [];
    const createdField = catalog.some((f) => f.key === 'createdAt')
      ? 'createdAt'
      : catalog.some((f) => f.key === 'lead.createdAt')
        ? 'lead.createdAt'
        : '';
    const statusField = catalog.some((f) => f.key === 'status')
      ? 'status'
      : catalog.some((f) => f.key === 'lead.status')
        ? 'lead.status'
        : '';
    const ownerField = catalog.some((f) => f.key === 'assignedToId')
      ? 'assignedToId'
      : catalog.some((f) => f.key === 'lead.assignedToId')
        ? 'lead.assignedToId'
        : '';
    const searchField = catalog.some((f) => f.key === 'name')
      ? 'name'
      : catalog.some((f) => f.key === 'lead.name')
        ? 'lead.name'
        : '';

    if (quickDatePreset !== 'all' && createdField) {
      const now = new Date();
      const start = new Date();
      if (quickDatePreset === 'last7') start.setDate(now.getDate() - 7);
      if (quickDatePreset === 'last30') start.setDate(now.getDate() - 30);
      if (quickDatePreset === 'last90') start.setDate(now.getDate() - 90);
      if (quickDatePreset === 'this_month') start.setDate(1);
      nextFilters.push({ field: createdField, operator: 'gte', value: start.toISOString() });
    }
    if (guidedStatus.trim() && statusField) {
      nextFilters.push({ field: statusField, operator: 'eq', value: guidedStatus.trim() });
    }
    if (guidedOwner.trim() && ownerField) {
      nextFilters.push({ field: ownerField, operator: 'eq', value: guidedOwner.trim() });
    }
    if (guidedSearch.trim() && searchField) {
      nextFilters.push({ field: searchField, operator: 'contains', value: guidedSearch.trim() });
    }

    setConfig((prev) => ({
      ...prev,
      visualization: guidedVisualization,
      filters: nextFilters,
      options: {
        ...(prev.options || {}),
        ...(guidedVisualization === 'funnel'
          ? {
              stepField: prev.options?.stepField || prev.dimensions[0] || 'status',
              valueField: prev.options?.valueField || prev.measures[0]?.key || 'm_count',
            }
          : {}),
      },
    }));
    toast.success('Filters applied. Run preview to see results.');
  }, [catalog, guidedOwner, guidedSearch, guidedStatus, guidedVisualization, quickDatePreset]);

  const renderPreview = useMemo(() => {
    if (!preview) return <p className="text-sm text-text-tertiary">Run preview to render data.</p>;

    if (preview.visualization === 'kpi') {
      const row = preview.rows[0] || {};
      const numericColumns = preview.columns.filter((c) => c.kind === 'measure');
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {numericColumns.map((col) => (
            <div key={col.key} className="card p-4">
              <p className="text-xs text-text-tertiary">{col.label}</p>
              <p className="text-2xl font-semibold text-text-primary mt-1">{formatCellValue(row[col.key])}</p>
            </div>
          ))}
        </div>
      );
    }

    if (preview.visualization === 'pivot' && preview.blocks?.pivot) {
      const pivot = preview.blocks.pivot;
      return (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 pr-3">{pivot.rowField}</th>
                {pivot.columns.map((col) => <th key={col} className="text-right py-2 px-2">{col}</th>)}
                <th className="text-right py-2 px-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((row) => (
                <tr key={row.rowKey} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3 font-medium">{row.rowKey}</td>
                  {pivot.columns.map((col) => (
                    <td key={col} className="py-2 px-2 text-right">{formatCellValue(row.cells[col])}</td>
                  ))}
                  <td className="py-2 px-2 text-right font-semibold">{formatCellValue(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (preview.visualization === 'funnel' && preview.blocks?.funnel) {
      const rows = preview.blocks.funnel;
      const maxValue = Math.max(...rows.map((r) => r.value), 1);
      return (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.step}>
              <div className="flex items-center justify-between text-xs text-text-tertiary mb-1">
                <span>{row.step}</span>
                <span>{row.value} ({row.conversionFromPrev}% from prev)</span>
              </div>
              <div className="h-2 rounded-full bg-surface-secondary">
                <div
                  className="h-2 rounded-full bg-brand-600"
                  style={{ width: `${Math.max(4, Math.round((row.value / maxValue) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (preview.visualization === 'cohort' && preview.blocks?.cohort) {
      return (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 pr-3">Cohort</th>
                <th className="text-right py-2 px-2">Leads</th>
                <th className="text-right py-2 px-2">Won</th>
                <th className="text-right py-2 px-2">Lost</th>
                <th className="text-right py-2 px-2">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {preview.blocks.cohort.map((row) => (
                <tr key={row.cohort} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3 font-medium">{row.cohort}</td>
                  <td className="py-2 px-2 text-right">{row.leads}</td>
                  <td className="py-2 px-2 text-right">{row.won}</td>
                  <td className="py-2 px-2 text-right">{row.lost}</td>
                  <td className="py-2 px-2 text-right">{row.winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Generic table preview (also used for bar/line/pie quick validation)
    return (
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {preview.columns.map((col) => (
                <th key={col.key} className="text-left py-2 pr-3">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, idx) => (
              <tr key={`row-${idx}`} className="border-b border-border-subtle/60">
                {preview.columns.map((col) => (
                  <td key={col.key} className="py-2 pr-3">{formatCellValue(row[col.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [preview]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">Enterprise Report Builder</h2>
              <p className="text-xs text-text-tertiary">
                {guidedMode
                  ? 'Guided mode helps business users build reports in minutes with simple presets and plain-language filters.'
                  : 'Build any report across built-in columns and custom fields with formulas, pivot, funnel, and cohort blocks.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border-subtle overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium ${guidedMode ? 'bg-brand-600 text-white' : 'bg-white text-text-secondary'}`}
                onClick={() => setGuidedMode(true)}
              >
                Guided Mode
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium ${!guidedMode ? 'bg-brand-600 text-white' : 'bg-white text-text-secondary'}`}
                onClick={() => setGuidedMode(false)}
              >
                Advanced Mode
              </button>
            </div>
            <button className="btn-secondary" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </button>
            <button className="btn-secondary" onClick={runPreview} disabled={bootstrapLoading || previewRunning}>
              <Play className="h-4 w-4 mr-1" />
              Run Preview
            </button>
            <button className="btn-primary" onClick={saveDefinition} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {selectedReportId ? 'Update' : 'Save'}
            </button>
            {selectedReportId && (
              <button className="btn-secondary text-red-600" onClick={deleteDefinition}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <div className="card p-3">
            <label className="text-xs text-text-tertiary">Dataset</label>
            <select
              className="input mt-1"
              value={dataset}
              onChange={(e) => setDataset(e.target.value as Dataset)}
            >
              {DATASET_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-text-primary">Saved Reports</p>
              <button
                type="button"
                className="btn-icon h-7 w-7"
                onClick={() => {
                  void catalogQuery.refetch();
                  void definitionsQuery.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 space-y-1 max-h-[300px] overflow-auto">
              {definitions.map((def) => (
                <button
                  key={def.id}
                  onClick={() => onSelectReport(def)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    selectedReportId === def.id
                      ? 'bg-brand-50 text-brand-700'
                      : 'hover:bg-surface-secondary text-text-secondary'
                  }`}
                >
                  <p className="font-medium truncate">{def.name}</p>
                  <p className="text-2xs text-text-tertiary truncate">{def.description || titleFromDataset(def.dataset)}</p>
                </button>
              ))}
              {!definitions.length && <p className="text-xs text-text-tertiary">No saved reports for this dataset.</p>}
            </div>
          </div>

          {guidedMode ? (
            <div className="card p-3">
              <p className="text-xs font-semibold text-text-primary">How it works</p>
              <ol className="mt-2 space-y-1.5 text-xs text-text-secondary list-decimal pl-4">
                <li>Pick a quick template.</li>
                <li>Set date range + business filters.</li>
                <li>Run preview and save for your team.</li>
              </ol>
            </div>
          ) : (
            <div className="card p-3">
              <p className="text-xs font-semibold text-text-primary">Dimensions</p>
              <p className="text-2xs text-text-tertiary mb-2">Group and slice metrics by any field.</p>
              <div className="space-y-1 max-h-[260px] overflow-auto">
                {dimensionFields.map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={config.dimensions.includes(field.key)}
                      onChange={() => toggleDimension(field.key)}
                    />
                    <span className="truncate">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-9 space-y-4">
          {guidedMode ? (
            <>
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">Quick Setup Templates</p>
                  <button className="btn-secondary" onClick={() => applyGuidedPreset(selectedPresetId)}>
                    Apply Selected Template
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {GUIDED_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyGuidedPreset(preset.id)}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                        selectedPresetId === preset.id
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-border-subtle hover:bg-surface-secondary'
                      }`}
                    >
                      <p className="text-sm font-medium text-text-primary">{preset.label}</p>
                      <p className="text-2xs text-text-tertiary mt-0.5">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card p-4 space-y-3">
                <p className="text-sm font-semibold text-text-primary">Business Filters</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-tertiary">Report Name</label>
                    <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Description</label>
                    <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Date Range</label>
                    <select
                      className="input mt-1"
                      value={quickDatePreset}
                      onChange={(e) => setQuickDatePreset(e.target.value as QuickDatePreset)}
                    >
                      <option value="all">All time</option>
                      <option value="last7">Last 7 days</option>
                      <option value="last30">Last 30 days</option>
                      <option value="last90">Last 90 days</option>
                      <option value="this_month">This month</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Chart Type</label>
                    <select
                      className="input mt-1"
                      value={guidedVisualization}
                      onChange={(e) => setGuidedVisualization(e.target.value as Visualization)}
                    >
                      <option value="table">Table</option>
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="pie">Pie</option>
                      <option value="kpi">KPI</option>
                      <option value="funnel">Funnel</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Status (optional)</label>
                    <input
                      className="input mt-1"
                      placeholder="e.g. NEW, WON, CONTACTED"
                      value={guidedStatus}
                      onChange={(e) => setGuidedStatus(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Owner Id (optional)</label>
                    <input
                      className="input mt-1"
                      placeholder="Team member id"
                      value={guidedOwner}
                      onChange={(e) => setGuidedOwner(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-text-tertiary">Search text (optional)</label>
                    <input
                      className="input mt-1"
                      placeholder="Name or keyword"
                      value={guidedSearch}
                      onChange={(e) => setGuidedSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={applyGuidedFilters}>Apply Filters</button>
                  <button className="btn-primary" onClick={runPreview} disabled={loading}>
                    <Play className="h-4 w-4 mr-1" />
                    Run Preview
                  </button>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-text-primary">Preview</p>
                  {preview && (
                    <p className="text-2xs text-text-tertiary">
                      {preview.meta.returnedRows}/{preview.meta.totalRows} rows • source {preview.meta.rawRows} • filtered {preview.meta.filteredRows}
                    </p>
                  )}
                </div>
                {loading ? <p className="text-sm text-text-tertiary">Loading preview…</p> : renderPreview}
              </div>
            </>
          ) : (
            <>
              <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-tertiary">Report Name</label>
                    <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Description</label>
                    <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-text-tertiary">Visualization</label>
                    <select
                      className="input mt-1"
                      value={config.visualization}
                      onChange={(e) => handleVisualizationChange(e.target.value as Visualization)}
                    >
                      <option value="table">Table</option>
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="pie">Pie</option>
                      <option value="kpi">KPI</option>
                      <option value="pivot">Pivot</option>
                      <option value="funnel">Funnel</option>
                      <option value="cohort">Cohort</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Time Grain</label>
                    <select
                      className="input mt-1"
                      value={config.timeGrain || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, timeGrain: (e.target.value || undefined) as ReportConfig['timeGrain'] }))}
                    >
                      <option value="">None</option>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="quarter">Quarter</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Rows Limit</label>
                    <input
                      className="input mt-1"
                      type="number"
                      min={1}
                      max={1000}
                      value={config.limit ?? 200}
                      onChange={(e) => setConfig((prev) => ({ ...prev, limit: Number(e.target.value || 200) }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Sort Field</label>
                    <select
                      className="input mt-1"
                      value={config.sort?.field || ''}
                      onChange={(e) => setConfig((prev) => ({
                        ...prev,
                        sort: e.target.value
                          ? { field: e.target.value, direction: prev.sort?.direction || 'desc' }
                          : undefined,
                      }))}
                    >
                      <option value="">None</option>
                      {sortFieldOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary">Sort Direction</label>
                    <select
                      className="input mt-1"
                      value={config.sort?.direction || 'desc'}
                      onChange={(e) => setConfig((prev) => ({
                        ...prev,
                        sort: prev.sort?.field
                          ? { field: prev.sort.field, direction: e.target.value as 'asc' | 'desc' }
                          : undefined,
                      }))}
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                  {dataset === 'call_logs' && (
                    <div>
                      <label className="text-xs text-text-tertiary">Call Mode</label>
                      <select
                        className="input mt-1"
                        value={config.mode || 'any'}
                        onChange={(e) => setConfig((prev) => ({ ...prev, mode: e.target.value as 'latest' | 'any' }))}
                      >
                        <option value="any">Any historical call</option>
                        <option value="latest">Latest call per lead</option>
                      </select>
                    </div>
                  )}
                </div>

                {(config.visualization === 'pivot' || config.visualization === 'funnel') && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {config.visualization === 'pivot' && (
                      <>
                        <div>
                          <label className="text-xs text-text-tertiary">Pivot Row Field</label>
                          <select
                            className="input mt-1"
                            value={config.options?.rowField || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, options: { ...(prev.options || {}), rowField: e.target.value } }))}
                          >
                            <option value="">Select row field</option>
                            {config.dimensions.map((dim) => (
                              <option key={dim} value={dim}>{dim}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-text-tertiary">Pivot Column Field</label>
                          <select
                            className="input mt-1"
                            value={config.options?.columnField || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, options: { ...(prev.options || {}), columnField: e.target.value } }))}
                          >
                            <option value="">Select column field</option>
                            {config.dimensions.map((dim) => (
                              <option key={dim} value={dim}>{dim}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-text-tertiary">Pivot Value Measure</label>
                          <select
                            className="input mt-1"
                            value={config.options?.valueField || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, options: { ...(prev.options || {}), valueField: e.target.value } }))}
                          >
                            <option value="">Select measure</option>
                            {measureKeyOptions.map((measure) => (
                              <option key={measure.key} value={measure.key}>{measure.label}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {config.visualization === 'funnel' && (
                      <>
                        <div>
                          <label className="text-xs text-text-tertiary">Funnel Step Field</label>
                          <select
                            className="input mt-1"
                            value={config.options?.stepField || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, options: { ...(prev.options || {}), stepField: e.target.value } }))}
                          >
                            <option value="">Select dimension</option>
                            {config.dimensions.map((dim) => (
                              <option key={dim} value={dim}>{dim}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-text-tertiary">Funnel Value Measure</label>
                          <select
                            className="input mt-1"
                            value={config.options?.valueField || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, options: { ...(prev.options || {}), valueField: e.target.value } }))}
                          >
                            <option value="">Select measure</option>
                            {measureKeyOptions.map((measure) => (
                              <option key={measure.key} value={measure.key}>{measure.label}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-brand-600" />
                    <p className="text-sm font-semibold text-text-primary">Measures</p>
                  </div>
                  <button className="btn-secondary" onClick={addMeasure}>Add Measure</button>
                </div>
                <div className="space-y-2">
                  {config.measures.map((measure, idx) => (
                    <div key={measure.key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="text-2xs text-text-tertiary">Aggregation</label>
                        <select
                          className="input mt-1"
                          value={measure.agg}
                          onChange={(e) => updateMeasure(idx, { agg: e.target.value as MeasureAgg })}
                        >
                          {AGG_OPTIONS.map((agg) => <option key={agg} value={agg}>{agg}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-2xs text-text-tertiary">Field</label>
                        <select
                          className="input mt-1"
                          value={measure.field || ''}
                          onChange={(e) => updateMeasure(idx, { field: e.target.value })}
                        >
                          {measureCandidateFields.map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-2xs text-text-tertiary">Alias</label>
                        <input
                          className="input mt-1"
                          value={measure.label || ''}
                          onChange={(e) => updateMeasure(idx, { label: e.target.value })}
                        />
                      </div>
                      <button className="btn-secondary text-red-600" onClick={() => removeMeasure(idx)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-brand-600" />
                    <p className="text-sm font-semibold text-text-primary">Filters</p>
                  </div>
                  <button className="btn-secondary" onClick={addFilter}>Add Filter</button>
                </div>
                <div className="space-y-2">
                  {config.filters.map((filter, idx) => (
                    <div key={`filter-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                      <div>
                        <label className="text-2xs text-text-tertiary">Field</label>
                        <select
                          className="input mt-1"
                          value={filter.field}
                          onChange={(e) => updateFilter(idx, { field: e.target.value })}
                        >
                          {catalog.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-2xs text-text-tertiary">Operator</label>
                        <select
                          className="input mt-1"
                          value={filter.operator}
                          onChange={(e) => updateFilter(idx, { operator: e.target.value as FilterOperator })}
                        >
                          {FILTER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-2xs text-text-tertiary">Value</label>
                        <input
                          className="input mt-1"
                          value={filter.value || ''}
                          onChange={(e) => updateFilter(idx, { value: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-2xs text-text-tertiary">Value To</label>
                        <input
                          className="input mt-1"
                          value={filter.valueTo || ''}
                          onChange={(e) => updateFilter(idx, { valueTo: e.target.value })}
                        />
                      </div>
                      <button className="btn-secondary text-red-600" onClick={() => removeFilter(idx)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sigma className="h-4 w-4 text-brand-600" />
                    <p className="text-sm font-semibold text-text-primary">Calculated Fields (Phase 2)</p>
                  </div>
                  <button className="btn-secondary" onClick={addCalculatedField}>Add Formula</button>
                </div>
                <p className="text-2xs text-text-tertiary">
                  Use formulas with placeholders, e.g. <code>{'{m_1} / {m_2} * 100'}</code>.
                </p>
              </div>
            </>
          )}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-text-primary">Preview</p>
              {preview && (
                <p className="text-2xs text-text-tertiary">
                  {preview.meta.returnedRows}/{preview.meta.totalRows} rows • source {preview.meta.rawRows} • filtered {preview.meta.filteredRows}
                </p>
              )}
            </div>
            {previewRunning ? <p className="text-sm text-text-tertiary">Loading preview…</p> : renderPreview}
          </div>
          </div>
        </div>
      </div>
  );
}
