'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore } from '@/lib/permissions';
import { premiumConfirm } from '@/lib/premiumDialogs';
import {
  Search, MoreVertical, Upload, Trash2, Loader2, Send, X,
  Package, Store, MessageCircle, Filter, Check, CheckCheck,
  AlertCircle, Clock, ChevronRight, Users, Calendar,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────
type ListRow = { id: string; name: string; slug: string | null; memberCount: number; updatedAt: string };
type MemberRow = { id: string; phone: string; displayName: string | null; lead: any };
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

// ─── Template helpers ─────────────────────────────────────────────────
function getComponent(components: any[], type: string) {
  return (components || []).find((c: any) => String(c?.type || '').toUpperCase() === type.toUpperCase());
}
function headerText(components: any[]) {
  const h = getComponent(components, 'HEADER');
  return h?.format === 'TEXT' ? String(h.text || '') : '';
}
function bodyText(components: any[]) {
  return String(getComponent(components, 'BODY')?.text || '');
}
function footerText(components: any[]) {
  return String(getComponent(components, 'FOOTER')?.text || '');
}
function buttons(components: any[]) {
  return (getComponent(components, 'BUTTONS')?.buttons || []) as any[];
}

// ─── Date/time helpers ────────────────────────────────────────────────
const UAE_TZ = 'Asia/Dubai'; // UTC+4
function fmtUAE(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-AE', { timeZone: UAE_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-AE', { timeZone: UAE_TZ, hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-AE', { timeZone: UAE_TZ, day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}
/** Returns "YYYY-MM-DDTHH:MM" in UAE time for a datetime-local input default */
function toUAELocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const uae = new Date(d.toLocaleString('en-US', { timeZone: UAE_TZ }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${uae.getFullYear()}-${pad(uae.getMonth() + 1)}-${pad(uae.getDate())}T${pad(uae.getHours())}:${pad(uae.getMinutes())}`;
}
/** Converts "YYYY-MM-DDTHH:MM" from UAE time to UTC ISO string */
function uaeInputToISO(local: string) {
  // Append UAE offset +04:00 so Date parses it correctly
  return new Date(`${local}:00+04:00`).toISOString();
}

function pct(num: number, total: number) {
  if (!total) return '0.0%';
  return `${((num / total) * 100).toFixed(1)}%`;
}

// ─── Status badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: BroadcastRun['status'] }) {
  const cls =
    status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
    status === 'RUNNING'   ? 'bg-blue-100 text-blue-700 animate-pulse' :
    status === 'FAILED'    ? 'bg-red-100 text-red-700' :
    status === 'SCHEDULED' ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-500';
  const label =
    status === 'SCHEDULED' ? 'Upcoming' :
    status === 'COMPLETED' ? 'Completed' :
    status === 'RUNNING'   ? 'Running' :
    status === 'FAILED'    ? 'Failed' :
    status;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {status === 'SCHEDULED' && <Clock className="h-3 w-3" />}
      {status === 'COMPLETED' && <Check className="h-3 w-3" />}
      {status === 'FAILED'   && <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

// ─── Single stat row inside the bubble ───────────────────────────────
function InlineStatRow({ icon, label, count, total, danger = false, viewLink }: {
  icon: React.ReactNode; label: string; count: number; total: number;
  danger?: boolean; viewLink?: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b border-black/[0.05] last:border-0 text-[12.5px] ${danger ? 'text-red-600' : 'text-gray-700'}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="tabular-nums font-semibold w-12 text-right shrink-0">{count.toLocaleString()}</span>
      <span className="flex-1 text-gray-600">— {label}</span>
      <span className={`tabular-nums text-[11px] font-medium w-12 text-right shrink-0 ${danger ? 'text-red-500' : 'text-gray-400'}`}>
        {pct(count, total)}
      </span>
      {danger && viewLink && (
        <Link href={viewLink} className="text-[11px] text-red-600 hover:underline shrink-0 ml-1">View reasons</Link>
      )}
      <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
    </div>
  );
}

// ─── Single run — template bubble + stats unified ─────────────────────
function RunBubble({ run, tplMap }: { run: BroadcastRun; tplMap: Record<string, any> }) {
  const tpl   = tplMap[run.templateName];
  const hText = tpl ? headerText(tpl.components)  : '';
  const bText = tpl ? bodyText(tpl.components)    : '';
  const fText = tpl ? footerText(tpl.components)  : '';
  const btns  = tpl ? buttons(tpl.components)     : [];

  const total     = run.totalRecipients || 0;
  const sent      = run.sentCount || 0;
  const delivered = run.deliveredCount || 0;
  const read      = run.readCount || 0;
  const replied   = run.repliedCount || 0;
  const failed    = run.failedCount || 0;
  const pending   = Math.max(0, total - sent - failed);
  const noResponse = Math.max(0, sent - read);

  return (
    <div className="mb-4 flex flex-col items-end">
      {/* Date chip */}
      <div className="w-full flex justify-center mb-2">
        <span className="text-[11px] font-semibold text-gray-500 bg-white/90 px-3 py-1 rounded-full shadow-sm">
          {fmtDate(run.scheduledAt || run.createdAt)}
        </span>
      </div>

      {/* ONE unified bubble: message content + stats */}
      <div className="max-w-[360px] w-full rounded-xl rounded-tr-none shadow-sm overflow-hidden bg-[#d9fdd3]">

        {/* ── Template name + status ── */}
        <div className="px-3 pt-2.5 pb-1 flex items-center justify-between gap-2 border-b border-black/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 truncate">
            {run.templateName.replace(/_/g, ' ')}
          </span>
          <StatusBadge status={run.status} />
        </div>

        {/* ── Template body ── */}
        <div className="px-3 pt-2 pb-2 space-y-1">
          {hText && <p className="text-[14px] font-bold text-gray-900 leading-snug">{hText}</p>}
          {bText ? (
            <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">{bText}</p>
          ) : (
            <p className="text-[12px] italic text-gray-400">Template body not available.</p>
          )}
          {fText && <p className="text-[11px] text-gray-500 mt-1">{fText}</p>}
          {btns.length > 0 && (
            <div className="pt-1.5 border-t border-black/10 flex flex-wrap gap-1.5">
              {btns.map((b: any, i: number) => (
                <span key={i} className="text-[11px] font-medium text-sky-600 border border-sky-200 rounded-full px-2 py-0.5 bg-white/60">
                  {b.text}
                </span>
              ))}
            </div>
          )}
          {/* Timestamp row */}
          <div className="flex justify-end items-center gap-1 pt-0.5">
            <span className="text-[11px] text-gray-400">{fmtTime(run.scheduledAt || run.createdAt)}</span>
            <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
          </div>
        </div>

        {/* ── Stats (same bubble, slightly lighter bg) ── */}
        <div className="bg-[#c8f0c0]/60 border-t border-black/[0.07]">
          <InlineStatRow icon={<CheckCheck    className="h-3.5 w-3.5 text-emerald-600" />} label="Sent to"         count={sent}       total={total} />
          <InlineStatRow icon={<Check         className="h-3.5 w-3.5 text-sky-500"     />} label="Delivered to"    count={delivered}  total={total} />
          <InlineStatRow icon={<CheckCheck    className="h-3.5 w-3.5 text-blue-500"    />} label="Read by"         count={read}       total={total} />
          <InlineStatRow icon={<Send          className="h-3.5 w-3.5 text-purple-500"  />} label="Replied by"      count={replied}    total={total} />
          <InlineStatRow icon={<MessageCircle className="h-3.5 w-3.5 text-gray-400"    />} label="No response by"  count={noResponse} total={total} />
          <InlineStatRow icon={<Clock         className="h-3.5 w-3.5 text-amber-500"   />} label="Pending"         count={pending}    total={total} />
          {failed > 0 && (
            <InlineStatRow icon={<AlertCircle className="h-3.5 w-3.5 text-red-500" />} label="Failed" count={failed} total={total} danger viewLink="/scheduled-broadcasts" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────
export default function BroadcastListsPage() {
  const { user } = useAuthStore();
  const { hasPermission } = usePermissionsStore();
  const canImport = !!(user && hasPermission(user.id, user.role, 'import'));
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const divisionId = typeof window !== 'undefined' && isSuperAdmin ? localStorage.getItem('activeDivisionId') : null;

  const [lists, setLists] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultNote, setResultNote] = useState('');

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, { members: MemberRow[] }>>({});
  const [memberSearch, setMemberSearch] = useState('');

  const [runsByList, setRunsByList] = useState<Record<string, BroadcastRun[]>>({});
  const [runsLoading, setRunsLoading] = useState(false);
  const runsScrollRef = useRef<HTMLDivElement>(null);

  // Templates keyed by name for bubble rendering
  const [tplMap, setTplMap] = useState<Record<string, any>>({});
  const [tplLoaded, setTplLoaded] = useState(false);

  // Template picker + send flow
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledAtUAE, setScheduledAtUAE] = useState(''); // datetime-local value in UAE time

  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [waNumbers, setWaNumbers] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedWaNumber, setSelectedWaNumber] = useState('');
  const [sendBusy, setSendBusy] = useState(false);

  // ── Load lists ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (isSuperAdmin && !divisionId) { setLists([]); setSelectedListId(null); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const res = await api.listBroadcastLists(divisionId || undefined);
      const rows = res.lists || [];
      setLists(rows);
      setSelectedListId((prev) => prev || rows[0]?.id || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load lists');
    } finally { setLoading(false); }
  }, [divisionId, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── Load all runs ──────────────────────────────────────────────────
  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await api.listBroadcastRuns(divisionId || undefined);
      const grouped: Record<string, BroadcastRun[]> = {};
      for (const r of (res.runs || [])) {
        const lid = (r as any).list?.id ?? (r as any).listId;
        if (!lid) continue;
        if (!grouped[lid]) grouped[lid] = [];
        grouped[lid].push(r as BroadcastRun);
      }
      setRunsByList(grouped);
    } catch { /* non-critical */ } finally { setRunsLoading(false); }
  }, [divisionId]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // ── Scroll center pane to bottom when runs load / list changes ────
  useEffect(() => {
    if (runsScrollRef.current) {
      runsScrollRef.current.scrollTop = runsScrollRef.current.scrollHeight;
    }
  }, [runsByList, selectedListId]);

  // ── Load templates for bubble rendering ───────────────────────────
  useEffect(() => {
    if (tplLoaded) return;
    api.listWhatsAppTemplates(divisionId || undefined)
      .then((res) => {
        const map: Record<string, any> = {};
        for (const t of (res.templates || [])) map[t.name] = t;
        setTplMap(map);
      })
      .catch(() => {})
      .finally(() => setTplLoaded(true));
  }, [divisionId, tplLoaded]);

  // ── Open list (fetch members) ──────────────────────────────────────
  const openList = async (id: string) => {
    setSelectedListId(id);
    if (!detailById[id]) {
      setDetailLoading(id);
      try {
        const res = await api.getBroadcastList(id, divisionId || undefined);
        setDetailById((prev) => ({ ...prev, [id]: { members: res.list.members || [] } }));
      } catch { setDetailById((prev) => ({ ...prev, [id]: { members: [] } })); }
      finally { setDetailLoading(null); }
    }
  };

  const selectedList = lists.find((l) => l.id === selectedListId) || null;
  const selectedMembers = selectedList ? detailById[selectedList.id]?.members || [] : [];
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return selectedMembers;
    return selectedMembers.filter((m) => {
      const name = (m.displayName || `${m.lead?.firstName || ''} ${m.lead?.lastName || ''}`).toLowerCase();
      return name.includes(q) || String(m.phone || '').toLowerCase().includes(q);
    });
  }, [memberSearch, selectedMembers]);

  const listRuns: BroadcastRun[] = selectedListId ? (runsByList[selectedListId] || []) : [];

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.name} ${t.category || ''}`.toLowerCase().includes(q));
  }, [templateSearch, templates]);

  const selectedTemplateVarKeys = useMemo(() => {
    if (!selectedTemplate?.components) return [] as string[];
    const keys = new Set<string>();
    for (const c of selectedTemplate.components) {
      const text = String(c?.text || '');
      const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
      for (const m of matches) keys.add(m.replace(/\{|\}/g, '').trim());
    }
    return Array.from(keys);
  }, [selectedTemplate]);

  // ── Open template picker ───────────────────────────────────────────
  const openTemplatePicker = async () => {
    if (!selectedList) return;
    setShowTemplatePicker(true); setTemplateLoading(true);
    setSelectedTemplateId(''); setTemplateVars({}); setTemplateSearch(''); setError('');
    try {
      const tRes = await api.listWhatsAppTemplates(divisionId || undefined);
      const approved = (tRes.templates || []).filter((t: any) => String(t.status || '').toUpperCase() === 'APPROVED');
      setTemplates(approved);
      setSelectedTemplateId(approved[0]?.id || '');
      // Also update tplMap
      const map: Record<string, any> = { ...tplMap };
      for (const t of tRes.templates || []) map[t.name] = t;
      setTplMap(map);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load templates'); }
    finally { setTemplateLoading(false); }

    try {
      const ws = await api.getWhatsAppSettings(divisionId || undefined);
      const nums = (ws.whatsappNumbers || []).map((n: any, idx: number) => ({
        id: String(n.phoneNumberId || `number-${idx}`),
        label: `${n.label || 'WhatsApp'}${n.displayPhone ? ` (${n.displayPhone})` : ''}`,
      }));
      setWaNumbers(nums); setSelectedWaNumber(nums[0]?.id || '');
    } catch { setWaNumbers([]); setSelectedWaNumber(''); }
  };

  // ── Run broadcast ──────────────────────────────────────────────────
  const runBroadcast = async () => {
    if (!selectedList || !selectedTemplateId) return;
    setSendBusy(true); setError(''); setResultNote('');
    try {
      const scheduledAt = sendMode === 'later' ? uaeInputToISO(scheduledAtUAE) : undefined;
      const out = await api.sendBroadcastTemplate(
        selectedList.id,
        { templateId: selectedTemplateId, variables: templateVars, mode: sendMode, scheduledAt: scheduledAt ?? null },
        divisionId || undefined
      );
      const skipped = (out as any).skippedDoNotCall ?? 0;
      const skippedNote = skipped > 0 ? ` · ${skipped} opted-out leads skipped.` : '';
      if (sendMode === 'now') {
        const s = out.sent ?? 0, f = out.failed ?? 0;
        setResultNote(f > 0 ? `Sent ${s}, failed ${f}.${skippedNote}` : `Broadcast sent to ${s} leads.${skippedNote}`);
      } else {
        setResultNote(`Broadcast scheduled for ${fmtUAE(scheduledAt!)}.${skippedNote}`);
      }
      setShowConfirmDialog(false); setShowSendDialog(false); setShowTemplatePicker(false);
      loadRuns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Broadcast send failed');
    } finally { setSendBusy(false); }
  };

  // ── Delete list ────────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    const ok = await premiumConfirm({
      title: 'Delete broadcast list?',
      message: `Delete "${name}" and all members? This cannot be undone.`,
      confirmText: 'Delete', cancelText: 'Cancel', variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteBroadcastList(id, divisionId || undefined);
      setLists((prev) => prev.filter((l) => l.id !== id));
      setSelectedListId((prev) => (prev === id ? null : prev));
      setDetailById((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Broadcast lists</h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs"><Filter className="h-3.5 w-3.5" /> Sort</button>
          {canImport && (
            <Link href="/import?module=whatsapp_broadcast" className="btn-secondary text-xs">
              <Upload className="h-3.5 w-3.5" /> Import
            </Link>
          )}
          <button className="btn-icon"><MoreVertical className="h-4 w-4" /></button>
        </div>
      </div>

      {isSuperAdmin && !divisionId && (
        <div className="card p-4 text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200">
          Select a division to load broadcast lists.
        </div>
      )}
      {error && <div className="card p-3 text-sm text-red-700 bg-red-50 ring-1 ring-red-200">{error}</div>}
      {resultNote && <div className="card p-3 text-sm text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200">{resultNote}</div>}

      {loading ? (
        <div className="card p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-text-tertiary" /></div>
      ) : lists.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 text-text-tertiary opacity-50" />
          <p className="text-sm font-medium text-text-primary">No broadcast lists yet</p>
          <p className="text-2xs mt-1">
            Import from <Link href="/import?module=whatsapp_broadcast" className="text-brand-600 hover:underline">Import → WhatsApp Broadcast</Link>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-3 h-[calc(100vh-210px)] min-h-[560px]">

          {/* ── Left: lists ──────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-3 card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border-subtle grid grid-cols-3 gap-2">
              <Link href="/import?module=whatsapp_broadcast" className="btn-secondary text-xs justify-center">
                <Upload className="h-3 w-3" /> Excel
              </Link>
              <button className="btn-secondary text-xs justify-center">Sample</button>
              <button className="btn-secondary text-xs justify-center">Quick</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {lists.map((list) => (
                <div
                  key={list.id}
                  className={`px-3 py-2.5 border-b border-border-subtle cursor-pointer group flex items-start justify-between ${
                    selectedListId === list.id ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/50'
                  }`}
                  onClick={() => openList(list.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary truncate">{list.name}</p>
                    <p className="text-2xs text-text-tertiary mt-0.5">
                      {list.memberCount.toLocaleString()} Members
                      {(runsByList[list.id]?.length ?? 0) > 0 && (
                        <span className="ml-1.5 text-brand-500">· {runsByList[list.id].length} run{runsByList[list.id].length !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>
                  <button
                    className="p-1.5 text-red-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleDelete(list.id, list.name); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border-subtle">
              <Link href="/import?module=whatsapp_broadcast" className="btn-primary w-full justify-center text-sm">
                + New List
              </Link>
            </div>
          </div>

          {/* ── Centre: runs as bubbles ───────────────────────── */}
          <div className="col-span-12 lg:col-span-6 card overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-semibold text-text-primary">{selectedList?.name || 'Select a list'}</p>
                <p className="text-2xs text-text-tertiary">{(selectedList?.memberCount || 0).toLocaleString()} members</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs">Manage Access</button>
                <Link href="/import?module=whatsapp_broadcast" className="btn-secondary text-xs">
                  <Upload className="h-3.5 w-3.5" /> Import
                </Link>
              </div>
            </div>

            {/* Scrollable bubble area */}
            <div ref={runsScrollRef} className="flex-1 overflow-y-auto bg-[#f1f0ea] relative">
              <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#d2d1ca_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
              <div className="relative p-4">
                {!selectedList ? (
                  <div className="flex flex-col items-center justify-center h-48 text-text-tertiary">
                    <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">Select a list to view broadcasts</p>
                  </div>
                ) : runsLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                ) : listRuns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
                    <Send className="h-8 w-8 text-gray-300" />
                    <p className="text-sm font-medium text-gray-600">No broadcasts yet</p>
                    <p className="text-xs text-gray-400">Send a template to see delivery stats here.</p>
                  </div>
                ) : (
                  listRuns.map((run) => (
                    <RunBubble key={run.id} run={run} tplMap={tplMap} />
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-border-subtle p-3 flex justify-center gap-2 shrink-0">
              <button className="btn-secondary text-sm" disabled><Package className="h-4 w-4" /> Send products</button>
              <button className="btn-secondary text-sm" disabled><Store className="h-4 w-4" /> Send catalogue</button>
              <button className="btn-primary text-sm" onClick={openTemplatePicker} disabled={!selectedList}>
                <Send className="h-4 w-4" /> Send template
              </button>
            </div>
          </div>

          {/* ── Right: members ────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-3 card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border-subtle">
              <div className="input flex items-center gap-2">
                <Search className="h-4 w-4 text-text-tertiary" />
                <input
                  className="w-full bg-transparent outline-none text-sm"
                  placeholder="Search for members"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {detailLoading === selectedListId ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-text-tertiary" /></div>
              ) : filteredMembers.length === 0 ? (
                <p className="p-4 text-sm text-text-tertiary">{selectedList ? 'No members' : 'Select a list'}</p>
              ) : (
                filteredMembers.map((m) => (
                  <div key={m.id} className="px-3 py-2.5 border-b border-border-subtle hover:bg-surface-secondary/50">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
                        {(m.displayName || m.lead?.firstName || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {m.displayName || `${m.lead?.firstName || ''} ${m.lead?.lastName || ''}`.trim() || 'Unknown'}
                        </p>
                        <p className="text-2xs text-text-tertiary">{m.phone}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {selectedList && (
              <div className="p-2 border-t border-border-subtle">
                <Link href="/import?module=whatsapp_broadcast" className="btn-secondary text-xs w-full justify-center">
                  + Add a member
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Template picker modal ────────────────────────────────── */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold">Templates</h3>
              <button onClick={() => setShowTemplatePicker(false)} className="btn-icon"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4">
              {templateLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-text-secondary">No approved templates found.</p>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    <div className="input flex items-center gap-2">
                      <Search className="h-4 w-4 text-text-tertiary" />
                      <input className="w-full bg-transparent outline-none text-sm" placeholder="Search template..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {filteredTemplates.map((t: any) => (
                      <div key={t.id} className="border border-border-subtle rounded-lg p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary">{t.name}</p>
                          <p className="text-2xs text-text-tertiary mb-2">{t.category} · {t.language}</p>
                          {headerText(t.components) && <p className="text-xs font-bold text-gray-700 mb-1">{headerText(t.components)}</p>}
                          <p className="text-xs text-text-secondary bg-surface-secondary rounded p-2 line-clamp-3">{bodyText(t.components)}</p>
                          {footerText(t.components) && <p className="text-[11px] text-text-tertiary mt-1">{footerText(t.components)}</p>}
                        </div>
                        <button
                          className="btn-primary shrink-0"
                          onClick={() => { setSelectedTemplateId(t.id); setShowTemplatePicker(false); setShowSendDialog(true); }}
                        >
                          <Send className="h-4 w-4" /> Send
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Send dialog (variables + WA number) ─────────────────── */}
      {showSendDialog && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold">Send Template</h3>
              <button onClick={() => setShowSendDialog(false)} className="btn-icon"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Template preview */}
              <div className="rounded-lg border border-border-subtle p-3 bg-surface-secondary/40">
                <p className="text-sm font-semibold text-text-primary">{selectedTemplate.name}</p>
                <p className="text-2xs text-text-tertiary mb-2">{selectedTemplate.category} · {selectedTemplate.language}</p>
                {headerText(selectedTemplate.components) && (
                  <p className="text-sm font-bold text-gray-800 mb-1">{headerText(selectedTemplate.components)}</p>
                )}
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{bodyText(selectedTemplate.components)}</p>
                {footerText(selectedTemplate.components) && (
                  <p className="text-xs text-text-tertiary mt-2">{footerText(selectedTemplate.components)}</p>
                )}
                {buttons(selectedTemplate.components).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {buttons(selectedTemplate.components).map((b: any, i: number) => (
                      <span key={i} className="text-xs border border-sky-200 text-sky-600 rounded-full px-2.5 py-0.5">{b.text}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="label">Send broadcast via</label>
                <select className="input" value={selectedWaNumber} onChange={(e) => setSelectedWaNumber(e.target.value)}>
                  {waNumbers.length === 0 ? <option value="">Default WhatsApp number</option> :
                    waNumbers.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>

              {selectedTemplateVarKeys.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedTemplateVarKeys.map((key) => (
                    <div key={key}>
                      <label className="label">Variable — {key}</label>
                      <input className="input" value={templateVars[key] || ''}
                        onChange={(e) => setTemplateVars((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={`Enter ${key}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-border-subtle flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowSendDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => { setSendMode('now'); setShowConfirmDialog(true); }}>Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm + schedule modal ─────────────────────────────── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold">Send broadcast</h3>
              <button onClick={() => setShowConfirmDialog(false)} className="btn-icon"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6">
              <div className="h-14 w-14 rounded-full bg-brand-50 mx-auto flex items-center justify-center mb-4">
                <Send className="h-6 w-6 text-brand-600" />
              </div>
              <p className="text-center text-sm font-semibold text-text-primary">Ready to send?</p>
              <p className="text-center text-xs text-text-secondary mt-1 mb-4">
                This will send to{' '}
                <span className="font-semibold">{(selectedList?.memberCount || 0).toLocaleString()}</span>{' '}contacts.
              </p>

              {/* Send mode toggle */}
              <div className="flex rounded-lg border border-border-subtle overflow-hidden mb-4">
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${sendMode === 'now' ? 'bg-brand-600 text-white' : 'bg-white text-text-secondary hover:bg-surface-secondary'}`}
                  onClick={() => setSendMode('now')}
                >
                  <Check className="h-4 w-4 inline mr-1" /> Send now
                </button>
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${sendMode === 'later' ? 'bg-brand-600 text-white' : 'bg-white text-text-secondary hover:bg-surface-secondary'}`}
                  onClick={() => {
                    setSendMode('later');
                    // Default to 1 hour from now in UAE time
                    const d = new Date(Date.now() + 60 * 60 * 1000);
                    setScheduledAtUAE(toUAELocalInput(d.toISOString()));
                  }}
                >
                  <Calendar className="h-4 w-4 inline mr-1" /> Send later
                </button>
              </div>

              {/* Date/time picker for Send Later */}
              {sendMode === 'later' && (
                <div className="space-y-2 mb-4">
                  <label className="label flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Schedule date &amp; time (UAE / Dubai time)
                  </label>
                  <input
                    type="datetime-local"
                    className="input w-full"
                    value={scheduledAtUAE}
                    onChange={(e) => setScheduledAtUAE(e.target.value)}
                    min={toUAELocalInput(new Date().toISOString())}
                  />
                  <p className="text-2xs text-text-tertiary flex items-center gap-1">
                    <Clock className="h-3 w-3" /> All times are in UAE (GMT+4) timezone.
                  </p>
                  {scheduledAtUAE && (
                    <p className="text-2xs text-emerald-700 font-medium">
                      Will send: {fmtUAE(uaeInputToISO(scheduledAtUAE))}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-border-subtle flex justify-end gap-2">
              <button className="btn-secondary" disabled={sendBusy} onClick={() => setShowConfirmDialog(false)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={sendBusy || (sendMode === 'later' && !scheduledAtUAE)}
                onClick={runBroadcast}
              >
                {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {sendBusy ? 'Processing…' : sendMode === 'later' ? 'Schedule' : 'Send now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
