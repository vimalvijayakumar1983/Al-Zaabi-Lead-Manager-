'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types';

export interface FilterState {
  search: string;
  status: string;     // single value OR comma-separated for multi-select (e.g., "NEW,CONTACTED")
  source: string;     // single value OR comma-separated for multi-select
  assignedToId: string;
  minScore: string;
  maxScore: string;
  dateFrom: string;
  dateTo: string;
  // Extended fields
  company: string;
  jobTitle: string;
  location: string;
  campaign: string;
  productInterest: string;
  budgetMin: string;
  budgetMax: string;
  tags: string;           // comma-separated tag names
  hasEmail: string;        // 'true' | 'false' | ''
  hasPhone: string;        // 'true' | 'false' | ''
  conversionMin: string;
  conversionMax: string;
  stageId: string;
}

export const emptyFilters: FilterState = {
  search: '',
  status: '',
  source: '',
  assignedToId: '',
  minScore: '',
  maxScore: '',
  dateFrom: '',
  dateTo: '',
  company: '',
  jobTitle: '',
  location: '',
  campaign: '',
  productInterest: '',
  budgetMin: '',
  budgetMax: '',
  tags: '',
  hasEmail: '',
  hasPhone: '',
  conversionMin: '',
  conversionMax: '',
  stageId: '',
};

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'PROPOSAL_SENT', label: 'Proposal Sent' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

const sourceOptions = [
  { value: 'WEBSITE_FORM', label: 'Website Form' },
  { value: 'LIVE_CHAT', label: 'Live Chat Widget' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CSV_IMPORT', label: 'CSV Import' },
  { value: 'API', label: 'API' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'OTHER', label: 'Other' },
];

const boolOptions = [
  { value: '', label: 'Any' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

// ─── Saved Views ──────────────────────────────────────────────────
interface SavedView {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem('leads_saved_filters');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]) {
  localStorage.setItem('leads_saved_filters', JSON.stringify(views));
}

// ─── Date preset helpers ──────────────────────────────────────────
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function getLastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
}

function getYearStart(): string {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

function getLastWeekRange(): { from: string; to: string } {
  const weekStart = getWeekStart();
  const ws = new Date(weekStart);
  const from = new Date(ws.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const to = new Date(ws.getTime() - 86400000).toISOString().split('T')[0];
  return { from, to };
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  users: User[];
  tags?: { id: string; name: string; color: string }[];
  stages?: { id: string; name: string }[];
  onClose: () => void;
}

// SVG icon helpers
function FilterIcon() {
  return <svg className="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>;
}
function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function StatusIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function UserIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
function ChartIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
function SearchIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function TagIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>;
}
function CalendarIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function BoltIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
}
function SaveIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
}
function BookmarkIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;
}
function TrashIcon() {
  return <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}

function SectionHeader({ title, icon, count, open, onToggle }: { title: string; icon: React.ReactNode; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700">
      <span className="flex items-center gap-2">
        {icon}
        {title}
      </span>
      <span className="flex items-center gap-2">
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
            {count}
          </span>
        )}
        <ChevronIcon open={open} />
      </span>
    </button>
  );
}

// ─── Multi-select helpers ─────────────────────────────────────────
function parseMulti(val: string): string[] {
  return val ? val.split(',').filter(Boolean) : [];
}
function toggleMulti(current: string, value: string): string {
  const arr = parseMulti(current);
  if (arr.includes(value)) {
    return arr.filter(v => v !== value).join(',');
  }
  return [...arr, value].join(',');
}

// ─── Main Component ───────────────────────────────────────────────
export function AdvancedFilters({ filters, onChange, users, tags: availableTags = [], stages = [], onClose }: AdvancedFiltersProps) {
  const [local, setLocal] = useState<FilterState>({ ...filters });

  // Section open/closed state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    statusPipeline: true,
    assignmentContact: false,
    scoreBudget: false,
    textSearch: false,
    tags: false,
    dateRange: false,
  });

  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editViewName, setEditViewName] = useState('');

  // Load saved views from localStorage on mount
  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    onChange(local);
    onClose();
  };

  const handleClear = () => {
    const cleared = { ...emptyFilters };
    setLocal(cleared);
    onChange(cleared);
    onClose();
  };

  const activeCount = Object.entries(local).filter(([k, v]) => k !== 'search' && v !== '').length;

  // Count active filters per section
  const sectionCounts = {
    statusPipeline: [local.status, local.stageId, local.source].filter(Boolean).length,
    assignmentContact: [local.assignedToId, local.hasEmail, local.hasPhone].filter(Boolean).length,
    scoreBudget: [local.minScore, local.maxScore, local.budgetMin, local.budgetMax, local.conversionMin, local.conversionMax].filter(Boolean).length,
    textSearch: [local.company, local.jobTitle, local.location, local.campaign, local.productInterest].filter(Boolean).length,
    tags: local.tags ? 1 : 0,
    dateRange: [local.dateFrom, local.dateTo].filter(Boolean).length,
  };

  // Tag handling
  const selectedTags = local.tags ? local.tags.split(',').filter(Boolean) : [];
  const toggleTag = (tagName: string) => {
    let updated: string[];
    if (selectedTags.includes(tagName)) {
      updated = selectedTags.filter((t) => t !== tagName);
    } else {
      updated = [...selectedTags, tagName];
    }
    setLocal({ ...local, tags: updated.join(',') });
  };

  // Quick filter presets
  const applyQuickFilter = (preset: Partial<FilterState>) => {
    const next = { ...emptyFilters, ...preset };
    setLocal(next);
  };

  // Date presets
  const today = getToday();
  const weekAgo = daysAgo(7);

  // ─── Date preset buttons ──────────────────────────────────
  const datePresets = [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: daysAgo(1), to: daysAgo(1) },
    { label: 'This Week', from: getWeekStart(), to: today },
    { label: 'Last Week', from: getLastWeekRange().from, to: getLastWeekRange().to },
    { label: 'This Month', from: getMonthStart(), to: today },
    { label: 'Last Month', from: getLastMonthRange().from, to: getLastMonthRange().to },
    { label: 'Last 90 Days', from: daysAgo(90), to: today },
    { label: 'This Year', from: getYearStart(), to: today },
  ];

  const applyDatePreset = (from: string, to: string) => {
    setLocal({ ...local, dateFrom: from, dateTo: to });
  };

  // ─── Saved views handlers ─────────────────────────────────
  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    const newView: SavedView = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: newViewName.trim(),
      filters: { ...local },
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedViews, newView];
    setSavedViews(updated);
    persistSavedViews(updated);
    setNewViewName('');
    setShowSaveDialog(false);
  };

  const handleApplyView = (view: SavedView) => {
    setLocal({ ...view.filters });
  };

  const handleDeleteView = (id: string) => {
    const updated = savedViews.filter(v => v.id !== id);
    setSavedViews(updated);
    persistSavedViews(updated);
  };

  const handleRenameView = (id: string) => {
    if (!editViewName.trim()) return;
    const updated = savedViews.map(v => v.id === id ? { ...v, name: editViewName.trim() } : v);
    setSavedViews(updated);
    persistSavedViews(updated);
    setEditingViewId(null);
    setEditViewName('');
  };

  // Multi-select helpers for status and source
  const selectedStatuses = parseMulti(local.status);
  const selectedSources = parseMulti(local.source);

  return (
    <div className="card p-5 border-brand-200 bg-white shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <FilterIcon />
          Advanced Filters
          {activeCount > 0 && <span className="badge bg-brand-100 text-brand-700">{activeCount} active</span>}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveDialog(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors"
          >
            <SaveIcon />
            Save View
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-50 ring-1 ring-brand-200 animate-fade-in">
          <BookmarkIcon />
          <input
            type="text"
            className="input flex-1 text-sm"
            placeholder="View name (e.g., Hot leads this week)…"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
            autoFocus
          />
          <button onClick={handleSaveView} className="btn-primary text-sm px-3 py-1.5">Save</button>
          <button onClick={() => { setShowSaveDialog(false); setNewViewName(''); }} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
        </div>
      )}

      {/* Saved Views */}
      {savedViews.length > 0 && (
        <div className="pb-3 border-b border-gray-200">
          <div className="flex items-center gap-1.5 mb-2">
            <BookmarkIcon />
            <span className="text-xs font-medium text-gray-500">Saved Views</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedViews.map((view) => (
              <div key={view.id} className="group relative">
                {editingViewId === view.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      className="input text-xs py-1 px-2 w-32"
                      value={editViewName}
                      onChange={(e) => setEditViewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameView(view.id);
                        if (e.key === 'Escape') { setEditingViewId(null); setEditViewName(''); }
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleRenameView(view.id)} className="text-2xs text-brand-600 hover:underline">Save</button>
                    <button onClick={() => { setEditingViewId(null); setEditViewName(''); }} className="text-2xs text-gray-500 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleApplyView(view)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <BookmarkIcon />
                    {view.name}
                    <span
                      onClick={(e) => { e.stopPropagation(); setEditingViewId(view.id); setEditViewName(view.name); }}
                      className="hidden group-hover:inline ml-0.5 text-gray-400 hover:text-brand-600 cursor-pointer"
                    >
                      ✏️
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); handleDeleteView(view.id); }}
                      className="hidden group-hover:inline ml-0.5 text-gray-400 hover:text-red-600 cursor-pointer"
                    >
                      <TrashIcon />
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-200">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mr-1">
          <BoltIcon />
          Quick:
        </span>
        <button
          onClick={() => applyQuickFilter({ minScore: '70' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
          title="Leads with score ≥ 70"
        >
          Hot Leads (score≥70)
        </button>
        <button
          onClick={() => applyQuickFilter({ hasEmail: 'true', hasPhone: 'true' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
          title="Leads with both email and phone"
        >
          Has Contact Info
        </button>
        <button
          onClick={() => applyQuickFilter({ dateFrom: weekAgo, dateTo: today })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
          title="Leads created in the last 7 days"
        >
          This Week
        </button>
        <button
          onClick={() => applyQuickFilter({ assignedToId: '__unassigned__' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
          title="Leads not assigned to anyone"
        >
          Unassigned
        </button>
        <button
          onClick={() => applyQuickFilter({ budgetMin: '50000' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
          title="Leads with budget ≥ 50,000 AED"
        >
          High Value (≥50K AED)
        </button>
        {/* New enhanced presets */}
        <button
          onClick={() => {
            const weekEnd = new Date();
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
            weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay() + 7);
            applyQuickFilter({
              status: 'NEGOTIATION,PROPOSAL_SENT',
              dateFrom: weekStart.toISOString().split('T')[0],
              dateTo: weekEnd.toISOString().split('T')[0],
            });
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          title="Leads in Negotiation or Proposal Sent stage this week"
        >
          Closing This Week
        </button>
        <button
          onClick={() => applyQuickFilter({ dateTo: daysAgo(30), status: 'NEW,CONTACTED' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
          title="Leads with no activity for 30+ days (created before 30 days ago with status NEW or CONTACTED)"
        >
          Stale Leads (30+ days)
        </button>
        <button
          onClick={() => applyQuickFilter({ dateFrom: daysAgo(7) })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors"
          title="Leads created or updated in the last 7 days"
        >
          Recently Active (7 days)
        </button>
      </div>

      {/* Section 1: Status & Pipeline */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Status & Pipeline" icon={<StatusIcon />} count={sectionCounts.statusPipeline} open={openSections.statusPipeline} onToggle={() => toggleSection('statusPipeline')} />
        {openSections.statusPipeline && (
          <div className="p-4 space-y-4">
            {/* Status multi-select */}
            <div>
              <label className="label">Status <span className="text-2xs text-gray-400 font-normal">(multi-select)</span></label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {statusOptions.map((o) => {
                  const isSelected = selectedStatuses.includes(o.value);
                  return (
                    <label key={o.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setLocal({ ...local, status: toggleMulti(local.status, o.value) })}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className={`text-sm ${isSelected ? 'text-brand-700 font-medium' : 'text-gray-600'}`}>{o.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Pipeline Stage</label>
                <select className="input" value={local.stageId} onChange={(e) => setLocal({ ...local, stageId: e.target.value })}>
                  <option value="">All Stages</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {/* Source multi-select */}
              <div>
                <label className="label">Source <span className="text-2xs text-gray-400 font-normal">(multi-select)</span></label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 mt-0.5 space-y-1">
                  {sourceOptions.map((o) => {
                    const isSelected = selectedSources.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setLocal({ ...local, source: toggleMulti(local.source, o.value) })}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className={`text-sm ${isSelected ? 'text-brand-700 font-medium' : 'text-gray-600'}`}>{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Assignment & Contact */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Assignment & Contact" icon={<UserIcon />} count={sectionCounts.assignmentContact} open={openSections.assignmentContact} onToggle={() => toggleSection('assignmentContact')} />
        {openSections.assignmentContact && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="label">Assigned To</label>
              <select className="input" value={local.assignedToId} onChange={(e) => setLocal({ ...local, assignedToId: e.target.value })}>
                <option value="">All Users</option>
                <option value="__unassigned__">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Has Email</label>
              <select className="input" value={local.hasEmail} onChange={(e) => setLocal({ ...local, hasEmail: e.target.value })}>
                {boolOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Has Phone</label>
              <select className="input" value={local.hasPhone} onChange={(e) => setLocal({ ...local, hasPhone: e.target.value })}>
                {boolOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Score & Budget */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Score & Budget" icon={<ChartIcon />} count={sectionCounts.scoreBudget} open={openSections.scoreBudget} onToggle={() => toggleSection('scoreBudget')} />
        {openSections.scoreBudget && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="label">Score Range</label>
              <div className="flex items-center gap-2">
                <input type="number" className="input" placeholder="Min" min={0} max={100} value={local.minScore} onChange={(e) => setLocal({ ...local, minScore: e.target.value })} />
                <span className="text-gray-400">-</span>
                <input type="number" className="input" placeholder="Max" min={0} max={100} value={local.maxScore} onChange={(e) => setLocal({ ...local, maxScore: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Budget Range (AED)</label>
              <div className="flex items-center gap-2">
                <input type="number" className="input" placeholder="Min" min={0} value={local.budgetMin} onChange={(e) => setLocal({ ...local, budgetMin: e.target.value })} />
                <span className="text-gray-400">-</span>
                <input type="number" className="input" placeholder="Max" min={0} value={local.budgetMax} onChange={(e) => setLocal({ ...local, budgetMax: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Conversion % Range</label>
              <div className="flex items-center gap-2">
                <input type="number" className="input" placeholder="Min %" min={0} max={100} value={local.conversionMin} onChange={(e) => setLocal({ ...local, conversionMin: e.target.value })} />
                <span className="text-gray-400">-</span>
                <input type="number" className="input" placeholder="Max %" min={0} max={100} value={local.conversionMax} onChange={(e) => setLocal({ ...local, conversionMax: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Text Search */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Text Search" icon={<SearchIcon />} count={sectionCounts.textSearch} open={openSections.textSearch} onToggle={() => toggleSection('textSearch')} />
        {openSections.textSearch && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="label">Company</label>
              <input type="text" className="input" placeholder="Filter by company..." value={local.company} onChange={(e) => setLocal({ ...local, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Job Title</label>
              <input type="text" className="input" placeholder="Filter by job title..." value={local.jobTitle} onChange={(e) => setLocal({ ...local, jobTitle: e.target.value })} />
            </div>
            <div>
              <label className="label">Location</label>
              <input type="text" className="input" placeholder="Filter by location..." value={local.location} onChange={(e) => setLocal({ ...local, location: e.target.value })} />
            </div>
            <div>
              <label className="label">Campaign</label>
              <input type="text" className="input" placeholder="Filter by campaign..." value={local.campaign} onChange={(e) => setLocal({ ...local, campaign: e.target.value })} />
            </div>
            <div>
              <label className="label">Product Interest</label>
              <input type="text" className="input" placeholder="Filter by product..." value={local.productInterest} onChange={(e) => setLocal({ ...local, productInterest: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {/* Section 5: Tags */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Tags" icon={<TagIcon />} count={sectionCounts.tags} open={openSections.tags} onToggle={() => toggleSection('tags')} />
        {openSections.tags && (
          <div className="p-4">
            {availableTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.name)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        isSelected ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || '#6b7280' }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No tags available</p>
            )}
          </div>
        )}
      </div>

      {/* Section 6: Date Range */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader title="Date Range" icon={<CalendarIcon />} count={sectionCounts.dateRange} open={openSections.dateRange} onToggle={() => toggleSection('dateRange')} />
        {openSections.dateRange && (
          <div className="p-4 space-y-3">
            {/* Quick date presets */}
            <div>
              <label className="label mb-1.5">Quick Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {datePresets.map((preset) => {
                  const isActive = local.dateFrom === preset.from && local.dateTo === preset.to;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => applyDatePreset(preset.from, preset.to)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 border-brand-300 ring-1 ring-brand-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom date inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Created From</label>
                <input type="date" className="input" value={local.dateFrom} onChange={(e) => setLocal({ ...local, dateFrom: e.target.value })} />
              </div>
              <div>
                <label className="label">Created To</label>
                <input type="date" className="input" value={local.dateTo} onChange={(e) => setLocal({ ...local, dateTo: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Summary */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-50 ring-1 ring-brand-200">
          <FilterIcon />
          <span className="text-sm font-medium text-brand-700">{activeCount} active filter{activeCount !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setLocal({ ...emptyFilters })}
            className="text-xs text-brand-600 hover:text-brand-800 hover:underline ml-auto"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700">Clear All Filters</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={handleApply} className="btn-primary text-sm">Apply Filters</button>
        </div>
      </div>
    </div>
  );
}

export function FilterBadges({ filters, onRemove, stages }: { filters: FilterState; onRemove: (key: keyof FilterState) => void; stages?: { id: string; name: string }[] }) {
  const badges: { key: keyof FilterState; label: string }[] = [];

  // Handle multi-select status display
  if (filters.status) {
    const statuses = parseMulti(filters.status);
    if (statuses.length > 1) {
      badges.push({ key: 'status', label: `Status: ${statuses.map(s => s.replace(/_/g, ' ')).join(', ')}` });
    } else {
      badges.push({ key: 'status', label: `Status: ${filters.status.replace(/_/g, ' ')}` });
    }
  }
  // Handle multi-select source display
  if (filters.source) {
    const sources = parseMulti(filters.source);
    if (sources.length > 1) {
      badges.push({ key: 'source', label: `Source: ${sources.length} selected` });
    } else {
      badges.push({ key: 'source', label: `Source: ${filters.source.replace(/_/g, ' ')}` });
    }
  }
  if (filters.assignedToId) badges.push({ key: 'assignedToId', label: filters.assignedToId === '__unassigned__' ? 'Unassigned' : 'Assigned' });
  if (filters.stageId) {
    // Resolve stage IDs to names (supports comma-separated IDs from analytics drill-down)
    const ids = filters.stageId.split(',').filter(Boolean);
    const names = stages
      ? ids.map(id => stages.find(s => s.id === id)?.name || id).filter((v, i, a) => a.indexOf(v) === i)
      : ids;
    badges.push({ key: 'stageId', label: `Stage: ${names.join(', ')}` });
  }
  if (filters.minScore) badges.push({ key: 'minScore', label: `Score >= ${filters.minScore}` });
  if (filters.maxScore) badges.push({ key: 'maxScore', label: `Score <= ${filters.maxScore}` });
  if (filters.dateFrom) badges.push({ key: 'dateFrom', label: `From: ${filters.dateFrom}` });
  if (filters.dateTo) badges.push({ key: 'dateTo', label: `To: ${filters.dateTo}` });
  if (filters.company) badges.push({ key: 'company', label: `Company: ${filters.company}` });
  if (filters.jobTitle) badges.push({ key: 'jobTitle', label: `Title: ${filters.jobTitle}` });
  if (filters.location) badges.push({ key: 'location', label: `Location: ${filters.location}` });
  if (filters.campaign) badges.push({ key: 'campaign', label: `Campaign: ${filters.campaign}` });
  if (filters.productInterest) badges.push({ key: 'productInterest', label: `Product: ${filters.productInterest}` });
  if (filters.budgetMin) badges.push({ key: 'budgetMin', label: `Budget >= ${filters.budgetMin} AED` });
  if (filters.budgetMax) badges.push({ key: 'budgetMax', label: `Budget <= ${filters.budgetMax} AED` });
  if (filters.tags) badges.push({ key: 'tags', label: `Tags: ${filters.tags}` });
  if (filters.hasEmail) badges.push({ key: 'hasEmail', label: `Has Email: ${filters.hasEmail === 'true' ? 'Yes' : 'No'}` });
  if (filters.hasPhone) badges.push({ key: 'hasPhone', label: `Has Phone: ${filters.hasPhone === 'true' ? 'Yes' : 'No'}` });
  if (filters.conversionMin) badges.push({ key: 'conversionMin', label: `Conv >= ${filters.conversionMin}%` });
  if (filters.conversionMax) badges.push({ key: 'conversionMax', label: `Conv <= ${filters.conversionMax}%` });

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span key={b.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2.5 py-1 border border-brand-200">
          {b.label}
          <button onClick={() => onRemove(b.key)} className="hover:text-brand-900">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </span>
      ))}
    </div>
  );
}
