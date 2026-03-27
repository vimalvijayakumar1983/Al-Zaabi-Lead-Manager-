'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { Gift, User, Settings2, FlaskConical, FileBarChart, Loader2 } from 'lucide-react';

export default function IncentivesHubPage() {
  const { user } = useAuthStore();
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [presets, setPresets] = useState<{ id: string; label: string; dataset: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDivisionId(typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null);
  }, []);

  useEffect(() => {
    if (!divisionId) {
      setLoading(false);
      return;
    }
    api
      .getIncentiveReportPresets()
      .then((r) => setPresets(r.presets || []))
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, [divisionId]);

  const isAdminish = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Gift className="h-7 w-7 text-brand-600" />
          Incentives
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Attribution, earnings, statements, and payouts — scoped to your division.
        </p>
      </div>

      {!divisionId && (
        <div className="card p-6 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          Select a division from the header switcher to load incentive data.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/incentives/my"
          className="card p-5 hover:border-brand-300 transition-colors flex gap-4 items-start"
        >
          <User className="h-10 w-10 text-brand-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-900">My incentives</h2>
            <p className="text-sm text-gray-500 mt-1">Posted earnings, recent statements, open disputes.</p>
          </div>
        </Link>

        {isAdminish && (
          <Link
            href="/incentives/admin"
            className="card p-5 hover:border-brand-300 transition-colors flex gap-4 items-start"
          >
            <Settings2 className="h-10 w-10 text-violet-600 shrink-0" />
            <div>
              <h2 className="font-semibold text-gray-900">Plans &amp; operations</h2>
              <p className="text-sm text-gray-500 mt-1">Plans, exceptions, simulation sandbox, event tools.</p>
            </div>
          </Link>
        )}

        <Link
          href="/incentives/sandbox"
          className="card p-5 hover:border-brand-300 transition-colors flex gap-4 items-start"
        >
          <FlaskConical className="h-10 w-10 text-teal-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-900">Simulation sandbox</h2>
            <p className="text-sm text-gray-500 mt-1">Preview attribution and earnings without saving.</p>
          </div>
        </Link>

        <Link href="/report-builder" className="card p-5 hover:border-brand-300 transition-colors flex gap-4 items-start">
          <FileBarChart className="h-10 w-10 text-slate-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-900">Report Builder</h2>
            <p className="text-sm text-gray-500 mt-1">Use incentive datasets for analytics and exports.</p>
          </div>
        </Link>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Guided report presets</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : presets.length === 0 ? (
          <p className="text-sm text-gray-500">No presets (sign in with division context).</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {presets.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 border-b border-gray-100 pb-2 last:border-0">
                <span className="text-gray-800">{p.label}</span>
                <span className="text-gray-400 font-mono text-xs shrink-0">{p.dataset}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
