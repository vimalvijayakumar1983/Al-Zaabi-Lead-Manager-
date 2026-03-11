'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  const maxFunnelCount = Math.max(...funnel.map((s) => s.count), 1);
  const maxTrendTotal = Math.max(...trends.map((t: any) => t.total), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">Insights and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Conversion Funnel</h2>
          <div className="space-y-3">
            {funnel.map((stage, i) => {
              const widthPct = (stage.count / maxFunnelCount) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-28 truncate">{stage.name}</span>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg flex items-center px-2 transition-all"
                      style={{ width: `${Math.max(widthPct, 8)}%`, backgroundColor: stage.color }}
                    >
                      <span className="text-xs font-medium text-white">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team Performance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Team Performance</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Total</th>
                  <th className="pb-3">Won</th>
                  <th className="pb-3">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {team.map((member: any) => (
                  <tr key={member.id}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-medium text-brand-700">
                          {member.name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-700">{member.totalLeads}</td>
                    <td className="py-3 text-sm text-green-600 font-medium">{member.wonLeads}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${member.conversionRate}%` }} />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{member.conversionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Lead Trends */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Lead Trends (Last 30 Days)</h2>
        {trends.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No data for the last 30 days</p>
        ) : (
          <div className="flex items-end gap-1 h-48">
            {trends.map((day: any, i: number) => {
              const height = (day.total / maxTrendTotal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-brand-500 rounded-t hover:bg-brand-600 transition-colors"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {day.date}: {day.total} leads ({day.won} won, {day.lost} lost)
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
