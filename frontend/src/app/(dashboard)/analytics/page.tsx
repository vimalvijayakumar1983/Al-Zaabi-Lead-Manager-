'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TrendingUp, Users, Trophy, BarChart3 } from 'lucide-react';

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<{ name: string; color: string; count: number }[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getFunnel(),
      api.getTeamPerformance(),
      api.getTrends(),
    ]).then(([f, t, tr]) => {
      setFunnel(f);
      setTeam(t);
      setTrends(tr);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div><div className="skeleton h-8 w-32 mb-2" /><div className="skeleton h-4 w-48" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6"><div className="skeleton h-5 w-40 mb-6" /><div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></div>
          <div className="card p-6"><div className="skeleton h-5 w-40 mb-6" /><div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-12 w-full" />)}</div></div>
        </div>
        <div className="card p-6"><div className="skeleton h-5 w-48 mb-6" /><div className="skeleton h-48 w-full" /></div>
      </div>
    );
  }

  const maxFunnelCount = Math.max(...funnel.map((s) => s.count), 1);
  const maxTrendTotal = Math.max(...trends.map((t: any) => t.total), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Analytics</h1>
        <p className="text-text-secondary text-sm mt-0.5">Insights and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-brand-600" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">Conversion Funnel</h2>
          </div>
          <div className="space-y-3">
            {funnel.map((stage, i) => {
              const widthPct = (stage.count / maxFunnelCount) * 100;
              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">{stage.name}</span>
                    <span className="text-sm font-semibold text-text-primary tabular-nums">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-smooth"
                      style={{ width: `${Math.max(widthPct, 4)}%`, backgroundColor: stage.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team Performance */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">Team Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="table-header px-6 py-3 text-left">Name</th>
                  <th className="table-header px-4 py-3 text-left">Total</th>
                  <th className="table-header px-4 py-3 text-left">Won</th>
                  <th className="table-header px-4 py-3 text-left">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member: any) => (
                  <tr key={member.id} className="table-row">
                    <td className="table-cell px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white shadow-xs">
                          {member.name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{member.name}</p>
                          <p className="text-2xs text-text-tertiary capitalize">{member.role?.toLowerCase().replace('_', ' ')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell px-4">
                      <span className="text-sm font-semibold text-text-primary tabular-nums">{member.totalLeads}</span>
                    </td>
                    <td className="table-cell px-4">
                      <span className="text-sm font-semibold text-emerald-600 tabular-nums">{member.wonLeads}</span>
                    </td>
                    <td className="table-cell px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${member.conversionRate}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-text-primary tabular-nums">{member.conversionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {team.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-text-tertiary">No team data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Lead Trends */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-lg bg-cyan-100 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Lead Trends</h2>
            <p className="text-2xs text-text-tertiary">Last 30 days</p>
          </div>
        </div>
        {trends.length === 0 ? (
          <div className="empty-state py-8">
            <div className="empty-state-icon"><BarChart3 className="h-6 w-6" /></div>
            <p className="text-sm text-text-tertiary">No data for the last 30 days</p>
          </div>
        ) : (
          <div className="flex items-end gap-[3px] h-48">
            {trends.map((day: any, i: number) => {
              const height = (day.total / maxTrendTotal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-brand-500 rounded-t-sm hover:bg-brand-600 transition-colors cursor-pointer"
                    style={{ height: `${Math.max(height, 3)}%` }}
                  />
                  <div className="tooltip absolute bottom-full mb-2 hidden group-hover:block z-10">
                    {day.date}: {day.total} leads
                    <br />{day.won} won, {day.lost} lost
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
