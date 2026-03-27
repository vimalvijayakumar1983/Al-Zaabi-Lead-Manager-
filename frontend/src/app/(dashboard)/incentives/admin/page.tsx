'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function IncentivesAdminPage() {
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tab, setTab] = useState<'plans' | 'exceptions' | 'events'>('plans');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDivisionId(typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null);
  }, []);

  useEffect(() => {
    if (!divisionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    Promise.all([
      api.getIncentivePlans(divisionId).catch(() => ({ plans: [] })),
      api.getIncentiveExceptions(divisionId, 'OPEN').catch(() => ({ items: [] })),
      api.getIncentiveEvents(divisionId, { limit: 30 }).catch(() => ({ items: [] })),
    ])
      .then(([p, ex, ev]) => {
        setPlans(p.plans || []);
        setExceptions(ex.items || []);
        setEvents(ev.items || []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [divisionId]);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/incentives" className="text-sm text-brand-600 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Incentive administration</h1>
      <p className="text-sm text-gray-500">
        Requires manager/admin role or custom incentive permissions. Configure plans in API or extend this UI.
      </p>

      {!divisionId && <p className="text-amber-700 text-sm">Select a division.</p>}
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {(['plans', 'exceptions', 'events'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}
            onClick={() => setTab(t)}
          >
            {t === 'plans' ? 'Plans' : t === 'exceptions' ? 'Exceptions' : 'Events'}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        <div className="card p-4 space-y-3">
          {plans.length === 0 ? (
            <p className="text-sm text-gray-500">No plans. Create via POST /api/incentives/plans or seed script.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {plans.map((pl) => (
                <li key={pl.id} className="py-3">
                  <p className="font-medium text-gray-900">{pl.name}</p>
                  <p className="text-xs text-gray-500">
                    {pl.status} · {pl.currency}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'exceptions' && (
        <div className="card p-4">
          {exceptions.length === 0 ? (
            <p className="text-sm text-gray-500">No open exceptions.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {exceptions.map((x) => (
                <li key={x.id} className="border border-gray-100 rounded-lg p-3">
                  <span className="font-mono text-xs text-brand-700">{x.reasonCode}</span>
                  <p className="text-gray-800 mt-1">{x.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="card p-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Occurred</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4">{e.eventType}</td>
                  <td className="py-2 pr-4">{e.processingStatus}</td>
                  <td className="py-2 pr-4">{new Date(e.occurredAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
