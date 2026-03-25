'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

type ActivityRow = {
  id: string;
  integration_id?: string;
  integrationId?: string;
  action?: string;
  event?: string;
  status: string;
  payload?: Record<string, unknown>;
  error_message?: string;
  errorMessage?: string;
  created_at?: string;
  createdAt?: string;
};

export default function IntegrationActivityPage() {
  const searchParams = useSearchParams();
  const integrationId = searchParams.get('integrationId') || '';
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActivityRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (!integrationId) {
          setRows([]);
          return;
        }
        const result = await api.getIntegrationLogs(integrationId, { page: 1, limit: 200 });
        const normalized = Array.isArray((result as any)?.data) ? (result as any).data : (Array.isArray(result) ? result : []);
        setRows(normalized);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [integrationId]);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2.5">
          <Activity className="w-7 h-7 text-brand-600" />
          Recent Activity
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {integrationId ? `Integration: ${integrationId}` : 'No integration selected'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Message</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Payload</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading activity...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                    No activity found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const status = row.status || 'info';
                  const createdAt = row.created_at || row.createdAt || '';
                  const message = row.error_message || row.errorMessage || '-';
                  return (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        {status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : status === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : status === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Info className="w-4 h-4 text-blue-500" />
                        )}
                      </td>
                      <td className="px-4 py-3">{row.action || row.event || '-'}</td>
                      <td className="px-4 py-3 text-xs">{message}</td>
                      <td className="px-4 py-3">
                        <pre className="text-[11px] bg-gray-50 border border-gray-100 rounded-md px-2 py-1 max-w-[500px] overflow-x-auto">
                          {JSON.stringify(row.payload || {}, null, 2)}
                        </pre>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {createdAt ? new Date(createdAt).toLocaleString('en-AE') : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
