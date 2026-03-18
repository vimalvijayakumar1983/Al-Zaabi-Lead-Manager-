'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings,
  Users,
  RefreshCw,
  Save,
  X,
  ChevronDown,
  Check,
  AlertCircle,
  Info,
  Loader2,
  Globe,
  Building2,
  RotateCcw,
  Zap,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AllocationMethod,
  AllocationRules,
  AllocationStats,
  AutoAllocateResult,
  SourceAllocationRule,
  User,
  Organization,
} from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AllocationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
}

interface RulesResponse {
  rules: AllocationRules;
  inherited?: boolean;
  divisionId?: string;
  scope?: 'global' | 'division';
}

const METHOD_OPTIONS: {
  value: AllocationMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'round_robin',
    label: 'Round Robin',
    description: 'Leads are distributed evenly across eligible users in order',
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    value: 'workload_based',
    label: 'Workload Based',
    description: 'Leads are assigned to users with the least active leads',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Leads must be manually assigned by admins or team members',
    icon: <Users className="w-5 h-5" />,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function AllocationSettings({
  isOpen,
  onClose,
  users,
}: AllocationSettingsProps) {
  // ── Division scope state ────────────────────────────────────────────────
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [isInherited, setIsInherited] = useState<boolean>(false);
  const [divisionDropdownOpen, setDivisionDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const divisionDropdownRef = useRef<HTMLDivElement>(null);

  // ── Core rules state ────────────────────────────────────────────────────
  const [method, setMethod] = useState<AllocationMethod>('manual');
  const [autoAssignOnCreate, setAutoAssignOnCreate] = useState(false);
  const [maxLeadsPerUser, setMaxLeadsPerUser] = useState(100);
  const [sourceRules, setSourceRules] = useState<SourceAllocationRule[]>([]);
  const [eligibleUserIds, setEligibleUserIds] = useState<string[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stats, setStats] = useState<AllocationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [autoAllocating, setAutoAllocating] = useState(false);
  const [autoAllocateResult, setAutoAllocateResult] = useState<AutoAllocateResult | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [divisionUsers, setDivisionUsers] = useState<User[]>([]);

  // ── Original rules ref (for change detection) ───────────────────────────
  const originalRulesRef = useRef<AllocationRules | null>(null);

  // ── Determine user role on mount ────────────────────────────────────────
  useEffect(() => {
    api
      .getMe()
      .then((res: any) => {
        const role = res?.data?.role || res?.role || null;
        setUserRole(role);
      })
      .catch(() => {});
  }, []);

  // ── Load divisions on mount ─────────────────────────────────────────────
  useEffect(() => {
    api
      .getDivisions()
      .then((res: any) => {
        const divs = res?.data || res || [];
        setDivisions(Array.isArray(divs) ? divs : []);
      })
      .catch(() => {
        setDivisions([]);
      });
  }, []);

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        divisionDropdownRef.current &&
        !divisionDropdownRef.current.contains(event.target as Node)
      ) {
        setDivisionDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Apply rules to state ────────────────────────────────────────────────
  const applyRules = useCallback((rules: AllocationRules) => {
    setMethod(rules.method || 'manual');
    setAutoAssignOnCreate(rules.autoAssignOnCreate ?? false);
    setMaxLeadsPerUser(rules.maxLeadsPerUser ?? 100);
    setSourceRules(rules.sourceRules || []);
    setEligibleUserIds(rules.eligibleUserIds || []);
    originalRulesRef.current = { ...rules };
    setHasChanges(false);
  }, []);

  // ── Load rules + stats ─────────────────────────────────────────────────
  const loadData = useCallback(
    async (divisionId: string | null) => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setAutoAllocateResult(null);

      try {
        const [rulesRes, statsRes] = await Promise.all([
          api.getAllocationRules(divisionId || undefined),
          api.getAllocationStats(divisionId || undefined),
        ]);

        const rulesData: RulesResponse = rulesRes?.data || rulesRes;
        const statsData = statsRes?.data || statsRes;

        const rules = rulesData.rules || rulesData;
        applyRules(rules as AllocationRules);
        setIsInherited(rulesData.inherited ?? false);
        setStats(statsData);

        // Extract division-scoped users from stats if available
        if (divisionId && statsData?.users) {
          setDivisionUsers(statsData.users);
        } else {
          setDivisionUsers([]);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load allocation settings');
      } finally {
        setLoading(false);
      }
    },
    [applyRules]
  );

  // ── Load stats separately ──────────────────────────────────────────────
  const loadStats = useCallback(async (divisionId: string | null) => {
    setStatsLoading(true);
    try {
      const statsRes = await api.getAllocationStats(divisionId || undefined);
      const statsData = statsRes?.data || statsRes;
      setStats(statsData);

      if (divisionId && statsData?.users) {
        setDivisionUsers(statsData.users);
      } else {
        setDivisionUsers([]);
      }
    } catch {
      // Stats load failure is non-critical
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Initial load & reload when division changes ─────────────────────────
  useEffect(() => {
    if (isOpen) {
      loadData(selectedDivisionId);
    }
  }, [isOpen, selectedDivisionId, loadData]);

  // ── Change detection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!originalRulesRef.current) return;
    const orig = originalRulesRef.current;
    const changed =
      method !== orig.method ||
      autoAssignOnCreate !== orig.autoAssignOnCreate ||
      maxLeadsPerUser !== orig.maxLeadsPerUser ||
      JSON.stringify(sourceRules) !== JSON.stringify(orig.sourceRules || []) ||
      JSON.stringify(eligibleUserIds) !== JSON.stringify(orig.eligibleUserIds || []);
    setHasChanges(changed);
  }, [method, autoAssignOnCreate, maxLeadsPerUser, sourceRules, eligibleUserIds]);

  // ── Clear success/error after timeout ───────────────────────────────────
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Compute effective users list ────────────────────────────────────────
  const effectiveUsers: User[] =
    selectedDivisionId && divisionUsers.length > 0 ? divisionUsers : users;

  // ── Save handler ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: AllocationRules = {
        method,
        autoAssignOnCreate,
        maxLeadsPerUser,
        sourceRules,
        eligibleUserIds,
      };

      await api.updateAllocationRules(payload, selectedDivisionId || undefined);
      originalRulesRef.current = { ...payload };
      setHasChanges(false);
      setIsInherited(false);
      setSuccess(
        selectedDivisionId
          ? 'Division allocation rules saved successfully'
          : 'Global allocation rules saved successfully'
      );

      // Reload stats after save
      await loadStats(selectedDivisionId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save allocation rules');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to global handler ─────────────────────────────────────────────
  const handleResetToGlobal = async () => {
    if (!selectedDivisionId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.resetDivisionAllocationRules(selectedDivisionId);
      setSuccess('Division rules reset to global');
      // Reload to get the inherited global rules
      await loadData(selectedDivisionId);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset division rules');
    } finally {
      setSaving(false);
    }
  };

  // ── Auto-allocate handler ──────────────────────────────────────────────
  const handleAutoAllocate = async () => {
    setAutoAllocating(true);
    setAutoAllocateResult(null);
    setError(null);

    try {
      const res = await api.autoAllocateLeads(selectedDivisionId || undefined);
      const result = res?.data || res;
      setAutoAllocateResult(result);
      setSuccess(
        `Auto-allocation complete: ${result.allocated || 0} leads assigned`
      );

      // Reload stats after allocation
      await loadStats(selectedDivisionId);
    } catch (err: any) {
      setError(err?.message || 'Auto-allocation failed');
    } finally {
      setAutoAllocating(false);
    }
  };

  // ── Add source rule ────────────────────────────────────────────────────
  const addSourceRule = () => {
    setSourceRules([...sourceRules, { source: '', assignToId: '' }]);
  };

  const updateSourceRule = (
    index: number,
    field: keyof SourceAllocationRule,
    value: string
  ) => {
    const updated = [...sourceRules];
    updated[index] = { ...updated[index], [field]: value };
    setSourceRules(updated);
  };

  const removeSourceRule = (index: number) => {
    setSourceRules(sourceRules.filter((_, i) => i !== index));
  };

  // ── Toggle eligible user ───────────────────────────────────────────────
  const toggleEligibleUser = (userId: string) => {
    setEligibleUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    setEligibleUserIds(effectiveUsers.map((u) => u.id));
  };

  const clearAllUsers = () => {
    setEligibleUserIds([]);
  };

  // ── Get selected division name ─────────────────────────────────────────
  const selectedDivisionName = selectedDivisionId
    ? divisions.find((d) => d.id === selectedDivisionId)?.name || 'Division'
    : null;

  // ── Don't render if not open ───────────────────────────────────────────
  if (!isOpen) return null;

  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Allocation Settings
                </h2>
                <p className="text-sm text-gray-500">
                  Configure how leads are distributed
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Division Scope Selector ─────────────────────────────────── */}
          {isSuperAdmin && divisions.length > 0 && (
            <div className="mt-4" ref={divisionDropdownRef}>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Scope
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDivisionDropdownOpen(!divisionDropdownOpen)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {selectedDivisionId ? (
                      <>
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span>{selectedDivisionName}</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 text-green-600" />
                        <span>🌐 Global (All Divisions)</span>
                      </>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      divisionDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {divisionDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                    {/* Global option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDivisionId(null);
                        setDivisionDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        !selectedDivisionId
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700'
                      }`}
                    >
                      <Globe className="w-4 h-4 text-green-600" />
                      <span className="flex-1 text-left">
                        🌐 Global (All Divisions)
                      </span>
                      {!selectedDivisionId && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>

                    <div className="border-t border-gray-100" />

                    {/* Division options */}
                    {divisions.map((div) => (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => {
                          setSelectedDivisionId(div.id);
                          setDivisionDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                          selectedDivisionId === div.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {div.logo ? (
                          <img
                            src={div.logo}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <Building2
                            className="w-4 h-4"
                            style={{ color: div.color || '#6B7280' }}
                          />
                        )}
                        <span className="flex-1 text-left">{div.name}</span>
                        {selectedDivisionId === div.id && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          {/* ── Inherited rules banner ──────────────────────────────────── */}
          {selectedDivisionId && isInherited && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">
                  Inherited Global Rules
                </p>
                <p className="text-sm text-blue-600 mt-0.5">
                  This division inherits global allocation rules. Customize to
                  override for this division.
                </p>
              </div>
            </div>
          )}

          {selectedDivisionId && !isInherited && !loading && (
            <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Custom Rules Active
                  </p>
                  <p className="text-sm text-amber-600 mt-0.5">
                    Custom allocation rules are active for{' '}
                    <strong>{selectedDivisionName}</strong>.
                  </p>
                </div>
              </div>
              <button
                onClick={handleResetToGlobal}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Global
              </button>
            </div>
          )}

          {/* ── Status messages ─────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg animate-in fade-in duration-200">
              <Check className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* ── Loading skeleton ────────────────────────────────────────── */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-gray-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* ── Allocation Method ───────────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Allocation Method
                </h3>
                <div className="space-y-2">
                  {METHOD_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-all ${
                        method === option.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="allocation-method"
                        value={option.value}
                        checked={method === option.value}
                        onChange={() => setMethod(option.value)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`${
                              method === option.value
                                ? 'text-blue-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {option.icon}
                          </span>
                          <span className="font-medium text-gray-900">
                            {option.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Auto-assign on create ───────────────────────────────── */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Auto-assign on Create
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Automatically assign new leads when they are created
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoAssignOnCreate}
                  onClick={() => setAutoAssignOnCreate(!autoAssignOnCreate)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    autoAssignOnCreate ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoAssignOnCreate ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* ── Max leads per user ──────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Max Leads per User
                  </h3>
                  <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {maxLeadsPerUser}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={maxLeadsPerUser}
                  onChange={(e) =>
                    setMaxLeadsPerUser(parseInt(e.target.value, 10))
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1</span>
                  <span>250</span>
                  <span>500</span>
                </div>
              </div>

              {/* ── Source-based Rules ──────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Source-based Rules
                  </h3>
                  <button
                    type="button"
                    onClick={addSourceRule}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add Rule
                  </button>
                </div>

                {sourceRules.length === 0 ? (
                  <p className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No source rules configured. Leads from all sources will use
                    the selected method.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sourceRules.map((rule, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <input
                          type="text"
                          value={rule.source}
                          onChange={(e) =>
                            updateSourceRule(index, 'source', e.target.value)
                          }
                          placeholder="Lead source..."
                          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <select
                          value={rule.assignToId}
                          onChange={(e) =>
                            updateSourceRule(
                              index,
                              'assignToId',
                              e.target.value
                            )
                          }
                          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          <option value="">Select assignee...</option>
                          {effectiveUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name || user.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeSourceRule(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Eligible Users ─────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Eligible Users
                    {selectedDivisionId && divisionUsers.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        (showing {selectedDivisionName} members)
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllUsers}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllUsers}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {effectiveUsers.length === 0 ? (
                    <p className="text-sm text-gray-400 italic p-3">
                      No users available
                      {selectedDivisionId ? ' in this division' : ''}
                    </p>
                  ) : (
                    effectiveUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={eligibleUserIds.includes(user.id)}
                          onChange={() => toggleEligibleUser(user.id)}
                          className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                            {(user.name || user.email || '?')
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.name || 'Unnamed'}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {eligibleUserIds.length} of {effectiveUsers.length} users
                  selected
                </p>
              </div>

              {/* ── Workload Statistics ─────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Workload Statistics
                    {selectedDivisionId && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        — {selectedDivisionName}
                      </span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={() => loadStats(selectedDivisionId)}
                    disabled={statsLoading}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${statsLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                </div>

                {stats && stats.users && stats.users.length > 0 ? (
                  <div className="space-y-2">
                    {stats.users.map((userStat: any) => {
                      const utilization = maxLeadsPerUser
                        ? Math.min(
                            100,
                            Math.round(
                              ((userStat.activeLeads || 0) / maxLeadsPerUser) *
                                100
                            )
                          )
                        : 0;
                      return (
                        <div
                          key={userStat.id || userStat.userId}
                          className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-gray-900">
                              {userStat.name || userStat.email || 'User'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {userStat.activeLeads || 0} / {maxLeadsPerUser}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                utilization >= 90
                                  ? 'bg-red-500'
                                  : utilization >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-blue-500'
                              }`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {utilization}% utilization
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    {statsLoading
                      ? 'Loading statistics...'
                      : 'No workload data available'}
                  </p>
                )}
              </div>

              {/* ── Auto-Allocate Button ───────────────────────────────── */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {selectedDivisionId
                        ? `Auto-Allocate ${selectedDivisionName} Leads`
                        : 'Auto-Allocate Leads'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Distribute all unassigned leads
                      {selectedDivisionId ? ' in this division' : ''} using
                      current rules
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    disabled={autoAllocating || method === 'manual'}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {autoAllocating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {autoAllocating ? 'Allocating...' : 'Auto-Allocate'}
                  </button>
                </div>

                {autoAllocateResult && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-semibold text-green-600">
                          {autoAllocateResult.allocated || 0}
                        </p>
                        <p className="text-xs text-gray-500">Allocated</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-red-600">
                          {autoAllocateResult.failed || 0}
                        </p>
                        <p className="text-xs text-gray-500">Failed</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-600">
                          {autoAllocateResult.total || 0}
                        </p>
                        <p className="text-xs text-gray-500">Total</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer: Save / Cancel ────────────────────────────────────── */}
        {!loading && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {hasChanges && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Unsaved changes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? 'Saving...' : 'Save Rules'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
