'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DashboardData, Organization } from '@/types';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Trophy,
  XCircle,
  TrendingUp,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  Building2,
  BarChart3,
  ChevronDown,
} from 'lucide-react';

const statusColors: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  NEW: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-600/10', dot: 'bg-indigo-500' },
  CONTACTED: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', dot: 'bg-blue-500' },
  QUALIFIED: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/10', dot: 'bg-cyan-500' },
  PROPOSAL_SENT: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/10', dot: 'bg-amber-500' },
  NEGOTIATION: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/10', dot: 'bg-orange-500' },
  WON: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', dot: 'bg-emerald-500' },
  LOST: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/10', dot: 'bg-red-500' },
};

const sourceLabels: Record<string, string> = {
  WEBSITE_FORM: 'Website', LANDING_PAGE: 'Landing Page', WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook', GOOGLE_ADS: 'Google', MANUAL: 'Manual',
  CSV_IMPORT: 'CSV Import', API: 'API', REFERRAL: 'Referral',
  EMAIL: 'Email', PHONE: 'Phone', OTHER: 'Other',
};

const sourceColors: Record<string, string> = {
  WEBSITE_FORM: 'bg-indigo-500', LANDING_PAGE: 'bg-violet-500', WHATSAPP: 'bg-emerald-500',
  FACEBOOK_ADS: 'bg-blue-500', GOOGLE_ADS: 'bg-amber-500', MANUAL: 'bg-gray-500',
  CSV_IMPORT: 'bg-cyan-500', API: 'bg-purple-500', REFERRAL: 'bg-pink-500',
  EMAIL: 'bg-sky-500', PHONE: 'bg-teal-500', OTHER: 'bg-gray-400',
};

/** Division-level stats returned by the dashboard API for SUPER_ADMIN */
interface DivisionStats {
  divisionId: string;
  divisionName: string;
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  conversionRate: number;
  pipelineValue: number;
}

/** Extended dashboard data that may include per-division breakdown for SUPER_ADMIN */
interface ExtendedDashboardData extends DashboardData {
  divisionBreakdown?: DivisionStats[];
}

/** Read the current user role from localStorage auth data */
function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth-store');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.user?.role || parsed?.user?.role || null;
    }
  } catch { /* ignore */ }
  return null;
}

const divisionColors = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
];

export default function DashboardPage() {
  const [data, setData] = useState<ExtendedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');

  useEffect(() => {
    const role = getUserRole();
    setUserRole(role);

    // Fetch divisions for SUPER_ADMIN
    if (role === 'SUPER_ADMIN') {
      api.getDivisions().then((divs: Organization[]) => {
        setDivisions(divs || []);
      }).catch(() => { /* ignore */ });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (divisionFilter !== 'all') {
      params.divisionId = divisionFilter;
    }
    const query = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    // Use getDashboard with optional division filter
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/analytics/dashboard${query}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(typeof window !== 'undefined' && localStorage.getItem('token')
          ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
          : {}),
      },
    })
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [divisionFilter]);

  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Super Admin Group Overview skeletons */}
        {isSuperAdmin && divisionFilter === 'all' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="card p-5">
                  <div className="skeleton h-4 w-20 mb-3" />
                  <div className="skeleton h-8 w-16 mb-2" />
                  <div className="skeleton h-3 w-24" />
                </div>
              ))}
            </div>
            <div className="card p-6">
              <div className="skeleton h-5 w-48 mb-6" />
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-10 w-full" />)}
              </div>
            </div>
          </>
        )}
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card p-5">
              <div className="skeleton h-4 w-20 mb-3" />
              <div className="skeleton h-8 w-16 mb-2" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
        {/* Content skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6"><div className="skeleton h-5 w-32 mb-6" /><div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></div>
          <div className="card p-6"><div className="skeleton h-5 w-32 mb-6" /><div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></div>
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="empty-state">
      <div className="empty-state-icon"><XCircle className="h-6 w-6" /></div>
      <p className="text-sm font-medium text-text-primary">Failed to load dashboard</p>
      <p className="text-xs text-text-tertiary mt-1">Please try refreshing the page</p>
    </div>
  );

  const { overview } = data;

  const kpis = [
    { label: 'Total Leads', value: overview.totalLeads, icon: Users, color: 'brand', trend: '+12%', up: true },
    { label: 'New Leads', value: overview.newLeads, icon: UserPlus, color: 'indigo', trend: '+8%', up: true },
    { label: 'Won Deals', value: overview.wonLeads, icon: Trophy, color: 'emerald', trend: '+15%', up: true },
    { label: 'Lost Deals', value: overview.lostLeads, icon: XCircle, color: 'red', trend: '-3%', up: false },
    { label: 'Conversion', value: `${overview.conversionRate}%`, icon: TrendingUp, color: 'cyan', trend: '+2.1%', up: true },
    { label: 'Pipeline Value', value: `AED ${Number(overview.pipelineValue).toLocaleString()}`, icon: Banknote, color: 'amber', trend: '+22%', up: true },
  ];

  const colorMap: Record<string, { iconBg: string; iconText: string }> = {
    brand: { iconBg: 'bg-brand-100', iconText: 'text-brand-600' },
    indigo: { iconBg: 'bg-indigo-100', iconText: 'text-indigo-600' },
    emerald: { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
    red: { iconBg: 'bg-red-100', iconText: 'text-red-600' },
    cyan: { iconBg: 'bg-cyan-100', iconText: 'text-cyan-600' },
    amber: { iconBg: 'bg-amber-100', iconText: 'text-amber-600' },
  };

  // Calculate group-level totals from divisionBreakdown if available
  const divisionBreakdown = data.divisionBreakdown || [];
  const groupTotalLeads = divisionBreakdown.reduce((sum, d) => sum + d.totalLeads, 0);
  const groupTotalPipeline = divisionBreakdown.reduce((sum, d) => sum + d.pipelineValue, 0);
  const groupTotalWon = divisionBreakdown.reduce((sum, d) => sum + d.wonLeads, 0);
  const groupConversionRate = groupTotalLeads > 0
    ? Number(((groupTotalWon / groupTotalLeads) * 100).toFixed(1))
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {isSuperAdmin
              ? 'Group-wide overview across all divisions.'
              : "Here's what's happening with your leads today."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Division filter for SUPER_ADMIN */}
          {isSuperAdmin && divisions.length > 0 && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
              <select
                className="input py-2 pl-9 pr-8 text-xs w-auto bg-white appearance-none cursor-pointer"
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
              >
                <option value="all">All Divisions</option>
                {divisions.map((div) => (
                  <option key={div.id} value={div.id}>{div.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
            </div>
          )}
          <select className="input py-2 px-3 text-xs w-auto bg-white">
            <option>Last 30 days</option>
            <option>Last 7 days</option>
            <option>Last 90 days</option>
            <option>This year</option>
          </select>
        </div>
      </div>

      {/* ─── SUPER_ADMIN: Group Overview ───────────────────────────── */}
      {isSuperAdmin && divisionFilter === 'all' && divisionBreakdown.length > 0 && (
        <>
          {/* Group Overview KPI Cards */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-purple-600" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">Group Overview</h2>
              <span className="badge bg-purple-50 text-purple-700 ring-1 ring-purple-200 text-2xs">
                {divisionBreakdown.length} Divisions
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Leads (All Divisions)',
                  value: groupTotalLeads.toLocaleString(),
                  icon: Users,
                  iconBg: 'bg-brand-100',
                  iconText: 'text-brand-600',
                },
                {
                  label: 'Total Pipeline Value',
                  value: `AED ${groupTotalPipeline.toLocaleString()}`,
                  icon: Banknote,
                  iconBg: 'bg-amber-100',
                  iconText: 'text-amber-600',
                },
                {
                  label: 'Total Won (All Divisions)',
                  value: groupTotalWon.toLocaleString(),
                  icon: Trophy,
                  iconBg: 'bg-emerald-100',
                  iconText: 'text-emerald-600',
                },
                {
                  label: 'Overall Conversion Rate',
                  value: `${groupConversionRate}%`,
                  icon: TrendingUp,
                  iconBg: 'bg-cyan-100',
                  iconText: 'text-cyan-600',
                },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className={`card p-5 animate-fade-in-up stagger-${i + 1} hover:shadow-card-hover transition-all duration-200 border-l-4 border-l-purple-400`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-9 w-9 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                        <Icon className={`h-[18px] w-[18px] ${card.iconText}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-text-primary tracking-tight">{card.value}</p>
                    <p className="text-xs text-text-tertiary mt-0.5">{card.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Division Performance Comparison Table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-secondary">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-text-tertiary" />
                <h2 className="text-sm font-semibold text-text-primary">Division Performance</h2>
              </div>
              <span className="text-2xs text-text-tertiary">Comparing across all divisions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell text-left">Division</th>
                    <th className="table-cell text-right">Total Leads</th>
                    <th className="table-cell text-right hidden md:table-cell">New Leads</th>
                    <th className="table-cell text-right hidden md:table-cell">Won Leads</th>
                    <th className="table-cell text-right">Conversion Rate</th>
                    <th className="table-cell text-right">Pipeline Value (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {divisionBreakdown.map((div, idx) => {
                    const colorClass = divisionColors[idx % divisionColors.length];
                    return (
                      <tr key={div.divisionId} className="table-row hover:bg-surface-secondary transition-colors">
                        <td className="table-cell">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold ${colorClass}`}>
                              {div.divisionName.charAt(0)}
                            </span>
                            <button
                              onClick={() => setDivisionFilter(div.divisionId)}
                              className="text-sm font-medium text-text-primary hover:text-brand-600 transition-colors"
                            >
                              {div.divisionName}
                            </button>
                          </div>
                        </td>
                        <td className="table-cell text-right">
                          <span className="text-sm font-semibold text-text-primary">{div.totalLeads.toLocaleString()}</span>
                        </td>
                        <td className="table-cell text-right hidden md:table-cell">
                          <span className="text-sm text-text-secondary">{div.newLeads.toLocaleString()}</span>
                        </td>
                        <td className="table-cell text-right hidden md:table-cell">
                          <span className="text-sm text-emerald-600 font-medium">{div.wonLeads.toLocaleString()}</span>
                        </td>
                        <td className="table-cell text-right">
                          <span className={`text-sm font-medium ${div.conversionRate >= 20 ? 'text-emerald-600' : div.conversionRate >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                            {div.conversionRate}%
                          </span>
                        </td>
                        <td className="table-cell text-right">
                          <span className="text-sm font-semibold text-text-primary">
                            AED {Number(div.pipelineValue).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="bg-surface-secondary border-t-2 border-border">
                    <td className="table-cell">
                      <span className="text-sm font-bold text-text-primary">Total (Group)</span>
                    </td>
                    <td className="table-cell text-right">
                      <span className="text-sm font-bold text-text-primary">{groupTotalLeads.toLocaleString()}</span>
                    </td>
                    <td className="table-cell text-right hidden md:table-cell">
                      <span className="text-sm font-bold text-text-primary">
                        {divisionBreakdown.reduce((s, d) => s + d.newLeads, 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="table-cell text-right hidden md:table-cell">
                      <span className="text-sm font-bold text-emerald-600">{groupTotalWon.toLocaleString()}</span>
                    </td>
                    <td className="table-cell text-right">
                      <span className="text-sm font-bold text-text-primary">{groupConversionRate}%</span>
                    </td>
                    <td className="table-cell text-right">
                      <span className="text-sm font-bold text-text-primary">
                        AED {groupTotalPipeline.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── Division-filtered indicator ───────────────────────────── */}
      {isSuperAdmin && divisionFilter !== 'all' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-50 ring-1 ring-brand-200">
          <Building2 className="h-4 w-4 text-brand-600" />
          <span className="text-sm text-brand-700 font-medium">
            Viewing: {divisions.find(d => d.id === divisionFilter)?.name || 'Selected Division'}
          </span>
          <button
            onClick={() => setDivisionFilter('all')}
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors"
          >
            ← Back to Group Overview
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          const colors = colorMap[kpi.color];
          return (
            <div
              key={kpi.label}
              className={`card p-5 animate-fade-in-up stagger-${i + 1} group hover:shadow-card-hover transition-all duration-200`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`h-9 w-9 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
                  <Icon className={`h-[18px] w-[18px] ${colors.iconText}`} />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-medium ${kpi.up ? 'text-emerald-600' : 'text-red-600'}`}>
                  {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {kpi.trend}
                </div>
              </div>
              <p className="text-2xl font-bold text-text-primary tracking-tight count-up">{kpi.value}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-text-primary">Leads by Status</h2>
            <button className="btn-icon h-7 w-7"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            {data.leadsByStatus.map((item) => {
              const pct = overview.totalLeads > 0 ? (item.count / overview.totalLeads) * 100 : 0;
              const colors = statusColors[item.status] || { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-500' };
              return (
                <div key={item.status} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                      <span className="text-sm font-medium text-text-primary capitalize">
                        {item.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                      <span className="text-xs text-text-tertiary">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-smooth ${colors.dot}`}
                      style={{ width: `${pct}%`, '--progress-width': `${pct}%` } as any}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leads by Source */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-text-primary">Leads by Source</h2>
            <button className="btn-icon h-7 w-7"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            {data.leadsBySource.map((item) => {
              const pct = overview.totalLeads > 0 ? (item.count / overview.totalLeads) * 100 : 0;
              const barColor = sourceColors[item.source] || 'bg-gray-400';
              return (
                <div key={item.source} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${barColor}`} />
                      <span className="text-sm font-medium text-text-primary">
                        {sourceLabels[item.source] || item.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                      <span className="text-xs text-text-tertiary">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-smooth ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent leads & Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary">Recent Leads</h2>
            <Link href="/leads" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
              View all
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle">
            {data.recentLeads.map((lead: any) => {
              const colors = statusColors[lead.status] || { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-500' };
              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-3.5 px-6 py-3 hover:bg-surface-secondary transition-colors group"
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {lead.firstName[0]}{lead.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-700 transition-colors">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="text-xs text-text-tertiary truncate">
                      {lead.company || lead.email}
                    </p>
                  </div>
                  <span className={`badge ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}>
                    {lead.status.replace(/_/g, ' ')}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <ScoreRing score={lead.score} size={32} />
                  </div>
                </Link>
              );
            })}
            {data.recentLeads.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-text-tertiary">No recent leads</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary">Upcoming Tasks</h2>
            <Link href="/tasks" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
              View all
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle">
            {data.upcomingTasks.map((task: any) => {
              const priorityMap: Record<string, { dot: string; label: string }> = {
                URGENT: { dot: 'bg-red-500', label: 'Urgent' },
                HIGH: { dot: 'bg-orange-500', label: 'High' },
                MEDIUM: { dot: 'bg-blue-500', label: 'Medium' },
                LOW: { dot: 'bg-gray-400', label: 'Low' },
              };
              const priority = priorityMap[task.priority] || priorityMap.MEDIUM;
              const dueDate = new Date(task.dueAt);
              const isOverdue = dueDate < new Date();

              return (
                <div key={task.id} className="flex items-center gap-3.5 px-6 py-3 hover:bg-surface-secondary transition-colors">
                  <div className={`h-2.5 w-2.5 rounded-full ${priority.dot} flex-shrink-0 ring-2 ring-white`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                    <p className="text-xs text-text-tertiary truncate">
                      {task.lead ? `${task.lead.firstName} ${task.lead.lastName}` : 'No lead'} &middot; {task.type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Clock className={`h-3 w-3 ${isOverdue ? 'text-red-500' : 'text-text-tertiary'}`} />
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-text-secondary'}`}>
                      {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
            {data.upcomingTasks.length === 0 && (
              <div className="py-8 text-center">
                <Sparkles className="h-8 w-8 text-text-tertiary mx-auto mb-2 opacity-50" />
                <p className="text-sm text-text-tertiary">No upcoming tasks</p>
                <p className="text-xs text-text-tertiary mt-0.5">You&apos;re all caught up!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score, size = 32 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f1f3f9" strokeWidth={3} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-smooth"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-text-primary">
        {score}
      </span>
    </div>
  );
}
