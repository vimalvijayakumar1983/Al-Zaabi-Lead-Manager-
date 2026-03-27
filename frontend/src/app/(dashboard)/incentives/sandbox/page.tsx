'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft, Play } from 'lucide-react';

export default function IncentiveSandboxPage() {
  const [divisionId, setDivisionId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [strategy, setStrategy] = useState<'last_valid_owner' | 'first_touch' | 'weighted_split'>('last_valid_owner');
  const [attrOut, setAttrOut] = useState<any>(null);
  const [earnOut, setEarnOut] = useState<any>(null);
  const [earnConfig, setEarnConfig] = useState(
    JSON.stringify(
      {
        roundingScale: 2,
        eventTypes: {
          conversion_won: { type: 'percent', percent: 2, baseField: 'amount' },
        },
      },
      null,
      2
    )
  );

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : '';
    if (id) setDivisionId(id);
  }, []);

  const runAttr = async () => {
    if (!divisionId) return;
    const r = await api.incentiveAttributionPreview({
      divisionId,
      strategy,
      event: { leadId: leadId || undefined, occurredAt: new Date().toISOString(), payload: {} },
    });
    setAttrOut(r);
  };

  const runEarn = async () => {
    if (!divisionId) return;
    let cfg: any = {};
    try {
      cfg = JSON.parse(earnConfig);
    } catch {
      setEarnOut({ error: 'Invalid JSON earnings config' });
      return;
    }
    const r = await api.incentiveEarningsSimulate({
      divisionId,
      eventType: 'conversion_won',
      earningsConfig: cfg,
      event: { amount: 50000, payload: {} },
    });
    setEarnOut(r);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/incentives" className="text-sm text-brand-600 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Simulation sandbox</h1>
      <p className="text-sm text-gray-500">Calls preview APIs only — nothing is written to the ledger.</p>

      <div className="card p-5 space-y-4">
        <h2 className="font-medium text-gray-800">Attribution preview</h2>
        <input
          className="input w-full"
          placeholder="Division ID (UUID)"
          value={divisionId}
          onChange={(e) => setDivisionId(e.target.value)}
        />
        <input className="input w-full" placeholder="Lead ID (optional)" value={leadId} onChange={(e) => setLeadId(e.target.value)} />
        <select className="input w-full" value={strategy} onChange={(e) => setStrategy(e.target.value as any)}>
          <option value="last_valid_owner">Last valid owner</option>
          <option value="first_touch">First touch</option>
          <option value="weighted_split">Weighted split</option>
        </select>
        <button type="button" className="btn-primary text-sm gap-2" onClick={runAttr}>
          <Play className="h-4 w-4" /> Run attribution preview
        </button>
        {attrOut && <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64">{JSON.stringify(attrOut, null, 2)}</pre>}
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-medium text-gray-800">Earnings simulate (conversion_won @ 50,000 base)</h2>
        <textarea className="input w-full font-mono text-xs min-h-[160px]" value={earnConfig} onChange={(e) => setEarnConfig(e.target.value)} />
        <button type="button" className="btn-primary text-sm gap-2" onClick={runEarn}>
          <Play className="h-4 w-4" /> Run earnings simulate
        </button>
        {earnOut && <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64">{JSON.stringify(earnOut, null, 2)}</pre>}
      </div>
    </div>
  );
}
