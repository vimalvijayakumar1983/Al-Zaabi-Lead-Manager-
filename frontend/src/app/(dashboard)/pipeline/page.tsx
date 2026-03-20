'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import type { PipelineStage, User } from '@/types';
import {
  GripVertical, DollarSign, User2, Plus, Search, X, Filter,
  ChevronDown, ChevronUp, SlidersHorizontal, LayoutGrid, List,
  TrendingUp, ArrowUpDown, Flame, Thermometer, Snowflake,
  Globe, Users as UsersIcon, Phone, Mail, Share2, Megaphone, MessageSquare,
  Calendar, BarChart3, Hash, Target,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Source config ─────────────────────────────────────────────────
const sourceOptions = [
  { value: 'WEBSITE_FORM', label: 'Website', icon: Globe },
  { value: 'LIVE_CHAT', label: 'Live Chat', icon: MessageSquare },
  { value: 'REFERRAL', label: 'Referral', icon: Share2 },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads', icon: Megaphone },
  { value: 'GOOGLE_ADS', label: 'Google Ads', icon: Megaphone },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads', icon: Megaphone },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: Phone },
  { value: 'PHONE', label: 'Cold Call', icon: Phone },
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'LANDING_PAGE', label: 'Landing Page', icon: Globe },
  { value: 'MANUAL', label: 'Manual', icon: Hash },
  { value: 'CSV_IMPORT', label: 'CSV Import', icon: Hash },
  { value: 'API', label: 'API', icon: Hash },
  { value: 'OTHER', label: 'Other', icon: Hash },
];

type ColumnSort = 'newest' | 'oldest' | 'highestValue' | 'highestScore';
type ViewMode = 'kanban' | 'list';
type PriorityFilter = 'all' | 'hot' | 'warm' | 'cold';
type DatePreset = 'all' | 'today' | 'week' | 'month';

function getDateCutoff(preset: DatePreset): Date | null {
  if (preset === 'all') return null;
  const now = new Date();
  switch (preset) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': return new Date(now.getTime() - 7 * 86400000);
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    default: return null;
  }
}

function getPriority(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

const priorityConfig = {
  hot: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200', icon: Flame, label: 'Hot' },
  warm: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', icon: Thermometer, label: 'Warm' },
  cold: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', icon: Snowflake, label: 'Cold' },
};

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

// ─── Main Component ────────────────────────────────────────────────
export default function PipelinePage() {
  const { user: currentUser } = useAuthStore();

  // Core state
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Column sort (per stage)
  const [columnSorts, setColumnSorts] = useState<Record<string, ColumnSort>>({});

  // Team members for assignee filter
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch ─────────────────────────────────────────────────
  const fetchStages = useCallback(async () => {
    try {
      const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
      const data = await api.getPipelineStages(activeDivisionId || undefined);

      // When "All Divisions" is selected, merge stages with the same name
      // (e.g., 4× "New Lead" from different orgs → 1 combined "New Lead" column)
      if (!activeDivisionId && data.length > 0) {
        const mergedMap = new Map<string, any>();
        for (const stage of data) {
          const key = stage.name.trim().toLowerCase();
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.leads = [...existing.leads, ...stage.leads];
          } else {
            mergedMap.set(key, { ...stage, leads: [...stage.leads] });
          }
        }
        setStages(Array.from(mergedMap.values()));
      } else {
        setStages(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  // Auto-refresh when another user modifies lead data
  useRealtimeSync(['lead'], () => { fetchStages(); });

  useEffect(() => {
    api.getUsers().then((u: User[]) => setTeamMembers(u)).catch(() => {});
  }, []);

  // ─── Ctrl+K shortcut ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Drag & Drop ──────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLead(leadId);
    e.dataTransfer.effectAllowed = 'move';
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedLead) return;

    try {
      await api.moveLead(draggedLead, stageId, 0);
      fetchStages();
    } catch (err: any) {
      alert(err.message);
    }
    setDraggedLead(null);
  };

  // ─── Helpers ───────────────────────────────────────────────
  const getStageValue = (stage: PipelineStage) => {
    return stage.leads?.reduce((sum: number, lead: any) => sum + (Number(lead.budget) || 0), 0) || 0;
  };

  // ─── Filter logic ─────────────────────────────────────────
  const matchesLead = useCallback((lead: any): boolean => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const searchable = `${lead.firstName} ${lead.lastName} ${lead.email || ''} ${lead.company || ''} ${lead.phone || ''}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    // Source
    if (sourceFilters.length > 0 && !sourceFilters.includes(lead.source)) return false;

    // Assignee
    if (assigneeFilter === 'me' && lead.assignedToId !== currentUser?.id) return false;
    if (assigneeFilter === 'unassigned' && lead.assignedToId) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'me' && assigneeFilter !== 'unassigned' && lead.assignedToId !== assigneeFilter) return false;

    // Value range
    const budget = Number(lead.budget) || 0;
    if (valueMin && budget < Number(valueMin)) return false;
    if (valueMax && budget > Number(valueMax)) return false;

    // Score range
    const score = lead.score ?? 0;
    if (scoreMin && score < Number(scoreMin)) return false;
    if (scoreMax && score > Number(scoreMax)) return false;

    // Priority
    if (priorityFilter !== 'all') {
      const p = getPriority(score);
      if (p !== priorityFilter) return false;
    }

    // Date
    const dateCutoff = getDateCutoff(datePreset);
    if (dateCutoff && lead.createdAt) {
      if (new Date(lead.createdAt) < dateCutoff) return false;
    }

    return true;
  }, [searchQuery, sourceFilters, assigneeFilter, currentUser?.id, valueMin, valueMax, scoreMin, scoreMax, priorityFilter, datePreset]);

  // ─── Filtered stages ──────────────────────────────────────
  const filteredStages = useMemo(() => {
    return stages.map(stage => ({
      ...stage,
      leads: (stage.leads || []).filter(matchesLead),
    }));
  }, [stages, matchesLead]);

  // Sort leads within each stage
  const sortedStages = useMemo(() => {
    return filteredStages.map(stage => {
      const sort = columnSorts[stage.id] || 'newest';
      const leads = [...(stage.leads || [])];
      leads.sort((a: any, b: any) => {
        switch (sort) {
          case 'oldest': return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          case 'highestValue': return (Number(b.budget) || 0) - (Number(a.budget) || 0);
          case 'highestScore': return (b.score || 0) - (a.score || 0);
          case 'newest':
          default: return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
      });
      return { ...stage, leads };
    });
  }, [filteredStages, columnSorts]);

  // ─── Totals ────────────────────────────────────────────────
  const totalLeadsAll = stages.reduce((sum, s) => sum + (s.leads?.length || 0), 0);
  const totalLeadsFiltered = filteredStages.reduce((sum, s) => sum + (s.leads?.length || 0), 0);
  const totalValue = sortedStages.reduce((sum, s) => sum + s.leads.reduce((v: number, l: any) => v + (Number(l.budget) || 0), 0), 0);
  const totalValueAll = stages.reduce((sum, s) => sum + getStageValue(s), 0);
  const avgDealSize = totalLeadsFiltered > 0 ? totalValue / totalLeadsFiltered : 0;

  // Conversion rate
  const wonStage = stages.find(s => s.name?.toLowerCase().includes('won') || s.name?.toLowerCase().includes('closed'));
  const wonCount = wonStage?.leads?.length || 0;
  const conversionRate = totalLeadsAll > 0 ? ((wonCount / totalLeadsAll) * 100) : 0;

  // ─── Active filter count ───────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (searchQuery) c++;
    if (sourceFilters.length > 0) c++;
    if (assigneeFilter !== 'all') c++;
    if (valueMin || valueMax) c++;
    if (scoreMin || scoreMax) c++;
    if (priorityFilter !== 'all') c++;
    if (datePreset !== 'all') c++;
    return c;
  }, [searchQuery, sourceFilters, assigneeFilter, valueMin, valueMax, scoreMin, scoreMax, priorityFilter, datePreset]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSourceFilters([]);
    setAssigneeFilter('all');
    setValueMin('');
    setValueMax('');
    setScoreMin('');
    setScoreMax('');
    setPriorityFilter('all');
    setDatePreset('all');
  };

  const toggleSourceFilter = (source: string) => {
    setSourceFilters(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    );
  };

  // ─── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div><div className="skeleton h-8 w-32 mb-2" /><div className="skeleton h-4 w-64" /></div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex-shrink-0 w-72">
              <div className="skeleton h-10 w-full mb-3 rounded-lg" />
              <div className="space-y-2">
                {[1,2,3].map(j => <div key={j} className="skeleton h-24 w-full rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-7rem)] animate-fade-in overflow-hidden">
      {/* Thin scrollbar styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pipeline-board::-webkit-scrollbar { width: 6px; height: 6px; }
        .pipeline-board::-webkit-scrollbar-track { background: transparent; border-radius: 3px; }
        .pipeline-board::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
        .pipeline-board::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.22); }
        .pipeline-col::-webkit-scrollbar { width: 5px; }
        .pipeline-col::-webkit-scrollbar-track { background: transparent; }
        .pipeline-col::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
        .pipeline-col::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        .pipeline-board { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.12) transparent; }
        .pipeline-col { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.1) transparent; }
      `}} />
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Pipeline</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {totalLeadsAll} leads &middot; AED {totalValueAll.toLocaleString()} total value
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchStages} />
          {/* View toggle */}
          <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-soft text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              title="Kanban View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-soft text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center">
              <Hash className="h-3.5 w-3.5 text-brand-600" />
            </div>
            <span className="text-sm font-medium text-text-secondary">Total Leads</span>
          </div>
          <p className="text-xl font-bold text-text-primary">{totalLeadsFiltered}{activeFilterCount > 0 ? ` / ${totalLeadsAll}` : ''}</p>
        </div>
        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-text-secondary">Pipeline Value</span>
          </div>
          <p className="text-xl font-bold text-text-primary">AED {totalValue.toLocaleString()}</p>
        </div>
        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-text-secondary">Avg Deal Size</span>
          </div>
          <p className="text-xl font-bold text-text-primary">AED {avgDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-purple-50 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-text-secondary">Conversion Rate</span>
          </div>
          <p className="text-xl font-bold text-text-primary">{conversionRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            ref={searchInputRef}
            className="input pl-10 pr-20"
            placeholder="Search leads…  Ctrl+K"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-tertiary text-text-tertiary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-text-tertiary bg-surface-tertiary rounded px-1.5 py-0.5 font-mono hidden sm:inline">
              Ctrl+K
            </span>
          )}
        </div>

        {/* Priority chips */}
        <div className="flex gap-1">
          {(['all', 'hot', 'warm', 'cold'] as PriorityFilter[]).map(p => {
            const active = priorityFilter === p;
            if (p === 'all') {
              return (
                <button
                  key={p}
                  onClick={() => setPriorityFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all border ${
                    active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-text-secondary border-border hover:border-border-strong'
                  }`}
                >
                  All
                </button>
              );
            }
            const cfg = priorityConfig[p];
            const Icon = cfg.icon;
            return (
              <button
                key={p}
                onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all border ${
                  active ? `${cfg.bg} ${cfg.text} ring-1 ${cfg.ring} border-transparent` : 'bg-white text-text-secondary border-border hover:border-border-strong'
                }`}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary text-sm ${showFilters ? 'ring-2 ring-brand-500 bg-brand-50' : ''}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-brand-500 text-white text-2xs font-semibold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Expanded Filter Panel */}
      {showFilters && (
        <div className="card p-4 border-brand-200 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Source multi-select */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Source
              </label>
              <div className="space-y-1 mt-1.5 max-h-40 overflow-y-auto">
                {sourceOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceFilters.includes(opt.value)}
                      onChange={() => toggleSourceFilter(opt.value)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-text-secondary">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="label flex items-center gap-1.5">
                <User2 className="h-3.5 w-3.5" /> Assignee
              </label>
              <select
                className="input mt-1.5"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="me">Me</option>
                <option value="unassigned">Unassigned</option>
                {teamMembers.map(u => (
                  <option key={u.id} value={u.id}>{getDisplayName(u.firstName, u.lastName)}</option>
                ))}
              </select>

              {/* Date preset */}
              <label className="label flex items-center gap-1.5 mt-3">
                <Calendar className="h-3.5 w-3.5" /> Date Added
              </label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {([
                  { value: 'all', label: 'All Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'This Week' },
                  { value: 'month', label: 'This Month' },
                ] as { value: DatePreset; label: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDatePreset(opt.value)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                      datePreset === opt.value
                        ? 'bg-brand-50 text-brand-700 border-brand-300'
                        : 'bg-white text-text-secondary border-border hover:border-border-strong'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Value range */}
            <div>
              <label className="label flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Value Range (AED)
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="Min"
                  value={valueMin}
                  onChange={(e) => setValueMin(e.target.value)}
                />
                <span className="text-text-tertiary">–</span>
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="Max"
                  value={valueMax}
                  onChange={(e) => setValueMax(e.target.value)}
                />
              </div>

              {/* Score range */}
              <label className="label flex items-center gap-1.5 mt-3">
                <BarChart3 className="h-3.5 w-3.5" /> Score Range (0-100)
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="Min"
                  min={0}
                  max={100}
                  value={scoreMin}
                  onChange={(e) => setScoreMin(e.target.value)}
                />
                <span className="text-text-tertiary">–</span>
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                />
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-col justify-between">
              <div>
                <label className="label">Quick Presets</label>
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <button
                    onClick={() => { clearAllFilters(); setPriorityFilter('hot'); }}
                    className="text-left px-2.5 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    🔥 Hot Leads Only
                  </button>
                  <button
                    onClick={() => { clearAllFilters(); setAssigneeFilter('unassigned'); }}
                    className="text-left px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    👤 Unassigned Leads
                  </button>
                  <button
                    onClick={() => { clearAllFilters(); setValueMin('50000'); }}
                    className="text-left px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    💰 High Value (≥50K AED)
                  </button>
                  <button
                    onClick={() => { clearAllFilters(); setDatePreset('week'); }}
                    className="text-left px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    📅 Added This Week
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="text-sm font-medium text-text-secondary">
            Showing {totalLeadsFiltered} of {totalLeadsAll} leads
          </span>
          <span className="text-text-tertiary">|</span>

          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 ring-1 ring-blue-200">
              Search: &quot;{searchQuery}&quot;
              <button onClick={() => setSearchQuery('')}><X className="h-3 w-3" /></button>
            </span>
          )}

          {sourceFilters.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium px-2.5 py-1 ring-1 ring-purple-200">
              Sources: {sourceFilters.length}
              <button onClick={() => setSourceFilters([])}><X className="h-3 w-3" /></button>
            </span>
          )}

          {assigneeFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 ring-1 ring-indigo-200">
              Assignee: {assigneeFilter === 'me' ? 'Me' : assigneeFilter === 'unassigned' ? 'Unassigned' : teamMembers.find(u => u.id === assigneeFilter)?.firstName || assigneeFilter}
              <button onClick={() => setAssigneeFilter('all')}><X className="h-3 w-3" /></button>
            </span>
          )}

          {(valueMin || valueMax) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 ring-1 ring-emerald-200">
              Value: {valueMin ? `≥${Number(valueMin).toLocaleString()}` : ''}{valueMin && valueMax ? ' – ' : ''}{valueMax ? `≤${Number(valueMax).toLocaleString()}` : ''} AED
              <button onClick={() => { setValueMin(''); setValueMax(''); }}><X className="h-3 w-3" /></button>
            </span>
          )}

          {(scoreMin || scoreMax) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 ring-1 ring-amber-200">
              Score: {scoreMin || '0'} – {scoreMax || '100'}
              <button onClick={() => { setScoreMin(''); setScoreMax(''); }}><X className="h-3 w-3" /></button>
            </span>
          )}

          {priorityFilter !== 'all' && (
            <span className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ring-1 ${priorityConfig[priorityFilter].bg} ${priorityConfig[priorityFilter].text} ${priorityConfig[priorityFilter].ring}`}>
              {priorityConfig[priorityFilter].label}
              <button onClick={() => setPriorityFilter('all')}><X className="h-3 w-3" /></button>
            </span>
          )}

          {datePreset !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-700 text-xs font-medium px-2.5 py-1 ring-1 ring-cyan-200">
              {datePreset === 'today' ? 'Today' : datePreset === 'week' ? 'This Week' : 'This Month'}
              <button onClick={() => setDatePreset('all')}><X className="h-3 w-3" /></button>
            </span>
          )}

          <button
            onClick={clearAllFilters}
            className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* ─── KANBAN VIEW ─────────────────────────────────────── */}
      {viewMode === 'kanban' && (
        <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto overflow-y-hidden pb-2 pipeline-board">
          {sortedStages.map((stage) => {
            const stageValue = stage.leads.reduce((sum: number, l: any) => sum + (Number(l.budget) || 0), 0);
            const leadCount = stage.leads.length;
            const isDragOver = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 flex flex-col h-full min-h-0"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Stage Header */}
                <div className="flex items-center gap-2.5 mb-2.5 px-1">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-xs" style={{ backgroundColor: stage.color }} />
                  <h3 className="font-semibold text-text-primary text-sm flex-1 truncate">{stage.name}</h3>
                  <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-md bg-surface-tertiary text-2xs font-semibold text-text-secondary">
                    {leadCount}
                  </span>
                </div>

                {/* Stage value & sort */}
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-text-tertiary" />
                    <span className="text-xs font-medium text-text-secondary">AED {stageValue.toLocaleString()}</span>
                  </div>
                  <div className="relative">
                    <select
                      className="text-2xs text-text-tertiary bg-transparent border-0 p-0 pr-4 cursor-pointer focus:ring-0 appearance-none"
                      value={columnSorts[stage.id] || 'newest'}
                      onChange={(e) => setColumnSorts(prev => ({ ...prev, [stage.id]: e.target.value as ColumnSort }))}
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highestValue">Highest Value</option>
                      <option value="highestScore">Highest Score</option>
                    </select>
                  </div>
                </div>

                {/* Cards Container */}
                <div className={`flex-1 min-h-0 space-y-2 rounded-xl p-2 transition-all duration-200 overflow-y-auto pipeline-col ${
                  isDragOver
                    ? 'bg-brand-50 ring-2 ring-brand-500/30 ring-offset-1'
                    : 'bg-surface-tertiary/50'
                }`}>
                  {stage.leads.map((lead: any) => {
                    const isSearchMatch = !searchQuery || matchesLead(lead);
                    const priority = getPriority(lead.score || 0);
                    const pCfg = priorityConfig[priority];

                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        className={`card-interactive p-3 group transition-opacity ${
                          searchQuery && !isSearchMatch ? 'opacity-30' : ''
                        }`}
                      >
                        <Link href={`/leads/${lead.id}`}>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white shadow-xs flex-shrink-0">
                              {getDisplayInitials(lead.firstName, lead.lastName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-700 transition-colors">
                                {getDisplayName(lead.firstName, lead.lastName)}
                              </p>
                              <p className="text-xs text-text-tertiary truncate">
                                {lead.company || lead.email || '-'}
                              </p>
                            </div>
                          </div>

                          {/* Value & Source row */}
                          <div className="flex items-center gap-2 mb-2">
                            {lead.budget && (
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3 text-text-tertiary" />
                                <span className="text-xs font-semibold text-text-primary">AED {Number(lead.budget).toLocaleString()}</span>
                              </div>
                            )}
                            {lead.source && (
                              <span className="text-2xs px-1.5 py-0.5 rounded-md bg-surface-secondary text-text-secondary font-medium">
                                {sourceOptions.find(s => s.value === lead.source)?.label || lead.source}{lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}
                              </span>
                            )}
                          </div>

                          {/* Tags & Score */}
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1 flex-wrap">
                              {lead.tags?.slice(0, 2).map((t: any) => (
                                <span key={t.tag.id} className="inline-block rounded-md px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset"
                                  style={{ backgroundColor: t.tag.color + '12', color: t.tag.color, boxShadow: `inset 0 0 0 1px ${t.tag.color}30` }}>
                                  {t.tag.name}
                                </span>
                              ))}
                              {lead.tags?.length > 2 && (
                                <span className="text-2xs text-text-tertiary">+{lead.tags.length - 2}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded-md ${pCfg.bg} ${pCfg.text}`}>
                                {lead.score}
                              </span>
                            </div>
                          </div>

                          {lead.assignedTo && (
                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle">
                              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-[9px] font-semibold text-white">
                                {getDisplayInitials(lead.assignedTo.firstName, lead.assignedTo.lastName)}
                              </div>
                              <span className="text-2xs text-text-tertiary">{getDisplayName(lead.assignedTo.firstName, lead.assignedTo.lastName)}</span>
                            </div>
                          )}
                        </Link>
                      </div>
                    );
                  })}

                  {stage.leads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="h-8 w-8 rounded-lg bg-surface-secondary flex items-center justify-center mb-2">
                        <Plus className="h-4 w-4 text-text-tertiary" />
                      </div>
                      <p className="text-xs text-text-tertiary">
                        {activeFilterCount > 0 ? 'No matching leads' : 'Drop leads here'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── LIST VIEW ───────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pipeline-board">
          {sortedStages.map((stage) => {
            const stageValue = stage.leads.reduce((sum: number, l: any) => sum + (Number(l.budget) || 0), 0);

            return (
              <div key={stage.id} className="card overflow-hidden">
                {/* Stage header */}
                <div className="flex items-center gap-2.5 px-4 py-3 bg-surface-secondary border-b border-border-subtle">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <h3 className="font-semibold text-text-primary text-sm">{stage.name}</h3>
                  <span className="badge bg-surface-tertiary text-text-secondary text-2xs">{stage.leads.length}</span>
                  <span className="text-xs text-text-tertiary ml-auto">AED {stageValue.toLocaleString()}</span>
                </div>

                {stage.leads.length > 0 ? (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="table-header">
                        <th className="table-cell text-left">Name</th>
                        <th className="table-cell text-left hidden md:table-cell">Company</th>
                        <th className="table-cell text-left hidden md:table-cell">Source</th>
                        <th className="table-cell text-right hidden md:table-cell">Value (AED)</th>
                        <th className="table-cell text-center hidden lg:table-cell">Score</th>
                        <th className="table-cell text-left hidden lg:table-cell">Assigned To</th>
                        <th className="table-cell text-left hidden lg:table-cell">Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {stage.leads.map((lead: any) => {
                        const priority = getPriority(lead.score || 0);
                        const pCfg = priorityConfig[priority];
                        return (
                          <tr key={lead.id} className="table-row hover:bg-surface-secondary/50">
                            <td className="table-cell">
                              <Link href={`/leads/${lead.id}`} className="flex items-center gap-2.5 group">
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                                  {getDisplayInitials(lead.firstName, lead.lastName)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-text-primary group-hover:text-brand-700">{getDisplayName(lead.firstName, lead.lastName)}</p>
                                  <p className="text-2xs text-text-tertiary">{lead.email}</p>
                                </div>
                              </Link>
                            </td>
                            <td className="table-cell hidden md:table-cell text-sm text-text-secondary">{lead.company || '—'}</td>
                            <td className="table-cell hidden md:table-cell">
                              <span className="text-2xs px-1.5 py-0.5 rounded-md bg-surface-secondary text-text-secondary font-medium">
                                {sourceOptions.find(s => s.value === lead.source)?.label || lead.source || '—'}{lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}
                              </span>
                            </td>
                            <td className="table-cell text-right hidden md:table-cell text-sm font-medium text-text-primary">
                              {lead.budget ? `AED ${Number(lead.budget).toLocaleString()}` : '—'}
                            </td>
                            <td className="table-cell text-center hidden lg:table-cell">
                              <span className={`inline-flex items-center gap-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded-md ${pCfg.bg} ${pCfg.text}`}>
                                {lead.score ?? 0}
                              </span>
                            </td>
                            <td className="table-cell hidden lg:table-cell text-sm text-text-secondary">
                              {lead.assignedTo ? getDisplayName(lead.assignedTo.firstName, lead.assignedTo.lastName) : '—'}
                            </td>
                            <td className="table-cell hidden lg:table-cell text-2xs text-text-tertiary">
                              {lead.createdAt ? (
                                <>
                                  {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' '}
                                  {new Date(lead.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-text-tertiary">
                    {activeFilterCount > 0 ? 'No matching leads in this stage' : 'No leads in this stage'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
