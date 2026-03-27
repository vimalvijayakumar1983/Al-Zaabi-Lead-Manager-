'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { AllocationStats, WorkloadUser } from '@/types';

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface WorkloadDashboardProps {
  isOpen: boolean;
  onToggle: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getUtilizationColor(pct: number): {
  bar: string;
  bg: string;
  text: string;
  ring: string;
} {
  if (pct >= 80)
    return {
      bar: 'bg-red-500',
      bg: 'bg-red-50',
      text: 'text-red-700',
      ring: 'ring-red-200',
    };
  if (pct >= 50)
    return {
      bar: 'bg-amber-500',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      ring: 'ring-amber-200',
    };
  return {
    bar: 'bg-green-500',
    bg: 'bg-green-50',
    text: 'text-green-700',
    ring: 'ring-green-200',
  };
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return 'bg-purple-500';
    case 'MANAGER':
      return 'bg-brand-500';
    case 'SALES_REP':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function UserCard({ user }: { user: WorkloadUser }) {
  const colors = getUtilizationColor(user.utilization);
  const roleColor = getRoleColor(user.role);

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow min-w-[160px] w-full sm:w-auto">
      {/* Avatar & Name */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold ${roleColor}`}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={`${user.firstName} ${user.lastName}`}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            getInitials(user.firstName, user.lastName)
          )}
          {/* Online dot */}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-[11px] text-gray-500 capitalize">
            {user.role.replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">
            {user.activeLeads}/{user.capacity}
          </span>
          <span className={`text-xs font-bold ${colors.text}`}>
            {user.utilization}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
            style={{ width: `${Math.min(100, user.utilization)}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-auto flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>🏆</span>
          <span className="font-medium text-gray-700">{user.conversionRate}%</span>
          <span>CVR</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}>
          {user.activeLeads} active
        </span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-20 rounded bg-gray-200" />
                <div className="h-2.5 w-14 rounded bg-gray-100" />
              </div>
            </div>
            <div className="space-y-1.5 mb-2">
              <div className="flex justify-between">
                <div className="h-2.5 w-10 rounded bg-gray-100" />
                <div className="h-2.5 w-8 rounded bg-gray-100" />
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100" />
            </div>
            <div className="pt-2 border-t border-gray-100 flex justify-between">
              <div className="h-3 w-16 rounded bg-gray-100" />
              <div className="h-4 w-14 rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-900">No team members found</p>
      <p className="mt-1 text-xs text-gray-500">
        Add team members to start tracking workload allocation.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function WorkloadDashboard({ isOpen, onToggle }: WorkloadDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AllocationStats | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAllocationStats();
      setStats(data);
      setHasFetchedOnce(true);
    } catch (err) {
      setError('Failed to load workload data. Please try again.');
      console.error('WorkloadDashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen, fetchStats]);

  /* ---- collapsed header (always visible) ---- */
  const headerContent = (
    <button
      type="button"
      onClick={onToggle}
      className="card flex w-full items-center justify-between gap-3 px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-sm font-semibold text-gray-900">Team Workload</h3>

        {/* Unassigned badge (show even when collapsed, if we have data) */}
        {stats && stats.summary.totalUnassigned > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            {stats.summary.totalUnassigned} Unassigned
          </span>
        )}
        {stats && stats.summary.totalUnassigned === 0 && hasFetchedOnce && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
            All Assigned ✓
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {stats && (
          <span className="hidden sm:inline text-xs text-gray-500">
            {stats.users.length} member{stats.users.length !== 1 ? 's' : ''} · avg {stats.summary.avgLeadsPerUser.toFixed(1)} leads
          </span>
        )}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>
  );

  /* ---- expanded body ---- */
  const bodyContent = isOpen ? (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        maxHeight: isOpen ? '600px' : '0px',
        opacity: isOpen ? 1 : 0,
      }}
    >
      {/* Divider */}
      <div className="border-t border-gray-100" />

      {loading && !hasFetchedOnce ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="p-4">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button
              type="button"
              onClick={fetchStats}
              className="ml-auto text-xs font-medium text-red-800 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      ) : stats && stats.users.length === 0 ? (
        <EmptyState />
      ) : stats ? (
        <div className="p-4">
          {/* Summary stats bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span>&lt; 50% utilization</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>50–80%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span>&gt; 80%</span>
            </div>
            <span className="ml-auto text-[11px] text-gray-400">
              Max capacity: {stats.summary.maxCapacity}
            </span>
          </div>

          {/* User cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stats.users
              .sort((a, b) => b.utilization - a.utilization)
              .map((user) => (
                <UserCard key={user.id} user={user} />
              ))}
          </div>

          {/* Refreshing indicator */}
          {loading && hasFetchedOnce && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Refreshing…
            </div>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="card overflow-hidden">
      {headerContent}
      {bodyContent}
    </div>
  );
}

export default WorkloadDashboard;
