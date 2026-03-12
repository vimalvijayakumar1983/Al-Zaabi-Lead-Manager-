'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { Lead, PaginatedResponse, User, CustomField } from '@/types';
import { ColumnManager, loadColumns, saveColumns, type ColumnDef } from './components/column-config';
import { ViewSidebar, SYSTEM_VIEWS, loadCustomViews, saveCustomViews, type SavedView } from './components/saved-views';
import { KanbanView } from './components/kanban-view';
import { InlineEdit } from './components/inline-edit';
import { AdvancedFilters, FilterBadges, emptyFilters, type FilterState } from './components/advanced-filters';

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
  WEBSITE_FORM: 'Website Form', LANDING_PAGE: 'Landing Page', WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook Ads', GOOGLE_ADS: 'Google Ads', MANUAL: 'Manual',
  CSV_IMPORT: 'CSV Import', API: 'API', REFERRAL: 'Referral',
  EMAIL: 'Email', PHONE: 'Phone', OTHER: 'Other',
};

type ViewMode = 'table' | 'cards' | 'kanban';

export default function LeadsPage() {
  // ─── State ──────────────────────────────────────────────────────
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ ...emptyFilters });
  const [sortBy, setSortBy] = useState('createdAt');
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
  const [showColumnManager, setShowColumnManager] = useState(false);

  // Saved views
  const [activeViewId, setActiveViewId] = useState('all');
  const [customViews, setCustomViews] = useState<SavedView[]>(() => loadCustomViews());
  const [showViewSidebar, setShowViewSidebar] = useState(true);

  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [allTags, setAllTags] = useState<{id: string; name: string; color: string}[]>([]);
  const [stages, setStages] = useState<{id: string; name: string}[]>([]);

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const visibleColumns = columns.filter((c) => c.visible);

  // ─── Data Fetching ──────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagination.page,
        limit: 20,
        sortBy,
        sortOrder,
      };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.source) params.source = filters.source;
      if (filters.assignedToId === '__unassigned__') {
        params.assignedToId = 'unassigned';
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
      const res: PaginatedResponse<Lead> = await api.getLeads(params);
      setLeads(res.data);
      setPagination(res.pagination as any);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, filters, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboard();
      setStats(data);
    } catch { /* non-critical */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data as User[]);
    } catch { /* non-critical */ }
  }, []);

  const fetchCustomFields = useCallback(async () => {
    try {
      const data = await api.getCustomFields();
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

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchStats(); fetchUsers(); fetchCustomFields(); }, [fetchStats, fetchUsers, fetchCustomFields]);
  useEffect(() => {
    api.getLeadTags().then((data: any) => setAllTags(data || [])).catch(() => {});
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
    const newFilters = { ...emptyFilters };
    if (view.filters.status) newFilters.status = view.filters.status;
    if (view.filters.source) newFilters.source = view.filters.source;
    if (view.filters.minScore) newFilters.minScore = String(view.filters.minScore);
    if (view.filters.maxScore) newFilters.maxScore = String(view.filters.maxScore);
    if (view.filters.assignedToId) newFilters.assignedToId = view.filters.assignedToId;
    if (view.filters.dateFrom) newFilters.dateFrom = view.filters.dateFrom;
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
  };

  const handleDeleteView = (id: string) => {
    const updated = customViews.filter((v) => v.id !== id);
    setCustomViews(updated);
    saveCustomViews(updated);
    if (activeViewId === id) handleSelectView(SYSTEM_VIEWS[0]);
  };

  const handleRemoveFilter = (key: keyof FilterState) => {
    setFilters({ ...filters, [key]: '' });
    setPagination((p) => ({ ...p, page: 1 }));
    setActiveViewId('all');
  };

  const exportCSV = () => {
    const visibleCols = columns.filter((c) => c.visible && c.id !== 'select' && c.id !== 'actions');
    const headers = visibleCols.map((c) => c.label);
    const rows = leads.map((l) =>
      visibleCols.map((c) => {
        switch (c.id) {
          case 'name': return `${l.firstName} ${l.lastName}`;
          case 'email': return l.email || '';
          case 'phone': return l.phone || '';
          case 'company': return l.company || '';
          case 'jobTitle': return l.jobTitle || '';
          case 'status': return l.status;
          case 'source': return l.source;
          case 'score': return (l.score ?? 0).toString();
          case 'budget': return l.budget?.toString() || '';
          case 'location': return l.location || '';
          case 'productInterest': return l.productInterest || '';
          case 'campaign': return l.campaign || '';
          case 'conversionProb': return l.conversionProb ? `${Math.round(l.conversionProb * 100)}%` : '';
          case 'assignedTo': return l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '';
          case 'tags': return l.tags?.map((t) => t.tag.name).join(', ') || '';
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
              {lead.firstName[0]}{lead.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate">{lead.firstName} {lead.lastName}</p>
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
          <InlineEdit value={lead.phone || ''} onSave={(v) => handleInlineUpdate(lead.id, 'phone', v)}
            type="tel" placeholder="Add phone" displayClassName="text-sm text-gray-700" />
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
      case 'status':
        return (
          <InlineEdit value={lead.status} onSave={(v) => handleInlineUpdate(lead.id, 'status', v)}
            type="select" options={Object.keys(statusColors).map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
            displayClassName={`badge ${statusColors[lead.status]}`} />
        );
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
      case 'assignedTo':
        return lead.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
              {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
            </div>
            <span className="text-sm text-gray-700">{lead.assignedTo.firstName}</span>
          </div>
        ) : <span className="text-xs text-gray-400">Unassigned</span>;
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
      case 'createdAt':
        return <span className="text-sm text-gray-500">{new Date(lead.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>;
      case 'updatedAt':
        return <span className="text-sm text-gray-500">{new Date(lead.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>;
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
                <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase">Change Status</div>
                {Object.keys(statusColors).filter((s) => s !== lead.status).map((s) => (
                  <button key={s} onClick={() => handleQuickStatus(lead.id, s)} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                    <span className={`inline-block w-2 h-2 rounded-full ${statusColors[s].split(' ')[0]}`} />
                    {s.replace(/_/g, ' ')}
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
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Leads</h1>
          <p className="text-text-secondary mt-0.5 text-sm">{pagination.total} leads total</p>
        </div>
        <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.overview.totalLeads} color="brand" />
          <StatCard label="New" value={stats.overview.newLeads} color="indigo" />
          <StatCard label="Qualified" value={stats.leadsByStatus?.find((s: any) => s.status === 'QUALIFIED')?._count?.status || 0} color="cyan" />
          <StatCard label="Won" value={stats.overview.wonLeads} color="green" />
          <StatCard label="Lost" value={stats.overview.lostLeads} color="red" />
          <StatCard label="Pipeline" value={`AED ${Number(stats.overview.pipelineValue || 0).toLocaleString()}`} color="amber" />
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-4">
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
        <div className="flex-1 min-w-0 space-y-3">
          {/* Toolbar */}
          <div className="card p-3">
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
                {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
          <FilterBadges filters={filters} onRemove={handleRemoveFilter} />

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
                    Update Status
                  </button>
                  {showBulkActions && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      {Object.keys(statusColors).map((s) => (
                        <button key={s} onClick={() => handleBulkStatusUpdate(s)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColors[s].split(' ')[0]}`} />
                          {s.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {visibleColumns.map((col) => (
                        <th key={col.id} className={`table-header px-4 py-3 text-left ${col.width || ''} ${col.sortable ? 'cursor-pointer hover:text-text-secondary select-none' : ''}`}
                          onClick={() => col.sortable && col.sortField && handleSort(col.sortField)}>
                          {col.id === 'select' ? (
                            <input type="checkbox" checked={leads.length > 0 && selectedLeads.size === leads.length}
                              onChange={toggleSelectAll} className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500" />
                          ) : (
                            <>{col.label}{col.sortable && col.sortField && <SortIcon field={col.sortField} />}</>
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
                        <tr key={lead.id} className={`table-row transition-colors ${selectedLeads.has(lead.id) ? 'bg-brand-50/40' : ''}`}>
                          {visibleColumns.map((col) => (
                            <td key={col.id} className={`table-cell ${col.width || ''}`}>{renderCell(col, lead)}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} setPagination={setPagination} pageNumbers={pageNumbers} />
            </div>
          )}

          {/* ═══════════════════ CARD VIEW ═══════════════════ */}
          {viewMode === 'cards' && (
            <div>
              {loading ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
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
                              {lead.firstName[0]}{lead.lastName[0]}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{lead.firstName} {lead.lastName}</p>
                              <p className="text-xs text-gray-500">{lead.company || 'No company'}</p>
                            </div>
                          </div>
                          <span className={`badge ${statusColors[lead.status] || 'bg-gray-100 text-gray-800'}`}>{(lead.status || 'NEW').replace(/_/g, ' ')}</span>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          {lead.email && <p className="text-gray-600 truncate flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>{lead.email}</p>}
                          {lead.phone && <p className="text-gray-600 flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28" /></svg>{lead.phone}</p>}
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${lead.score ?? 0}%`, backgroundColor: (lead.score ?? 0) >= 70 ? '#22c55e' : (lead.score ?? 0) >= 40 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: (lead.score ?? 0) >= 70 ? '#16a34a' : (lead.score ?? 0) >= 40 ? '#d97706' : '#dc2626' }}>{lead.score ?? 0}</span>
                          </div>
                          <span className="text-xs text-gray-400">{sourceLabels[lead.source] || lead.source}</span>
                        </div>
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
            <KanbanView
              leads={leads}
              customFields={customFields}
              onStatusChange={async (leadId, status) => {
                await handleQuickStatus(leadId, status);
              }}
            />
          )}
        </div>
      </div>

      {/* ─── Modals ──────────────────────────────────────────────── */}
      {showForm && <CreateLeadModal onClose={() => setShowForm(false)} onSubmit={handleCreateLead} customFields={customFields} />}
      {showColumnManager && <ColumnManager columns={columns} onChange={(c) => { setColumns(c); saveColumns(c); }} onClose={() => setShowColumnManager(false)} />}
    </div>
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
  pagination: { total: number; page: number; totalPages: number };
  setPagination: (fn: (p: any) => any) => void;
  pageNumbers: () => (number | string)[];
}) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
      <p className="text-sm text-gray-500">
        Showing {((pagination.page - 1) * 20) + 1}-{Math.min(pagination.page * 20, pagination.total)} of {pagination.total}
      </p>
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
    </div>
  );
}

function CreateLeadModal({ onClose, onSubmit, customFields = [] }: { onClose: () => void; onSubmit: (data: any) => void; customFields?: CustomField[] }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '',
    source: 'MANUAL', productInterest: '', location: '', budget: '', website: '', campaign: '',
  });
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Build customData from custom field values
      const customData: Record<string, unknown> = {};
      for (const cf of customFields) {
        const val = customValues[cf.name];
        if (val !== undefined && val !== '' && val !== null) {
          if (cf.type === 'NUMBER') customData[cf.name] = parseFloat(String(val)) || null;
          else if (cf.type === 'BOOLEAN') customData[cf.name] = val === true || val === 'true';
          else customData[cf.name] = val;
        }
      }

      await onSubmit({
        firstName: form.firstName, lastName: form.lastName,
        email: form.email || null, phone: form.phone || null,
        company: form.company || null, jobTitle: form.jobTitle || null,
        source: form.source || undefined, productInterest: form.productInterest || null,
        location: form.location || null, budget: form.budget ? parseFloat(form.budget) : null,
        website: form.website || null, campaign: form.campaign || null,
        ...(Object.keys(customData).length > 0 ? { customData } : {}),
      });
    } finally { setSubmitting(false); }
  };

  const sourceLabelsLocal: Record<string, string> = {
    MANUAL: 'Manual', WEBSITE_FORM: 'Website Form', LANDING_PAGE: 'Landing Page',
    WHATSAPP: 'WhatsApp', FACEBOOK_ADS: 'Facebook Ads', GOOGLE_ADS: 'Google Ads',
    REFERRAL: 'Referral', EMAIL: 'Email', PHONE: 'Phone', CSV_IMPORT: 'CSV Import',
    API: 'API', OTHER: 'Other',
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto relative z-50 animate-fade-in-up">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Create New Lead</h2>
            <p className="text-sm text-text-secondary mt-0.5">Add a new lead to your pipeline</p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <SectionHeader icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" title="Personal Information" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First Name *</label><input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" /></div>
            <div><label className="label">Last Name *</label><input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" /></div>
          </div>

          <SectionHeader icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" title="Contact Details" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" /></div>
          </div>

          <SectionHeader icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" title="Company Details" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Company</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." /></div>
            <div><label className="label">Job Title</label><input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Marketing Manager" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Website</label><input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" /></div>
            <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Dubai, UAE" /></div>
          </div>

          <SectionHeader icon="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" title="Lead Information" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Source</label>
              <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {Object.entries(sourceLabelsLocal).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Budget</label><input type="number" className="input" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0.00" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Product Interest</label><input className="input" value={form.productInterest} onChange={(e) => setForm({ ...form, productInterest: e.target.value })} placeholder="e.g. Enterprise Plan" /></div>
            <div><label className="label">Campaign</label><input className="input" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="e.g. Q1 Promo" /></div>
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <>
              <SectionHeader icon="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2" title="Custom Fields" />
              <div className="grid grid-cols-2 gap-3">
                {customFields.map((cf) => (
                  <div key={cf.id}>
                    <label className="label">{cf.label}{cf.isRequired ? ' *' : ''}</label>
                    {cf.type === 'TEXT' && <input className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} />}
                    {cf.type === 'NUMBER' && <input type="number" className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} />}
                    {cf.type === 'DATE' && <input type="date" className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} />}
                    {cf.type === 'EMAIL' && <input type="email" className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} />}
                    {cf.type === 'PHONE' && <input className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} placeholder="+1 (555) 000-0000" />}
                    {cf.type === 'URL' && <input type="url" className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })} placeholder="https://" />}
                    {cf.type === 'SELECT' && (
                      <select className="input" required={cf.isRequired} value={String(customValues[cf.name] || '')} onChange={(e) => setCustomValues({ ...customValues, [cf.name]: e.target.value })}>
                        <option value="">Select...</option>
                        {(cf.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {cf.type === 'MULTI_SELECT' && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {((customValues[cf.name] as string[]) || []).map((v, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                              {v}
                              <button type="button" onClick={() => setCustomValues({ ...customValues, [cf.name]: ((customValues[cf.name] as string[]) || []).filter((_, j) => j !== i) })} className="hover:text-red-600">&times;</button>
                            </span>
                          ))}
                        </div>
                        <select className="input" value="" onChange={(e) => {
                          if (e.target.value) {
                            const current = (customValues[cf.name] as string[]) || [];
                            if (!current.includes(e.target.value)) {
                              setCustomValues({ ...customValues, [cf.name]: [...current, e.target.value] });
                            }
                            e.target.value = '';
                          }
                        }}>
                          <option value="">Add...</option>
                          {(cf.options || []).filter(o => !((customValues[cf.name] as string[]) || []).includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    )}
                    {cf.type === 'BOOLEAN' && (
                      <div className="flex items-center gap-4 mt-1">
                        <label className="flex items-center gap-1.5 text-sm"><input type="radio" name={`cf_${cf.name}`} checked={customValues[cf.name] === true} onChange={() => setCustomValues({ ...customValues, [cf.name]: true })} /> Yes</label>
                        <label className="flex items-center gap-1.5 text-sm"><input type="radio" name={`cf_${cf.name}`} checked={customValues[cf.name] === false} onChange={() => setCustomValues({ ...customValues, [cf.name]: false })} /> No</label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary gap-1.5">
              {submitting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating...</> : <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>Create Lead</>}
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
