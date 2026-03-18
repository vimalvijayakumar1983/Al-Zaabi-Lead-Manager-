'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import type { Organization } from '@/types';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import {
  Users, UserPlus, Trophy, XCircle, TrendingUp, TrendingDown,
  Banknote, ArrowUpRight, ArrowDownRight, Calendar, Clock,
  MoreHorizontal, ChevronRight, Sparkles, Building2, BarChart3,
  ChevronDown, Target, Activity, AlertTriangle, Zap, Award,
  DollarSign, ArrowRight, Flame, CheckCircle2, CircleDot,
  Timer, FileText, Phone, Mail, Eye, Shield,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Types ──────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | '180d' | '365d';

interface DivisionStats {
  divisionId: string;
  divisionName: string;
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  conversionRate: number;
  pipelineValue: number;
}

interface DashboardFullData {
  kpis: {
    totalLeads: number;
    newLeads: number;
    newLeadsChange: number;
    wonLeads: number;
    wonLeadsChange: number;
    lostLeads: number;
    lostLeadsChange: number;
    pipelineValue: number;
    pipelineValueChange: number;
    conversionRate: number;
    conversionRateChange: number;
    wonRevenue: number;
    avgDealSize: number;
    totalWon: number;
    activities: number;
    activitiesChange: number;
    overdueTasks: number;
    slaAtRisk: number;
    slaBreached: number;
  };
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  recentLeads: any[];
  upcomingTasks: any[];
  trends: { date: string; total: number; won: number; lost: number; value: number }[];
  funnel: { name: string; color: string; order: number; count: number; value: number; conversionFromPrev: number; isWonStage?: boolean; isLostStage?: boolean }[];
  scoreDistribution: { label: string; total: number; won: number; conversionRate: number }[];
  teamLeaderboard: { id: string; name: string; avatar?: string; role: string; totalLeads: number; wonLeads: number; wonRevenue: number; conversionRate: number }[];
  recentActivities: any[];
  divisionBreakdown: DivisionStats[];
}

// ─── Constants ──────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: '180d', label: 'Last 6 months', days: 180 },
  { value: '365d', label: 'Last year', days: 365 },
];

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
  WEBSITE_FORM: 'Website', LIVE_CHAT: 'Live Chat', LANDING_PAGE: 'Landing Page', WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook', GOOGLE_ADS: 'Google', TIKTOK_ADS: 'TikTok',
  MANUAL: 'Manual', CSV_IMPORT: 'CSV Import', API: 'API', REFERRAL: 'Referral',
  EMAIL: 'Email', PHONE: 'Phone', OTHER: 'Other',
};

const SOURCE_CHART_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#64748b', '#84cc16', '#a855f7', '#e11d48',
];

const divisionColors = [
  'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700',
];

const activityIcons: Record<string, typeof Activity> = {
  STATUS_CHANGE: TrendingUp, STAGE_CHANGE: ArrowRight, NOTE_ADDED: FileText,
  EMAIL_SENT: Mail, CALL_MADE: Phone, LEAD_CREATED: UserPlus,
  LEAD_ASSIGNED: Users, SLA_ESCALATED: AlertTriangle,
};

// ─── Utility ────────────────────────────────────────────────────────

function fmt(n: number, type: 'number' | 'currency' | 'percent' = 'number') {
  if (type === 'currency') {
    if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `AED ${(n / 1_000).toFixed(1)}K`;
    return `AED ${n.toLocaleString()}`;
  }
  if (type === 'percent') return `${n}%`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fillDates(data: any[], days: number) {
  const map = new Map(data.map((d: any) => [d.date, d]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = d.toISOString().split('T')[0];
    result.push(map.get(s) || { date: s, total: 0, won: 0, lost: 0, value: 0 });
  }
  return result;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Components ─────────────────────────────────────────────────────

function ChangeIndicator({ change, size = 'sm' }: { change: number; size?: 'sm' | 'md' }) {
  if (change === 0) return <span className="text-text-tertiary text-xs">—</span>;
  const isUp = change > 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const color = isUp ? 'text-emerald-600' : 'text-red-600';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${color} ${textSize}`}>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {Math.abs(change)}%
    </span>
  );
}

function ScoreRing({ score, size = 32 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score || 0) / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f3f9" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-smooth" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-text-primary">{score || 0}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-secondary mb-1">
        {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-text-secondary capitalize">{p.dataKey}:</span>
          <span className="font-semibold text-text-primary">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-text-primary">{d.name}</p>
      <p className="text-xs text-text-secondary">{d.value} leads ({d.payload.pct}%)</p>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><div className="skeleton h-7 w-56 mb-2" /><div className="skeleton h-4 w-72" /></div>
        <div className="flex gap-2"><div className="skeleton h-9 w-32" /><div className="skeleton h-9 w-9" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {[...Array(8)].map((_, i) => <div key={i} className="card p-4"><div className="skeleton h-4 w-16 mb-2" /><div className="skeleton h-7 w-20 mb-1" /><div className="skeleton h-3 w-12" /></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6"><div className="skeleton h-5 w-32 mb-4" /><div className="skeleton h-52 w-full" /></div>
        <div className="card p-6"><div className="skeleton h-5 w-28 mb-4" /><div className="skeleton h-52 w-full" /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="card p-6"><div className="skeleton h-5 w-32 mb-4" /><div className="space-y-3">{[...Array(4)].map((_, j) => <div key={j} className="skeleton h-8 w-full" />)}</div></div>)}
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<DashboardFullData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Load divisions for SUPER_ADMIN
  useEffect(() => {
    if (isSuperAdmin) {
      api.getDivisions().then((divs) => setDivisions(divs || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  // Fetch consolidated dashboard data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const divId = divisionFilter !== 'all' ? divisionFilter : undefined;
      const d = await api.getDashboardFull(period, divId);
      if (d && typeof d === 'object' && d.kpis) {
        setData(d);
      } else {
        setError('Unexpected response format');
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period, divisionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time refresh
  useRealtimeSync(['lead', 'contact', 'task', 'deal', 'campaign'], () => {
    const divId = divisionFilter !== 'all' ? divisionFilter : undefined;
    api.getDashboardFull(period, divId).then((d) => {
      if (d?.kpis) setData(d);
    }).catch(() => {});
  });

  const periodDays = PERIODS.find((p) => p.value === period)?.days || 30;

  // Computed data
  const trendData = useMemo(() => {
    if (!data?.trends) return [];
    return fillDates(data.trends, periodDays);
  }, [data?.trends, periodDays]);

  const sourceChartData = useMemo(() => {
    if (!data?.leadsBySource) return [];
    const total = data.leadsBySource.reduce((s, x) => s + x.count, 0);
    return data.leadsBySource.map((s, i) => ({
      name: sourceLabels[s.source] || s.source,
      value: s.count,
      color: SOURCE_CHART_COLORS[i % SOURCE_CHART_COLORS.length],
      pct: total > 0 ? Math.round((s.count / total) * 100) : 0,
    }));
  }, [data?.leadsBySource]);

  if (loading) return <DashboardSkeleton />;

  if (!data) return (
    <div className="empty-state">
      <div className="empty-state-icon"><XCircle className="h-6 w-6" /></div>
      <p className="text-sm font-medium text-text-primary">{error || 'Failed to load dashboard'}</p>
      <p className="text-xs text-text-tertiary mt-1">Please try refreshing the page</p>
      <button onClick={() => window.location.reload()} className="mt-3 btn-primary text-sm">Refresh</button>
    </div>
  );

  const k = data.kpis;
  const leadsByStatus = data.leadsByStatus || [];
  const recentLeads = data.recentLeads || [];
  const upcomingTasks = data.upcomingTasks || [];
  const funnel = data.funnel || [];
  const scoreDistribution = data.scoreDistribution || [];
  const teamLeaderboard = data.teamLeaderboard || [];
  const recentActivities = data.recentActivities || [];
  const divisionBreakdown = data.divisionBreakdown || [];

  // Group overview stats
  const groupTotalLeads = divisionBreakdown.reduce((s, d) => s + (d.totalLeads || 0), 0);
  const groupTotalPipeline = divisionBreakdown.reduce((s, d) => s + (d.pipelineValue || 0), 0);
  const groupTotalWon = divisionBreakdown.reduce((s, d) => s + (d.wonLeads || 0), 0);
  const groupConvRate = groupTotalLeads > 0 ? Number(((groupTotalWon / groupTotalLeads) * 100).toFixed(1)) : 0;

  const kpiCards = [
    { label: 'Total Leads', value: fmt(k.totalLeads), icon: Users, color: 'brand', change: null },
    { label: 'New Leads', value: fmt(k.newLeads), icon: UserPlus, color: 'indigo', change: k.newLeadsChange },
    { label: 'Won Deals', value: fmt(k.wonLeads), icon: Trophy, color: 'emerald', change: k.wonLeadsChange },
    { label: 'Lost Deals', value: fmt(k.lostLeads), icon: XCircle, color: 'red', change: k.lostLeadsChange },
    { label: 'Conversion', value: `${k.conversionRate}%`, icon: Target, color: 'cyan', change: k.conversionRateChange },
    { label: 'Pipeline', value: fmt(k.pipelineValue, 'currency'), icon: Banknote, color: 'amber', change: k.pipelineValueChange },
    { label: 'Won Revenue', value: fmt(k.wonRevenue, 'currency'), icon: DollarSign, color: 'emerald', change: null },
    { label: 'Activities', value: fmt(k.activities), icon: Activity, color: 'purple', change: k.activitiesChange },
  ];

  const colorMap: Record<string, { iconBg: string; iconText: string }> = {
    brand: { iconBg: 'bg-brand-100', iconText: 'text-brand-600' },
    indigo: { iconBg: 'bg-indigo-100', iconText: 'text-indigo-600' },
    emerald: { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
    red: { iconBg: 'bg-red-100', iconText: 'text-red-600' },
    cyan: { iconBg: 'bg-cyan-100', iconText: 'text-cyan-600' },
    amber: { iconBg: 'bg-amber-100', iconText: 'text-amber-600' },
    purple: { iconBg: 'bg-purple-100', iconText: 'text-purple-600' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {getGreeting()}, {user?.firstName || 'there'}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {isSuperAdmin
              ? 'Group-wide overview across all divisions.'
              : "Here's what's happening with your leads today."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && divisions.length > 0 && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
              <select className="input py-2 pl-9 pr-8 text-xs w-auto bg-white appearance-none cursor-pointer"
                value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
                <option value="all">All Divisions</option>
                {divisions.map((div) => <option key={div.id} value={div.id}>{div.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <select className="input py-2 pl-9 pr-8 text-xs w-auto bg-white appearance-none cursor-pointer"
              value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          </div>
          <RefreshButton onRefresh={fetchData} />
        </div>
      </div>

      {/* ─── Alert Banners ──────────────────────────────────────────── */}
      {(k.overdueTasks > 0 || k.slaBreached > 0) && (
        <div className="flex flex-wrap gap-3">
          {k.overdueTasks > 0 && (
            <Link href="/tasks" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100 transition-colors group">
              <Timer className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">{k.overdueTasks} overdue task{k.overdueTasks !== 1 ? 's' : ''}</span>
              <ChevronRight className="h-3.5 w-3.5 text-amber-400 group-hover:text-amber-600 transition-colors" />
            </Link>
          )}
          {k.slaBreached > 0 && (
            <Link href="/leads?slaStatus=BREACHED" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 ring-1 ring-red-200 hover:bg-red-100 transition-colors group">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-800">{k.slaBreached} SLA breached</span>
              <ChevronRight className="h-3.5 w-3.5 text-red-400 group-hover:text-red-600 transition-colors" />
            </Link>
          )}
          {k.slaAtRisk > 0 && (
            <Link href="/leads?slaStatus=AT_RISK" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-50 ring-1 ring-orange-200 hover:bg-orange-100 transition-colors group">
              <Shield className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-800">{k.slaAtRisk} at risk</span>
              <ChevronRight className="h-3.5 w-3.5 text-orange-400 group-hover:text-orange-600 transition-colors" />
            </Link>
          )}
        </div>
      )}

      {/* ─── SUPER_ADMIN: Group Overview ────────────────────────────── */}
      {isSuperAdmin && divisionFilter === 'all' && divisionBreakdown.length > 0 && (
        <>
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
                { label: 'Total Leads (All)', value: groupTotalLeads.toLocaleString(), icon: Users, iconBg: 'bg-brand-100', iconText: 'text-brand-600' },
                { label: 'Total Pipeline', value: fmt(groupTotalPipeline, 'currency'), icon: Banknote, iconBg: 'bg-amber-100', iconText: 'text-amber-600' },
                { label: 'Total Won', value: groupTotalWon.toLocaleString(), icon: Trophy, iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
                { label: 'Conversion Rate', value: `${groupConvRate}%`, icon: TrendingUp, iconBg: 'bg-cyan-100', iconText: 'text-cyan-600' },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={card.label}
                    className={`card p-5 animate-fade-in-up stagger-${i + 1} hover:shadow-card-hover transition-all duration-200 border-l-4 border-l-purple-400`}>
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

          {/* Division Performance Table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-secondary">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-text-tertiary" />
                <h2 className="text-sm font-semibold text-text-primary">Division Performance</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell text-left">Division</th>
                    <th className="table-cell text-right">Total Leads</th>
                    <th className="table-cell text-right hidden md:table-cell">New Leads</th>
                    <th className="table-cell text-right hidden md:table-cell">Won Leads</th>
                    <th className="table-cell text-right">Conversion</th>
                    <th className="table-cell text-right">Pipeline (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {divisionBreakdown.map((div, idx) => (
                    <tr key={div.divisionId} className="table-row hover:bg-surface-secondary transition-colors">
                      <td className="table-cell">
                        <button onClick={() => setDivisionFilter(div.divisionId)}
                          className="flex items-center gap-2.5 text-sm font-medium text-text-primary hover:text-brand-600 transition-colors">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold ${divisionColors[idx % divisionColors.length]}`}>
                            {(div.divisionName || '?').charAt(0)}
                          </span>
                          {div.divisionName || 'Unknown'}
                        </button>
                      </td>
                      <td className="table-cell text-right font-semibold">{(div.totalLeads || 0).toLocaleString()}</td>
                      <td className="table-cell text-right hidden md:table-cell text-text-secondary">{(div.newLeads || 0).toLocaleString()}</td>
                      <td className="table-cell text-right hidden md:table-cell text-emerald-600 font-medium">{(div.wonLeads || 0).toLocaleString()}</td>
                      <td className="table-cell text-right">
                        <span className={`font-medium ${(div.conversionRate || 0) >= 20 ? 'text-emerald-600' : (div.conversionRate || 0) >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                          {div.conversionRate || 0}%
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold">AED {Number(div.pipelineValue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-secondary border-t-2 border-border">
                    <td className="table-cell font-bold">Total (Group)</td>
                    <td className="table-cell text-right font-bold">{groupTotalLeads.toLocaleString()}</td>
                    <td className="table-cell text-right hidden md:table-cell font-bold">{divisionBreakdown.reduce((s, d) => s + (d.newLeads || 0), 0).toLocaleString()}</td>
                    <td className="table-cell text-right hidden md:table-cell font-bold text-emerald-600">{groupTotalWon.toLocaleString()}</td>
                    <td className="table-cell text-right font-bold">{groupConvRate}%</td>
                    <td className="table-cell text-right font-bold">AED {groupTotalPipeline.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Division-filtered indicator */}
      {isSuperAdmin && divisionFilter !== 'all' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-50 ring-1 ring-brand-200">
          <Building2 className="h-4 w-4 text-brand-600" />
          <span className="text-sm text-brand-700 font-medium">
            Viewing: {divisions.find(d => d.id === divisionFilter)?.name || 'Selected Division'}
          </span>
          <button onClick={() => setDivisionFilter('all')}
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors">
            &larr; Back to Group Overview
          </button>
        </div>
      )}

      {/* ─── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          const colors = colorMap[kpi.color] || colorMap.brand;
          return (
            <div key={kpi.label}
              className={`card p-4 animate-fade-in-up stagger-${Math.min(i + 1, 6)} group hover:shadow-card-hover transition-all duration-200`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`h-8 w-8 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${colors.iconText}`} />
                </div>
                {kpi.change !== null && <ChangeIndicator change={kpi.change} />}
              </div>
              <p className="text-xl font-bold text-text-primary tracking-tight leading-none mb-0.5">{kpi.value}</p>
              <p className="text-2xs text-text-tertiary">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* ─── Charts Row: Trend + Source Donut ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Trend Area Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Lead Trends</h2>
              <p className="text-2xs text-text-tertiary mt-0.5">New, won, and lost leads over time</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-indigo-500" /><span className="text-2xs text-text-tertiary">New</span></div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-2xs text-text-tertiary">Won</span></div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-red-400" /><span className="text-2xs text-text-tertiary">Lost</span></div>
            </div>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  interval={Math.max(Math.floor(trendData.length / 7) - 1, 0)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#gradTotal)" />
                <Area type="monotone" dataKey="won" stroke="#10b981" strokeWidth={2} fill="url(#gradWon)" />
                <Area type="monotone" dataKey="lost" stroke="#f87171" strokeWidth={1.5} fill="none" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-text-tertiary">No trend data for this period</div>
          )}
        </div>

        {/* Source Distribution Donut */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Lead Sources</h2>
            <Link href="/analytics" className="text-2xs font-medium text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-0.5">
              Details <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {sourceChartData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sourceChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    paddingAngle={2} dataKey="value" stroke="none">
                    {sourceChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full mt-2 space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
                {sourceChartData.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="text-text-secondary">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">{s.value}</span>
                      <span className="text-text-tertiary w-8 text-right">{s.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-text-tertiary">No source data yet</div>
          )}
        </div>
      </div>

      {/* ─── Funnel + Score Distribution ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Conversion Funnel</h2>
              <p className="text-2xs text-text-tertiary mt-0.5">Pipeline stage progression</p>
            </div>
            <Link href="/pipeline" className="text-2xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-0.5">
              Pipeline <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {funnel.length > 0 ? (
            <div className="space-y-3">
              {funnel.filter(f => !f.isLostStage).map((stage, i) => {
                const maxCount = Math.max(...funnel.filter(f => !f.isLostStage).map(f => f.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={i} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded" style={{ backgroundColor: stage.color || '#6366f1' }} />
                        <span className="text-sm font-medium text-text-primary">{stage.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-text-primary">{stage.count}</span>
                        {i > 0 && stage.conversionFromPrev !== undefined && (
                          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ${
                            stage.conversionFromPrev >= 50 ? 'bg-emerald-50 text-emerald-700'
                              : stage.conversionFromPrev >= 25 ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {stage.conversionFromPrev}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 ease-smooth"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color || '#6366f1' }} />
                    </div>
                    {stage.value > 0 && (
                      <p className="text-2xs text-text-tertiary mt-0.5">{fmt(stage.value, 'currency')} pipeline value</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-text-tertiary">No pipeline stages configured</div>
          )}
        </div>

        {/* Lead Score Distribution */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Lead Quality</h2>
              <p className="text-2xs text-text-tertiary mt-0.5">Score distribution & win rate by bracket</p>
            </div>
            <div className="flex items-center gap-1.5 text-2xs text-text-tertiary">
              <Flame className="h-3 w-3" /> Avg deal: {fmt(k.avgDealSize, 'currency')}
            </div>
          </div>
          {scoreDistribution.some(b => b.total > 0) ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={scoreDistribution} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-lg text-xs">
                          <p className="font-semibold mb-1">Score {label}</p>
                          <p>Total: {payload[0]?.value}</p>
                          <p className="text-emerald-600">Won: {payload[1]?.value}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="won" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-2">
                {scoreDistribution.map((b) => (
                  <div key={b.label} className="text-center">
                    <p className="text-lg font-bold text-text-primary">{b.conversionRate}%</p>
                    <p className="text-2xs text-text-tertiary">Win rate</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-text-tertiary">No scored leads yet</div>
          )}
        </div>
      </div>

      {/* ─── Leads by Status + Team Leaderboard ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-text-primary">Leads by Status</h2>
            <Link href="/leads" className="text-2xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-0.5">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {leadsByStatus.length > 0 ? (
            <div className="space-y-3">
              {leadsByStatus.map((item) => {
                const pct = k.totalLeads > 0 ? (item.count / k.totalLeads) * 100 : 0;
                const colors = statusColors[item.status] || { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-500' };
                return (
                  <div key={item.status} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                        <span className="text-sm font-medium text-text-primary capitalize">{item.status.replace(/_/g, ' ').toLowerCase()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{item.count}</span>
                        <span className="text-xs text-text-tertiary">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ease-smooth ${colors.dot}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-text-tertiary">No lead data yet</div>
          )}
        </div>

        {/* Team Leaderboard */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-text-primary">Top Performers</h2>
            </div>
            <Link href="/team" className="text-2xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-0.5">
              Team <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {teamLeaderboard.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {teamLeaderboard.map((member, i) => {
                const medals = ['bg-amber-100 text-amber-700 ring-amber-200', 'bg-gray-100 text-gray-600 ring-gray-200', 'bg-orange-100 text-orange-700 ring-orange-200'];
                return (
                  <div key={member.id} className="flex items-center gap-3 px-6 py-3 hover:bg-surface-secondary transition-colors">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ring-1 ${i < 3 ? medals[i] : 'bg-surface-tertiary text-text-tertiary ring-border'}`}>
                      {i + 1}
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{member.name}</p>
                      <p className="text-2xs text-text-tertiary">{member.wonLeads} won &middot; {member.conversionRate}% rate</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-emerald-600">{fmt(member.wonRevenue, 'currency')}</p>
                      <p className="text-2xs text-text-tertiary">{member.totalLeads} leads</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center">
              <Users className="h-8 w-8 text-text-tertiary mx-auto mb-2 opacity-50" />
              <p className="text-sm text-text-tertiary">No team data available</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Recent Leads + Upcoming Tasks + Activity Feed ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Leads */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary">Recent Leads</h2>
            <Link href="/leads" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle">
            {recentLeads.slice(0, 6).map((lead: any) => {
              const colors = statusColors[lead.status] || statusColors.NEW;
              const initials = `${(lead.firstName || '?')[0]}${(lead.lastName || '?')[0]}`;
              return (
                <Link key={lead.id} href={`/leads/${lead.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-surface-secondary transition-colors group">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-700 transition-colors">
                      {lead.firstName || ''} {lead.lastName || ''}
                    </p>
                    <p className="text-2xs text-text-tertiary truncate">{lead.company || lead.email || 'No details'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`badge text-2xs ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}>
                      {(lead.status || 'NEW').replace(/_/g, ' ')}
                    </span>
                    <ScoreRing score={lead.score ?? 0} size={28} />
                  </div>
                </Link>
              );
            })}
            {recentLeads.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-text-tertiary">No recent leads</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">Upcoming Tasks</h2>
              {k.overdueTasks > 0 && (
                <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200 text-2xs">
                  {k.overdueTasks} overdue
                </span>
              )}
            </div>
            <Link href="/tasks" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle">
            {upcomingTasks.map((task: any) => {
              const priorityMap: Record<string, { dot: string }> = {
                URGENT: { dot: 'bg-red-500' }, HIGH: { dot: 'bg-orange-500' },
                MEDIUM: { dot: 'bg-blue-500' }, LOW: { dot: 'bg-gray-400' },
              };
              const priority = priorityMap[task.priority] || priorityMap.MEDIUM;
              const dueDate = task.dueAt ? new Date(task.dueAt) : null;
              const isOverdue = dueDate ? dueDate < new Date() : false;
              return (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-surface-secondary transition-colors">
                  <div className={`h-2.5 w-2.5 rounded-full ${priority.dot} flex-shrink-0 ring-2 ring-white`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{task.title || 'Untitled task'}</p>
                    <p className="text-2xs text-text-tertiary truncate">
                      {task.lead ? `${task.lead.firstName || ''} ${task.lead.lastName || ''}`.trim() : 'No lead'} &middot; {(task.type || 'TASK').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Clock className={`h-3 w-3 ${isOverdue ? 'text-red-500' : 'text-text-tertiary'}`} />
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-text-secondary'}`}>
                      {dueDate ? dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                    </span>
                  </div>
                </div>
              );
            })}
            {upcomingTasks.length === 0 && (
              <div className="py-8 text-center">
                <Sparkles className="h-8 w-8 text-text-tertiary mx-auto mb-2 opacity-50" />
                <p className="text-sm text-text-tertiary">No upcoming tasks</p>
                <p className="text-xs text-text-tertiary mt-0.5">You&apos;re all caught up!</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-text-primary">Recent Activity</h2>
            </div>
            <Link href="/analytics" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
              Analytics <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle max-h-[400px] overflow-y-auto scrollbar-thin">
            {recentActivities.map((act: any) => {
              const ActIcon = activityIcons[act.type] || Activity;
              return (
                <div key={act.id} className="flex gap-3 px-6 py-3 hover:bg-surface-secondary transition-colors">
                  <div className="h-7 w-7 rounded-lg bg-surface-tertiary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ActIcon className="h-3.5 w-3.5 text-text-tertiary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary leading-snug">
                      <span className="font-medium">{act.user ? `${act.user.firstName} ${act.user.lastName}` : 'System'}</span>
                      <span className="text-text-secondary"> {act.description?.toLowerCase() || act.type.replace(/_/g, ' ').toLowerCase()}</span>
                    </p>
                    {act.lead && (
                      <Link href={`/leads/${act.lead.id}`} className="text-2xs text-brand-600 hover:text-brand-700 font-medium">
                        {act.lead.firstName} {act.lead.lastName}
                      </Link>
                    )}
                    <p className="text-2xs text-text-tertiary mt-0.5">{timeAgo(act.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {recentActivities.length === 0 && (
              <div className="py-8 text-center">
                <Activity className="h-8 w-8 text-text-tertiary mx-auto mb-2 opacity-50" />
                <p className="text-sm text-text-tertiary">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Quick Actions Footer ───────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-thin pb-1">
          <span className="text-xs font-medium text-text-tertiary flex-shrink-0">Quick actions:</span>
          <Link href="/leads" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <Eye className="h-3.5 w-3.5" /> View Leads
          </Link>
          <Link href="/pipeline" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <BarChart3 className="h-3.5 w-3.5" /> Pipeline
          </Link>
          <Link href="/tasks" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Tasks
          </Link>
          <Link href="/analytics" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <TrendingUp className="h-3.5 w-3.5" /> Analytics
          </Link>
          <Link href="/campaigns" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <Target className="h-3.5 w-3.5" /> Campaigns
          </Link>
          <Link href="/import" className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
            <FileText className="h-3.5 w-3.5" /> Import
          </Link>
        </div>
      </div>
    </div>
  );
}
