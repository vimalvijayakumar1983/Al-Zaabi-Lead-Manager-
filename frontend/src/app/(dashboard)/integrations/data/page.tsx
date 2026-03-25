'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, Filter, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Organization, User } from '@/types';

type ErpDataRow = {
  id: string;
  integrationId: string;
  provider: string | null;
  divisionId: string | null;
  entityType: string;
  externalId: string;
  crmEntityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const ENTITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'sale', label: 'Sales' },
  { value: 'doctor_availability', label: 'Doctor Availability' },
];

export default function ErpDataPage() {
  const { user } = useAuthStore() as { user: User | null };
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const searchParams = useSearchParams();
  const initialDivision = searchParams.get('divisionId') || 'all';

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ErpDataRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [selectedDivision, setSelectedDivision] = useState(initialDivision);
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const divs = await api.getDivisions();
        if (Array.isArray(divs)) setDivisions(divs);
      } catch {
        setDivisions([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await api.getErpData({
          divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
          entityType: selectedEntity !== 'all' ? selectedEntity : undefined,
          page,
          limit,
        });
        setRows(response.data || []);
        setCounts(response.countsByEntity || {});
        setTotal(response.total || 0);
        setTotalPages(response.pagination?.totalPages || 1);
      } catch {
        setRows([]);
        setCounts({});
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDivision, selectedEntity, page, limit]);

  useEffect(() => {
    setPage(1);
  }, [selectedDivision, selectedEntity, limit]);

  const titleStats = useMemo(() => {
    return {
      total: rows.length,
      customers: counts.customer || 0,
      sales: counts.sale || 0,
      availability: counts.doctor_availability || 0,
    };
  }, [rows, counts]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2.5">
            <Database className="w-7 h-7 text-brand-600" />
            ERP Data
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Customers, sales, and availability records received from ERP endpoints
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && divisions.length > 0 && (
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="all">All Divisions</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-sm">
          <p className="text-text-tertiary">Total</p>
          <p className="text-xl font-semibold text-text-primary">{total || titleStats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-sm">
          <p className="text-text-tertiary">Customers</p>
          <p className="text-xl font-semibold text-text-primary">{titleStats.customers}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-sm">
          <p className="text-text-tertiary">Sales</p>
          <p className="text-xl font-semibold text-text-primary">{titleStats.sales}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4 text-sm">
          <p className="text-text-tertiary">Availability</p>
          <p className="text-xl font-semibold text-text-primary">{titleStats.availability}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">External ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">CRM ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Payload</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading ERP data...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                    No ERP records found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 uppercase">{row.provider || '-'}</td>
                    <td className="px-4 py-3">{row.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.externalId}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.crmEntityId}</td>
                    <td className="px-4 py-3">
                      <pre className="text-[11px] bg-gray-50 border border-gray-100 rounded-md px-2 py-1 max-w-[520px] overflow-x-auto">
                        {JSON.stringify(row.payload || {}, null, 2)}
                      </pre>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {new Date(row.updatedAt).toLocaleString('en-AE')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-text-secondary">
            Showing page {page} of {totalPages} ({total} records)
          </div>
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
