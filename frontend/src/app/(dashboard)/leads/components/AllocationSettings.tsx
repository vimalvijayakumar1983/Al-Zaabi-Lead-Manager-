'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type {
  Organization,
  AllocationMethod,
  AllocationRules,
  AllocationStats,
  AutoAllocateResult,
  SourceAllocationRule,
  User,
} from '@/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const LEAD_SOURCES = [
  'WEBSITE_FORM',
  'LIVE_CHAT',
  'LANDING_PAGE',
  'WHATSAPP',
  'FACEBOOK_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'MANUAL',
  'CSV_IMPORT',
  'API',
  'REFERRAL',
  'EMAIL',
  'PHONE',
  'OTHER',
] as const;

const SOURCE_LABELS: Record<string, string> = {
  WEBSITE_FORM: 'Website Form',
  LIVE_CHAT: 'Live Chat Widget',
  LANDING_PAGE: 'Landing Page',
  WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook Ads',
  GOOGLE_ADS: 'Google Ads',
  TIKTOK_ADS: 'TikTok Ads',
  MANUAL: 'Manual',
  CSV_IMPORT: 'CSV Import',
  API: 'API',
  REFERRAL: 'Referral',
  EMAIL: 'Email',
  PHONE: 'Phone',
  OTHER: 'Other',
};

interface MethodOption {
  value: AllocationMethod;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface AllocationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
}

/* ------------------------------------------------------------------ */
/*  Icons (inline SVGs)                                               */
/* ------------------------------------------------------------------ */

function IconRoundRobin() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconWorkload() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconManual() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function MethodCard({
  option,
  selected,
  onSelect,
}: {
  option: MethodOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200 w-full ${
        selected
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Radio indicator */}
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? 'border-brand-500 bg-brand-500' : 'border-gray-300 bg-white'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>

      {/* Icon */}
      <span
        className={`shrink-0 ${selected ? 'text-brand-600' : 'text-gray-400'}`}
      >
        {option.icon}
      </span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-gray-900'}`}>
            {option.title}
          </span>
          {option.badge && (
            <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              {option.badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{option.description}</p>
      </div>
    </button>
  );
}

function SourceRuleRow({
  rule,
  users,
  usedSources,
  onUpdate,
  onRemove,
}: {
  rule: SourceAllocationRule;
  users: User[];
  usedSources: Set<string>;
  onUpdate: (updated: SourceAllocationRule) => void;
  onRemove: () => void;
}) {
  const activeUsers = users.filter((u) => u.isActive);

  return (
    <div className="flex items-center gap-2">
      {/* Source select */}
      <select
        value={rule.source}
        onChange={(e) => onUpdate({ ...rule, source: e.target.value })}
        className="input flex-1 text-sm"
      >
        <option value="">Select source…</option>
        {LEAD_SOURCES.map((src) => (
          <option key={src} value={src} disabled={usedSources.has(src) && rule.source !== src}>
            {SOURCE_LABELS[src] ?? src}
          </option>
        ))}
      </select>

      {/* Arrow */}
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>

      {/* Assignee select */}
      <select
        value={rule.assignToId}
        onChange={(e) => {
          const user = activeUsers.find((u) => u.id === e.target.value);
          onUpdate({
            ...rule,
            assignToId: e.target.value,
            assignToName: user ? `${user.firstName} ${user.lastName}` : undefined,
          });
        }}
        className="input flex-1 text-sm"
      >
        <option value="">Select assignee…</option>
        {activeUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.firstName} {u.lastName} ({u.role.replace('_', ' ')})
          </option>
        ))}
      </select>

      {/* Delete */}
      <button
        type="button"
        onClick={onRemove}
        className="btn-icon shrink-0 text-gray-400 hover:text-red-500 transition-colors"
        aria-label="Remove rule"
      >
        <IconTrash />
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-20 rounded-xl bg-gray-100" />
        <div className="h-20 rounded-xl bg-gray-100" />
        <div className="h-20 rounded-xl bg-gray-100" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-56 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-100" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-36 rounded bg-gray-200" />
        <div className="h-12 rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

const METHODS: MethodOption[] = [
  {
    value: 'round_robin',
    icon: <IconRoundRobin />,
    title: 'Round Robin',
    description: 'Leads are assigned equally among all available team members in rotation.',
  },
  {
    value: 'workload_based',
    icon: <IconWorkload />,
    title: 'Workload Based',
    description: 'Leads go to whoever has the fewest active leads, ensuring balanced workloads.',
    badge: 'Recommended',
  },
  {
    value: 'manual',
    icon: <IconManual />,
    title: 'Manual Only',
    description: 'Leads remain unassigned until a manager manually assigns them to a team member.',
  },
];

export function AllocationSettings({ isOpen, onClose, users }: AllocationSettingsProps) {
  // Division scope
  const { user } = useAuthStore();
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [inherited, setInherited] = useState(false);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Load divisions for super admin
  useEffect(() => {
    if (isSuperAdmin && isOpen) {
      api.getDivisions().then((divs) => {
        setDivisions(divs || []);
      }).catch(() => {});
    }
  }, [isSuperAdmin, isOpen]);

  /* ---- state ---- */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [method, setMethod] = useState<AllocationMethod>('workload_based');
  const [autoAssign, setAutoAssign] = useState(true);
  const [maxLeads, setMaxLeads] = useState(25);
  const [sourceRules, setSourceRules] = useState<SourceAllocationRule[]>([]);
  const [eligibleUserIds, setEligibleUserIds] = useState<string[]>([]);

  const [stats, setStats] = useState<AllocationStats | null>(null);
  const [autoAllocating, setAutoAllocating] = useState(false);
  const [allocateResult, setAllocateResult] = useState<AutoAllocateResult | null>(null);

  /* ---- data loading ---- */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rules, allocationStats] = await Promise.all([
        api.getAllocationRules(),
        api.getAllocationStats(),
      ]);
      setMethod(rules.method);
      setAutoAssign(rules.autoAssignOnCreate);
      setMaxLeads(rules.maxLeadsPerUser);
      setSourceRules(rules.sourceRules);
      setEligibleUserIds(rules.eligibleUserIds || []);
      setStats(allocationStats);
    } catch (err) {
      setError('Failed to load allocation settings. Please try again.');
      console.error('AllocationSettings load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setAllocateResult(null);
      setSuccessMsg(null);
    }
  }, [isOpen, loadData]);

  /* ---- handlers ---- */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payload: AllocationRules = {
        method,
        autoAssignOnCreate: autoAssign,
        maxLeadsPerUser: maxLeads,
        sourceRules: sourceRules.filter((r) => r.source && r.assignToId),
        eligibleUserIds,
      };
      await api.updateAllocationRules({ ...payload, divisionId: selectedDivisionId || undefined });
      setSuccessMsg('Allocation settings saved successfully.');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      console.error('AllocationSettings save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoAllocate = async () => {
    setAutoAllocating(true);
    setError(null);
    setAllocateResult(null);
    try {
      const result = await api.autoAllocateLeads(selectedDivisionId || undefined);
      setAllocateResult(result);
      // Refresh stats after allocation
      const freshStats = await api.getAllocationStats();
      setStats(freshStats);
    } catch (err) {
      setError('Auto-allocation failed. Please try again.');
      console.error('Auto-allocate error:', err);
    } finally {
      setAutoAllocating(false);
    }
  };

  const addSourceRule = () => {
    setSourceRules((prev) => [...prev, { source: '', assignToId: '' }]);
  };

  const updateSourceRule = (index: number, updated: SourceAllocationRule) => {
    setSourceRules((prev) => prev.map((r, i) => (i === index ? updated : r)));
  };

  const removeSourceRule = (index: number) => {
    setSourceRules((prev) => prev.filter((_, i) => i !== index));
  };

  const usedSources = new Set(sourceRules.map((r) => r.source).filter(Boolean));

  /* ---- early return if closed ---- */
  if (!isOpen) return null;

  /* ---- render ---- */
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative z-10 my-8 w-full max-w-2xl animate-[slideUp_0.25s_ease-out] rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Allocation Settings</h2>
            <p className="text-xs text-gray-500 mt-0.5">Configure how leads are assigned to your team</p>
          {/* Division Scope Selector */}
          {isSuperAdmin && divisions.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                Division Scope
              </label>
              <select
                value={selectedDivisionId || ''}
                onChange={(e) => setSelectedDivisionId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">🌐 All Divisions (Global Rules)</option>
                {divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    🏢 {div.name}{div.tradeName ? ` (${div.tradeName})` : ''}
                  </option>
                ))}
              </select>
              {selectedDivisionId && inherited && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-blue-700">
                    📋 This division is <strong>inheriting global rules</strong>
                  </span>
                  <button
                    onClick={() => setInherited(false)}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Customize
                  </button>
                </div>
              )}
              {selectedDivisionId && !inherited && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-amber-700">
                    ⚡ This division has <strong>custom rules</strong>
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await api.updateAllocationRules({ divisionId: selectedDivisionId, resetToGlobal: true });
                        setInherited(true);
                        loadData();
                      } catch {}
                    }}
                    className="text-xs px-3 py-1 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                  >
                    Reset to Global
                  </button>
                </div>
              )}
            </div>
          )}

          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="space-y-6 p-6">
              {/* ──────── Section 1: Assignment Method ──────── */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-base">⚙️</span>
                  <h3 className="text-sm font-semibold text-gray-900">Lead Assignment Method</h3>
                </div>

                <div className="space-y-2">
                  {METHODS.map((opt) => (
                    <MethodCard
                      key={opt.value}
                      option={opt}
                      selected={method === opt.value}
                      onSelect={() => setMethod(opt.value)}
                    />
                  ))}
                </div>

                {/* Options below radio cards */}
                <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  {/* Auto-assign checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={autoAssign}
                      onChange={(e) => setAutoAssign(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                      Auto-assign leads on creation
                    </span>
                  </label>

                  {/* Max leads */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="max-leads" className="label text-sm text-gray-700 whitespace-nowrap">
                      Max leads per user:
                    </label>
                    <input
                      id="max-leads"
                      type="number"
                      min={1}
                      max={999}
                      value={maxLeads}
                      onChange={(e) => setMaxLeads(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="input w-24 text-sm"
                    />
                  </div>
                </div>
              </section>

              {/* ──────── Section 2: Eligible Team Members ──────── */}
              {method !== 'manual' && (
                <section>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base">👥</span>
                    <h3 className="text-sm font-semibold text-gray-900">Eligible Team Members</h3>
                  </div>
                  <p className="mb-3 text-xs text-gray-500">
                    Select which team members participate in auto-assignment. If none selected, all active team members are eligible.
                  </p>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 max-h-64 overflow-y-auto space-y-1">
                    {users.filter((u) => u.isActive && ['SALES_REP', 'MANAGER', 'ADMIN'].includes(u.role)).map((u) => {
                      const isChecked = eligibleUserIds.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white transition-colors">
                          <input
                            type="checkbox"
                            checked={eligibleUserIds.length === 0 || isChecked}
                            onChange={(e) => {
                              if (eligibleUserIds.length === 0) {
                                // Switching from "all" to specific: select all except this one
                                const allIds = users
                                  .filter((u2) => u2.isActive && ['SALES_REP', 'MANAGER', 'ADMIN'].includes(u2.role))
                                  .map((u2) => u2.id);
                                setEligibleUserIds(allIds.filter((id) => id !== u.id));
                              } else if (e.target.checked) {
                                setEligibleUserIds((prev) => [...prev, u.id]);
                              } else {
                                const next = eligibleUserIds.filter((id) => id !== u.id);
                                // If unchecking would leave 0 selected, keep at least this user
                                setEligibleUserIds(next.length > 0 ? next : []);
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-700">
                            {u.firstName} {u.lastName}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {u.role.replace('_', ' ')}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {eligibleUserIds.length === 0 && (
                    <p className="mt-2 text-xs text-brand-600 font-medium">
                      All active team members are currently eligible for assignment.
                    </p>
                  )}
                  {eligibleUserIds.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-gray-500">
                        {eligibleUserIds.length} member{eligibleUserIds.length !== 1 ? 's' : ''} selected
                      </p>
                      <button
                        type="button"
                        onClick={() => setEligibleUserIds([])}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Reset to all
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* ──────── Section 3: Source-Based Rules ──────── */}
              <section>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <h3 className="text-sm font-semibold text-gray-900">Source-Based Assignment Rules</h3>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  Override default assignment: leads from specific sources get routed to designated team members.
                </p>

                <div className="space-y-2">
                  {sourceRules.map((rule, idx) => (
                    <SourceRuleRow
                      key={idx}
                      rule={rule}
                      users={users}
                      usedSources={usedSources}
                      onUpdate={(updated) => updateSourceRule(idx, updated)}
                      onRemove={() => removeSourceRule(idx)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addSourceRule}
                  disabled={sourceRules.length >= LEAD_SOURCES.length}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconPlus />
                  Add Source Rule
                </button>
              </section>

              {/* ──────── Section 3: Quick Actions ──────── */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  {stats && (
                    <p className="mb-3 text-sm text-gray-700">
                      <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-xs h-6 min-w-[1.5rem] px-1.5">
                        {stats.summary.totalUnassigned}
                      </span>
                      <span className="ml-1.5">unassigned lead{stats.summary.totalUnassigned !== 1 ? 's' : ''} in your organization</span>
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    disabled={autoAllocating || (stats?.summary.totalUnassigned ?? 0) === 0}
                    className="btn-primary w-full justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {autoAllocating ? (
                      <>
                        <IconSpinner />
                        Assigning leads…
                      </>
                    ) : (
                      <>
                        <span>🤖</span>
                        Auto-Assign All Unassigned Leads
                      </>
                    )}
                  </button>

                  {/* Result feedback */}
                  {allocateResult && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                      <span className="shrink-0 text-green-600 mt-0.5">
                        <IconCheck />
                      </span>
                      <div className="text-sm text-green-800">
                        <p className="font-medium">
                          Assigned {allocateResult.allocated} lead{allocateResult.allocated !== 1 ? 's' : ''}{' '}
                          to{' '}
                          {new Set(allocateResult.details.map((d) => d.assignedToId)).size} team member
                          {new Set(allocateResult.details.map((d) => d.assignedToId)).size !== 1 ? 's' : ''}
                        </p>
                        {allocateResult.details.length > 0 && allocateResult.details.length <= 8 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-green-700">
                            {allocateResult.details.map((d) => (
                              <li key={d.leadId}>
                                → {d.assignedToName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {(stats?.summary.totalUnassigned ?? 0) === 0 && !allocateResult && (
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      All leads are currently assigned. 🎉
                    </p>
                  )}
                </div>
              </section>

              {/* ──────── Feedback messages ──────── */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                  <IconCheck />
                  {successMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm gap-2"
            >
              {saving ? (
                <>
                  <IconSpinner />
                  Saving…
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Keyframe for modal entrance */}
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default AllocationSettings;
