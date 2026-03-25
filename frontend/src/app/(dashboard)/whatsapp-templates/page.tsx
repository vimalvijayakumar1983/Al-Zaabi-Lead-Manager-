'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { RefreshCw, AlertCircle, LayoutTemplate } from 'lucide-react';

function useEffectiveDivisionId() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [mounted, setMounted] = useState(false);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setActiveDivisionId(typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null);
  }, []);

  return useMemo(() => {
    if (!mounted) return { divisionId: undefined as string | undefined, isSuperAdmin, ready: false };
    if (isSuperAdmin) {
      return { divisionId: activeDivisionId || undefined, isSuperAdmin, ready: true };
    }
    return { divisionId: undefined, isSuperAdmin: false, ready: true };
  }, [mounted, isSuperAdmin, activeDivisionId]);
}

export default function WhatsAppTemplatesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { divisionId, isSuperAdmin, ready } = useEffectiveDivisionId();
  const canSync = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const listQuery = useQuery({
    queryKey: ['whatsapp-templates', divisionId],
    queryFn: () => api.listWhatsAppTemplates(divisionId),
    enabled: ready && (!isSuperAdmin || !!divisionId),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncWhatsAppTemplates(divisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
    },
  });

  const superAdminBlocked = isSuperAdmin && !divisionId;

  function statusClass(status: string | null) {
    const s = (status || '').toUpperCase();
    if (s === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
    if (s === 'PENDING') return 'bg-amber-100 text-amber-800';
    if (s === 'REJECTED') return 'bg-red-100 text-red-800';
    return 'bg-surface-tertiary text-text-secondary';
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <LayoutTemplate className="h-7 w-7 text-brand-600" />
            <h1 className="text-xl font-bold">WhatsApp templates</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Templates are stored in Meta. Sync pulls the latest list for your WhatsApp Business Account (WABA).
          </p>
        </div>
        {canSync && (
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2 self-start"
            disabled={superAdminBlocked || syncMutation.isPending || !ready}
            onClick={() => syncMutation.mutate()}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync from Meta
          </button>
        )}
      </div>

      {superAdminBlocked && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span>
            Select a <strong>division</strong> in the header switcher so we know which organization&apos;s WABA to use, then sync again.
          </span>
        </div>
      )}

      {listQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load templates'}
        </div>
      )}

      {syncMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {syncMutation.error instanceof Error ? syncMutation.error.message : 'Sync failed'}
        </div>
      )}

      {listQuery.data?.lastSyncedAt && (
        <p className="text-xs text-text-tertiary">
          Last synced:{' '}
          {new Date(listQuery.data.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}

      <div className="card overflow-hidden border border-border-subtle">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary text-left text-2xs uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Language</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">Meta ID</th>
                <th className="px-4 py-3 font-semibold hidden xl:table-cell">Note</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">
                    Loading…
                  </td>
                </tr>
              )}
              {!listQuery.isLoading && (!listQuery.data?.templates || listQuery.data.templates.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">
                    {superAdminBlocked
                      ? 'Select a division to load templates.'
                      : 'No templates cached yet. Add WABA ID in Settings → WhatsApp, then sync from Meta.'}
                  </td>
                </tr>
              )}
              {listQuery.data?.templates?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-secondary/50">
                  <td className="px-4 py-3 font-medium text-text-primary">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{t.language}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${statusClass(t.status)}`}>
                      {t.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{t.category || '—'}</td>
                  <td className="px-4 py-3 font-mono text-2xs text-text-tertiary hidden lg:table-cell">{t.waTemplateId}</td>
                  <td className="px-4 py-3 text-2xs text-red-700 max-w-[200px] truncate hidden xl:table-cell" title={t.rejectedReason || ''}>
                    {t.rejectedReason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
