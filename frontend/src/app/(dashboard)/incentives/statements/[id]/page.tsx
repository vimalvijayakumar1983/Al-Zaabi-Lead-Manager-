'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function IncentiveStatementDetailPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeMsg, setDisputeMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getIncentiveStatement(id)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const submitDispute = async () => {
    if (!disputeReason.trim()) return;
    try {
      await api.createIncentiveDispute(id, disputeReason.trim());
      setDisputeMsg('Dispute submitted.');
      setDisputeReason('');
    } catch (e: any) {
      setDisputeMsg(e.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/incentives/my" className="text-sm text-brand-600 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> My incentives
      </Link>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}
      {err && <p className="text-red-600 text-sm">{err}</p>}

      {data && (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Statement</h1>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(data.periodStart).toLocaleDateString()} – {new Date(data.periodEnd).toLocaleDateString()} ·{' '}
              <span className="font-medium text-gray-700">{data.status}</span>
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-2">
              {Number(data.totalAmount).toFixed(2)} {data.currency}
            </p>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Lines</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {(data.lines || []).map((line: any) => (
                <li key={line.id} className="py-3 flex justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{line.lineType}</p>
                    <p className="text-gray-600">{line.description}</p>
                  </div>
                  <span className="shrink-0">{Number(line.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          {data.status !== 'PAID' && data.status !== 'LOCKED' && (
            <div className="card p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-800">Raise dispute</h2>
              <textarea
                className="input w-full text-sm"
                rows={3}
                placeholder="Describe the issue…"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <button type="button" className="btn-secondary text-sm" onClick={submitDispute}>
                Submit dispute
              </button>
              {disputeMsg && <p className="text-xs text-gray-600">{disputeMsg}</p>}
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Trace (JSON)</h2>
            <p className="text-xs text-gray-500 mb-2">Expand line-level traces in Report Builder or API.</p>
            <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-48">
              {JSON.stringify(
                (data.lines || []).map((l: any) => ({ id: l.id, trace: l.trace })),
                null,
                2
              )}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
