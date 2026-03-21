'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { RecycleBinItem, RecycleEntityType } from '@/types';
import { ArchiveRestore, Loader2, RefreshCw, Search, Trash2, CalendarClock } from 'lucide-react';

const TYPE_OPTIONS: Array<{ value: '' | RecycleEntityType; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'LEAD', label: 'Leads' },
  { value: 'CONTACT', label: 'Contacts' },
  { value: 'TASK', label: 'Tasks' },
  { value: 'CAMPAIGN', label: 'Campaigns' },
];

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function RecycleBinPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | RecycleEntityType>('');
  const [expiringInDays, setExpiringInDays] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [divisionId, setDivisionId] = useState<string>('');
  const [divisions, setDivisions] = useState<Array<{ id: string; name?: string; tradeName?: string }>>([]);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const localDivisions = localStorage.getItem('divisions');
      if (localDivisions) {
        const parsed = JSON.parse(localDivisions);
        if (Array.isArray(parsed)) setDivisions(parsed);
      }
      const activeDivisionId = localStorage.getItem('activeDivisionId');
      if (activeDivisionId) setDivisionId(activeDivisionId);
    } catch {
      // ignore storage parse errors
    }
  }, []);

  const fetchItems = useCallback(async (requestedPage = 1, withSpinner = true) => {
    if (withSpinner) setLoading(true);
    try {
      const response = await api.getRecycleBinItems({
        page: requestedPage,
        limit: 20,
        ...(type ? { type } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(expiringInDays ? { expiringInDays } : {}),
        ...(isSuperAdmin && divisionId ? { divisionId } : {}),
        sortBy: 'deletedAt',
        sortOrder: 'desc',
      });
      setItems(response.data || []);
      setPage(response.pagination?.page || requestedPage);
      setTotalPages(response.pagination?.totalPages || 1);
      setTotal(response.pagination?.total || 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type, search, expiringInDays, isSuperAdmin, divisionId]);

  useEffect(() => {
    fetchItems(1).catch(() => setLoading(false));
  }, [fetchItems]);

  const handleRestore = useCallback(async (item: RecycleBinItem) => {
    const allowed = item.capabilities?.canRestore;
    if (!allowed) return;
    setActionBusyId(item.id);
    try {
      await api.restoreRecycleBinItem(item.id);
      await fetchItems(page, false);
    } catch (error: any) {
      alert(error?.message || 'Failed to restore record');
    } finally {
      setActionBusyId(null);
    }
  }, [fetchItems, page]);

  const handlePermanentDelete = useCallback(async (item: RecycleBinItem) => {
    const allowed = item.capabilities?.canPurge;
    if (!allowed) return;
    const ok = window.confirm('Permanently delete this record from Recycle Bin? This cannot be undone.');
    if (!ok) return;
    setActionBusyId(item.id);
    try {
      await api.permanentlyDeleteRecycleBinItem(item.id);
      await fetchItems(page, false);
    } catch (error: any) {
      alert(error?.message || 'Failed to permanently delete record');
    } finally {
      setActionBusyId(null);
    }
  }, [fetchItems, page]);

  const summary = useMemo(() => {
    const expiringSoon = items.filter((item) => (item.daysUntilPurge ?? 999) <= 7).length;
    const byType = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.entityType] = (acc[item.entityType] || 0) + 1;
      return acc;
    }, {});
    return { expiringSoon, byType };
  }, [items]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Recycle Bin</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Deleted records remain here for 60 days before permanent purge.
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchItems(page, false).catch(() => setRefreshing(false));
          }}
          className="btn-secondary text-xs"
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-2xs text-text-tertiary">Total in Bin</p>
          <p className="text-xl font-semibold text-text-primary">{total}</p>
        </div>
        <div className="card p-3">
          <p className="text-2xs text-text-tertiary">Expiring in 7 days</p>
          <p className="text-xl font-semibold text-amber-600">{summary.expiringSoon}</p>
        </div>
        <div className="card p-3">
          <p className="text-2xs text-text-tertiary">Leads / Contacts</p>
          <p className="text-xl font-semibold text-text-primary">
            {(summary.byType.LEAD || 0) + (summary.byType.CONTACT || 0)}
          </p>
        </div>
      </div>

      <div className="card p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <label className="relative md:col-span-2">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deleted records"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-border-subtle bg-surface text-sm"
            />
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as '' | RecycleEntityType)}
            className="h-9 rounded-lg border border-border-subtle bg-surface px-3 text-sm"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={expiringInDays}
            onChange={(e) => setExpiringInDays(e.target.value ? Number(e.target.value) : '')}
            className="h-9 rounded-lg border border-border-subtle bg-surface px-3 text-sm"
          >
            <option value="">All retention windows</option>
            <option value={7}>Expiring in 7 days</option>
            <option value={3}>Expiring in 3 days</option>
            <option value={1}>Expiring in 24h</option>
          </select>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-text-tertiary" />
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="h-8 rounded-md border border-border-subtle bg-surface px-2.5 text-xs"
            >
              <option value="">All divisions in scope</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.tradeName || division.name || 'Division'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recycle bin records...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-text-primary">Recycle Bin is empty</p>
            <p className="text-2xs text-text-tertiary mt-1">No deleted records match current filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {items.map((item) => (
              <div key={item.id} className="px-4 py-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {item.entityLabel || `${item.entityType} ${item.entityId.slice(0, 8)}`}
                  </p>
                  <p className="text-2xs text-text-tertiary mt-0.5">
                    {item.entityType} • Deleted {formatDate(item.deletedAt)} • Purges {formatDate(item.purgeAt)}
                  </p>
                  <p className="text-2xs text-amber-600 mt-0.5">
                    {item.daysUntilPurge ?? 0} day(s) remaining
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={!item.capabilities?.canRestore || actionBusyId === item.id}
                    className="h-8 px-2.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {actionBusyId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Restore
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(item)}
                    disabled={!item.capabilities?.canPurge || actionBusyId === item.id}
                    className="h-8 px-2.5 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete forever
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => fetchItems(Math.max(1, page - 1)).catch(() => {})}
          disabled={page <= 1 || loading}
          className="btn-secondary text-xs"
        >
          Previous
        </button>
        <span className="text-xs text-text-tertiary">
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button
          onClick={() => fetchItems(Math.min(totalPages, page + 1)).catch(() => {})}
          disabled={page >= totalPages || loading}
          className="btn-secondary text-xs"
        >
          Next
        </button>
      </div>
    </div>
  );
}
