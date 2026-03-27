'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, Eye, Filter, Loader2, Pencil, Search, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const { user } = useAuthStore() as { user: User | null };
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const searchParams = useSearchParams();
  const initialDivision = searchParams.get('divisionId') || 'all';

  const [selectedDivision, setSelectedDivision] = useState(initialDivision);
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editingRow, setEditingRow] = useState<ErpDataRow | null>(null);
  const [editPayloadText, setEditPayloadText] = useState('');
  const [detailsRow, setDetailsRow] = useState<ErpDataRow | null>(null);
  const [showPayloadInDetails, setShowPayloadInDetails] = useState(false);
  const [showPayloadColumn, setShowPayloadColumn] = useState(false);
  const [configuredCustomEntities, setConfiguredCustomEntities] = useState<string[]>([]);

  const divisionsQuery = useQuery({
    queryKey: ['erp-data-divisions'],
    queryFn: () => api.getDivisions() as Promise<Organization[]>,
    staleTime: 60_000,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const erpDataQuery = useQuery({
    queryKey: ['erp-data', selectedDivision, selectedEntity, debouncedSearch, page, limit],
    queryFn: () =>
      api.getErpData({
        divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
        entityType: selectedEntity !== 'all' ? selectedEntity : undefined,
        search: debouncedSearch || undefined,
        page,
        limit,
      }) as Promise<{
        data: ErpDataRow[];
        countsByEntity: Record<string, number>;
        total: number;
        pagination?: { totalPages?: number };
      }>,
    staleTime: 15_000,
  });

  useEffect(() => {
    setPage(1);
  }, [selectedDivision, selectedEntity, debouncedSearch, limit]);

  const divisions = Array.isArray(divisionsQuery.data) ? divisionsQuery.data : [];
  const rows = erpDataQuery.data?.data || [];
  const counts = erpDataQuery.data?.countsByEntity || {};
  const total = erpDataQuery.data?.total || 0;
  const totalPages = erpDataQuery.data?.pagination?.totalPages || 1;
  const loading = erpDataQuery.isLoading || erpDataQuery.isFetching;

  const updateRowMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.updateErpDataRow(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-data'] });
      setEditingRow(null);
      setEditPayloadText('');
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: (id: string) => api.deleteErpDataRow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-data'] });
    },
  });

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

  const getMandatoryFieldEntries = (row: ErpDataRow): Array<[string, unknown]> => {
    const payload = row.payload || {};
    const mandatoryKeys = KNOWN_FIELDS_BY_ENTITY[row.entityType] || [];
    if (mandatoryKeys.length === 0) return [];
    return mandatoryKeys.map((k) => [k, payload[k]]);
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

  const openEditModal = (row: ErpDataRow) => {
    setEditingRow(row);
    setEditPayloadText(JSON.stringify(row.payload || {}, null, 2));
  };

  const handleSaveEdit = async () => {
    if (!editingRow) return;
    try {
      const parsed = JSON.parse(editPayloadText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        window.alert('Payload must be a JSON object.');
        return;
      }
      await updateRowMutation.mutateAsync({
        id: editingRow.id,
        payload: parsed as Record<string, unknown>,
      });
    } catch (err: any) {
      window.alert(err?.message || 'Invalid JSON or failed to save row.');
    }
  };

  const handleDeleteRow = async (row: ErpDataRow) => {
    const ok = window.confirm(`Delete this row (${row.entityType} / ${row.externalId})?`);
    if (!ok) return;
    try {
      await deleteRowMutation.mutateAsync(row.id);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to delete row.');
    }
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all fields, including payload..."
              className="w-[320px] max-w-[75vw] pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
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
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-end">
          <button
            onClick={() => setShowPayloadColumn((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-text-primary hover:bg-white"
          >
            {showPayloadColumn ? 'Hide Payload' : 'Show Payload'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">External ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">CRM ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Custom Fields</th>
                {showPayloadColumn && <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Payload</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Updated</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={showPayloadColumn ? 8 : 7} className="px-4 py-10 text-center text-text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading ERP data...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={showPayloadColumn ? 8 : 7} className="px-4 py-10 text-center text-text-secondary">
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
                            <div className="text-[11px] text-text-tertiary">+{getCustomFieldEntries(row).length - 6} more</div>
                          )}
                        </div>
                      )}
                    </td>
                    {showPayloadColumn && (
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
                    )}
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {new Date(row.updatedAt).toLocaleString('en-AE')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(row)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {(getPayloadEntries(row).length > 8 || getCustomFieldEntries(row).length > 6) && (
                          <button
                            onClick={() => {
                              setDetailsRow(row);
                              setShowPayloadInDetails(false);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Details
                          </button>
                        )}
                        <button
                          onClick={() => void handleDeleteRow(row)}
                          disabled={deleteRowMutation.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deleteRowMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Delete
                        </button>
                      </div>
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

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Edit ERP Payload</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {editingRow.entityType} / {editingRow.externalId}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingRow(null);
                  setEditPayloadText('');
                }}
                className="p-1.5 rounded-md hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <textarea
                value={editPayloadText}
                onChange={(e) => setEditPayloadText(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditingRow(null);
                  setEditPayloadText('');
                }}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveEdit()}
                disabled={updateRowMutation.isPending}
                className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {updateRowMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">ERP Row Details</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {detailsRow.entityType} / {detailsRow.externalId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPayloadInDetails((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-text-primary hover:bg-gray-50"
                >
                  {showPayloadInDetails ? 'Show Fields' : 'Show Payload'}
                </button>
                <button onClick={() => setDetailsRow(null)} className="p-1.5 rounded-md hover:bg-gray-100">
                  <X className="w-4 h-4 text-text-secondary" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto space-y-5">
              {showPayloadInDetails ? (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Full Payload</h4>
                  {getPayloadEntries(detailsRow).length === 0 ? (
                    <div className="text-xs text-text-tertiary">Payload is empty</div>
                  ) : (
                    <div className="space-y-1.5">
                      {getPayloadEntries(detailsRow).map(([k, v]) => (
                        <div
                          key={`details-payload-${detailsRow.id}-${k}`}
                          className="grid grid-cols-[200px_1fr] gap-2 text-xs rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                        >
                          <span className="font-mono text-text-secondary break-all">{k}</span>
                          <span className="text-text-primary break-all">
                            {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                              ? String(v)
                              : JSON.stringify(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Table Mandatory Fields</h4>
                    {getMandatoryFieldEntries(detailsRow).length === 0 ? (
                      <div className="text-xs text-text-tertiary">No mandatory field config for this entity</div>
                    ) : (
                      <div className="space-y-1.5">
                        {getMandatoryFieldEntries(detailsRow).map(([k, v]) => (
                          <div
                            key={`details-mandatory-${detailsRow.id}-${k}`}
                            className="grid grid-cols-[200px_1fr] gap-2 text-xs rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                          >
                            <span className="font-mono text-text-secondary break-all">{k}</span>
                            <span className="text-text-primary break-all">{formatCellValue(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Custom Fields</h4>
                    {getCustomFieldEntries(detailsRow).length === 0 ? (
                      <div className="text-xs text-text-tertiary">No custom fields</div>
                    ) : (
                      <div className="space-y-1.5">
                        {getCustomFieldEntries(detailsRow).map(([k, v]) => (
                          <div
                            key={`details-custom-${detailsRow.id}-${k}`}
                            className="grid grid-cols-[200px_1fr] gap-2 text-xs rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                          >
                            <span className="font-mono text-text-secondary break-all">{k}</span>
                            <span className="text-text-primary break-all">
                              {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                                ? String(v)
                                : JSON.stringify(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setDetailsRow(null)} className="btn-secondary text-xs px-3 py-1.5">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
