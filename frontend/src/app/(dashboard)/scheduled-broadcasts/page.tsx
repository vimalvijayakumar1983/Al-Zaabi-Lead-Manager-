'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  Loader2, Clock3, CheckCircle2, AlertCircle, PlayCircle,
  Radio, Search, ChevronRight, Calendar, Users,
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
  failedCount: number;
  createdAt: string;
  updatedAt: string;
};

type BroadcastRecipient = {
  id: string;
  leadId: string;
  phone: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  waMessageId: string | null;
  error: string | null;
  attemptCount: number;
  sentAt: string | null;
  lead: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
};

const UAE_TZ = 'Asia/Dubai';
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
function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  if (!total) return <span className="text-xs text-text-tertiary">—</span>;
  const sp = Math.min(100, (sent / total) * 100);
  const fp = Math.min(100 - sp, (failed / total) * 100);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${sp}%` }} />
          <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${fp}%` }} />
        </div>
        <span className="text-[10px] text-text-tertiary tabular-nums">{sent}/{total}</span>
      </div>
      <p className="text-[10px] text-text-tertiary">
        {pct(sent, total)} sent · {failed > 0 ? <span className="text-red-500">{failed} failed</span> : '0 failed'}
      </p>
    </div>
  );
}

// ─── Recipient status badge ───────────────────────────────────────────
function RecipientBadge({ status }: { status: BroadcastRecipient['status'] }) {
  const cfg = { SENT: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', PENDING: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg[status]}`}>{status}</span>;
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
  const [recipientFilter, setRecipientFilter] = useState<'ALL' | 'FAILED' | 'SENT' | 'PENDING'>('ALL');
  const [recipientSearch, setRecipientSearch] = useState('');

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

  const shownRecipients = recipients.filter((r) => {
    if (recipientFilter !== 'ALL' && r.status !== recipientFilter) return false;
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

                  {/* Right: progress */}
                  <div className="shrink-0 w-40">
                    {row.status === 'SCHEDULED' ? (
                      <p className="text-xs text-amber-600 flex items-center gap-1 justify-end">
                        <Calendar className="h-3.5 w-3.5" /> Scheduled
                      </p>
                    ) : (
                      <ProgressBar sent={row.sentCount} failed={row.failedCount} total={row.totalRecipients} />
                    )}
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
                {selectedRun.sentCount} sent · {selectedRun.failedCount} failed
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
                    <th className="text-left px-4 py-2 font-medium">WA Message ID</th>
                    <th className="text-left px-4 py-2 font-medium">Error</th>
                    <th className="text-left px-4 py-2 font-medium">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRecipients.map((r) => (
                    <tr key={r.id} className="border-t border-border-subtle hover:bg-surface-secondary/40">
                      <td className="px-4 py-2 font-medium text-text-primary">
                        {`${r.lead?.firstName || ''} ${r.lead?.lastName || ''}`.trim() || '—'}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{r.phone}</td>
                      <td className="px-4 py-2"><RecipientBadge status={r.status} /></td>
                      <td className="px-4 py-2 text-text-tertiary text-xs">{r.sentAt ? fmtUAE(r.sentAt) : '—'}</td>
                      <td className="px-4 py-2 text-text-tertiary text-xs truncate max-w-[160px]">{r.waMessageId || '—'}</td>
                      <td className="px-4 py-2 text-xs text-red-600 max-w-[200px] truncate">{r.error || '—'}</td>
                      <td className="px-4 py-2 text-center">{r.attemptCount}</td>
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
