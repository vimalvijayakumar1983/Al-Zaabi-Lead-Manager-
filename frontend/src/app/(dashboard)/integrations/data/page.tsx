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

const KNOWN_FIELDS_BY_ENTITY: Record<string, string[]> = {
  customer: ['externalCustomerId', 'customerId', 'id', 'code', 'firstName', 'lastName', 'fullName', 'name', 'email', 'phone', 'mobile', 'company', 'companyName'],
  sale: ['externalSaleId', 'saleId', 'salesId', 'id', 'externalCustomerId', 'customerId', 'amount', 'currency', 'status', 'date'],
  doctor_availability: ['externalAvailabilityId', 'availabilityId', 'doctorId', 'providerId', 'id', 'date', 'slots'],
};

const BASE_ENTITY_OPTIONS = [
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
  const [configuredCustomEntities, setConfiguredCustomEntities] = useState<string[]>([]);

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
        const integrations = (await api.getIntegrations()) as unknown as Array<{
          platform: string;
          config?: Record<string, unknown>;
        }>;
        const entitySet = new Set<string>();
        integrations
          .filter((i) => i.platform === 'erp')
          .filter((i) => {
            const divId = String(i.config?.divisionId || '');
            return selectedDivision === 'all' || divId === selectedDivision;
          })
          .forEach((i) => {
            const customTables = Array.isArray(i.config?.erpCustomTables)
              ? (i.config?.erpCustomTables as Array<Record<string, unknown>>)
              : [];
            customTables.forEach((t) => {
              const slug = String(t.slug || '').trim().toLowerCase();
              if (slug) entitySet.add(`custom_${slug}`);
            });
          });
        setConfiguredCustomEntities(Array.from(entitySet).sort());
      } catch {
        setConfiguredCustomEntities([]);
      }
    })();
  }, [selectedDivision]);

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
      total,
      customers: counts.customer || 0,
      sales: counts.sale || 0,
      availability: counts.doctor_availability || 0,
    };
  }, [total, counts]);

  const entityOptions = useMemo(() => {
    const fromCounts = Object.keys(counts || {})
      .filter((k) => k.startsWith('custom_'))
      .map((k) => ({ value: k, label: `Custom: ${k.slice('custom_'.length)}` }));
    const fromConfig = configuredCustomEntities.map((k) => ({
      value: k,
      label: `Custom: ${k.slice('custom_'.length)}`,
    }));
    const byValue = new Map<string, { value: string; label: string }>();
    [...fromCounts, ...fromConfig].forEach((opt) => byValue.set(opt.value, opt));
    const dynamic = Array.from(byValue.values());
    const selectedMissing =
      selectedEntity !== 'all' &&
      ![...BASE_ENTITY_OPTIONS.map((o) => o.value), ...dynamic.map((o) => o.value)].includes(selectedEntity)
        ? [{ value: selectedEntity, label: selectedEntity }]
        : [];
    return [...BASE_ENTITY_OPTIONS, ...dynamic, ...selectedMissing];
  }, [counts, configuredCustomEntities, selectedEntity]);

  const getCustomFieldEntries = (row: ErpDataRow): Array<[string, unknown]> => {
    const payload = row.payload || {};
    const allEntries = Object.entries(payload);
    if (allEntries.length === 0) return [];

    // For custom tables, treat all top-level keys as table-specific fields.
    if (row.entityType.startsWith('custom_')) return allEntries;

    const known = new Set(KNOWN_FIELDS_BY_ENTITY[row.entityType] || []);
    return allEntries.filter(([k]) => !known.has(k));
  };

  const getPayloadEntries = (row: ErpDataRow): Array<[string, unknown]> =>
    Object.entries(row.payload || {});

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value || '-';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.length ? `${value.length} item(s)` : '[]';
    return 'Object';
  };

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
              {entityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-sm shadow-sm">
          <p className="text-blue-700/80 font-medium">Customers</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{titleStats.customers}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-sm shadow-sm">
          <p className="text-emerald-700/80 font-medium">Sales</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{titleStats.sales}</p>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Custom Fields</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Payload</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading ERP data...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-secondary">
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
                      {getCustomFieldEntries(row).length === 0 ? (
                        <span className="text-xs text-text-tertiary">-</span>
                      ) : (
                        <div className="max-w-[280px] space-y-1">
                          {getCustomFieldEntries(row).slice(0, 6).map(([k, v]) => (
                            <div key={`${row.id}-${k}`} className="text-[11px]">
                              <span className="font-mono text-text-secondary">{k}</span>
                              <span className="text-text-tertiary">: </span>
                              <span className="text-text-primary">
                                {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                                  ? String(v)
                                  : JSON.stringify(v)}
                              </span>
                            </div>
                          ))}
                          {getCustomFieldEntries(row).length > 6 && (
                            <div className="text-[11px] text-text-tertiary">
                              +{getCustomFieldEntries(row).length - 6} more
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[520px] space-y-1.5">
                        {getPayloadEntries(row).length === 0 ? (
                          <span className="text-xs text-text-tertiary">-</span>
                        ) : (
                          getPayloadEntries(row).slice(0, 8).map(([k, v]) => (
                            <div
                              key={`${row.id}-payload-${k}`}
                              className="grid grid-cols-[140px_1fr] gap-2 text-[11px] rounded-md border border-gray-100 bg-gray-50 px-2 py-1"
                            >
                              <span className="font-mono text-text-secondary truncate">{k}</span>
                              <span className="text-text-primary break-all">{formatCellValue(v)}</span>
                            </div>
                          ))
                        )}
                        {getPayloadEntries(row).length > 8 && (
                          <div className="text-[11px] text-text-tertiary">+{getPayloadEntries(row).length - 8} more fields</div>
                        )}
                      </div>
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
