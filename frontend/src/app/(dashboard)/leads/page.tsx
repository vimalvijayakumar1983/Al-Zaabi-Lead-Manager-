'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import Link from 'next/link';
import type { Lead, PaginatedResponse, User, CustomField } from '@/types';
import { ColumnManager, loadColumns, saveColumns, type ColumnDef } from './components/column-config';
import { ViewSidebar, SYSTEM_VIEWS, loadCustomViews, saveCustomViews, loadActiveViewId, saveActiveViewId, type SavedView } from './components/saved-views';
import { KanbanView } from './components/kanban-view';
import { InlineEdit } from './components/inline-edit';
import { AdvancedFilters, FilterBadges, emptyFilters, type FilterState } from './components/advanced-filters';
import { AssigneeDropdown } from './components/AssigneeDropdown';
import { BulkReassignModal } from './components/BulkReassignModal';
import { AllocationSettings } from './components/AllocationSettings';
import { WorkloadDashboard } from './components/WorkloadDashboard';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Constants ──────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-cyan-100 text-cyan-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

const sourceLabels: Record<string, string> = {
  WEBSITE_FORM: 'Website Form', LIVE_CHAT: 'Live Chat Widget', LANDING_PAGE: 'Landing Page', WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook Ads', GOOGLE_ADS: 'Google Ads', TIKTOK_ADS: 'TikTok Ads',
  MANUAL: 'Manual', CSV_IMPORT: 'CSV Import', API: 'API', REFERRAL: 'Referral',
  EMAIL: 'Email', PHONE: 'Phone', OTHER: 'Other',
};

type ViewMode = 'table' | 'cards' | 'kanban';

// ─── Phone formatting - auto-add UAE country code if missing ────
const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  return '+971' + cleaned;
};

// ─── Smart Name Display (handles duplicate firstName/lastName) ────
const getDisplayName = (lead: { firstName?: string; lastName?: string }) => {
  const fn = (lead.firstName || '').trim();
  const ln = (lead.lastName || '').trim();
  if (!ln || fn.toLowerCase() === ln.toLowerCase()) return fn || 'Unknown';
  if (fn.toLowerCase().endsWith(ln.toLowerCase())) return fn;
  return `${fn} ${ln}`.trim() || 'Unknown';
};
const getInitials = (lead: { firstName?: string; lastName?: string }) => {
  const name = getDisplayName(lead);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
};

// ─── Time Formatting ─────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 7)}w ago`;
}

// ─── SLA Badge Component ─────────────────────────────────────────

interface SLAInfo {
  enabled: boolean;
  status: string;
  elapsedMinutes?: number;
  percentUsed?: number;
  timeRemainingMinutes?: number;
  respondedInMinutes?: number;
  withinSLA?: boolean;
  escalationLevel?: number;
  thresholds?: { breachMinutes: number; warningMinutes: number; escalationMinutes: number; reassignMinutes: number };
}

function SLABadge({ slaInfo }: { slaInfo: SLAInfo }) {
  if (!slaInfo.enabled) return null;

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  if (slaInfo.status === 'RESPONDED') {
    const mins = slaInfo.respondedInMinutes || 0;
    return (
      <div className="flex items-center gap-1.5" title={`Responded in ${formatDuration(mins)}${slaInfo.withinSLA ? ' (within SLA)' : ' (SLA breached)'}`}>
        <div className={`h-2 w-2 rounded-full ${slaInfo.withinSLA ? 'bg-green-500' : 'bg-amber-500'}`} />
        <span className={`text-xs font-medium ${slaInfo.withinSLA ? 'text-green-700' : 'text-amber-700'}`}>
          {formatDuration(mins)}
        </span>
      </div>
    );
  }

  const configs: Record<string, { color: string; bg: string; ring: string; icon: string; label: string; pulse?: boolean }> = {
    ON_TIME: { color: 'text-green-700', bg: 'bg-green-50', ring: 'ring-green-200', icon: '●', label: 'On Time' },
    AT_RISK: { color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', icon: '◐', label: 'At Risk', pulse: true },
    BREACHED: { color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-300', icon: '!', label: 'Breached', pulse: true },
    ESCALATED: { color: 'text-red-800', bg: 'bg-red-100', ring: 'ring-red-400', icon: '!!', label: 'Escalated', pulse: true },
  };

  const cfg = configs[slaInfo.status] || configs.ON_TIME;
  const elapsed = slaInfo.elapsedMinutes || 0;
  const percent = Math.min(slaInfo.percentUsed || 0, 100);

  return (
    <div className="flex flex-col gap-1" title={`${cfg.label} — ${formatDuration(elapsed)} elapsed (${percent}% of SLA used)`}>
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`}>
          {cfg.pulse && <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${slaInfo.status === 'BREACHED' || slaInfo.status === 'ESCALATED' ? 'bg-red-500' : 'bg-amber-500'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${slaInfo.status === 'BREACHED' || slaInfo.status === 'ESCALATED' ? 'bg-red-600' : 'bg-amber-500'}`} />
          </span>}
          {!cfg.pulse && <span className={`h-2 w-2 rounded-full ${slaInfo.status === 'ON_TIME' ? 'bg-green-500' : 'bg-gray-400'}`} />}
          {formatDuration(elapsed)}
        </span>
        {slaInfo.escalationLevel !== undefined && slaInfo.escalationLevel > 0 && (
          <span className="text-[9px] font-bold text-red-600" title={`Escalation level ${slaInfo.escalationLevel}`}>
            L{slaInfo.escalationLevel}
          </span>
        )}
      </div>
      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{
          width: `${percent}%`,
          backgroundColor: percent >= 100 ? '#dc2626' : percent >= 75 ? '#f59e0b' : '#22c55e',
        }} />
      </div>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => {
    // Initialize filters from URL params (for drill-down from analytics)
    const initial = { ...emptyFilters };
    const paramKeys: (keyof FilterState)[] = [
      'status', 'source', 'assignedToId', 'stageId', 'campaign',
      'minScore', 'maxScore', 'search', 'company', 'location',
    ];
    for (const key of paramKeys) {
      const val = searchParams.get(key);
      if (val) initial[key] = val;
    }
    return initial;
  });
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showForm, setShowForm] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [quickActionId, setQuickActionId] = useState<string | null>(null);
  const quickActionRef = useRef<HTMLDivElement>(null);

  // Column management
  const [columns, setColumns] = useState<ColumnDef[]>(() => loadColumns());
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [showColumnManager, setShowColumnManager] = useState(false);

  // Status labels (custom per division)
  const [statusLabelsMap, setStatusLabelsMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
    const params = activeDivisionId ? `?divisionId=${activeDivisionId}` : '';
    fetch(`/api/settings/field-config${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.statusLabels) setStatusLabelsMap(data.statusLabels); })
      .catch(() => {});
  }, []);
  const getStatusLabel = (status: string): string => {
    return statusLabelsMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, m => m.toLowerCase());
  };

  // Saved views
  const [activeViewId, setActiveViewId] = useState(() => loadActiveViewId());
  const [customViews, setCustomViews] = useState<SavedView[]>(() => loadCustomViews());
  const [showViewSidebar, setShowViewSidebar] = useState(true);

  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [showAllocationSettings, setShowAllocationSettings] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [allTags, setAllTags] = useState<{id: string; name: string; color: string}[]>([]);
  const [stages, setStages] = useState<{id: string; name: string; color?: string; isWonStage?: boolean; isLostStage?: boolean}[]>([]);

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const visibleColumns = columns.filter((c) => c.visible);

  // ─── Data Fetching ──────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
      };
      // Scope leads to the active division for super admin
      const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
      if (activeDivisionId) params.divisionId = activeDivisionId;
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
      if (filters.minCallCount) params.minCallCount = filters.minCallCount;
      if (filters.maxCallCount) params.maxCallCount = filters.maxCallCount;
      if (filters.divisionId) params.divisionId = filters.divisionId;
      const res = await api.getLeads(params) as any;
      const leadsData = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setLeads(leadsData);
      if (res?.pagination) {
        setPagination(prev => ({
          ...prev,
          total: res.pagination.total ?? prev.total,
          page: res.pagination.page ?? prev.page,
          limit: res.pagination.limit ?? prev.limit,
          totalPages: res.pagination.totalPages ?? prev.totalPages,
        }));
      }
    } catch (err: any) {
      console.error('Failed to fetch leads:', err);
      setError(err.message || 'Failed to load leads. Please check that the backend server is running.');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, sortBy, sortOrder, currentUser]);

  const fetchStats = useCallback(async () => {
    try {
      const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
      const data = await api.getDashboard(activeDivisionId || undefined);
      setStats(data);
    } catch { /* non-critical */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data as User[]);
    } catch { /* non-critical */ }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const me = await api.getMe();
      setCurrentUser(me);
    } catch { /* non-critical */ }
  }, []);

  const fetchCustomFields = useCallback(async () => {
    try {
      // Scope custom fields to the active division (if super admin has one selected)
      const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
      const data = await api.getCustomFields(activeDivisionId || undefined);
      setCustomFields(data as CustomField[]);
      // Rebuild columns with custom fields
      setColumns(prev => {
        const updated = loadColumns(data as CustomField[]);
        // Preserve user's visibility/order preferences from existing columns
        const prevMap = new Map(prev.map(c => [c.id, c]));
        return updated.map(c => {
          const existing = prevMap.get(c.id);
          if (existing) return { ...c, visible: existing.visible };
          return c;
        });
      });
    } catch { /* non-critical */ }
  }, []);

  // Restore saved view filters on page mount
  useEffect(() => {
    const savedViewId = loadActiveViewId();
    if (savedViewId && savedViewId !== 'all') {
      // Check system views first
      const systemView = SYSTEM_VIEWS.find(v => v.id === savedViewId);
      // Then check custom views
      const allViews = [...SYSTEM_VIEWS, ...loadCustomViews()];
      const view = allViews.find(v => v.id === savedViewId);
      if (view) {
        const restored = { ...emptyFilters };
        Object.entries(view.filters).forEach(([key, val]) => {
          if (val !== undefined && val !== null && val !== '') {
            (restored as any)[key] = String(val);
          }
        });
        setFilters(restored);
        if (view.sortBy) setSortBy(view.sortBy);
        if (view.sortOrder) setSortOrder(view.sortOrder);
      } else {
        // Saved view was deleted — reset
        setActiveViewId('all');
        saveActiveViewId('all');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCurrentUser(); }, [fetchCurrentUser]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchStats(); fetchUsers(); fetchCustomFields(); }, [fetchStats, fetchUsers, fetchCustomFields]);

  // Fetch field config to get custom labels for column headers
  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    const params = new URLSearchParams();
    if (activeDivisionId) params.append('divisionId', activeDivisionId);
    fetch(`/api/settings/field-config?${params}`, {
      headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''}` },
    })
      .then(r => r.json())
      .then(data => {
        const labels: Record<string, string> = {};
        (data.builtInFields || []).forEach((f: any) => {
          if (f.customLabel) labels[f.key] = f.customLabel;
        });
        setCustomLabels(labels);
      })
      .catch(() => {});
  }, []);

  // Auto-refresh when data changes (including the current user marking messages as read)
  useRealtimeSync(['lead', 'communication'], () => { fetchLeads(); fetchStats(); });
  useEffect(() => {
    api.getTags().then((data: any) => setAllTags(data || [])).catch(() => {});
    api.getPipelineStages().then((data: any) => setStages(data.stages || data || [])).catch(() => {});
  }, []);

  // Close quick action menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(e.target as Node)) {
        setQuickActionId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────

  const handleCreateLead = async (data: any) => {
    try {
      // For SUPER_ADMIN: attach the active division so the lead goes into a
      // division (which has pipeline stages) instead of the GROUP org.
      const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
      if (activeDivisionId && !data.divisionId) {
        data.divisionId = activeDivisionId;
      }
      await api.createLead(data);
      setShowForm(false);
      fetchLeads();
      fetchStats();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedLeads.size === 0) return;
    try {
      await api.bulkUpdateLeads(Array.from(selectedLeads), { status });
      setSelectedLeads(new Set());
      setShowBulkActions(false);
      fetchLeads();
      fetchStats();
    } catch (err: any) { alert(err.message); }
  };

  const handleBulkReassign = async (assignedToId: string, _reason?: string) => {
    try {
      await api.bulkUpdateLeads(Array.from(selectedLeads), { assignedToId });
      setShowBulkReassign(false);
      setSelectedLeads(new Set());
      fetchLeads();
      fetchStats();
    } catch (err: any) { alert(err.message); }
  };

  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;
    if (!confirm(`Archive ${selectedLeads.size} lead(s)?`)) return;
    try {
      const ids = Array.from(selectedLeads);
      for (let i = 0; i < ids.length; i++) {
        await api.deleteLead(ids[i]);
      }
      setSelectedLeads(new Set());
      fetchLeads();
      fetchStats();
    } catch (err: any) { alert(err.message); }
  };

  const handleQuickStatus = async (leadId: string, status: string) => {
    try {
      await api.updateLead(leadId, { status });
      setQuickActionId(null);
      fetchLeads();
      fetchStats();
    } catch (err: any) { alert(err.message); }
  };

  const handleQuickDelete = async (leadId: string) => {
    if (!confirm('Archive this lead?')) return;
    try {
      await api.deleteLead(leadId);
      setQuickActionId(null);
      fetchLeads();
      fetchStats();
    } catch (err: any) { alert(err.message); }
  };

  const handleInlineUpdate = async (leadId: string, field: string, value: string) => {
    const data: any = {};
    if (field === 'budget') {
      data[field] = value ? parseFloat(value) : null;
    } else {
      data[field] = value || null;
    }
    await api.updateLead(leadId, data);
    fetchLeads();
    if (field === 'status') fetchStats();
  };

  const handleSelectView = (view: SavedView) => {
    setActiveViewId(view.id);
    saveActiveViewId(view.id);
    // Spread ALL saved filters over empty defaults — no cherry-picking
    const newFilters = { ...emptyFilters };
    Object.entries(view.filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        (newFilters as any)[key] = String(val);
      }
    });
    setFilters(newFilters);
    if (view.sortBy) setSortBy(view.sortBy);
    if (view.sortOrder) setSortOrder(view.sortOrder);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleSaveView = (view: SavedView) => {
    const updated = [...customViews, view];
    setCustomViews(updated);
    saveCustomViews(updated);
    setActiveViewId(view.id);
    saveActiveViewId(view.id);
  };

  const handleDeleteView = (id: string) => {
    const updated = customViews.filter((v) => v.id !== id);
    setCustomViews(updated);
    saveCustomViews(updated);
    if (activeViewId === id) handleSelectView(SYSTEM_VIEWS[0]);
  };

  const handleRemoveFilter = (key: keyof FilterState) => {
    const updated = { ...filters, [key]: '' };
    // When removing call count, clear both min and max
    if (key === 'minCallCount') updated.maxCallCount = '';
    if (key === 'maxCallCount') updated.minCallCount = '';
    setFilters(updated);
    setPagination((p) => ({ ...p, page: 1 }));
    setActiveViewId('all');
    saveActiveViewId('all');
  };

  const exportCSV = () => {
    const visibleCols = columns.filter((c) => c.visible && c.id !== 'select' && c.id !== 'actions');
    const headers = visibleCols.map((c) => customLabels[c.id] || c.label);
    const rows = leads.map((l) =>
      visibleCols.map((c) => {
        switch (c.id) {
          case 'name': return getDisplayName(l);
          case 'email': return l.email || '';
          case 'phone': return formatPhone(l.phone) || '';
          case 'company': return l.company || '';
          case 'jobTitle': return l.jobTitle || '';
          case 'status': return (l as any).stage?.name || l.status;
          case 'source': return l.source;
          case 'score': return (l.score ?? 0).toString();
          case 'budget': return l.budget?.toString() || '';
          case 'location': return l.location || '';
          case 'productInterest': return l.productInterest || '';
          case 'campaign': return l.campaign || '';
          case 'conversionProb': return l.conversionProb ? `${Math.round(l.conversionProb * 100)}%` : '';
          case 'assignedTo': return l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '';
          case 'tags': return l.tags?.map((t) => t.tag.name).join(', ') || '';
          case 'callCount': return String(l._count?.callLogs || 0);
          case 'channels': {
            const ucc = l.unreadChannelCounts || {};
            return Object.entries(ucc).filter(([, cnt]) => cnt > 0).map(([ch, cnt]) => `${ch}:${cnt}`).join(', ') || '';
          }
          case 'sla': {
            const sla = (l as any).slaInfo;
            if (!sla || !sla.enabled) return '';
            if (sla.status === 'RESPONDED') return `Responded in ${sla.respondedInMinutes}m`;
            return `${sla.status} (${Math.round(sla.elapsedMinutes || 0)}m)`;
          }
          case 'createdAt': return new Date(l.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
          case 'updatedAt': return new Date(l.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
          default:
            if (c.id.startsWith('cf_')) {
              const fn = c.id.slice(3);
              const cd = (l.customData || {}) as Record<string, unknown>;
              const v = cd[fn];
              if (v === undefined || v === null) return '';
              if (Array.isArray(v)) return v.join(', ');
              return String(v);
            }
            return '';
        }
      })
    );
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length - (filters.search ? 1 : 0); // exclude search

  const SortIcon = ({ field }: { field: string }) => (
    <svg className={`inline-block ml-1 h-3 w-3 ${sortBy === field ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {sortBy === field && sortOrder === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      ) : sortBy === field && sortOrder === 'desc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      )}
    </svg>
  );

  const pageNumbers = () => {
    const pages: (number | string)[] = [];
    const total = pagination.totalPages;
    const current = pagination.page;
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  };

  // ─── Cell Renderer ──────────────────────────────────────────────

  const renderCell = (col: ColumnDef, lead: Lead) => {
    switch (col.id) {
      case 'select':
        return (
          <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleSelect(lead.id)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600" />
        );
      case 'name':
        return (
          <Link href={`/leads/${lead.id}`} className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-medium text-white shadow-sm flex-shrink-0">
              {getInitials(lead)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate">{getDisplayName(lead)}</p>
              {lead.jobTitle && <p className="text-xs text-gray-500 truncate">{lead.jobTitle}</p>}
            </div>
          </Link>
        );
      case 'email':
        return (
          <InlineEdit value={lead.email || ''} onSave={(v) => handleInlineUpdate(lead.id, 'email', v)}
            type="email" placeholder="Add email" displayClassName="text-sm text-gray-900" />
        );
      case 'phone':
        return (
          <InlineEdit value={formatPhone(lead.phone) || ''} onSave={(v) => handleInlineUpdate(lead.id, 'phone', v)}
            type="tel" placeholder="+971 50 123 4567" displayClassName="text-sm text-gray-700" />
        );
      case 'company':
        return (
          <InlineEdit value={lead.company || ''} onSave={(v) => handleInlineUpdate(lead.id, 'company', v)}
            placeholder="Add company" displayClassName="text-sm text-gray-700" />
        );
      case 'jobTitle':
        return (
          <InlineEdit value={lead.jobTitle || ''} onSave={(v) => handleInlineUpdate(lead.id, 'jobTitle', v)}
            placeholder="Add title" displayClassName="text-sm text-gray-700" />
        );
      case 'status': {
        // Show pipeline stage name (e.g., "Proposal Sent") instead of status enum ("QUALIFIED")
        const useStages = stages.length > 0;
        const stageOpts = useStages
          ? stages.map((s) => ({ value: s.id, label: s.name }))
          : Object.keys(statusColors).map((s) => ({ value: s, label: getStatusLabel(s) }));
        const currentVal = useStages ? ((lead as any).stageId || lead.status) : lead.status;
        return (
          <InlineEdit value={currentVal} onSave={async (v) => {
              if (useStages) {
                try { await api.moveLead(lead.id, v, 0); fetchLeads(); fetchStats(); } catch (err: any) { alert(err.message); }
              } else {
                handleInlineUpdate(lead.id, 'status', v);
              }
            }}
            type="select" options={stageOpts}
            displayClassName={`badge ${statusColors[lead.status] || 'bg-gray-100 text-gray-800'}`} />
        );
      }
      case 'source':
        return <span className="text-sm text-gray-700">{sourceLabels[lead.source] || lead.source}</span>;
      case 'score':
        const score = lead.score ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-14 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${score}%`,
                backgroundColor: score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444',
              }} />
            </div>
            <span className="text-sm font-semibold tabular-nums" style={{ color: score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626' }}>{score}</span>
          </div>
        );
      case 'budget':
        return (
          <InlineEdit value={lead.budget ? Number(lead.budget).toLocaleString() : ''} onSave={(v) => handleInlineUpdate(lead.id, 'budget', v.replace(/,/g, ''))}
            type="number" placeholder="Add budget" displayClassName="text-sm text-gray-700" />
        );
      case 'location':
        return (
          <InlineEdit value={lead.location || ''} onSave={(v) => handleInlineUpdate(lead.id, 'location', v)}
            placeholder="Add location" displayClassName="text-sm text-gray-700" />
        );
      case 'productInterest':
        return (
          <InlineEdit value={lead.productInterest || ''} onSave={(v) => handleInlineUpdate(lead.id, 'productInterest', v)}
            placeholder="Add interest" displayClassName="text-sm text-gray-700" />
        );
      case 'campaign':
        return <span className="text-sm text-gray-700">{lead.campaign || '-'}</span>;
      case 'conversionProb':
        return lead.conversionProb != null ? (
          <span className="text-sm font-medium" style={{ color: lead.conversionProb >= 0.6 ? '#16a34a' : lead.conversionProb >= 0.3 ? '#d97706' : '#dc2626' }}>
            {Math.round(lead.conversionProb * 100)}%
          </span>
        ) : <span className="text-sm text-gray-400">-</span>;
      case 'division':
        return lead.organization ? (
          <span className="text-sm text-gray-700">{lead.organization.name}</span>
        ) : <span className="text-xs text-gray-400">-</span>;
      case 'assignedTo':
        return lead.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
              {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
            </div>
            <span className="text-sm text-gray-700">{lead.assignedTo.firstName}</span>
          </div>
        ) : <span className="text-xs text-gray-400">Unassigned</span>;
      case 'callCount': {
        const count = lead._count?.callLogs || 0;
        return (
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className={`text-sm font-medium ${count === 0 ? 'text-gray-400' : count >= 5 ? 'text-red-600' : count >= 3 ? 'text-amber-600' : 'text-gray-700'}`}>
              {count}
            </span>
            {count === 0 && <span className="text-xs text-gray-400">Never called</span>}
          </div>
        );
      }
      case 'tags':
        return lead.tags && lead.tags.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {lead.tags.slice(0, 3).map((t) => (
              <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                {t.tag.name}
              </span>
            ))}
            {lead.tags.length > 3 && <span className="text-[10px] text-gray-400">+{lead.tags.length - 3}</span>}
          </div>
        ) : <span className="text-xs text-gray-400">-</span>;
      case 'channels': {
        const ucc = lead.unreadChannelCounts || {};
        const unreadEntries = Object.entries(ucc).filter(([, cnt]) => cnt > 0);
        if (unreadEntries.length === 0) return <span className="text-xs text-gray-400">-</span>;
        const channelConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
          WHATSAPP: { icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z', color: '#25D366', bg: 'bg-green-50', label: 'WhatsApp' },
          EMAIL: { icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', color: '#6366F1', bg: 'bg-indigo-50', label: 'Email' },
          SMS: { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', color: '#8B5CF6', bg: 'bg-purple-50', label: 'SMS' },
          PHONE: { icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', color: '#F59E0B', bg: 'bg-amber-50', label: 'Phone' },
          CHAT: { icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z', color: '#3B82F6', bg: 'bg-blue-50', label: 'Chat' },
        };
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {unreadEntries.map(([channel, unread]) => {
              const cfg = channelConfig[channel] || { icon: '', color: '#6B7280', bg: 'bg-gray-50', label: channel };
              return (
                <span key={channel} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 ring-1 ring-brand-200 text-brand-700"
                  title={`${cfg.label}: ${unread} unread`}>
                  <svg className="h-3 w-3" fill={channel === 'WHATSAPP' ? 'currentColor' : 'none'} stroke={channel === 'WHATSAPP' ? 'none' : 'currentColor'} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.icon} />
                  </svg>
                  {unread}
                </span>
              );
            })}
          </div>
        );
      }
      case 'createdAt':
        return (
          <div className="flex flex-col">
            <span className="text-sm text-gray-700">{new Date(lead.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="text-[10px] text-gray-400">{formatTimeAgo(lead.createdAt)}</span>
          </div>
        );
      case 'updatedAt':
        return (
          <div className="flex flex-col">
            <span className="text-sm text-gray-700">{new Date(lead.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="text-[10px] text-gray-400">{formatTimeAgo(lead.updatedAt)}</span>
          </div>
        );
      case 'sla': {
        const sla = (lead as any).slaInfo;
        if (!sla || !sla.enabled) return <span className="text-xs text-gray-400">-</span>;
        return <SLABadge slaInfo={sla} />;
      }
      case 'actions':
        return (
          <div className="relative">
            <button onClick={() => setQuickActionId(quickActionId === lead.id ? null : lead.id)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
            </button>
            {quickActionId === lead.id && (
              <div ref={quickActionRef} className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                <Link href={`/leads/${lead.id}`} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  View Details
                </Link>
                <div className="border-t border-gray-100 my-1" />
                <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase">Move to Stage</div>
                {stages.length > 0
                  ? stages.filter((s) => s.id !== (lead as any).stageId).map((s) => (
                      <button key={s.id} onClick={async () => {
                        try { await api.moveLead(lead.id, s.id, 0); setQuickActionId(null); fetchLeads(); fetchStats(); } catch (err: any) { alert(err.message); }
                      }} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color || '#6B7280' }} />
                        {s.name}
                      </button>
                    ))
                  : Object.keys(statusColors).filter((s) => s !== lead.status).map((s) => (
                      <button key={s} onClick={() => handleQuickStatus(lead.id, s)} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                        <span className={`inline-block w-2 h-2 rounded-full ${statusColors[s].split(' ')[0]}`} />
                        {getStatusLabel(s)}
                      </button>
                    ))}
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => handleQuickDelete(lead.id)} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Archive Lead
                </button>
              </div>
            )}
          </div>
        );
      default:
        // Custom field columns (id starts with cf_)
        if (col.id.startsWith('cf_') && col.isCustom) {
          const fieldName = col.id.slice(3); // remove 'cf_' prefix
          const customData = (lead.customData || {}) as Record<string, unknown>;
          const value = customData[fieldName];
          const cf = customFields.find(f => f.name === fieldName);

          if (value === undefined || value === null || value === '') {
            return <span className="text-xs text-gray-400 italic">-</span>;
          }

          // Render based on type
          switch (col.customFieldType) {
            case 'BOOLEAN':
              return <span className={`text-xs font-medium px-2 py-0.5 rounded ${value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{value ? 'Yes' : 'No'}</span>;
            case 'SELECT':
              return <span className="text-sm text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{String(value)}</span>;
            case 'MULTI_SELECT':
              return (
                <div className="flex gap-1 flex-wrap">
                  {(Array.isArray(value) ? value : []).map((v: string, i: number) => (
                    <span key={i} className="text-[10px] font-medium bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">{v}</span>
                  ))}
                </div>
              );
            case 'URL':
              return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline truncate block max-w-[180px]">{String(value)}</a>;
            case 'DATE':
              return <span className="text-sm text-gray-700">{new Date(String(value)).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>;
            case 'NUMBER':
              return (
                <InlineEdit value={String(value)} onSave={async (v) => {
                  const newCustomData = { ...customData, [fieldName]: v ? parseFloat(v) : null };
                  await api.updateLead(lead.id, { customData: newCustomData });
                  fetchLeads();
                }} type="number" placeholder="-" displayClassName="text-sm text-gray-700" />
              );
            default:
              return (
                <InlineEdit value={String(value)} onSave={async (v) => {
                  const newCustomData = { ...customData, [fieldName]: v || null };
                  await api.updateLead(lead.id, { customData: newCustomData });
                  fetchLeads();
                }} placeholder="-" displayClassName="text-sm text-gray-700" />
              );
          }
        }
        return null;
    }
  };

  // Listen for open-lead-form event from command palette
  useEffect(() => {
    const handler = () => setShowForm(true);
    window.addEventListener('open-lead-form', handler);
    return () => window.removeEventListener('open-lead-form', handler);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <>
    <style jsx global>{`
      .leads-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .leads-scroll::-webkit-scrollbar-track { background: transparent; }
      .leads-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      .leads-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      .leads-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
    `}</style>
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 pt-4 px-1">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Leads</h1>
          <p className="text-text-secondary mt-0.5 text-sm">{pagination.total} leads total</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => { fetchLeads(); fetchStats(); }} />
          <button onClick={exportCSV} className="btn-secondary text-xs gap-1.5" title="Export visible columns as CSV">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            New Lead
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 flex-shrink-0">
          <StatCard label="Total" value={stats.overview.totalLeads} color="brand" />
          <StatCard label={getStatusLabel('NEW')} value={stats.overview.newLeads} color="indigo" />
          <StatCard label={getStatusLabel('QUALIFIED')} value={stats.overview.qualifiedLeads} color="cyan" />
          <StatCard label={getStatusLabel('WON')} value={stats.overview.wonLeads} color="green" />
          <StatCard label={getStatusLabel('LOST')} value={stats.overview.lostLeads} color="red" />
          <StatCard label="Pipeline" value={`AED ${Number(stats.overview.pipelineValue || 0).toLocaleString()}`} color="amber" />
          <div className="col-span-full flex gap-2 mt-1">
            <button onClick={() => setShowWorkload(!showWorkload)} className="btn-secondary text-xs gap-1.5 px-3 py-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Team Workload
            </button>
            <button onClick={() => setShowAllocationSettings(true)} className="btn-secondary text-xs gap-1.5 px-3 py-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Allocation Rules
            </button>
          </div>
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* View Sidebar */}
        {showViewSidebar && (
          <ViewSidebar
            activeViewId={activeViewId}
            customViews={customViews}
            onSelectView={handleSelectView}
            onSaveView={handleSaveView}
            onDeleteView={handleDeleteView}
            currentFilters={filters}
            currentSortBy={sortBy}
            currentSortOrder={sortOrder}
          />
        )}

        {/* Content Area */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Toolbar */}
          <div className="card p-3 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Sidebar */}
              <button onClick={() => setShowViewSidebar(!showViewSidebar)}
                className={`p-2 rounded-lg border transition-colors ${showViewSidebar ? 'bg-brand-50 border-brand-200 text-brand-600' : 'border-gray-300 text-gray-400 hover:text-gray-600'}`}
                title="Toggle view sidebar">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
              </button>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" placeholder="Search by name, email, company, phone..." className="input pl-9 text-sm"
                  value={filters.search}
                  onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); setActiveViewId('all'); }}
                />
              </div>

              {/* Quick Status Filter */}
              <select className="input max-w-[140px] text-sm" value={filters.status}
                onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPagination((p) => ({ ...p, page: 1 })); setActiveViewId('all'); }}>
                <option value="">All Statuses</option>
                {Object.keys(statusColors).map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
              </select>

              {/* Advanced Filters Toggle */}
              <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`p-2 rounded-lg border transition-colors relative ${showAdvancedFilters || activeFilterCount > 0 ? 'bg-brand-50 border-brand-200 text-brand-600' : 'border-gray-300 text-gray-400 hover:text-gray-600'}`}
                title="Advanced filters">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center">{activeFilterCount}</span>
                )}
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Column Manager */}
              <button onClick={() => setShowColumnManager(true)}
                className="p-2 rounded-lg border border-gray-300 text-gray-400 hover:text-gray-600 transition-colors"
                title="Manage columns">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              </button>

              {/* View Toggle */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button onClick={() => setViewMode('table')}
                  className={`p-2 ${viewMode === 'table' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`} title="Table view">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                </button>
                <button onClick={() => setViewMode('cards')}
                  className={`p-2 border-l border-gray-300 ${viewMode === 'cards' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`} title="Card view">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                </button>
                <button onClick={() => setViewMode('kanban')}
                  className={`p-2 border-l border-gray-300 ${viewMode === 'kanban' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`} title="Kanban view">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <AdvancedFilters
              filters={filters}
              onChange={(f) => { setFilters(f); setPagination((p) => ({ ...p, page: 1 })); setActiveViewId('all'); }}
              users={users}
              tags={allTags}
              stages={stages}
              onClose={() => setShowAdvancedFilters(false)}
            />
          )}

          {/* Active Filter Badges */}
          <FilterBadges filters={filters} onRemove={handleRemoveFilter} stages={stages} />

          {/* Bulk Actions Bar */}
          {selectedLeads.size > 0 && (
            <div className="card p-3 bg-brand-50 border-brand-200 flex items-center justify-between">
              <span className="text-sm font-medium text-brand-700">
                {selectedLeads.size} lead{selectedLeads.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button onClick={() => setShowBulkActions(!showBulkActions)} className="btn-secondary text-xs gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Move to Stage
                  </button>
                  {showBulkActions && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-60 overflow-y-auto">
                      {stages.length > 0
                        ? stages.map((s) => (
                            <button key={s.id} onClick={async () => {
                              try { await Promise.all(Array.from(selectedLeads).map(id => api.moveLead(id, s.id, 0))); setShowBulkActions(false); setSelectedLeads(new Set()); fetchLeads(); fetchStats(); } catch (err: any) { alert(err.message); }
                            }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color || '#6B7280' }} />
                              {s.name}
                            </button>
                          ))
                        : Object.keys(statusColors).map((s) => (
                            <button key={s} onClick={() => handleBulkStatusUpdate(s)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColors[s].split(' ')[0]}`} />
                              {getStatusLabel(s)}
                            </button>
                          ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowBulkReassign(true)} className="btn-secondary text-xs gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Reassign
                </button>
                <button onClick={handleBulkDelete} className="btn-secondary text-xs text-red-600 hover:text-red-700 gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Archive
                </button>
                <button onClick={() => setSelectedLeads(new Set())} className="btn-secondary text-xs">Clear</button>
              </div>
            </div>
          )}

          {/* ═══════════════════ TABLE VIEW ═══════════════════ */}
          {viewMode === 'table' && (
            <div className="card overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-auto leads-scroll">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
                    <tr className="border-b border-border">
                      {visibleColumns.map((col) => (
                        <th key={col.id} className={`table-header px-4 py-3 text-left border-r border-gray-100 last:border-r-0 ${col.width || ''} ${col.sortable ? 'cursor-pointer hover:text-text-secondary select-none' : ''}`}
                          onClick={() => col.sortable && col.sortField && handleSort(col.sortField)}>
                          {col.id === 'select' ? (
                            <input type="checkbox" checked={leads.length > 0 && selectedLeads.size === leads.length}
                              onChange={toggleSelectAll} className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500" />
                          ) : (
                            <>{customLabels[col.id] || col.label}{col.sortable && col.sortField && <SortIcon field={col.sortField} />}</>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={visibleColumns.length} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center animate-pulse-soft">
                            <div className="h-4 w-4 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
                          </div>
                          <span className="text-sm text-text-tertiary">Loading leads...</span>
                        </div>
                      </td></tr>
                    ) : error ? (
                      <tr><td colSpan={visibleColumns.length} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 py-8">
                          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          </div>
                          <p className="text-sm font-medium text-red-800">Failed to load leads</p>
                          <p className="text-xs text-red-600 max-w-md">{error}</p>
                          <button onClick={() => fetchLeads()} className="btn-primary text-sm mt-2">Retry</button>
                        </div>
                      </td></tr>
                    ) : leads.length === 0 ? (
                      <tr><td colSpan={visibleColumns.length} className="px-4 py-16 text-center">
                        <div className="empty-state py-8">
                          <div className="empty-state-icon">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <p className="text-sm font-medium text-text-primary">No leads found</p>
                          <p className="text-xs text-text-tertiary mt-1 mb-3">Get started by creating your first lead</p>
                          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Create your first lead</button>
                        </div>
                      </td></tr>
                    ) : (
                      leads.map((lead) => (
                        <tr key={lead.id}
                          className={`table-row transition-colors cursor-pointer hover:bg-brand-50/30 ${selectedLeads.has(lead.id) ? 'bg-brand-50/40' : ''}`}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('input, button, a, select, [role="listbox"], [data-inline-edit]')) return;
                            router.push(`/leads/${lead.id}`);
                          }}>
                          {visibleColumns.map((col) => (
                            <td key={col.id} className={`table-cell border-r border-gray-100 last:border-r-0 ${col.width || ''}`}>{renderCell(col, lead)}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex-shrink-0 border-t border-gray-200">
                <Pagination pagination={pagination} setPagination={setPagination} pageNumbers={pageNumbers} />
              </div>
            </div>
          )}

          {/* ═══════════════════ CARD VIEW ═══════════════════ */}
          {viewMode === 'cards' && (
            <div className="flex-1 min-h-0 overflow-auto leads-scroll">
              {loading ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
              ) : error ? (
                <div className="card p-12 text-center">
                  <p className="text-sm font-medium text-red-800">Failed to load leads</p>
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                  <button onClick={() => fetchLeads()} className="btn-primary text-sm mt-3">Retry</button>
                </div>
              ) : leads.length === 0 ? (
                <div className="card p-12 text-center">
                  <p className="text-sm text-gray-500">No leads found</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leads.map((lead) => (
                      <Link key={lead.id} href={`/leads/${lead.id}`} className="card p-4 hover:shadow-md transition-shadow group">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-sm font-medium text-white shadow-sm">
                              {getInitials(lead)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{getDisplayName(lead)}</p>
                              <p className="text-xs text-gray-500">{lead.company || 'No company'}</p>
                            </div>
                          </div>
                          <span className={`badge ${statusColors[lead.status] || 'bg-gray-100 text-gray-800'}`}>{(lead as any).stage?.name || getStatusLabel(lead.status || 'NEW')}</span>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          {lead.email && <p className="text-gray-600 truncate flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>{lead.email}</p>}
                          {lead.phone && <p className="text-gray-600 flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28" /></svg>{formatPhone(lead.phone)}</p>}
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${lead.score ?? 0}%`, backgroundColor: (lead.score ?? 0) >= 70 ? '#22c55e' : (lead.score ?? 0) >= 40 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: (lead.score ?? 0) >= 70 ? '#16a34a' : (lead.score ?? 0) >= 40 ? '#d97706' : '#dc2626' }}>{lead.score ?? 0}</span>
                          </div>
                          <span className="text-xs text-gray-400">{sourceLabels[lead.source] || lead.source}</span>
                          {lead._count?.callLogs ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {lead._count.callLogs} calls
                            </span>
                          ) : null}
                        </div>
                        {/* Channel Indicators */}
                        {lead.channelCounts && Object.keys(lead.channelCounts).length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            {Object.entries(lead.channelCounts).map(([channel, count]) => {
                              const cfgMap: Record<string, { color: string; bg: string; label: string }> = {
                                WHATSAPP: { color: '#25D366', bg: 'bg-green-50', label: 'WhatsApp' },
                                EMAIL: { color: '#6366F1', bg: 'bg-indigo-50', label: 'Email' },
                                SMS: { color: '#8B5CF6', bg: 'bg-purple-50', label: 'SMS' },
                                PHONE: { color: '#F59E0B', bg: 'bg-amber-50', label: 'Phone' },
                                CHAT: { color: '#3B82F6', bg: 'bg-blue-50', label: 'Chat' },
                              };
                              const cfg = cfgMap[channel] || { color: '#6B7280', bg: 'bg-gray-50', label: channel };
                              return (
                                <span key={channel} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg}`}
                                  style={{ color: cfg.color }} title={`${cfg.label}: ${count} message${count !== 1 ? 's' : ''}`}>
                                  {channel === 'WHATSAPP' && <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>}
                                  {channel === 'EMAIL' && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>}
                                  {channel === 'SMS' && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
                                  {channel === 'PHONE' && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                                  {channel === 'CHAT' && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>}
                                  {count}
                                </span>
                              );
                            })}
                            {lead.lastInboundMessage && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={`Last: ${lead.lastInboundMessage.body}`}>
                                {lead.lastInboundMessage.body.substring(0, 30)}{lead.lastInboundMessage.body.length > 30 ? '...' : ''}
                              </span>
                            )}
                          </div>
                        )}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {lead.tags.slice(0, 4).map((t) => (
                              <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>{t.tag.name}</span>
                            ))}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Pagination pagination={pagination} setPagination={setPagination} pageNumbers={pageNumbers} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════ KANBAN VIEW ═══════════════════ */}
          {viewMode === 'kanban' && (
            <div>
              <KanbanView
                leads={leads}
                customFields={customFields}
                onStatusChange={async (leadId, status) => {
                  await handleQuickStatus(leadId, status);
                }}
              />
              <div className="mt-4">
                <Pagination pagination={pagination} setPagination={setPagination} pageNumbers={pageNumbers} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Workload Dashboard ─────────────────────────────────── */}
      <WorkloadDashboard isOpen={showWorkload} onToggle={() => setShowWorkload(!showWorkload)} />

      {/* ─── Modals ──────────────────────────────────────────────── */}
      {showBulkReassign && (
        <BulkReassignModal
          leadCount={selectedLeads.size}
          users={users}
          currentUserId={currentUser?.id}
          onConfirm={handleBulkReassign}
          onClose={() => setShowBulkReassign(false)}
        />
      )}
      {showAllocationSettings && (
        <AllocationSettings
          isOpen={showAllocationSettings}
          onClose={() => { setShowAllocationSettings(false); fetchLeads(); }}
          users={users}
        />
      )}
      {showForm && <CreateLeadModal onClose={() => setShowForm(false)} onSubmit={handleCreateLead} customFields={customFields} users={users} currentUserId={currentUser?.id} userRole={currentUser?.role} />}
      {showColumnManager && <ColumnManager columns={columns} onChange={(c) => { setColumns(c); saveColumns(c); }} onClose={() => setShowColumnManager(false)} />}
    </div>
    </>
  );
}

// ─── Sub Components ───────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`card p-3 border-transparent ${colorMap[color] || colorMap.brand}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}

function Pagination({ pagination, setPagination, pageNumbers }: {
  pagination: { total: number; page: number; limit: number; totalPages: number };
  setPagination: (fn: (p: any) => any) => void;
  pageNumbers: () => (number | string)[];
}) {
  const limit = pagination.limit || 20;
  const start = ((pagination.page - 1) * limit) + 1;
  const end = Math.min(pagination.page * limit, pagination.total);
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-500">
          {pagination.total > 0 ? `Showing ${start}-${end} of ${pagination.total}` : 'No leads'}
        </p>
        <div className="flex items-center gap-1.5">
          <label htmlFor="page-size" className="text-xs text-gray-400">Per page</label>
          <select
            id="page-size"
            value={limit}
            onChange={(e) => setPagination((p: any) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
            className="text-xs border border-gray-200 rounded-md px-1.5 py-1 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      {pagination.totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" disabled={pagination.page <= 1}
            onClick={() => setPagination((p: any) => ({ ...p, page: p.page - 1 }))}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          {pageNumbers().map((p, i) => (
            typeof p === 'number' ? (
              <button key={i} onClick={() => setPagination((prev: any) => ({ ...prev, page: p }))}
                className={`min-w-[32px] h-8 rounded text-sm font-medium ${p === pagination.page ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {p}
              </button>
            ) : <span key={i} className="px-1 text-gray-400">...</span>
          ))}
          <button className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((p: any) => ({ ...p, page: p.page + 1 }))}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

const LEAD_SOURCES = [
  'WEBSITE_FORM', 'LIVE_CHAT', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
  'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT',
  'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
] as const;

interface CreateLeadModalProps {
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  customFields?: any[];
  users?: User[];
  currentUserId?: string;
  userRole?: string;
}

function CreateLeadModal({
  onClose,
  onSubmit,
  customFields = [],
  users = [],
  currentUserId,
  userRole,
}: CreateLeadModalProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    return {
      name: '',
      email: '',
      phone: '',
      company: '',
      jobTitle: '',
      source: '',
      budget: '',
      productInterest: '',
      location: '',
      website: '',
      campaign: '',
      tags: [] as string[],
      assignedToId: currentUserId || null,
      ...(userRole === 'SUPER_ADMIN' && activeDivisionId ? { divisionId: activeDivisionId } : {}),
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableTags, setAvailableTags] = useState<{id: string; name: string; color: string}[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<Record<string, { isRequired?: boolean; customLabel?: string }>>({});
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});

  // Fetch available tags for the division
  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    if (activeDivisionId) {
      api.getTags(activeDivisionId).then((data: any) => setAvailableTags(Array.isArray(data) ? data : [])).catch(() => {});
    } else {
      api.getTags().then((data: any) => setAvailableTags(Array.isArray(data) ? data : [])).catch(() => {});
    }
  }, []);

  // Fetch field config to know which fields are required for this division
  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    const params = new URLSearchParams();
    if (activeDivisionId) params.append('divisionId', activeDivisionId);
    fetch(`/api/settings/field-config?${params}`, {
      headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''}` },
    })
      .then(r => r.json())
      .then(data => {
        const config: Record<string, { isRequired?: boolean; customLabel?: string }> = {};
        (data.builtInFields || []).forEach((f: any) => {
          config[f.key] = { isRequired: f.isRequired || false, customLabel: f.customLabel || undefined };
        });
        setFieldConfig(config);
        if (data.statusLabels) setStatusLabels(data.statusLabels);
      })
      .catch(() => {}); // fallback: only name required (hardcoded)
  }, []);

  const getStatusLabel = (status: string): string => {
    return statusLabels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, m => m.toLowerCase());
  };

  const isFieldRequired = (key: string): boolean => {
    if (key === 'name') return true; // always required
    return fieldConfig[key]?.isRequired || false;
  };

  const getLabel = (key: string, defaultLabel: string): string => {
    return fieldConfig[key]?.customLabel || defaultLabel;
  };

  const updateField = useCallback((field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Name is always required
    if (!formData.name || String(formData.name).trim() === '') {
      newErrors.name = 'Name is required';
    }

    // Dynamic required fields from Field Manager config
    const requirableFields = [
      { key: 'email', label: getLabel('email', 'Email') },
      { key: 'phone', label: getLabel('phone', 'Phone') },
      { key: 'company', label: getLabel('company', 'Company') },
      { key: 'jobTitle', label: getLabel('jobTitle', 'Job Title') },
      { key: 'source', label: getLabel('source', 'Source') },
      { key: 'budget', label: getLabel('budget', 'Budget') },
      { key: 'productInterest', label: getLabel('productInterest', 'Product Interest') },
      { key: 'location', label: getLabel('location', 'Location') },
      { key: 'website', label: getLabel('website', 'Website') },
      { key: 'campaign', label: getLabel('campaign', 'Campaign') },
    ];
    requirableFields.forEach(({ key, label }) => {
      if (isFieldRequired(key) && (!formData[key] || String(formData[key]).trim() === '')) {
        newErrors[key] = `${label} is required`;
      }
    });

    // Format validations
    if (formData.email && String(formData.email).trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(formData.email))) {
        newErrors.email = 'Invalid email address';
      }
    }
    if (formData.website && String(formData.website).trim() !== '') {
      try {
        new URL(String(formData.website));
      } catch {
        newErrors.website = 'Invalid URL (include https://)';
      }
    }
    if (formData.budget && isNaN(Number(formData.budget))) {
      newErrors.budget = 'Budget must be a number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, fieldConfig]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);
      try {
        const submitData: Record<string, unknown> = { ...formData };

        // Clean up budget — send as number
        if (submitData.budget && String(submitData.budget).trim() !== '') {
          submitData.budget = Number(submitData.budget);
        } else {
          delete submitData.budget;
        }

        // Smart-split unified Name into firstName/lastName for the API
        if (submitData.name && typeof submitData.name === 'string') {
          const nameParts = (submitData.name as string).trim().split(/\s+/);
          if (nameParts.length <= 1) {
            submitData.firstName = nameParts[0] || '';
            submitData.lastName = '';
          } else {
            submitData.lastName = nameParts.pop() || '';
            submitData.firstName = nameParts.join(' ');
          }
          delete submitData.name;
        }

        // Clean up empty strings
        Object.keys(submitData).forEach((key) => {
          if (submitData[key] === '') {
            delete submitData[key];
          }
        });

        // Ensure firstName is always sent (even after clean-up)
        if (!submitData.firstName && submitData.name) {
          submitData.firstName = submitData.name;
          delete submitData.name;
        }

        // Handle custom fields — store in customData keyed by cf.name
        const customData: Record<string, unknown> = {};
        customFields.forEach((cf) => {
          const val = submitData[`custom_${cf.name}`];
          if (val !== undefined && val !== '') {
            customData[cf.name] = val;
          }
          delete submitData[`custom_${cf.name}`];
        });
        if (Object.keys(customData).length > 0) {
          submitData.customData = customData;
        }

        await onSubmit(submitData);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, validate, onSubmit, customFields]
  );

  const renderInput = (
    field: string,
    label: string,
    options?: {
      type?: string;
      placeholder?: string;
      required?: boolean;
      half?: boolean;
    }
  ) => {
    const { type = 'text', placeholder = '', required = false } = options || {};
    const error = errors[field];

    return (
      <div className={options?.half ? '' : ''}>
        <label className="label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type={type}
          value={String(formData[field] ?? '')}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          className={`input w-full ${error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Create New Lead</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add a new lead to your pipeline</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* ===== Division Selector (SUPER_ADMIN only) ===== */}
            {userRole === 'SUPER_ADMIN' && (() => {
              let divisions: any[] = [];
              try { divisions = JSON.parse(localStorage.getItem('divisions') || '[]'); } catch {}
              if (divisions.length === 0) return null;
              const activeDivId = localStorage.getItem('activeDivisionId') || '';
              return (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Division</h3>
                  </div>
                  <select
                    value={String(formData.divisionId ?? activeDivId)}
                    onChange={(e) => updateField('divisionId', e.target.value || null)}
                    className="input w-full"
                  >
                    <option value="">Select division…</option>
                    {divisions.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.tradeName || d.name}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-gray-500">Choose which division this lead belongs to.</p>
                </section>
              );
            })()}

            {/* ===== Contact Information ===== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Contact Information
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderInput('name', getLabel('name', 'Name'), { placeholder: 'Ahmed Al-Zaabi', required: true })}
                {renderInput('email', getLabel('email', 'Email'), { type: 'email', placeholder: 'john@example.com', required: isFieldRequired('email') })}
                {renderInput('phone', getLabel('phone', 'Phone'), { type: 'tel', placeholder: '+971 50 123 4567', required: isFieldRequired('phone') })}
              </div>
            </section>

            {/* ===== Lead Information ===== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Lead Information
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderInput('company', getLabel('company', 'Company'), { placeholder: 'Acme Corp', required: isFieldRequired('company') })}
                {renderInput('jobTitle', getLabel('jobTitle', 'Job Title'), { placeholder: 'Marketing Director', required: isFieldRequired('jobTitle') })}
                <div>
                  <label className="label">{getLabel('source', 'Source')}{isFieldRequired('source') && <span className="text-red-500 ml-0.5">*</span>}</label>
                  {errors.source && <p className="mt-1 text-xs text-red-600">{errors.source}</p>}
                  <select
                    value={String(formData.source ?? '')}
                    onChange={(e) => updateField('source', e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Select source…</option>
                    {LEAD_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">
                    {getLabel('budget', 'Budget')} <span className="text-gray-400 font-normal">(AED)</span>{isFieldRequired('budget') && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      AED
                    </span>
                    <input
                      type="text"
                      value={String(formData.budget ?? '')}
                      onChange={(e) => updateField('budget', e.target.value)}
                      placeholder="0.00"
                      className={`input w-full pl-12 ${errors.budget ? 'border-red-300' : ''}`}
                    />
                  </div>
                  {errors.budget && <p className="mt-1 text-xs text-red-600">{errors.budget}</p>}
                </div>
                {renderInput('productInterest', getLabel('productInterest', 'Product Interest'), { placeholder: 'e.g. Enterprise Plan', required: isFieldRequired('productInterest') })}
                {renderInput('location', getLabel('location', 'Location'), { placeholder: 'Dubai, UAE', required: isFieldRequired('location') })}
                {renderInput('website', getLabel('website', 'Website'), { type: 'url', placeholder: 'https://example.com', required: isFieldRequired('website') })}
                {renderInput('campaign', getLabel('campaign', 'Campaign'), { placeholder: 'Q1 2026 Campaign', required: isFieldRequired('campaign') })}
              </div>
            </section>

            {/* ===== Lead Assignment ===== */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Lead Assignment
                </h3>
              </div>
              <div>
                <label className="label">Assigned To</label>
                <AssigneeDropdown
                  users={users}
                  selectedId={formData.assignedToId as string | null}
                  onChange={(userId) => updateField('assignedToId', userId)}
                  currentUserId={currentUserId}
                  showAutoAssign
                  showUnassigned
                  placeholder="Select team member…"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Choose a team member or let the system auto-assign via round robin.
                </p>
              </div>
            </section>

            {/* ===== Custom Fields ===== */}
            {customFields.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Custom Fields
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {customFields.map((cf) => {
                    const fieldKey = `custom_${cf.name}`;

                    if (cf.type === 'SELECT' && cf.options && cf.options.length > 0) {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <select
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          >
                            <option value="">Select…</option>
                            {cf.options.map((opt: string) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (cf.type === 'MULTI_SELECT' && cf.options && cf.options.length > 0) {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <select
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          >
                            <option value="">Select…</option>
                            {cf.options.map((opt: string) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (cf.type === 'TEXTAREA') {
                      return (
                        <div key={cf.id} className="sm:col-span-2">
                          <label className="label">{cf.label}</label>
                          <textarea
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            rows={3}
                            className="input w-full resize-none"
                          />
                        </div>
                      );
                    }

                    if (cf.type === 'BOOLEAN' || cf.type === 'CHECKBOX') {
                      return (
                        <div key={cf.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={fieldKey}
                            checked={Boolean(formData[fieldKey])}
                            onChange={(e) => updateField(fieldKey, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <label htmlFor={fieldKey} className="text-sm text-gray-700">
                            {cf.label}
                          </label>
                        </div>
                      );
                    }

                    if (cf.type === 'NUMBER') {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <input
                            type="number"
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          />
                        </div>
                      );
                    }

                    if (cf.type === 'DATE') {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <input
                            type="date"
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          />
                        </div>
                      );
                    }

                    if (cf.type === 'URL') {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <input
                            type="url"
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                            placeholder="https://"
                          />
                        </div>
                      );
                    }

                    if (cf.type === 'EMAIL') {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <input
                            type="email"
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          />
                        </div>
                      );
                    }

                    if (cf.type === 'PHONE') {
                      return (
                        <div key={cf.id}>
                          <label className="label">{cf.label}</label>
                          <input
                            type="tel"
                            value={String(formData[fieldKey] ?? '')}
                            onChange={(e) => updateField(fieldKey, e.target.value)}
                            className="input w-full"
                          />
                        </div>
                      );
                    }

                    // Default: TEXT
                    return (
                      <div key={cf.id}>
                        <label className="label">{cf.label}</label>
                        <input
                          type="text"
                          value={String(formData[fieldKey] ?? '')}
                          onChange={(e) => updateField(fieldKey, e.target.value)}
                          className="input w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

              {/* Tags Picker */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {((formData.tags as string[]) || []).map((tagName: string) => {
                    const tagInfo = availableTags.find(t => t.name === tagName);
                    const color = tagInfo?.color || '#6366f1';
                    return (
                      <span key={tagName} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}>
                        {tagName}
                        <button type="button" onClick={() => setFormData({ ...formData, tags: ((formData.tags as string[]) || []).filter((t: string) => t !== tagName) })} className="hover:bg-black/10 rounded-full p-0.5">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => { setTagInput(e.target.value); setShowTagDropdown(true); }}
                    onFocus={() => setShowTagDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        const existing = (formData.tags as string[]) || [];
                        if (!existing.includes(tagInput.trim())) {
                          setFormData({ ...formData, tags: [...existing, tagInput.trim()] });
                        }
                        setTagInput('');
                        setShowTagDropdown(false);
                      }
                      if (e.key === 'Escape') setShowTagDropdown(false);
                    }}
                    placeholder="Type to search or create tags..."
                    className="input text-sm w-full"
                  />
                  {showTagDropdown && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                      {availableTags
                        .filter(t => !((formData.tags as string[]) || []).includes(t.name))
                        .filter(t => !tagInput || t.name.toLowerCase().includes(tagInput.toLowerCase()))
                        .map(t => (
                          <button key={t.id} type="button" onClick={() => {
                            const existing = (formData.tags as string[]) || [];
                            setFormData({ ...formData, tags: [...existing, t.name] });
                            setTagInput('');
                            setShowTagDropdown(false);
                          }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </button>
                        ))}
                      {tagInput.trim() && !availableTags.some(t => t.name.toLowerCase() === tagInput.toLowerCase()) && (
                        <button type="button" onClick={() => {
                          const existing = (formData.tags as string[]) || [];
                          if (!existing.includes(tagInput.trim())) {
                            setFormData({ ...formData, tags: [...existing, tagInput.trim()] });
                          }
                          setTagInput('');
                          setShowTagDropdown(false);
                        }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-indigo-50 text-indigo-600 font-medium">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Create &ldquo;{tagInput.trim()}&rdquo;
                        </button>
                      )}
                      {availableTags.filter(t => !((formData.tags as string[]) || []).includes(t.name)).length === 0 && !tagInput && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">Type to create a new tag</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating…
                </span>
              ) : (
                'Create Lead'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}




function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
      {title}
    </h3>
  );
}
