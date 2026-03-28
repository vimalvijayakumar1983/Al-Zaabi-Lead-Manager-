'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function MyIncentivesPage() {
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    setDivisionId(id);
  }, []);

  useEffect(() => {
    if (!divisionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getIncentiveMeSummary(divisionId)
      .then(setSummary)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [divisionId]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/incentives" className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to incentives
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900">My incentives</h1>

      {!divisionId && <p className="text-sm text-amber-700">Select a division to continue.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {summary && !loading && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Posted earnings (all time)</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {Number(summary.postedEarningsSum || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">{summary.postedEarningsCount} records</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Open disputes</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.openDisputes}</p>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Recent statements</h2>
            {(!summary.recentStatements || summary.recentStatements.length === 0) && (
              <p className="text-sm text-gray-500">No statements yet.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {(summary.recentStatements || []).map((s: any) => (
                <li key={s.id} className="py-3 flex justify-between items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">{s.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{Number(s.totalAmount).toFixed(2)} {s.currency}</p>
                    <Link href={`/incentives/statements/${s.id}`} className="text-xs text-brand-600 hover:underline">
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
