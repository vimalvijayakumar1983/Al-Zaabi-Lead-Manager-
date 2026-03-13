'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  TrendingUp, TrendingDown, Minus, Users, Trophy, BarChart3, DollarSign,
  Target, Zap, Activity, ArrowUpRight, ArrowDownRight, RefreshCw,
  Download, ChevronDown, Star, AlertCircle, CheckCircle2, Clock, Flame,
  Globe, Mail, Phone, MessageSquare, Award, Filter,
} from 'lucide-react';

type Period = '7d' | '30d' | '90d' | '180d' | '365d';
type Tab = 'overview' | 'pipeline' | 'team' | 'sources' | 'activities';

// ─── Utility ─────────────────────────────────────────────────────

function fmt(n: number, type: 'number' | 'currency' | 'percent' = 'number') {
  if (type === 'currency') {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
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

function formatSource(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function sourceColor(s: string) {
  const map: Record<string, string> = {
    FACEBOOK_ADS: '#3b82f6', GOOGLE_ADS: '#ef4444', TIKTOK_ADS: '#8b5cf6',
    WHATSAPP: '#22c55e', EMAIL: '#f59e0b', PHONE: '#06b6d4',
    WEBSITE_FORM: '#6366f1', LANDING_PAGE: '#ec4899', REFERRAL: '#14b8a6',
    MANUAL: '#64748b', CSV_IMPORT: '#94a3b8', API: '#a78bfa', OTHER: '#9ca3af',
  };
  return map[s] || '#6366f1';
}

function roleLabel(r: string) {
  return r?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
}

// ─── SVG Line Chart ───────────────────────────────────────────────

function LineChart({ data, series, height = 220 }: {
  data: any[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  if (!data.length) return <div className="flex items-center justify-center h-40 text-sm text-text-tertiary">No data for this period</div>;

  const W = 800, H = height;
  const PAD = { top: 16, bottom: 28, left: 44, right: 12 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const allVals = data.flatMap(d => series.map(s => Number(d[s.key] || 0)));
  const maxV = Math.max(...allVals, 1);
  const xScale = (i: number) => PAD.left + (data.length < 2 ? cW / 2 : (i / (data.length - 1)) * cW);
  const yScale = (v: number) => PAD.top + cH - (v / maxV) * cH;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxV * p));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={s.key} id={`area-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid lines */}
      {gridVals.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {fmt(v)}
            </text>
          </g>
        );
      })}

      {/* Areas + lines */}
      {series.map((s, si) => {
        const pts = data.map((d, i) => `${xScale(i)},${yScale(Number(d[s.key] || 0))}`);
        const area = [
          `${xScale(0)},${PAD.top + cH}`,
          ...pts,
          `${xScale(data.length - 1)},${PAD.top + cH}`,
        ].join(' ');
        return (
          <g key={s.key}>
            <polygon points={area} fill={`url(#area-${si})`} />
            <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}

      {/* Dots on last point */}
      {series.map((s, si) => {
        const last = data[data.length - 1];
        if (!last) return null;
        const x = xScale(data.length - 1);
        const y = yScale(Number(last[s.key] || 0));
        return (
          <g key={`dot-${si}`}>
            <circle cx={x} cy={y} r="4" fill={s.color} />
            <circle cx={x} cy={y} r="7" fill={s.color} fillOpacity="0.15" />
          </g>
        );
      })}

      {/* X axis labels */}
      {data.map((d, i) => {
        const step = Math.max(1, Math.ceil(data.length / 8));
        if (i % step !== 0 && i !== data.length - 1) return null;
        const label = d.date?.slice(5) ?? '';
        return (
          <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────

function BarChart({ data, xKey, yKey, color, secondaryKey, secondaryColor, height = 160 }: {
  data: any[]; xKey: string; yKey: string; color: string;
  secondaryKey?: string; secondaryColor?: string; height?: number;
}) {
  if (!data.length) return <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">No data</div>;
  const maxVal = Math.max(...data.map(d => Number(d[yKey] || 0)), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (Number(d[yKey] || 0) / maxVal) * 90;
        const secPct = secondaryKey ? (Number(d[secondaryKey] || 0) / maxVal) * 90 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="w-full flex flex-col justify-end" style={{ height: height - 24 }}>
              {secondaryKey && (
                <div className="w-full rounded-t-sm mb-0.5 transition-all duration-500"
                  style={{ height: `${secPct}%`, backgroundColor: secondaryColor, minHeight: secPct > 0 ? 2 : 0 }} />
              )}
              <div className="w-full rounded-t-sm transition-all duration-700"
                style={{ height: `${pct}%`, backgroundColor: color, minHeight: pct > 0 ? 3 : 0 }} />
            </div>
            <span className="text-xs text-text-tertiary truncate w-full text-center">{d[xKey]}</span>
            <div className="tooltip absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap hidden group-hover:block z-20 pointer-events-none">
              {d[xKey]}: {fmt(Number(d[yKey] || 0))}
              {secondaryKey && ` • ${fmt(Number(d[secondaryKey] || 0))} won`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Activity Heatmap ─────────────────────────────────────────────

function ActivityHeatmap({ data, days }: { data: any[]; days: number }) {
  const map = new Map(data.map((d: any) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d: any) => d.count), 1);
  const cells: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = d.toISOString().split('T')[0];
    cells.push({ date: s, count: (map.get(s) as number) || 0 });
  }

  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-[3px] min-w-0">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, di) => {
              const intensity = cell.count === 0 ? 0 : 0.15 + (cell.count / maxCount) * 0.85;
              return (
                <div key={di} title={`${cell.date}: ${cell.count} activities`}
                  className="w-3 h-3 rounded-[2px] cursor-default transition-transform hover:scale-125"
                  style={{ backgroundColor: cell.count === 0 ? '#f1f5f9' : `rgba(99,102,241,${intensity})` }} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-text-tertiary">Less</span>
        {[0, 0.2, 0.45, 0.7, 1].map((v, i) => (
          <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: v === 0 ? '#f1f5f9' : `rgba(99,102,241,${0.15 + v * 0.85})` }} />
        ))}
        <span className="text-xs text-text-tertiary">More</span>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────

function KpiCard({ title, value, change, format = 'number', icon: Icon, iconBg, iconColor, subtitle }: {
  title: string; value: number; change?: number; format?: 'number' | 'currency' | 'percent';
  icon: any; iconBg: string; iconColor: string; subtitle?: string;
}) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === undefined || change === 0;

  return (
    <div className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            isPositive ? 'bg-emerald-50 text-emerald-700' :
            isNegative ? 'bg-red-50 text-red-600' :
            'bg-gray-50 text-gray-500'
          }`}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> :
             isNegative ? <ArrowDownRight className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary tabular-nums tracking-tight">
          {fmt(value, format)}
        </p>
        <p className="text-sm text-text-secondary mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────

function DonutChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="flex items-center justify-center h-24 text-xs text-text-tertiary">No data</div>;

  const R = 40, cx = 56, cy = 56, stroke = 22;
  const circ = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circ;
          const gap = circ - dash;
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none"
              stroke={colors[i % colors.length]} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circ}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += pct;
          return seg;
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="600" fill="#1e293b">
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-xs text-text-secondary">{d.label}</span>
            <span className="text-xs font-semibold text-text-primary tabular-nums ml-auto pl-2">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funnel Visualization ─────────────────────────────────────────

function FunnelViz({ stages }: { stages: any[] }) {
  if (!stages.length) return <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No pipeline data</p></div>;
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.count / maxCount) * 100, 8);
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium text-text-primary">{stage.name}</span>
                {i > 0 && stage.conversionFromPrev !== undefined && (
                  <span className="text-xs text-text-tertiary">← {stage.conversionFromPrev}% from prev</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-right">
                {stage.value > 0 && (
                  <span className="text-xs text-text-tertiary">{fmt(stage.value, 'currency')}</span>
                )}
                <span className="text-sm font-bold text-text-primary tabular-nums w-8">{stage.count}</span>
              </div>
            </div>
            <div className="h-7 bg-surface-tertiary rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg flex items-center px-2 transition-all duration-700 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: stage.color + '33', borderLeft: `3px solid ${stage.color}` }}
              >
                {widthPct > 15 && (
                  <span className="text-xs font-semibold" style={{ color: stage.color }}>{stage.count}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '6 months' },
  { value: '365d', label: '1 year' },
];

const TABS: { value: Tab; label: string; icon: any }[] = [
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'pipeline', label: 'Pipeline', icon: TrendingUp },
  { value: 'team', label: 'Team', icon: Users },
  { value: 'sources', label: 'Sources & Campaigns', icon: Target },
  { value: 'activities', label: 'Activities', icon: Activity },
];

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = (user as any)?.role === 'SUPER_ADMIN';

  const [period, setPeriod] = useState<Period>('30d');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  // Data
  const [overview, setOverview] = useState<any>(null);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activities, setActivities] = useState<any>(null);
  const [scoreDistrib, setScoreDistrib] = useState<any[]>([]);
  const [divisionComp, setDivisionComp] = useState<any[]>([]);

  const periodRef = useRef(period);
  periodRef.current = period;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const p = periodRef.current;
      const [ov, fn, tr, tm, src, cam, act, sd] = await Promise.allSettled([
        api.getAnalyticsOverview(p),
        api.getFunnel(),
        api.getTrends(p),
        api.getTeamPerformance(),
        api.getSourcePerformance(p),
        api.getCampaignPerformance(),
        api.getActivitiesAnalytics(p),
        api.getScoreDistribution(),
      ]);

      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (fn.status === 'fulfilled') setFunnel(Array.isArray(fn.value) ? fn.value : []);
      if (tr.status === 'fulfilled') setTrends(Array.isArray(tr.value) ? tr.value : []);
      if (tm.status === 'fulfilled') setTeam(Array.isArray(tm.value) ? tm.value : []);
      if (src.status === 'fulfilled') setSources(Array.isArray(src.value) ? src.value : []);
      if (cam.status === 'fulfilled') setCampaigns(Array.isArray(cam.value) ? cam.value : []);
      if (act.status === 'fulfilled') setActivities(act.value);
      if (sd.status === 'fulfilled') setScoreDistrib(Array.isArray(sd.value) ? sd.value : []);

      if (isSuperAdmin) {
        api.getDivisionComparison().then(d => setDivisionComp(Array.isArray(d) ? d : [])).catch(() => {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { fetchData(); }, [period, fetchData]);

  const days = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }[period];
  const filledTrends = trends.length ? fillDates(trends, days) : [];
  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? '';

  // ── Loading Skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div><div className="skeleton h-7 w-36 mb-2" /><div className="skeleton h-4 w-56" /></div>
          <div className="flex gap-2"><div className="skeleton h-9 w-28" /><div className="skeleton h-9 w-24" /></div>
        </div>
        <div className="flex gap-1 border-b border-border-subtle pb-0"><div className="skeleton h-9 w-24 mr-1" /><div className="skeleton h-9 w-24 mr-1" /><div className="skeleton h-9 w-24" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-9 w-9 mb-3" /><div className="skeleton h-7 w-20 mb-1" /><div className="skeleton h-4 w-28" /></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-5"><div className="skeleton h-5 w-32 mb-5" /><div className="skeleton h-52 w-full" /></div>
          <div className="card p-5"><div className="skeleton h-5 w-28 mb-5" />{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10 w-full mb-2" />)}</div>
        </div>
      </div>
    );
  }

  // ── Overview Tab ──────────────────────────────────────────────────
  const OverviewTab = () => (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="New Leads" value={overview?.newLeads?.value ?? 0}
          change={overview?.newLeads?.change} icon={TrendingUp}
          iconBg="bg-brand-50" iconColor="text-brand-600"
          subtitle={`In last ${periodLabel}`} />
        <KpiCard title="Deals Won" value={overview?.wonLeads?.value ?? 0}
          change={overview?.wonLeads?.change} icon={Trophy}
          iconBg="bg-emerald-50" iconColor="text-emerald-600"
          subtitle={`In last ${periodLabel}`} />
        <KpiCard title="Pipeline Value" value={overview?.pipelineValue?.value ?? 0}
          change={overview?.pipelineValue?.change} format="currency" icon={DollarSign}
          iconBg="bg-amber-50" iconColor="text-amber-600"
          subtitle="Active pipeline" />
        <KpiCard title="Conversion Rate" value={overview?.conversionRate?.value ?? 0}
          change={overview?.conversionRate?.change} format="percent" icon={Target}
          iconBg="bg-purple-50" iconColor="text-purple-600"
          subtitle={`In last ${periodLabel}`} />
        <KpiCard title="Won Revenue" value={overview?.wonRevenue?.value ?? 0}
          format="currency" icon={Star}
          iconBg="bg-rose-50" iconColor="text-rose-500"
          subtitle="All-time won deals" />
        <KpiCard title="Avg Deal Size" value={overview?.avgDealSize?.value ?? 0}
          format="currency" icon={Award}
          iconBg="bg-cyan-50" iconColor="text-cyan-600"
          subtitle="From closed deals" />
        <KpiCard title="Activities" value={overview?.activities?.value ?? 0}
          change={overview?.activities?.change} icon={Zap}
          iconBg="bg-violet-50" iconColor="text-violet-600"
          subtitle={`In last ${periodLabel}`} />
        <KpiCard title="Overdue Tasks" value={overview?.overdueTasks?.value ?? 0}
          icon={AlertCircle}
          iconBg="bg-red-50" iconColor="text-red-500"
          subtitle="Need attention" />
      </div>

      {/* Trends + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Lead Trends</h2>
              <p className="text-xs text-text-tertiary mt-0.5">Created vs Won — last {periodLabel}</p>
            </div>
            <div className="flex items-center gap-3">
              {[{ color: '#6366f1', label: 'Created' }, { color: '#10b981', label: 'Won' }, { color: '#f43f5e', label: 'Lost' }].map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-text-tertiary">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <LineChart
            data={filledTrends}
            series={[
              { key: 'total', label: 'Created', color: '#6366f1' },
              { key: 'won', label: 'Won', color: '#10b981' },
              { key: 'lost', label: 'Lost', color: '#f43f5e' },
            ]}
            height={220}
          />
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Pipeline Funnel</h2>
              <p className="text-xs text-text-tertiary mt-0.5">Stage breakdown</p>
            </div>
          </div>
          <FunnelViz stages={funnel} />
        </div>
      </div>

      {/* Lead Status Donut + Score Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Lead Status Breakdown</h2>
          {overview?.totalLeads?.value > 0 ? (
            <DonutChart
              data={[
                { label: 'New', value: overview?.newLeads?.value ?? 0 },
                { label: 'Won', value: overview?.wonLeads?.value ?? 0 },
                { label: 'Lost', value: overview?.lostLeads?.value ?? 0 },
              ].filter(d => d.value > 0)}
              colors={['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4']}
            />
          ) : (
            <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No lead data available</p></div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Lead Score Distribution</h2>
          <p className="text-xs text-text-tertiary mb-4">Quality distribution of all leads</p>
          {scoreDistrib.some(b => b.total > 0) ? (
            <BarChart
              data={scoreDistrib}
              xKey="label" yKey="total"
              color="#6366f1" secondaryKey="won" secondaryColor="#10b981"
              height={160}
            />
          ) : (
            <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No scored leads yet</p></div>
          )}
          {scoreDistrib.some(b => b.total > 0) && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-brand-500" /><span className="text-xs text-text-tertiary">Total</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-xs text-text-tertiary">Won</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Division Comparison (Super Admin) */}
      {isSuperAdmin && divisionComp.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Division Comparison</h2>
              <p className="text-xs text-text-tertiary mt-0.5">Performance across all divisions</p>
            </div>
            <Globe className="h-4 w-4 text-text-tertiary" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  {['Division', 'Team', 'Total Leads', 'Active', 'Won', 'Lost', 'Conversion', 'Pipeline Value', 'Per User'].map(h => (
                    <th key={h} className="table-header px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {divisionComp.map((div: any, i) => (
                  <tr key={div.id} className="table-row">
                    <td className="table-cell px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
                          {i + 1}
                        </div>
                        <span className="text-sm font-medium text-text-primary">{div.name}</span>
                      </div>
                    </td>
                    <td className="table-cell px-4"><span className="text-sm text-text-secondary">{div.userCount}</span></td>
                    <td className="table-cell px-4"><span className="text-sm font-semibold tabular-nums">{div.total}</span></td>
                    <td className="table-cell px-4"><span className="text-sm text-brand-600 tabular-nums">{div.active}</span></td>
                    <td className="table-cell px-4"><span className="text-sm text-emerald-600 font-semibold tabular-nums">{div.won}</span></td>
                    <td className="table-cell px-4"><span className="text-sm text-red-500 tabular-nums">{div.lost}</span></td>
                    <td className="table-cell px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${div.conversionRate}%` }} />
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{div.conversionRate}%</span>
                      </div>
                    </td>
                    <td className="table-cell px-4"><span className="text-sm font-semibold text-amber-600 tabular-nums">{fmt(div.pipelineValue, 'currency')}</span></td>
                    <td className="table-cell px-4"><span className="text-sm text-text-secondary tabular-nums">{div.leadsPerUser}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ── Pipeline Tab ──────────────────────────────────────────────────
  const PipelineTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-brand-600" /></div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Pipeline Stages</h2>
              <p className="text-xs text-text-tertiary">Lead count & value per stage</p>
            </div>
          </div>
          <FunnelViz stages={funnel} />
          {funnel.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-text-primary tabular-nums">{funnel.reduce((s, f) => s + f.count, 0)}</p>
                <p className="text-xs text-text-tertiary">Total Leads</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600 tabular-nums">
                  {fmt(funnel.reduce((s, f) => s + (f.value || 0), 0), 'currency')}
                </p>
                <p className="text-xs text-text-tertiary">Total Value</p>
              </div>
              <div>
                <p className="text-lg font-bold text-brand-600 tabular-nums">
                  {funnel.length > 1 ? `${funnel[funnel.length - 1].conversionFromPrev ?? 0}%` : '—'}
                </p>
                <p className="text-xs text-text-tertiary">Final Conv.</p>
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center"><Star className="h-4 w-4 text-violet-600" /></div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Lead Score Distribution</h2>
              <p className="text-xs text-text-tertiary">Quality & win rate by score bucket</p>
            </div>
          </div>
          {scoreDistrib.some(b => b.total > 0) ? (
            <>
              <BarChart data={scoreDistrib} xKey="label" yKey="total" color="#8b5cf6"
                secondaryKey="won" secondaryColor="#10b981" height={160} />
              <div className="mt-4 space-y-2">
                {scoreDistrib.filter(b => b.total > 0).map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary w-14">{b.label}</span>
                    <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${b.conversionRate}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-text-primary w-10 text-right">{b.conversionRate}% win</span>
                    <span className="text-xs text-text-tertiary w-12 text-right">{b.total} leads</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state py-8"><p className="text-sm text-text-tertiary">No scored leads yet</p></div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-8 w-8 rounded-lg bg-cyan-50 flex items-center justify-center"><BarChart3 className="h-4 w-4 text-cyan-600" /></div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Revenue Trend</h2>
            <p className="text-xs text-text-tertiary">Won deal value over time — last {periodLabel}</p>
          </div>
        </div>
        <LineChart
          data={filledTrends}
          series={[{ key: 'value', label: 'Won Revenue', color: '#10b981' }]}
          height={200}
        />
      </div>
    </div>
  );

  // ── Team Tab ──────────────────────────────────────────────────────
  const TeamTab = () => (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Team Leaderboard</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Ranked by won revenue</p>
          </div>
          <Trophy className="h-4 w-4 text-amber-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {['#', 'Sales Rep', 'Active', 'Total', 'Won', 'Lost', 'Conversion', 'Won Revenue', 'Avg Deal', 'Tasks ✓'].map(h => (
                  <th key={h} className="table-header px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-sm text-text-tertiary">No team data available</td></tr>
              ) : team.map((m: any, i: number) => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell px-4 w-8">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-gray-100 text-gray-600' :
                      i === 2 ? 'bg-orange-100 text-orange-600' : 'text-text-tertiary'
                    }`}>{i + 1}</div>
                  </td>
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white shadow-xs flex-shrink-0">
                        {m.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{m.name}</p>
                        <p className="text-2xs text-text-tertiary">{roleLabel(m.role)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell px-4"><span className="text-sm text-brand-600 font-semibold tabular-nums">{m.activeLeads}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-text-primary tabular-nums">{m.totalLeads}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-emerald-600 font-semibold tabular-nums">{m.wonLeads}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-red-500 tabular-nums">{m.lostLeads}</span></td>
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(m.conversionRate, 100)}%` }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{m.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="table-cell px-4">
                    <span className={`text-sm font-bold tabular-nums ${m.wonRevenue > 0 ? 'text-emerald-700' : 'text-text-tertiary'}`}>
                      {fmt(m.wonRevenue, 'currency')}
                    </span>
                  </td>
                  <td className="table-cell px-4"><span className="text-sm text-text-secondary tabular-nums">{fmt(m.avgDealSize, 'currency')}</span></td>
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${m.taskCompletionRate}%` }} />
                      </div>
                      <span className="text-xs text-text-secondary tabular-nums">{m.taskCompletionRate}%</span>
                      {m.overdueTasks > 0 && (
                        <span className="ml-1 text-xs text-red-500 font-medium">({m.overdueTasks} overdue)</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Stats */}
      {activities?.taskStats?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { status: 'COMPLETED', label: 'Completed', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { status: 'IN_PROGRESS', label: 'In Progress', icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50' },
            { status: 'PENDING', label: 'Pending', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { status: 'CANCELLED', label: 'Cancelled', icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
          ].map(({ status, label, icon: Icon, color, bg }) => {
            const stat = activities.taskStats.find((t: any) => t.status === status);
            return (
              <div key={status} className="card p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <p className="text-xl font-bold text-text-primary tabular-nums">{stat?.count ?? 0}</p>
                  <p className="text-xs text-text-secondary">{label} Tasks</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Sources & Campaigns Tab ────────────────────────────────────────
  const SourcesTab = () => (
    <div className="space-y-6">
      {/* Source Performance */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">Lead Source Attribution</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Where your leads come from and how they convert</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Source', 'Volume', 'In Progress', 'Won', 'Lost', 'Conversion', 'Won Revenue', 'Avg Deal', `Last ${periodLabel}`].map(h => (
                  <th key={h} className="table-header px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-sm text-text-tertiary">No source data available</td></tr>
              ) : sources.map((s: any) => (
                <tr key={s.source} className="table-row">
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sourceColor(s.source) }} />
                      <span className="text-sm font-medium text-text-primary whitespace-nowrap">{formatSource(s.source)}</span>
                    </div>
                  </td>
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.total / Math.max(...sources.map((x: any) => x.total), 1)) * 100}%`, backgroundColor: sourceColor(s.source) }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{s.total}</span>
                    </div>
                  </td>
                  <td className="table-cell px-4"><span className="text-sm text-brand-600 tabular-nums">{s.inProgress}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-emerald-600 font-semibold tabular-nums">{s.won}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-red-500 tabular-nums">{s.lost}</span></td>
                  <td className="table-cell px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${s.conversionRate}%` }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{s.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="table-cell px-4"><span className="text-sm font-semibold text-emerald-700 tabular-nums">{fmt(s.wonRevenue, 'currency')}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-text-secondary tabular-nums">{fmt(s.avgDealSize, 'currency')}</span></td>
                  <td className="table-cell px-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.recentCount > 0 ? 'bg-brand-50 text-brand-600' : 'text-text-tertiary'}`}>
                      {s.recentCount > 0 && <Flame className="h-2.5 w-2.5" />}
                      {s.recentCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Campaign ROI</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Budget, leads, conversion and return on investment</p>
          </div>
          <span className="text-xs text-text-tertiary">{campaigns.length} campaigns</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Campaign', 'Type', 'Status', 'Budget', 'Leads', 'Won', 'Conv.', 'Won Revenue', 'CPL', 'ROI'].map(h => (
                  <th key={h} className="table-header px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-sm text-text-tertiary">No campaigns yet</td></tr>
              ) : campaigns.map((c: any) => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell px-4">
                    <span className="text-sm font-medium text-text-primary">{c.name}</span>
                  </td>
                  <td className="table-cell px-4">
                    <span className="text-xs text-text-secondary">{formatSource(c.type)}</span>
                  </td>
                  <td className="table-cell px-4">
                    <span className={`badge ${
                      c.status === 'ACTIVE' ? 'badge-success' :
                      c.status === 'DRAFT' ? 'badge-gray' :
                      c.status === 'PAUSED' ? 'badge-warning' : 'badge-gray'
                    }`}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</span>
                  </td>
                  <td className="table-cell px-4"><span className="text-sm tabular-nums">{fmt(c.budget, 'currency')}</span></td>
                  <td className="table-cell px-4"><span className="text-sm font-semibold tabular-nums">{c.leadsCount}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-emerald-600 font-semibold tabular-nums">{c.wonLeads}</span></td>
                  <td className="table-cell px-4"><span className="text-sm tabular-nums">{c.conversionRate}%</span></td>
                  <td className="table-cell px-4"><span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(c.wonRevenue, 'currency')}</span></td>
                  <td className="table-cell px-4"><span className="text-sm text-text-secondary tabular-nums">{c.cpl > 0 ? fmt(c.cpl, 'currency') : '—'}</span></td>
                  <td className="table-cell px-4">
                    {c.roi !== 0 ? (
                      <span className={`text-sm font-bold tabular-nums ${c.roi > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {c.roi > 0 ? '+' : ''}{c.roi}%
                      </span>
                    ) : <span className="text-sm text-text-tertiary">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Activities Tab ────────────────────────────────────────────────
  const ActivitiesTab = () => {
    const totalActivities = activities?.totalActivities ?? 0;
    const byType = activities?.byType ?? [];
    const heatmap = activities?.heatmap ?? [];
    const commStats = activities?.communicationStats ?? [];
    const maxType = Math.max(...byType.map((t: any) => t.count), 1);

    const activityIcons: Record<string, any> = {
      CALL_MADE: Phone, CALL_RECEIVED: Phone, EMAIL_SENT: Mail, EMAIL_RECEIVED: Mail,
      WHATSAPP_SENT: MessageSquare, WHATSAPP_RECEIVED: MessageSquare,
      NOTE_ADDED: Activity, TASK_CREATED: CheckCircle2, TASK_COMPLETED: CheckCircle2,
      STATUS_CHANGE: TrendingUp, STAGE_CHANGE: TrendingUp,
      ASSIGNMENT_CHANGED: Users, MEETING_SCHEDULED: Clock,
    };

    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-text-primary tabular-nums">{fmt(totalActivities)}</p>
            <p className="text-xs text-text-secondary mt-1">Total Activities</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-600 tabular-nums">
              {fmt(byType.filter((t: any) => t.type.includes('CALL')).reduce((s: number, t: any) => s + t.count, 0))}
            </p>
            <p className="text-xs text-text-secondary mt-1">Calls Made/Received</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">
              {fmt(byType.filter((t: any) => t.type.includes('EMAIL')).reduce((s: number, t: any) => s + t.count, 0))}
            </p>
            <p className="text-xs text-text-secondary mt-1">Emails Sent/Received</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-violet-600 tabular-nums">
              {fmt(byType.filter((t: any) => t.type.includes('WHATSAPP')).reduce((s: number, t: any) => s + t.count, 0))}
            </p>
            <p className="text-xs text-text-secondary mt-1">WhatsApp Messages</p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center"><Activity className="h-4 w-4 text-violet-600" /></div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Activity Heatmap</h2>
              <p className="text-xs text-text-tertiary">Daily activity volume — last {periodLabel}</p>
            </div>
          </div>
          {heatmap.length > 0 ? (
            <ActivityHeatmap data={heatmap} days={days} />
          ) : (
            <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No activity data for this period</p></div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Activity by Type */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Activity Breakdown</h2>
            {byType.length === 0 ? (
              <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No activities recorded</p></div>
            ) : (
              <div className="space-y-2.5">
                {byType.slice(0, 10).map((t: any) => {
                  const Icon = activityIcons[t.type] || Activity;
                  const pct = (t.count / maxType) * 100;
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded flex items-center justify-center bg-surface-secondary flex-shrink-0">
                        <Icon className="h-3 w-3 text-text-tertiary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-text-secondary truncate">
                            {t.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </span>
                          <span className="text-xs font-semibold text-text-primary ml-2 tabular-nums">{t.count}</span>
                        </div>
                        <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Communication Channels */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Communication Channels</h2>
            {commStats.length === 0 ? (
              <div className="empty-state py-6"><p className="text-sm text-text-tertiary">No communications logged</p></div>
            ) : (
              <>
                <DonutChart
                  data={commStats.map((c: any) => ({ label: c.channel, value: c.count }))}
                  colors={['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6']}
                />
                <div className="mt-4 space-y-2">
                  {commStats.map((c: any) => {
                    const total = commStats.reduce((s: number, x: any) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                    return (
                      <div key={c.channel} className="flex items-center gap-2 text-xs">
                        <span className="text-text-secondary w-20">{c.channel}</span>
                        <div className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-text-primary font-semibold w-8 text-right tabular-nums">{c.count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Analytics</h1>
          <p className="text-sm text-text-secondary mt-0.5">Deep insights across your entire lead management operation</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Period selector */}
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(v => !v)}
              className="btn-secondary flex items-center gap-2 text-sm h-9 px-3"
            >
              <span className="text-xs text-text-tertiary">Period:</span>
              <span className="font-medium">{periodLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 top-10 bg-white border border-border-subtle rounded-xl shadow-lg z-30 py-1 min-w-[130px]">
                {PERIODS.map(p => (
                  <button key={p.value}
                    onClick={() => { setPeriod(p.value); setPeriodOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-secondary transition-colors ${period === p.value ? 'text-brand-600 font-semibold bg-brand-50' : 'text-text-primary'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="btn-secondary h-9 w-9 flex items-center justify-center p-0">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-brand-500' : 'text-text-secondary'}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.value
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'pipeline' && <PipelineTab />}
      {activeTab === 'team' && <TeamTab />}
      {activeTab === 'sources' && <SourcesTab />}
      {activeTab === 'activities' && <ActivitiesTab />}
    </div>
  );
}
