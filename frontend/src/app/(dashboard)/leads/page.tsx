'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { Lead, PaginatedResponse } from '@/types';

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-cyan-100 text-cyan-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

const statusIcons: Record<string, string> = {
  NEW: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
  CONTACTED: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  QUALIFIED: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  PROPOSAL_SENT: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  NEGOTIATION: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  WON: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  LOST: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
};

const sourceLabels: Record<string, string> = {
  WEBSITE_FORM: 'Website Form',
  LANDING_PAGE: 'Landing Page',
  WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook Ads',
  GOOGLE_ADS: 'Google Ads',
  MANUAL: 'Manual',
  CSV_IMPORT: 'CSV Import',
  API: 'API',
  REFERRAL: 'Referral',
  EMAIL: 'Email',
  PHONE: 'Phone',
  OTHER: 'Other',
};

type ViewMode = 'table' | 'cards';
type SortField = 'createdAt' | 'firstName' | 'score' | 'status' | 'source' | 'company';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showForm, setShowForm] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [quickActionId, setQuickActionId] = useState<string | null>(null);
  const quickActionRef = useRef<HTMLDivElement>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagination.page,
        limit: 20,
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      const res: PaginatedResponse<Lead> = await api.getLeads(params);
      setLeads(res.data);
      setPagination(res.pagination as any);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, statusFilter, sourceFilter, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboard();
      setStats(data);
    } catch {
      // stats are non-critical
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

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

  const handleSort = (field: SortField) => {
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
    } catch (err: any) {
      alert(err.message);
    }
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
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickStatus = async (leadId: string, status: string) => {
    try {
      await api.updateLead(leadId, { status });
      setQuickActionId(null);
      fetchLeads();
      fetchStats();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickDelete = async (leadId: string) => {
    if (!confirm('Archive this lead?')) return;
    try {
      await api.deleteLead(leadId);
      setQuickActionId(null);
      fetchLeads();
      fetchStats();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Source', 'Score', 'Budget', 'Location', 'Created'];
    const rows = leads.map((l) => [
      `${l.firstName} ${l.lastName}`,
      l.email || '',
      l.phone || '',
      l.company || '',
      l.status,
      l.source,
      l.score.toString(),
      l.budget?.toString() || '',
      l.location || '',
      new Date(l.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => (
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">{pagination.total} leads total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-secondary text-xs gap-1.5" title="Export CSV">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Leads" value={stats.overview.totalLeads} icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" color="brand" />
          <StatCard label="New" value={stats.overview.newLeads} icon={statusIcons.NEW} color="indigo" />
          <StatCard label="Qualified" value={stats.leadsByStatus?.find((s: any) => s.status === 'QUALIFIED')?._count?.status || 0} icon={statusIcons.QUALIFIED} color="cyan" />
          <StatCard label="Won" value={stats.overview.wonLeads} icon={statusIcons.WON} color="green" />
          <StatCard label="Lost" value={stats.overview.lostLeads} icon={statusIcons.LOST} color="red" />
          <StatCard label="Pipeline Value" value={`$${Number(stats.overview.pipelineValue || 0).toLocaleString()}`} icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" color="amber" />
        </div>
      )}

      {/* Filters & Controls */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder="Search by name, email, phone, company..."
              className="input pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            />
          </div>
          <select className="input max-w-[160px]" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}>
            <option value="">All Statuses</option>
            {Object.keys(statusColors).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select className="input max-w-[160px]" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}>
            <option value="">All Sources</option>
            {Object.keys(sourceLabels).map((s) => (
              <option key={s} value={s}>{sourceLabels[s]}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 ${viewMode === 'table' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
                title="Table view"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 border-l border-gray-300 ${viewMode === 'cards' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
                title="Card view"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedLeads.size > 0 && (
        <div className="card p-3 bg-brand-50 border-brand-200 flex items-center justify-between">
          <span className="text-sm font-medium text-brand-700">
            {selectedLeads.size} lead{selectedLeads.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowBulkActions(!showBulkActions)}
                className="btn-secondary text-xs gap-1"
              >
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
            <button onClick={() => setSelectedLeads(new Set())} className="btn-secondary text-xs">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selectedLeads.size === leads.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('firstName')}>
                    Name <SortIcon field="firstName" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('company')}>
                    Company <SortIcon field="company" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('source')}>
                    Source <SortIcon field="source" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('score')}>
                    Score <SortIcon field="score" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort('createdAt')}>
                    Created <SortIcon field="createdAt" />
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
                      <span className="text-sm text-gray-500">Loading leads...</span>
                    </div>
                  </td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <p className="text-sm text-gray-500">No leads found</p>
                      <button onClick={() => setShowForm(true)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">Create your first lead</button>
                    </div>
                  </td></tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className={`hover:bg-gray-50 transition-colors ${selectedLeads.has(lead.id) ? 'bg-brand-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="flex items-center gap-2.5 group">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-medium text-white shadow-sm">
                            {lead.firstName[0]}{lead.lastName[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{lead.firstName} {lead.lastName}</p>
                            {lead.jobTitle && <p className="text-xs text-gray-500">{lead.jobTitle}</p>}
                            {lead.tags && lead.tags.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {lead.tags.slice(0, 3).map((t) => (
                                  <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                                    {t.tag.name}
                                  </span>
                                ))}
                                {lead.tags.length > 3 && <span className="text-[10px] text-gray-400">+{lead.tags.length - 3}</span>}
                              </div>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {lead.email && (
                            <p className="text-sm text-gray-900 flex items-center gap-1">
                              <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              <span className="truncate max-w-[180px]">{lead.email}</span>
                            </p>
                          )}
                          {lead.phone && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              {lead.phone}
                            </p>
                          )}
                          {!lead.email && !lead.phone && <span className="text-xs text-gray-400">No contact info</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{lead.company || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusColors[lead.status]}`}>
                          {lead.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{sourceLabels[lead.source] || lead.source}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${lead.score}%`,
                              backgroundColor: lead.score >= 70 ? '#22c55e' : lead.score >= 40 ? '#f59e0b' : '#ef4444',
                            }} />
                          </div>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: lead.score >= 70 ? '#16a34a' : lead.score >= 40 ? '#d97706' : '#dc2626' }}>{lead.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
                              {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
                            </div>
                            <span className="text-sm text-gray-700">{lead.assignedTo.firstName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">{new Date(lead.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td className="px-4 py-3 relative">
                        <button
                          onClick={() => setQuickActionId(quickActionId === lead.id ? null : lead.id)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                        </button>
                        {quickActionId === lead.id && (
                          <div ref={quickActionRef} className="absolute right-4 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-500">
                Showing {((pagination.page - 1) * 20) + 1}-{Math.min(pagination.page * 20, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {pageNumbers().map((p, i) => (
                  typeof p === 'number' ? (
                    <button
                      key={i}
                      onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                      className={`min-w-[32px] h-8 rounded text-sm font-medium ${p === pagination.page ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={i} className="px-1 text-gray-400">...</span>
                  )
                ))}
                <button
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card View */}
      {viewMode === 'cards' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            </div>
          ) : leads.length === 0 ? (
            <div className="card p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-sm text-gray-500 mt-2">No leads found</p>
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
                      <span className={`badge ${statusColors[lead.status]}`}>{lead.status.replace(/_/g, ' ')}</span>
                    </div>

                    <div className="space-y-2 text-sm">
                      {lead.email && (
                        <p className="text-gray-600 flex items-center gap-1.5 truncate">
                          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          {lead.email}
                        </p>
                      )}
                      {lead.phone && (
                        <p className="text-gray-600 flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          {lead.phone}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${lead.score}%`,
                            backgroundColor: lead.score >= 70 ? '#22c55e' : lead.score >= 40 ? '#f59e0b' : '#ef4444',
                          }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: lead.score >= 70 ? '#16a34a' : lead.score >= 40 ? '#d97706' : '#dc2626' }}>{lead.score}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">{sourceLabels[lead.source] || lead.source}</span>
                      </div>
                    </div>

                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {lead.tags.slice(0, 4).map((t) => (
                          <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>

              {/* Card view pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Showing {((pagination.page - 1) * 20) + 1}-{Math.min(pagination.page * 20, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      disabled={pagination.page <= 1}
                      onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    {pageNumbers().map((p, i) => (
                      typeof p === 'number' ? (
                        <button
                          key={i}
                          onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                          className={`min-w-[32px] h-8 rounded text-sm font-medium ${p === pagination.page ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                          {p}
                        </button>
                      ) : (
                        <span key={i} className="px-1 text-gray-400">...</span>
                      )
                    ))}
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Create Lead Modal */}
      {showForm && <CreateLeadModal onClose={() => setShowForm(false)} onSubmit={handleCreateLead} />}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    brand: { bg: 'bg-brand-50', text: 'text-brand-700', iconBg: 'bg-brand-100' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', iconBg: 'bg-indigo-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', iconBg: 'bg-cyan-100' },
    green: { bg: 'bg-green-50', text: 'text-green-700', iconBg: 'bg-green-100' },
    red: { bg: 'bg-red-50', text: 'text-red-700', iconBg: 'bg-red-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', iconBg: 'bg-amber-100' },
  };
  const c = colorMap[color] || colorMap.brand;
  return (
    <div className={`card p-4 ${c.bg} border-transparent`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <svg className={`h-5 w-5 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
          <p className={`text-lg font-bold ${c.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function CreateLeadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '',
    source: 'MANUAL', productInterest: '', location: '', budget: '', website: '', campaign: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        jobTitle: form.jobTitle || null,
        source: form.source || undefined,
        productInterest: form.productInterest || null,
        location: form.location || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        website: form.website || null,
        campaign: form.campaign || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Create New Lead</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add a new lead to your pipeline</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Personal Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Personal Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name *</label>
                <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Contact Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              Company Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Company</label>
                <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
              </div>
              <div>
                <label className="label">Job Title</label>
                <input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Marketing Manager" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Website</label>
                <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
              </div>
              <div>
                <label className="label">Location</label>
                <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Dubai, UAE" />
              </div>
            </div>
          </div>

          {/* Lead Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Lead Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Source</label>
                <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {Object.entries(sourceLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Budget</label>
                <input type="number" className="input" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Product Interest</label>
                <input className="input" value={form.productInterest} onChange={(e) => setForm({ ...form, productInterest: e.target.value })} placeholder="e.g. Enterprise Plan" />
              </div>
              <div>
                <label className="label">Campaign</label>
                <input className="input" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="e.g. Q1 Promo" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary gap-1.5">
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Create Lead
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
