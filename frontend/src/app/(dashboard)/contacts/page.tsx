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
  BarChart3, TrendingUp, Clock, Hash,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Constants ───────────────────────────────────────────────────

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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ lifecycle: '', type: '', source: '', ownerId: '', company: '' });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterValues, setFilterValues] = useState<any>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    if (!confirm('Archive this contact?')) return;
    await api.deleteContact(id);
    fetchContacts();
    fetchStats();
  };

  const handleBulkUpdate = async (data: Record<string, any>) => {
    await api.bulkUpdateContacts(Array.from(selectedIds), data);
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
      // If specific contacts are selected, export only those
      if (selectedIds.size > 0) params.ids = Array.from(selectedIds).join(',');
      await api.exportContacts(params);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingContact(null);
  };

  const handleFormSubmit = async (data: any) => {
    if (editingContact) {
      await api.updateContact(editingContact.id, data);
    } else {
      await api.createContact(data);
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

      {/* Search & Filters Bar */}
      <div className="card p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            className="input pl-10 text-sm"
            placeholder="Search contacts by name, email, phone, company..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          />
        </div>
        <div className="flex gap-2">
          <select className="input text-sm w-40" value={filters.lifecycle} onChange={(e) => { setFilters(f => ({ ...f, lifecycle: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">All Lifecycles</option>
            {Object.entries(lifecycleLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
          </select>
          <select className="input text-sm w-36" value={filters.type} onChange={(e) => { setFilters(f => ({ ...f, type: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
          </select>
          {filterValues?.companies?.length > 0 && (
            <select className="input text-sm w-40 hidden lg:block" value={filters.company} onChange={(e) => { setFilters(f => ({ ...f, company: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}>
              <option value="">All Companies</option>
              {filterValues.companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

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

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-secondary">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={contacts.length > 0 && selectedIds.size === contacts.length} onChange={handleSelectAll} className="rounded border-gray-300" />
                </th>
                <SortHeader label="Name" field="firstName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Email / Phone</th>
                <SortHeader label="Company" field="company" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Lifecycle</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Type</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Owner</th>
                <SortHeader label="Score" field="score" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Tags</th>
                <SortHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary mx-auto" /></td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-16">
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
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => handleSelect(contact.id)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {contact.firstName[0]}{contact.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {contact.salutation ? `${contact.salutation} ` : ''}{contact.firstName} {contact.lastName}
                          </p>
                          {contact.jobTitle && <p className="text-2xs text-text-tertiary truncate">{contact.jobTitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-0.5">
                        {contact.email && <p className="text-xs text-text-secondary truncate max-w-[180px]">{contact.email}</p>}
                        {contact.phone && <p className="text-2xs text-text-tertiary">{contact.phone}</p>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {contact.company && (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                          <span className="text-xs text-text-secondary truncate max-w-[120px]">{contact.company}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${lifecycle.color}`}>
                        {lifecycle.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        <TypeIcon className="h-3 w-3" />
                        {contactType.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {contact.owner && (
                        <span className="text-xs text-text-secondary">{contact.owner.firstName} {contact.owner.lastName[0]}.</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${contact.score >= 70 ? 'bg-emerald-500' : contact.score >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                        <span className="text-xs font-medium text-text-secondary">{contact.score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags?.slice(0, 2).map((t) => (
                          <span key={t.tag.id} className="px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-tertiary text-text-secondary">{t.tag.name}</span>
                        ))}
                        {(contact.tags?.length || 0) > 2 && <span className="text-2xs text-text-tertiary">+{contact.tags!.length - 2}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-2xs text-text-tertiary">{new Date(contact.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => handleEdit(contact)} className="btn-icon h-7 w-7" title="Edit"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => handleDelete(contact.id)} className="btn-icon h-7 w-7 text-red-500" title="Delete"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
            <span className="text-xs text-text-tertiary">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className="btn-icon h-7 w-7">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-text-secondary px-2">Page {pagination.page} of {pagination.totalPages}</span>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className="btn-icon h-7 w-7">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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
    if (!form.firstName || !form.lastName) return alert('First and Last name are required');
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.email) payload.email = null;
      if (!payload.phone) payload.phone = null;
      if (!payload.dateOfBirth) payload.dateOfBirth = null;
      await onSubmit(payload);
    } catch (err: any) {
      alert(err.message || 'Failed to save');
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
