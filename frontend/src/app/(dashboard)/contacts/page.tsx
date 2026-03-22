'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import type { Contact, ContactStats, ContactLifecycle, ContactType } from '@/types';
import {
  Users, Plus, Search, Filter, MoreHorizontal, ChevronDown,
  Mail, Phone, Building2, MapPin, Tag, Eye, Pencil, Trash2,
  ArrowUpDown, Check, X, UserPlus, Loader2, Download, Upload,
  Globe, Linkedin, Twitter, Calendar, Shield, Star, Heart,
  Briefcase, UserCheck, Merge, ChevronLeft, ChevronRight,
  BarChart3, TrendingUp, Clock, Hash, LayoutGrid, List, Columns,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';
import { useNotificationStore } from '@/store/notificationStore';
import { ContactColumnManager, loadContactColumns, saveContactColumns, type ContactColumnDef } from './components/column-config';
import { premiumAlert, premiumConfirm } from '@/lib/premiumDialogs';

// ─── Name Helpers ────────────────────────────────────────────────

function getDisplayName(first?: string | null, last?: string | null): string {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f && l && f.toLowerCase() === l.toLowerCase()) return f;
  if (f && l && f.toLowerCase().includes(l.toLowerCase())) return f;
  if (f && l && l.toLowerCase().includes(f.toLowerCase())) return l;
  return [f, l].filter(Boolean).join(' ') || 'Unknown';
}

function getDisplayInitials(first?: string | null, last?: string | null): string {
  const name = getDisplayName(first, last);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

// ─── Constants ───────────────────────────────────────────────────

type ViewMode = 'table' | 'cards' | 'kanban';

const lifecycleLabels: Record<ContactLifecycle, { label: string; color: string }> = {
  SUBSCRIBER: { label: 'Subscriber', color: 'bg-gray-100 text-gray-700' },
  LEAD: { label: 'Lead', color: 'bg-blue-100 text-blue-700' },
  MARKETING_QUALIFIED: { label: 'Marketing Qualified', color: 'bg-indigo-100 text-indigo-700' },
  SALES_QUALIFIED: { label: 'Sales Qualified', color: 'bg-violet-100 text-violet-700' },
  OPPORTUNITY: { label: 'Opportunity', color: 'bg-amber-100 text-amber-700' },
  CUSTOMER: { label: 'Customer', color: 'bg-emerald-100 text-emerald-700' },
  EVANGELIST: { label: 'Evangelist', color: 'bg-pink-100 text-pink-700' },
  OTHER: { label: 'Other', color: 'bg-gray-100 text-gray-600' },
};

const typeLabels: Record<ContactType, { label: string; icon: any }> = {
  PROSPECT: { label: 'Prospect', icon: UserPlus },
  CUSTOMER: { label: 'Customer', icon: UserCheck },
  PARTNER: { label: 'Partner', icon: Heart },
  VENDOR: { label: 'Vendor', icon: Briefcase },
  INFLUENCER: { label: 'Influencer', icon: Star },
  OTHER: { label: 'Other', icon: Users },
};

// ─── Main Page ───────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter();
  const addToast = useNotificationStore((s) => s.addToast);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ lifecycle: '', type: '', source: '', ownerId: '', company: '', divisionId: '' });
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterValues, setFilterValues] = useState<any>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showViewSidebar, setShowViewSidebar] = useState(false);
  const [columns, setColumns] = useState<ContactColumnDef[]>(() => loadContactColumns());
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const visibleColumns = columns.filter(c => c.visible);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (filters.lifecycle) params.lifecycle = filters.lifecycle;
      if (filters.type) params.type = filters.type;
      if (filters.source) params.source = filters.source;
      if (filters.ownerId) params.ownerId = filters.ownerId;
      if (filters.company) params.company = filters.company;
      if (filters.divisionId) params.divisionId = filters.divisionId;

      const res = await api.getContacts(params);
      setContacts(res.data);
      setPagination(p => ({ ...p, total: res.pagination.total, totalPages: res.pagination.totalPages }));
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, search, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.getContactStats();
      setStats(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    fetchStats();
    api.getContactFilterValues().then(setFilterValues).catch(() => {});
    try {
      const raw = localStorage.getItem('divisions');
      if (raw) setDivisions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [fetchStats]);

  // Auto-refresh when another user modifies contact/deal data
  useRealtimeSync(['contact', 'deal'], () => { fetchContacts(); fetchStats(); });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const handleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await premiumConfirm({
      title: 'Delete this contact?',
      message: 'The contact will move to Recycle Bin and can be restored within 60 days.',
      confirmText: 'Move to Recycle Bin',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    await api.deleteContact(id);
    addToast({ type: 'success', title: 'Contact Moved', message: 'Contact moved to Recycle Bin' });
    fetchContacts();
    fetchStats();
  };

  const handleBulkUpdate = async (data: Record<string, any>) => {
    await api.bulkUpdateContacts(Array.from(selectedIds), data);
    addToast({ type: 'success', title: 'Bulk Update Complete', message: `${selectedIds.size} contacts updated successfully` });
    setSelectedIds(new Set());
    fetchContacts();
    fetchStats();
  };

  const handleCreate = async () => {
    setEditingContact(null);
    setShowForm(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setShowForm(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filters.lifecycle) params.lifecycle = filters.lifecycle;
      if (filters.type) params.type = filters.type;
      if (filters.source) params.source = filters.source;
      if (filters.company) params.company = filters.company;
      if (filters.divisionId) params.divisionId = filters.divisionId;
      // If specific contacts are selected, export only those
      if (selectedIds.size > 0) params.ids = Array.from(selectedIds).join(',');
      await api.exportContacts(params);
      addToast({ type: 'success', title: 'Export Complete', message: 'Contacts exported successfully' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = [filters.type, filters.source, filters.ownerId, filters.company, filters.divisionId].filter(v => v !== '').length;

  const handleFormClose = () => {
    setShowForm(false);
    setEditingContact(null);
  };

  const handleFormSubmit = async (data: any) => {
    if (editingContact) {
      await api.updateContact(editingContact.id, data);
      addToast({ type: 'success', title: 'Contact Updated', message: 'Contact has been updated successfully' });
    } else {
      await api.createContact(data);
      addToast({ type: 'success', title: 'Contact Created', message: 'New contact has been created successfully' });
    }
    setShowForm(false);
    setEditingContact(null);
    fetchContacts();
    fetchStats();
  };

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Contacts</h1>
          <p className="text-text-secondary text-sm mt-0.5">{stats?.total ?? 0} contacts in your CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => { fetchContacts(); fetchStats(); }} />
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-sm">
            <Download className="h-4 w-4" /> {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button onClick={handleCreate} className="btn-primary text-sm">
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Total" value={stats.total} color="text-brand-600 bg-brand-50" />
          <StatCard icon={UserCheck} label="Customers" value={stats.byType?.CUSTOMER || 0} color="text-emerald-600 bg-emerald-50" />
          <StatCard icon={UserPlus} label="Prospects" value={stats.byType?.PROSPECT || 0} color="text-blue-600 bg-blue-50" />
          <StatCard icon={TrendingUp} label="Added This Week" value={stats.recentlyAdded} color="text-violet-600 bg-violet-50" />
          <StatCard icon={Clock} label="Contacted This Week" value={stats.recentlyContacted} color="text-amber-600 bg-amber-50" />
        </div>
      )}

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search by name, email, company, phone..." className="input pl-9 text-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
            />
          </div>

          {/* Quick Lifecycle Filter */}
          <select className="input max-w-[140px] text-sm" value={filters.lifecycle}
            onChange={(e) => { setFilters(f => ({ ...f, lifecycle: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">All Statuses</option>
            {Object.entries(lifecycleLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
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
          <button
            className={`p-2 rounded-lg border transition-colors ${showColumnManager ? 'bg-brand-50 border-brand-200 text-brand-600' : 'border-gray-300 text-gray-400 hover:text-gray-600'}`}
            title="Manage columns"
            onClick={() => setShowColumnManager(true)}>
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
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Advanced Filters</h3>
            <button onClick={() => setShowAdvancedFilters(false)} className="btn-icon h-7 w-7"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-2xs font-medium text-text-tertiary uppercase mb-1 block">Type</label>
              <select className="input text-sm" value={filters.type} onChange={(e) => { setFilters(f => ({ ...f, type: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
                <option value="">All Types</option>
                {Object.entries(typeLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs font-medium text-text-tertiary uppercase mb-1 block">Source</label>
              <select className="input text-sm" value={filters.source} onChange={(e) => { setFilters(f => ({ ...f, source: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
                <option value="">All Sources</option>
                {['WEBSITE_FORM', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            {filterValues?.companies?.length > 0 && (
              <div>
                <label className="text-2xs font-medium text-text-tertiary uppercase mb-1 block">Company</label>
                <select className="input text-sm" value={filters.company} onChange={(e) => { setFilters(f => ({ ...f, company: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
                  <option value="">All Companies</option>
                  {filterValues.companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {divisions.length > 0 && (
              <div>
                <label className="text-2xs font-medium text-text-tertiary uppercase mb-1 block">Division</label>
                <select className="input text-sm" value={filters.divisionId} onChange={(e) => { setFilters(f => ({ ...f, divisionId: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
                  <option value="">All Divisions</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button onClick={() => { setFilters({ lifecycle: '', type: '', source: '', ownerId: '', company: '', divisionId: '' }); setPagination(p => ({ ...p, page: 1 })); }}
                className="btn-secondary text-xs">
                <X className="h-3 w-3" /> Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.type && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              Type: {typeLabels[filters.type as ContactType]?.label || filters.type}
              <button onClick={() => { setFilters(f => ({ ...f, type: '' })); setPagination(p => ({ ...p, page: 1 })); }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.source && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              Source: {filters.source.replace(/_/g, ' ')}
              <button onClick={() => { setFilters(f => ({ ...f, source: '' })); setPagination(p => ({ ...p, page: 1 })); }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.company && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              Company: {filters.company}
              <button onClick={() => { setFilters(f => ({ ...f, company: '' })); setPagination(p => ({ ...p, page: 1 })); }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.ownerId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              Owner filter active
              <button onClick={() => { setFilters(f => ({ ...f, ownerId: '' })); setPagination(p => ({ ...p, page: 1 })); }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.divisionId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              Division: {divisions.find(d => d.id === filters.divisionId)?.name || filters.divisionId}
              <button onClick={() => { setFilters(f => ({ ...f, divisionId: '' })); setPagination(p => ({ ...p, page: 1 })); }} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="card p-3 flex items-center gap-3 bg-brand-50 border-brand-200">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          <select className="input text-xs w-40" defaultValue="" onChange={(e) => { if (e.target.value) handleBulkUpdate({ lifecycle: e.target.value }); e.target.value = ''; }}>
            <option value="" disabled>Change Lifecycle</option>
            {Object.entries(lifecycleLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
          </select>
          <select className="input text-xs w-36" defaultValue="" onChange={(e) => { if (e.target.value) handleBulkUpdate({ type: e.target.value }); e.target.value = ''; }}>
            <option value="" disabled>Change Type</option>
            {Object.entries(typeLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
          </select>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs">
            <Download className="h-3 w-3" /> {exporting ? 'Exporting...' : 'Export Selected'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="btn-secondary text-xs ml-auto">
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {/* Column Manager Modal */}
      {showColumnManager && (
        <ContactColumnManager
          columns={columns}
          onChange={(updated) => { setColumns(updated); saveContactColumns(updated); }}
          onClose={() => setShowColumnManager(false)}
        />
      )}

      {/* ═══════════════════ TABLE VIEW ═══════════════════ */}
      {viewMode === 'table' && (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-secondary">
                {visibleColumns.map((col) => {
                  if (col.id === 'select') return (
                    <th key={col.id} className="w-10 px-3 py-3">
                      <input type="checkbox" checked={contacts.length > 0 && selectedIds.size === contacts.length} onChange={handleSelectAll} className="rounded border-gray-300" />
                    </th>
                  );
                  if (col.id === 'actions') return <th key={col.id} className="w-12 px-3 py-3"></th>;
                  if (col.sortable && col.sortField) return (
                    <SortHeader key={col.id} label={col.label} field={col.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  );
                  return <th key={col.id} className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleColumns.length} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary mx-auto" /></td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={visibleColumns.length} className="text-center py-16">
                  <Users className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-secondary">No contacts found</p>
                  <p className="text-xs text-text-tertiary mt-1">Add your first contact or convert a lead</p>
                  <button onClick={handleCreate} className="btn-primary text-xs mt-3"><Plus className="h-3.5 w-3.5" /> Add Contact</button>
                </td></tr>
              ) : contacts.map((contact) => {
                const lifecycle = lifecycleLabels[contact.lifecycle] || lifecycleLabels.OTHER;
                const contactType = typeLabels[contact.type] || typeLabels.OTHER;
                const TypeIcon = contactType.icon;
                return (
                  <tr key={contact.id} className="border-b border-border-subtle hover:bg-surface-secondary/50 transition-colors cursor-pointer" onClick={() => router.push(`/contacts/${contact.id}`)}>
                    {visibleColumns.map((col) => {
                      switch (col.id) {
                        case 'select':
                          return <td key={col.id} className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => handleSelect(contact.id)} className="rounded border-gray-300" />
                          </td>;
                        case 'name':
                          return <td key={col.id} className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {getDisplayInitials(contact.firstName, contact.lastName)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {contact.salutation ? `${contact.salutation} ` : ''}{getDisplayName(contact.firstName, contact.lastName)}
                                </p>
                                {contact.jobTitle && <p className="text-2xs text-text-tertiary truncate">{contact.jobTitle}</p>}
                              </div>
                            </div>
                          </td>;
                        case 'emailPhone':
                          return <td key={col.id} className="px-3 py-3">
                            <div className="space-y-0.5">
                              {contact.email && <p className="text-xs text-text-secondary truncate max-w-[180px]">{contact.email}</p>}
                              {contact.phone && <p className="text-2xs text-text-tertiary">{contact.phone}</p>}
                            </div>
                          </td>;
                        case 'company':
                          return <td key={col.id} className="px-3 py-3">
                            {contact.company && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                                <span className="text-xs text-text-secondary truncate max-w-[120px]">{contact.company}</span>
                              </div>
                            )}
                          </td>;
                        case 'jobTitle':
                          return <td key={col.id} className="px-3 py-3">
                            <span className="text-xs text-text-secondary">{contact.jobTitle || ''}</span>
                          </td>;
                        case 'lifecycle':
                          return <td key={col.id} className="px-3 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${lifecycle.color}`}>
                              {lifecycle.label}
                            </span>
                          </td>;
                        case 'type':
                          return <td key={col.id} className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                              <TypeIcon className="h-3 w-3" />
                              {contactType.label}
                            </span>
                          </td>;
                        case 'division':
                          return <td key={col.id} className="px-3 py-3">
                            {contact.organization ? (
                              <span className="text-xs text-text-secondary">{contact.organization.name}</span>
                            ) : <span className="text-2xs text-text-tertiary">-</span>}
                          </td>;
                        case 'owner':
                          return <td key={col.id} className="px-3 py-3">
                            {contact.owner && (
                              <span className="text-xs text-text-secondary">{getDisplayName(contact.owner.firstName, contact.owner.lastName)}</span>
                            )}
                          </td>;
                        case 'score':
                          return <td key={col.id} className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <div className={`h-2 w-2 rounded-full ${contact.score >= 70 ? 'bg-emerald-500' : contact.score >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                              <span className="text-xs font-medium text-text-secondary">{contact.score}</span>
                            </div>
                          </td>;
                        case 'tags':
                          return <td key={col.id} className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {contact.tags?.slice(0, 2).map((t) => (
                                <span key={t.tag.id} className="px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-tertiary text-text-secondary">{t.tag.name}</span>
                              ))}
                              {(contact.tags?.length || 0) > 2 && <span className="text-2xs text-text-tertiary">+{contact.tags!.length - 2}</span>}
                            </div>
                          </td>;
                        case 'location':
                          return <td key={col.id} className="px-3 py-3">
                            {(contact as any).location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                                <span className="text-xs text-text-secondary truncate max-w-[120px]">{(contact as any).location}</span>
                              </div>
                            )}
                          </td>;
                        case 'website':
                          return <td key={col.id} className="px-3 py-3">
                            {(contact as any).website && (
                              <span className="text-xs text-text-secondary truncate max-w-[150px] block">{(contact as any).website}</span>
                            )}
                          </td>;
                        case 'linkedin':
                          return <td key={col.id} className="px-3 py-3">
                            {(contact as any).linkedin && (
                              <span className="text-xs text-text-secondary truncate max-w-[150px] block">{(contact as any).linkedin}</span>
                            )}
                          </td>;
                        case 'createdAt':
                          return <td key={col.id} className="px-3 py-3">
                            <span className="text-2xs text-text-tertiary">{new Date(contact.createdAt).toLocaleDateString()}</span>
                          </td>;
                        case 'updatedAt':
                          return <td key={col.id} className="px-3 py-3">
                            <span className="text-2xs text-text-tertiary">{new Date(contact.updatedAt).toLocaleDateString()}</span>
                          </td>;
                        case 'actions':
                          return <td key={col.id} className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => handleEdit(contact)} className="btn-icon h-7 w-7" title="Edit"><Pencil className="h-3 w-3" /></button>
                              <button onClick={() => handleDelete(contact.id)} className="btn-icon h-7 w-7 text-red-500" title="Delete"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </td>;
                        default:
                          return <td key={col.id} className="px-3 py-3" />;
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ContactPagination pagination={pagination} setPagination={setPagination} />
      </div>
      )}

      {/* ═══════════════════ CARD VIEW ═══════════════════ */}
      {viewMode === 'cards' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="card p-16 text-center">
              <Users className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-sm font-medium text-text-secondary">No contacts found</p>
              <p className="text-xs text-text-tertiary mt-1">Add your first contact or convert a lead</p>
              <button onClick={handleCreate} className="btn-primary text-xs mt-3"><Plus className="h-3.5 w-3.5" /> Add Contact</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contacts.map((contact) => {
                  const lifecycle = lifecycleLabels[contact.lifecycle] || lifecycleLabels.OTHER;
                  const contactType = typeLabels[contact.type] || typeLabels.OTHER;
                  const TypeIcon = contactType.icon;
                  return (
                    <div key={contact.id} className="card p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/contacts/${contact.id}`)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {getDisplayInitials(contact.firstName, contact.lastName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">
                              {contact.salutation ? `${contact.salutation} ` : ''}{getDisplayName(contact.firstName, contact.lastName)}
                            </p>
                            {contact.jobTitle && <p className="text-2xs text-text-tertiary truncate">{contact.jobTitle}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleEdit(contact)} className="btn-icon h-7 w-7" title="Edit"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => handleDelete(contact.id)} className="btn-icon h-7 w-7 text-red-500" title="Delete"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Mail className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Phone className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {contact.company && (
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Building2 className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                            <span className="truncate">{contact.company}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${lifecycle.color}`}>
                          {lifecycle.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-2xs text-text-tertiary">
                          <TypeIcon className="h-3 w-3" />
                          {contactType.label}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${contact.score >= 70 ? 'bg-emerald-500' : contact.score >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                          <span className="text-2xs font-medium text-text-secondary">{contact.score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <ContactPagination pagination={pagination} setPagination={setPagination} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ KANBAN VIEW ═══════════════════ */}
      {viewMode === 'kanban' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Object.entries(lifecycleLabels).map(([lifecycle, { label, color }]) => {
                const columnContacts = contacts.filter(c => c.lifecycle === lifecycle);
                return (
                  <div key={lifecycle} className="flex-shrink-0 w-72">
                    <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${color}`}>
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-2xs font-medium opacity-70">{columnContacts.length}</span>
                    </div>
                    <div className="bg-surface-secondary rounded-b-lg p-2 space-y-2 min-h-[200px]">
                      {columnContacts.length === 0 ? (
                        <p className="text-2xs text-text-tertiary text-center py-8">No contacts</p>
                      ) : columnContacts.map((contact) => {
                        const contactType = typeLabels[contact.type] || typeLabels.OTHER;
                        const TypeIcon = contactType.icon;
                        return (
                          <div key={contact.id} className="card p-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/contacts/${contact.id}`)}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                {getDisplayInitials(contact.firstName, contact.lastName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-text-primary truncate">{getDisplayName(contact.firstName, contact.lastName)}</p>
                                {contact.jobTitle && <p className="text-2xs text-text-tertiary truncate">{contact.jobTitle}</p>}
                              </div>
                            </div>
                            {contact.company && (
                              <div className="flex items-center gap-1 mb-1.5">
                                <Building2 className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                                <span className="text-2xs text-text-secondary truncate">{contact.company}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 text-2xs text-text-tertiary">
                                <TypeIcon className="h-3 w-3" />
                                {contactType.label}
                              </span>
                              <div className="flex items-center gap-1">
                                <div className={`h-1.5 w-1.5 rounded-full ${contact.score >= 70 ? 'bg-emerald-500' : contact.score >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                                <span className="text-2xs font-medium text-text-secondary">{contact.score}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4">
            <ContactPagination pagination={pagination} setPagination={setPagination} />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <ContactFormModal
          contact={editingContact}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-lg font-bold text-text-primary">{value}</p>
        <p className="text-2xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────

function ContactPagination({ pagination, setPagination }: {
  pagination: { total: number; page: number; limit: number; totalPages: number };
  setPagination: (fn: (p: any) => any) => void;
}) {
  const limit = pagination.limit || 25;
  const start = ((pagination.page - 1) * limit) + 1;
  const end = Math.min(pagination.page * limit, pagination.total);

  const pageNumbers = (): (number | string)[] => {
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

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-tertiary">
          {pagination.total > 0 ? `Showing ${start}–${end} of ${pagination.total}` : 'No contacts'}
        </span>
        <div className="flex items-center gap-1.5">
          <label htmlFor="contacts-page-size" className="text-xs text-gray-400">Per page</label>
          <select
            id="contacts-page-size"
            value={limit}
            onChange={(e) => setPagination((p: any) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
            className="text-xs border border-gray-200 rounded-md px-1.5 py-1 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      {pagination.totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className="btn-icon h-7 w-7">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageNumbers().map((p, i) => (
            typeof p === 'number' ? (
              <button key={i} onClick={() => setPagination((prev: any) => ({ ...prev, page: p }))}
                className={`min-w-[28px] h-7 rounded text-xs font-medium ${p === pagination.page ? 'bg-brand-600 text-white' : 'text-text-secondary hover:bg-surface-secondary'}`}>
                {p}
              </button>
            ) : <span key={i} className="px-1 text-text-quaternary">...</span>
          ))}
          <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className="btn-icon h-7 w-7">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sort Header ────────────────────────────────────────────────

function SortHeader({ label, field, sortBy, sortOrder, onSort }: { label: string; field: string; sortBy: string; sortOrder: string; onSort: (f: string) => void }) {
  return (
    <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-tertiary uppercase">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-brand-600' : 'text-text-quaternary'}`} />
      </span>
    </th>
  );
}

// ─── Contact Form Modal ─────────────────────────────────────────

function ContactFormModal({ contact, onClose, onSubmit }: { contact: Contact | null; onClose: () => void; onSubmit: (data: any) => void }) {
  const isEditing = !!contact;
  const addToast = useNotificationStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'details' | 'address' | 'social' | 'preferences'>('basic');
  const [form, setForm] = useState({
    salutation: contact?.salutation || '',
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    mobile: contact?.mobile || '',
    company: contact?.company || '',
    jobTitle: contact?.jobTitle || '',
    department: contact?.department || '',
    source: contact?.source || 'MANUAL',
    lifecycle: contact?.lifecycle || 'SUBSCRIBER',
    type: contact?.type || 'PROSPECT',
    dateOfBirth: contact?.dateOfBirth ? contact.dateOfBirth.split('T')[0] : '',
    website: contact?.website || '',
    linkedin: contact?.linkedin || '',
    twitter: contact?.twitter || '',
    address: contact?.address || '',
    city: contact?.city || '',
    state: contact?.state || '',
    country: contact?.country || '',
    postalCode: contact?.postalCode || '',
    description: contact?.description || '',
    doNotEmail: contact?.doNotEmail || false,
    doNotCall: contact?.doNotCall || false,
    hasOptedOutEmail: contact?.hasOptedOutEmail || false,
    tags: contact?.tags?.map(t => t.tag.name) || [] as string[],
  });
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      await premiumAlert({
        title: 'Missing required fields',
        message: 'First and Last name are required.',
        confirmText: 'OK',
        variant: 'danger',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.email) payload.email = null;
      if (!payload.phone) payload.phone = null;
      if (!payload.dateOfBirth) payload.dateOfBirth = null;
      await onSubmit(payload);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm({ ...form, tags: [...form.tags, t] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  const tabs = [
    { key: 'basic' as const, label: 'Basic Info' },
    { key: 'details' as const, label: 'Details' },
    { key: 'address' as const, label: 'Address' },
    { key: 'social' as const, label: 'Social & Web' },
    { key: 'preferences' as const, label: 'Preferences' },
  ];

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl max-h-[92vh] overflow-hidden relative z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">{isEditing ? 'Edit Contact' : 'New Contact'}</h2>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 flex gap-1 border-b border-border-subtle flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-surface-secondary text-brand-700 border-b-2 border-brand-600' : 'text-text-tertiary hover:text-text-secondary'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Salutation</label>
                  <select className="input text-sm" value={form.salutation} onChange={e => setForm({ ...form, salutation: e.target.value })}>
                    <option value="">None</option>
                    {['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">First Name *</label>
                  <input className="input text-sm" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input className="input text-sm" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input className="input text-sm" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input text-sm" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Mobile</label>
                  <input className="input text-sm" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
                </div>
                <div>
                  <label className="label">Date of Birth</label>
                  <input className="input text-sm" type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Company</label>
                  <input className="input text-sm" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                </div>
                <div>
                  <label className="label">Job Title</label>
                  <input className="input text-sm" value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input text-sm" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Lifecycle Stage</label>
                  <select className="input text-sm" value={form.lifecycle} onChange={e => setForm({ ...form, lifecycle: e.target.value as any })}>
                    {Object.entries(lifecycleLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Contact Type</label>
                  <select className="input text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}>
                    {Object.entries(typeLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Source</label>
                <select className="input text-sm" value={form.source} onChange={e => setForm({ ...form, source: e.target.value as any })}>
                  {['WEBSITE_FORM', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER'].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input text-sm" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notes about this contact..." />
              </div>
              <div>
                <label className="label">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-tertiary rounded text-xs">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="text-text-tertiary hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input text-sm flex-1" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag..." />
                  <button type="button" onClick={addTag} className="btn-secondary text-xs"><Plus className="h-3 w-3" /> Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Address Tab */}
          {activeTab === 'address' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="label">Street Address</label>
                <input className="input text-sm" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">City</label>
                  <input className="input text-sm" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <label className="label">State / Province</label>
                  <input className="input text-sm" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Country</label>
                  <input className="input text-sm" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
                </div>
                <div>
                  <label className="label">Postal Code</label>
                  <input className="input text-sm" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* Social Tab */}
          {activeTab === 'social' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="label flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Website</label>
                <input className="input text-sm" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</label>
                <input className="input text-sm" value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><Twitter className="h-3.5 w-3.5" /> Twitter / X</label>
                <input className="input text-sm" value={form.twitter} onChange={e => setForm({ ...form, twitter: e.target.value })} placeholder="@handle" />
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-4 animate-fade-in">
              <div className="card p-4 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Communication Preferences</h3>
                {[
                  { key: 'doNotEmail', label: 'Do Not Email', desc: 'Exclude from email campaigns and automations' },
                  { key: 'doNotCall', label: 'Do Not Call', desc: 'Exclude from phone outreach' },
                  { key: 'hasOptedOutEmail', label: 'Email Opt-Out', desc: 'Contact has opted out of marketing emails' },
                ].map(pref => (
                  <label key={pref.key} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={(form as any)[pref.key]} onChange={() => setForm({ ...form, [pref.key]: !(form as any)[pref.key] })} />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{pref.label}</p>
                      <p className="text-2xs text-text-tertiary">{pref.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-subtle flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}
