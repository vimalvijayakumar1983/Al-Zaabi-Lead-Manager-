'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DashboardData } from '@/types';
import Link from 'next/link';

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-cyan-100 text-cyan-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

const sourceLabels: Record<string, string> = {
  WEBSITE_FORM: 'Website', LANDING_PAGE: 'Landing Page', WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook', GOOGLE_ADS: 'Google', MANUAL: 'Manual',
  CSV_IMPORT: 'CSV Import', API: 'API', REFERRAL: 'Referral',
  EMAIL: 'Email', PHONE: 'Phone', OTHER: 'Other',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  if (!data) return <p className="text-gray-500">Failed to load dashboard</p>;

  const { overview } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Your lead management overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard label="Total Leads" value={overview.totalLeads} color="brand" />
        <KpiCard label="New Leads" value={overview.newLeads} color="indigo" />
        <KpiCard label="Won" value={overview.wonLeads} color="green" />
        <KpiCard label="Lost" value={overview.lostLeads} color="red" />
        <KpiCard label="Conversion" value={`${overview.conversionRate}%`} color="cyan" />
        <KpiCard label="Pipeline Value" value={`$${Number(overview.pipelineValue).toLocaleString()}`} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Status */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Leads by Status</h2>
          <div className="space-y-3">
            {data.leadsByStatus.map((item) => {
              const pct = overview.totalLeads > 0 ? (item.count / overview.totalLeads) * 100 : 0;
              return (
                <div key={item.status} className="flex items-center gap-3">
                  <span className={`badge ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                    {item.status.replace('_', ' ')}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leads by Source */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Leads by Source</h2>
          <div className="space-y-3">
            {data.leadsBySource.map((item) => {
              const pct = overview.totalLeads > 0 ? (item.count / overview.totalLeads) * 100 : 0;
              return (
                <div key={item.source} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24 truncate">{sourceLabels[item.source] || item.source}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Leads</h2>
            <Link href="/leads" className="text-sm text-brand-600 hover:text-brand-700">View all</Link>
          </div>
          <div className="space-y-3">
            {data.recentLeads.map((lead: any) => (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-xs font-medium text-brand-700">
                  {lead.firstName[0]}{lead.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lead.firstName} {lead.lastName}</p>
                  <p className="text-xs text-gray-500">{lead.email}</p>
                </div>
                <span className={`badge ${statusColors[lead.status]}`}>{lead.status}</span>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{lead.score}</p>
                  <p className="text-xs text-gray-500">score</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Tasks</h2>
            <Link href="/tasks" className="text-sm text-brand-600 hover:text-brand-700">View all</Link>
          </div>
          <div className="space-y-3">
            {data.upcomingTasks.map((task: any) => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                <div className={`h-2 w-2 rounded-full ${task.priority === 'URGENT' ? 'bg-red-500' : task.priority === 'HIGH' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {task.lead ? `${task.lead.firstName} ${task.lead.lastName}` : 'No lead'} &middot; {task.type.replace('_', ' ')}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(task.dueAt).toLocaleDateString()}
                </span>
              </div>
            ))}
            {data.upcomingTasks.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No upcoming tasks</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 border-brand-200',
    indigo: 'bg-indigo-50 border-indigo-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    cyan: 'bg-cyan-50 border-cyan-200',
    amber: 'bg-amber-50 border-amber-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || 'bg-gray-50 border-gray-200'}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
