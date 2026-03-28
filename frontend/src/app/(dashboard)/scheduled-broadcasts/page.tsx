'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  Loader2, Clock3, CheckCircle2, AlertCircle, PlayCircle,
  Radio, Search, ChevronRight, Calendar, Users, XCircle, RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────
type BroadcastRun = {
  id: string;
  mode: 'NOW' | 'LATER';
  status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  templateName: string;
  templateLanguage: string;
  list: { id: string; name: string };
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
};

type BroadcastRecipient = {
  id: string;
  leadId: string;
  phone: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  waMessageId: string | null;
  error: string | null;
  attemptCount: number;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  lead: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null;
    whatsappOptOut?: boolean; whatsappOptOutAt?: string | null;
  } | null;
};

const UAE_TZ = 'Asia/Dubai';
const BROADCAST_RETRY_LIMIT = 3;
function fmtUAE(iso: string) {
  try { return new Date(iso).toLocaleString('en-AE', { timeZone: UAE_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function fmtUAEShort(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-AE', { timeZone: UAE_TZ, day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function pct(n: number, t: number) { return t ? `${((n / t) * 100).toFixed(1)}%` : '0%'; }
function isUpcoming(r: BroadcastRun) { return r.status === 'SCHEDULED'; }

// ─── Status chip ──────────────────────────────────────────────────────
function StatusChip({ status }: { status: BroadcastRun['status'] }) {
  const cfg: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
    SCHEDULED: { cls: 'bg-amber-100 text-amber-700', label: 'Upcoming',  icon: <Clock3 className="h-3 w-3" /> },
    RUNNING:   { cls: 'bg-blue-100 text-blue-700 animate-pulse', label: 'Running', icon: <PlayCircle className="h-3 w-3" /> },
    COMPLETED: { cls: 'bg-emerald-100 text-emerald-700', label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" /> },
    FAILED:    { cls: 'bg-red-100 text-red-700', label: 'Failed', icon: <AlertCircle className="h-3 w-3" /> },
    CANCELLED: { cls: 'bg-gray-100 text-gray-500', label: 'Cancelled', icon: null },
  };
  const c = cfg[status] || cfg.CANCELLED;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────
function ProgressBar({ sent, delivered, read, failed, total }: {
  sent: number; delivered: number; read: number; failed: number; total: number;
}) {
  if (!total) return <span className="text-xs text-text-tertiary">—</span>;
  const sp = Math.min(100, (sent      / total) * 100);
  const dp = Math.min(sp,  (delivered / total) * 100);
  const rp = Math.min(dp,  (read      / total) * 100);
  const fp = Math.min(100 - sp, (failed / total) * 100);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${sp}%` }} />
          <div className="h-full bg-red-400 transition-all"     style={{ width: `${fp}%` }} />
        </div>
        <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">{sent}/{total}</span>
      </div>
      <p className="text-[10px] text-text-tertiary space-x-1">
        <span className="text-emerald-600">{pct(sent, total)} sent</span>
        {delivered > 0 && <span className="text-sky-600">· {pct(delivered, total)} delivered</span>}
        {read > 0      && <span className="text-blue-600">· {pct(read, total)} read</span>}
        {failed > 0    && <span className="text-red-500">· {failed} failed</span>}
      </p>
    </div>
  );
}

// ─── Recipient status badge ───────────────────────────────────────────
function RecipientBadge({ status }: { status: BroadcastRecipient['status'] }) {
  const cfg: Record<string, string> = {
    SENT:      'bg-emerald-100 text-emerald-700',
    DELIVERED: 'bg-sky-100 text-sky-700',
    READ:      'bg-blue-100 text-blue-700',
    FAILED:    'bg-red-100 text-red-700',
    PENDING:   'bg-gray-100 text-gray-600',
  };
  const icons: Record<string, string> = { SENT: '✓', DELIVERED: '✓✓', READ: '✓✓', FAILED: '✕', PENDING: '…' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${cfg[status] || cfg.PENDING}`}>
      <span>{icons[status] || status}</span>
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function ScheduledBroadcastsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const divisionId = typeof window !== 'undefined' && isSuperAdmin ? localStorage.getItem('activeDivisionId') : null;

  const [rows, setRows] = useState<BroadcastRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'all'>('upcoming');
  const [runSearch, setRunSearch] = useState('');

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [recipientFilter, setRecipientFilter] = useState<'ALL' | 'FAILED' | 'SENT' | 'PENDING' | 'EXHAUSTED'>('ALL');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null); // runId being actioned
  const [actionNote, setActionNote] = useState('');

  // ── Load runs ──────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (isSuperAdmin && !divisionId) { if (mounted) { setRows([]); setLoading(false); } return; }
      if (mounted) setLoading(true);
      try {
        const out = await api.listBroadcastRuns(divisionId || undefined);
        if (!mounted) return;
        const nextRows = out.runs || [];
        setRows(nextRows);
        setSelectedRunId((prev) => {
          if (!prev && nextRows[0]?.id) return nextRows[0].id;
          if (prev && !nextRows.some((r) => r.id === prev)) return nextRows[0]?.id || null;
          return prev;
        });
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load broadcasts');
      } finally { if (mounted) setLoading(false); }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { mounted = false; clearInterval(t); };
  }, [divisionId, isSuperAdmin]);

  // ── Load recipient details ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedRunId) { setRecipients([]); return; }
    let mounted = true;
    setDetailLoading(true);
    api.getBroadcastRun(selectedRunId, divisionId || undefined)
      .then((out) => { if (mounted) setRecipients(out.run.recipients || []); })
      .catch((e: unknown) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load run details'); })
      .finally(() => { if (mounted) setDetailLoading(false); });
    return () => { mounted = false; };
  }, [divisionId, selectedRunId]);

  // ── Filter rows ────────────────────────────────────────────────────
  const visibleRows = rows.filter((r) => {
    if (tab === 'upcoming' && !isUpcoming(r)) return false;
    if (runSearch.trim()) {
      const q = runSearch.trim().toLowerCase();
      return r.list?.name?.toLowerCase().includes(q) || r.templateName?.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedRun = rows.find((r) => r.id === selectedRunId) || null;

  const reloadRuns = useCallback(async () => {
    const out = await api.listBroadcastRuns(divisionId || undefined);
    setRows(out.runs || []);
  }, [divisionId]);

  const handleCancel = async (runId: string) => {
    if (!confirm('Cancel this scheduled broadcast? Recipients will not receive the message.')) return;
    setActionBusy(runId); setActionNote('');
    try {
      await api.cancelBroadcastRun(runId, divisionId || undefined);
      setActionNote('Broadcast cancelled.');
      await reloadRuns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel broadcast');
    } finally { setActionBusy(null); }
  };

  const handleRetry = async (runId: string) => {
    if (!confirm('Retry all failed recipients for this broadcast?')) return;
    setActionBusy(runId); setActionNote('');
    try {
      const out = await api.retryBroadcastRun(runId, divisionId || undefined);
      const exhausted = Number(out.exhausted || 0);
      const maxAttempts = Number(out.maxAttempts || BROADCAST_RETRY_LIMIT);
      setActionNote(
        out.message || (
          exhausted > 0
            ? `Retry started. ${exhausted} recipient(s) skipped after reaching retry limit (${maxAttempts}).`
            : 'Retry started.'
        )
      );
      await reloadRuns();
      // Reload recipient details
      if (selectedRunId === runId) {
        const detail = await api.getBroadcastRun(runId, divisionId || undefined);
        setRecipients(detail.run.recipients || []);
      }
    } catch (e: unknown) {
      const err = e as any;
      const details = err?.details || {};
      const exhausted = Number(details?.exhausted || 0);
      const maxAttempts = Number(details?.maxAttempts || BROADCAST_RETRY_LIMIT);
      if (details?.error && exhausted > 0) {
        setError(`${details.error} (${exhausted} recipient(s) exhausted at ${maxAttempts} attempts)`);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to retry broadcast');
      }
    } finally { setActionBusy(null); }
  };

  const shownRecipients = recipients.filter((r) => {
    if (recipientFilter === 'EXHAUSTED') {
      if (!(r.status === 'FAILED' && r.attemptCount >= BROADCAST_RETRY_LIMIT)) return false;
    } else if (recipientFilter !== 'ALL' && r.status !== recipientFilter) {
      return false;
    }
    if (!recipientSearch.trim()) return true;
    const q = recipientSearch.trim().toLowerCase();
    const name = `${r.lead?.firstName || ''} ${r.lead?.lastName || ''}`.toLowerCase();
    return name.includes(q) || r.phone.toLowerCase().includes(q) || String(r.error || '').toLowerCase().includes(q);
  });

  const upcomingCount = rows.filter(isUpcoming).length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Scheduled broadcasts</h1>
          <p className="text-sm text-text-secondary">Track scheduled and completed WhatsApp template broadcasts.</p>
        </div>
        <Link href="/broadcast-lists" className="btn-secondary text-sm">
          <Radio className="h-4 w-4" /> Broadcast lists
        </Link>
      </div>

      {error && <div className="card p-3 text-sm text-red-700 bg-red-50 ring-1 ring-red-200">{error}</div>}
      {actionNote && <div className="card p-3 text-sm text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200">{actionNote}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle">
        {(['upcoming', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t === 'upcoming' ? (
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" /> Upcoming
                {upcomingCount > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {upcomingCount}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> All broadcasts
                <span className="text-text-tertiary text-[11px]">({rows.length})</span>
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Runs list */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2">
          <Search className="h-4 w-4 text-text-tertiary shrink-0" />
          <input
            className="w-full bg-transparent outline-none text-sm"
            placeholder="Search by list name or template…"
            value={runSearch}
            onChange={(e) => setRunSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="p-10 flex justify-center text-text-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-10 text-center">
            <Clock3 className="h-8 w-8 mx-auto mb-2 text-text-tertiary opacity-40" />
            <p className="text-sm text-text-secondary">
              {tab === 'upcoming' ? 'No upcoming scheduled broadcasts.' : 'No broadcasts found.'}
            </p>
          </div>
        ) : (
          <div>
            {visibleRows.map((row) => (
              <div
                key={row.id}
                className={`px-4 py-3 border-b border-border-subtle cursor-pointer transition-colors ${
                  selectedRunId === row.id ? 'bg-brand-50/40 ring-1 ring-inset ring-brand-100' : 'hover:bg-surface-secondary/60'
                }`}
                onClick={() => setSelectedRunId(row.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-text-primary truncate">{row.list?.name || '—'}</p>
                      <StatusChip status={row.status} />
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Template: <span className="font-medium">{row.templateName}</span>
                      <span className="text-text-tertiary ml-1">· {row.templateLanguage}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-tertiary">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {row.totalRecipients.toLocaleString()} recipients
                      </span>
                      {row.status === 'SCHEDULED' && row.scheduledAt && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <Clock3 className="h-3 w-3" /> {fmtUAE(row.scheduledAt)}
                        </span>
                      )}
                      {row.status !== 'SCHEDULED' && (
                        <span>{fmtUAEShort(row.updatedAt)}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: progress + actions */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="w-36">
                      {row.status === 'SCHEDULED' ? (
                        <p className="text-xs text-amber-600 flex items-center gap-1 justify-end">
                          <Calendar className="h-3.5 w-3.5" /> Scheduled
                        </p>
                      ) : (
                        <ProgressBar sent={row.sentCount} delivered={row.deliveredCount} read={row.readCount} failed={row.failedCount} total={row.totalRecipients} />
                      )}
                    </div>

                    {/* Action buttons — stop click propagating to row selection */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {row.status === 'SCHEDULED' && (
                        <button
                          className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                          disabled={actionBusy === row.id}
                          onClick={() => handleCancel(row.id)}
                        >
                          {actionBusy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Cancel
                        </button>
                      )}
                      {(row.status === 'COMPLETED' || row.status === 'FAILED') && row.failedCount > 0 && (
                        <button
                          className="flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                          disabled={actionBusy === row.id}
                          onClick={() => handleRetry(row.id)}
                        >
                          {actionBusy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Retry {row.failedCount} failed
                        </button>
                      )}
                    </div>
                  </div>

                  <ChevronRight className={`h-4 w-4 shrink-0 mt-1 transition-colors ${selectedRunId === row.id ? 'text-brand-500' : 'text-text-tertiary'}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recipient drill-down */}
      {selectedRun && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex flex-wrap items-center gap-3 justify-between bg-surface-secondary/40">
            <div>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                Recipients — {selectedRun.list?.name}
                <StatusChip status={selectedRun.status} />
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                Template: {selectedRun.templateName} · {selectedRun.totalRecipients} total ·{' '}
                {selectedRun.sentCount} sent · {selectedRun.deliveredCount} delivered · {selectedRun.readCount} read · {selectedRun.failedCount} failed
                {selectedRun.scheduledAt && (
                  <> · Scheduled: {fmtUAE(selectedRun.scheduledAt)}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Search name / phone / error"
                className="input input-sm min-w-[200px] text-sm"
              />
              <select
                value={recipientFilter}
                onChange={(e) => setRecipientFilter(e.target.value as typeof recipientFilter)}
                className="input input-sm text-sm"
              >
                <option value="ALL">All</option>
                <option value="SENT">Sent</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
                <option value="EXHAUSTED">Exhausted (limit reached)</option>
              </select>
            </div>
          </div>

          {detailLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-text-tertiary" /></div>
          ) : shownRecipients.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-tertiary">No recipients match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-secondary text-text-tertiary text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Recipient</th>
                    <th className="text-left px-4 py-2 font-medium">Phone</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Sent at</th>
                    <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Delivered at</th>
                    <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Read at</th>
                    <th className="text-left px-4 py-2 font-medium">Error</th>
                    <th className="text-left px-4 py-2 font-medium">Tries</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRecipients.map((r) => (
                    <tr key={r.id} className="border-t border-border-subtle hover:bg-surface-secondary/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-text-primary">
                            {`${r.lead?.firstName || ''} ${r.lead?.lastName || ''}`.trim() || '—'}
                          </span>
                          {r.lead?.whatsappOptOut && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>
                              WA opt-out
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{r.phone}</td>
                      <td className="px-4 py-2"><RecipientBadge status={r.status} /></td>
                      <td className="px-4 py-2 text-text-tertiary text-xs whitespace-nowrap">{r.sentAt ? fmtUAE(r.sentAt) : '—'}</td>
                      <td className="px-4 py-2 text-text-tertiary text-xs whitespace-nowrap hidden lg:table-cell">{r.deliveredAt ? fmtUAE(r.deliveredAt) : '—'}</td>
                      <td className="px-4 py-2 text-text-tertiary text-xs whitespace-nowrap hidden lg:table-cell">{r.readAt ? fmtUAE(r.readAt) : '—'}</td>
                      <td className="px-4 py-2 text-xs text-red-600 max-w-[260px] truncate" title={r.error || ''}>
                        {r.error || '—'}
                      </td>
                      <td className="px-4 py-2 text-center text-xs">
                        <div className="inline-flex items-center gap-1.5">
                          <span>{r.attemptCount}</span>
                          {r.status === 'FAILED' && r.attemptCount >= BROADCAST_RETRY_LIMIT && (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-red-100 text-red-700 border border-red-200">
                              limit reached
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
