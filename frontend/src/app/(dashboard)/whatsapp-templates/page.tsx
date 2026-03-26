'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { RefreshCw, AlertCircle, LayoutTemplate, Plus, Pencil, Trash2, X, ChevronRight, ChevronLeft, Search, SlidersHorizontal, Loader2 } from 'lucide-react';

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

type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string };

type TemplateDraft = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  headerEnabled: boolean;
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText: string;
  headerMediaMode: 'upload' | 'url';
  headerMediaUrl: string;
  headerMediaFileName: string;
  headerMediaObjectUrl: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
  sampleValues: Record<string, string>;
};

type WizardMode = 'create' | 'edit';
type WizardStep = 1 | 2 | 3 | 4;

const DEFAULT_DRAFT: TemplateDraft = {
  name: '',
  language: 'en_US',
  category: 'MARKETING',
  headerEnabled: false,
  headerFormat: 'NONE',
  headerText: '',
  headerMediaMode: 'upload',
  headerMediaUrl: '',
  headerMediaFileName: '',
  headerMediaObjectUrl: '',
  bodyText: '',
  footerText: '',
  buttons: [],
  sampleValues: {},
};
const TEMPLATE_DRAFT_STORAGE_KEY = 'wa_template_studio_draft_v1';
const TEMPLATE_LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ur', label: 'Urdu' },
];
const PREDEFINED_VARIABLE_LABELS = [
  'Chat Session',
  'Location',
  'companyId',
  'companyName',
  'networkFirst',
  'Tracking Code',
  'Inquiry Code',
];

function toNameSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function extractVarIndexes(text: string) {
  const set = new Set<number>();
  const regex = /\{\{(\d+)\}\}/g;
  const source = String(text || '');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function extractPlaceholderTokens(text: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  const source = String(text || '');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    const token = String(m[1] || '').trim();
    if (!token) continue;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function toPlaceholderKey(label: string) {
  const cleaned = String(label || '').replace(/[^A-Za-z0-9]+/g, '');
  return cleaned || 'Variable';
}

function buildTokenIndexMap(headerText: string, bodyText: string) {
  const ordered = [...extractPlaceholderTokens(headerText), ...extractPlaceholderTokens(bodyText)];
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of ordered) {
    if (!seen.has(t)) {
      seen.add(t);
      uniq.push(t);
    }
  }
  const map: Record<string, number> = {};
  uniq.forEach((t, i) => {
    map[t] = i + 1;
  });
  return map;
}

function convertTemplateTextToMetaPlaceholders(text: string, tokenIndexMap: Record<string, number>) {
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_match, tokenRaw) => {
    const token = String(tokenRaw || '').trim();
    const idx = tokenIndexMap[token];
    return idx ? `{{${idx}}}` : `{{${token}}}`;
  });
}

function convertTemplateTextToLocalMetaPlaceholders(text: string) {
  const tokens = extractPlaceholderTokens(text);
  const localMap: Record<string, number> = {};
  tokens.forEach((t, i) => {
    localMap[t] = i + 1;
  });
  return {
    convertedText: convertTemplateTextToMetaPlaceholders(text, localMap),
    orderedTokens: tokens,
  };
}

function startsWithVariableToken(text: string) {
  return /^\s*\{\{[^}]+\}\}/.test(String(text || ''));
}

function endsWithVariableToken(text: string) {
  return /\{\{[^}]+\}\}\s*$/.test(String(text || ''));
}

function replaceVars(text: string, sampleValues: Record<string, string>) {
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_, tokenRaw) => {
    const token = String(tokenRaw || '').trim();
    return sampleValues[token] || `{{${token}}}`;
  });
}

function buildMetaComponents(draft: TemplateDraft) {
  const components: Record<string, unknown>[] = [];
  if (draft.headerEnabled && draft.headerFormat !== 'NONE') {
    if (draft.headerFormat === 'TEXT') {
      const { convertedText: convertedHeaderText, orderedTokens: headerTokens } =
        convertTemplateTextToLocalMetaPlaceholders(draft.headerText.trim());
      const c: Record<string, unknown> = {
        type: 'HEADER',
        format: 'TEXT',
        text: convertedHeaderText,
      };
      if (headerTokens.length > 0) {
        c.example = {
          header_text: [headerTokens.map((token) => draft.sampleValues[token] || `sample_${token}`).join(' ')],
        };
      }
      components.push(c);
    } else {
      const headerExample = draft.headerMediaUrl.trim() || draft.headerMediaFileName.trim();
      components.push({
        type: 'HEADER',
        format: draft.headerFormat,
        ...(headerExample ? { example: { header_handle: [headerExample] } } : {}),
      });
    }
  }

  const { convertedText: convertedBodyText, orderedTokens: bodyTokens } =
    convertTemplateTextToLocalMetaPlaceholders(draft.bodyText.trim());
  const body: Record<string, unknown> = {
    type: 'BODY',
    text: convertedBodyText,
  };
  if (bodyTokens.length > 0) {
    body.example = {
      body_text: [bodyTokens.map((token) => draft.sampleValues[token] || `sample_${token}`)],
    };
  }
  components.push(body);

  if (draft.footerText.trim()) {
    components.push({
      type: 'FOOTER',
      text: draft.footerText.trim(),
    });
  }

  if (draft.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: draft.buttons,
    });
  }
  return components;
}

function draftFromTemplate(row: any): TemplateDraft {
  const draft: TemplateDraft = { ...DEFAULT_DRAFT };
  draft.name = row?.name || '';
  draft.language = row?.language || 'en_US';
  draft.category = (String(row?.category || 'MARKETING').toUpperCase() as TemplateDraft['category']);
  const comps = Array.isArray(row?.components) ? row.components : [];
  for (const c of comps) {
    const type = String(c?.type || '').toUpperCase();
    if (type === 'HEADER') {
      draft.headerEnabled = true;
      const format = String(c?.format || 'TEXT').toUpperCase();
      draft.headerFormat = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(format) ? (format as any) : 'TEXT';
      if (draft.headerFormat === 'TEXT') draft.headerText = String(c?.text || '');
    } else if (type === 'BODY') {
      draft.bodyText = String(c?.text || '');
    } else if (type === 'FOOTER') {
      draft.footerText = String(c?.text || '');
    } else if (type === 'BUTTONS' && Array.isArray(c?.buttons)) {
      draft.buttons = c.buttons
        .map((b: any) => {
          const bt = String(b?.type || '').toUpperCase();
          if (bt === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: String(b?.text || '') };
          if (bt === 'URL') return { type: 'URL', text: String(b?.text || ''), url: String(b?.url || '') };
          if (bt === 'PHONE_NUMBER') {
            return { type: 'PHONE_NUMBER', text: String(b?.text || ''), phone_number: String(b?.phone_number || '') };
          }
          return null;
        })
        .filter(Boolean) as TemplateButton[];
    }
  }
  return draft;
}

export default function WhatsAppTemplatesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { divisionId, isSuperAdmin, ready } = useEffectiveDivisionId();
  const canSync = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const canManage = canSync;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardError, setWizardError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(DEFAULT_DRAFT);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftStorageKey = useMemo(
    () => `${TEMPLATE_DRAFT_STORAGE_KEY}:${divisionId || 'default'}`,
    [divisionId]
  );

  const listQuery = useQuery({
    queryKey: ['whatsapp-templates', divisionId],
    queryFn: () => api.listWhatsAppTemplates(divisionId),
    enabled: ready && (!isSuperAdmin || !!divisionId),
    // Auto-refresh every 60s while any template is in a non-terminal state
    refetchInterval: (query) => {
      const templates: Array<{ status?: string | null }> = query.state.data?.templates ?? [];
      const hasPending = templates.some((t) => ['PENDING', 'PAUSED', 'IN_APPEAL'].includes((t.status ?? '').toUpperCase()));
      return hasPending ? 60_000 : false;
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncWhatsAppTemplates(divisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; language: string; category: string; components: Record<string, unknown>[] }) =>
      api.createWhatsAppTemplate(payload, divisionId),
    onSuccess: () => {
      setWizardOpen(false);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; category: string; components: Record<string, unknown>[] }) =>
      api.updateWhatsAppTemplate(payload.id, { category: payload.category, components: payload.components }, divisionId),
    onSuccess: () => {
      setWizardOpen(false);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWhatsAppTemplate(id, divisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
    },
  });

  const superAdminBlocked = isSuperAdmin && !divisionId;
  const allVariableTokens = useMemo(() => {
    const merged = [...extractPlaceholderTokens(draft.bodyText), ...extractPlaceholderTokens(draft.headerText)];
    return Array.from(new Set(merged));
  }, [draft.bodyText, draft.headerText]);
  const maxButtons = draft.category === 'AUTHENTICATION' ? 0 : 3;

  useEffect(() => {
    if (!wizardOpen || wizardMode !== 'create') return;
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {}
  }, [wizardOpen, wizardMode, draft, draftStorageKey]);

  function statusClass(status: string | null) {
    const s = (status || '').toUpperCase();
    if (s === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
    if (s === 'PENDING') return 'bg-amber-100 text-amber-800';
    if (s === 'REJECTED') return 'bg-red-100 text-red-800';
    return 'bg-surface-tertiary text-text-secondary';
  }

  function openCreateWizard() {
    setWizardMode('create');
    setWizardStep(1);
    setWizardError('');
    setEditingId(null);
    let restored: TemplateDraft | null = null;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) restored = JSON.parse(raw);
    } catch {}
    setDraft(restored || DEFAULT_DRAFT);
    setWizardOpen(true);
  }

  function openEditWizard(row: any) {
    setWizardMode('edit');
    setWizardStep(1);
    setWizardError('');
    setEditingId(row.id);
    setDraft(draftFromTemplate(row));
    setWizardOpen(true);
  }

  function validateStep(step: WizardStep): string | null {
    if (step === 1) {
      if (!toNameSlug(draft.name)) return 'Template name is required and must contain letters/numbers.';
      if (!draft.language.trim()) return 'Language is required.';
      if (!draft.category) return 'Category is required.';
    }
    if (step === 2) {
      if (!draft.bodyText.trim()) return 'Body text is required.';
      if (startsWithVariableToken(draft.bodyText) || endsWithVariableToken(draft.bodyText)) {
        return 'Variables cannot be at the start or end of body text.';
      }
      if (draft.headerEnabled && draft.headerFormat === 'TEXT' && !draft.headerText.trim()) {
        return 'Header text is required when header format is TEXT.';
      }
      if (
        draft.headerEnabled &&
        draft.headerFormat === 'TEXT' &&
        (startsWithVariableToken(draft.headerText) || endsWithVariableToken(draft.headerText))
      ) {
        return 'Variables cannot be at the start or end of header text.';
      }
      if (
        draft.headerEnabled &&
        ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(draft.headerFormat) &&
        !draft.headerMediaUrl.trim() &&
        !draft.headerMediaFileName.trim()
      ) {
        return 'Media header requires URL or uploaded file.';
      }
    }
    if (step === 3) {
      for (const b of draft.buttons) {
        if (!b.text.trim()) return 'All buttons must have text.';
        if (b.type === 'URL' && !b.url.trim()) return 'URL button must have URL.';
        if (b.type === 'URL' && !/^https?:\/\//i.test(b.url.trim())) return 'URL button must start with http:// or https://';
        if (b.type === 'PHONE_NUMBER' && !b.phone_number.trim()) return 'Phone button must have phone number.';
        if (b.type === 'PHONE_NUMBER' && !/^\+?[0-9]{7,15}$/.test(b.phone_number.trim())) {
          return 'Phone button must be valid E.164 or digits.';
        }
      }
      if (draft.buttons.length > maxButtons) return `Max ${maxButtons} buttons allowed for ${draft.category}.`;
    }
    if (step === 4) {
      for (const token of allVariableTokens) {
        if (!draft.sampleValues[token]?.trim()) return `Sample value for variable {{${token}}} is required.`;
      }
    }
    return null;
  }

  async function submitWizard() {
    const err = validateStep(4);
    if (err) {
      setWizardError(err);
      return;
    }
    setWizardError('');
    const payload = {
      name: toNameSlug(draft.name),
      language: draft.language.trim(),
      category: draft.category,
      components: buildMetaComponents(draft),
    };
    try {
      if (wizardMode === 'create') {
        await createMutation.mutateAsync(payload);
        try {
          localStorage.removeItem(draftStorageKey);
        } catch {}
      } else if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          category: payload.category,
          components: payload.components,
        });
      }
    } catch (err: any) {
      setWizardError(err?.message || 'Failed to submit template');
    }
  }

  function insertBodyVariableAtCursor(token: string) {
    const el = bodyTextareaRef.current;
    if (!el) {
      setDraft((d) => ({
        ...d,
        bodyText: `${d.bodyText}${d.bodyText ? ' ' : ''}${token}`,
      }));
      return;
    }
    const start = el.selectionStart ?? draft.bodyText.length;
    const end = el.selectionEnd ?? start;
    const before = draft.bodyText.slice(0, start);
    const after = draft.bodyText.slice(end);
    const next = `${before}${token}${after}`;
    setDraft((d) => ({ ...d, bodyText: next }));
    requestAnimationFrame(() => {
      const input = bodyTextareaRef.current;
      if (!input) return;
      const pos = start + token.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    });
  }

  // ── Template table search/filter state ──────────────────────────────
  const [tplSearch, setTplSearch] = useState('');
  const [tplStatusFilter, setTplStatusFilter] = useState('ALL');
  const [tplCategoryFilter, setTplCategoryFilter] = useState('ALL');
  const [hoveredTpl, setHoveredTpl] = useState<{ id: string; top: number; right: number } | null>(null);
  const [previewTpl, setPreviewTpl] = useState<any | null>(null);

  // Close preview modal on Escape
  useEffect(() => {
    if (!previewTpl) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewTpl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewTpl]);

  const allTemplates = listQuery.data?.templates ?? [];
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      const q = tplSearch.toLowerCase();
      const matchSearch = !q || t.name.toLowerCase().includes(q);
      const matchStatus = tplStatusFilter === 'ALL' || (t.status || '').toUpperCase() === tplStatusFilter;
      const matchCat    = tplCategoryFilter === 'ALL' || (t.category || '').toUpperCase() === tplCategoryFilter;
      return matchSearch && matchStatus && matchCat;
    });
  }, [allTemplates, tplSearch, tplStatusFilter, tplCategoryFilter]);

  function getPreviewText(t: any) {
    const comps: any[] = t.components || [];
    const body = comps.find((c: any) => c.type === 'BODY');
    const text = body?.text || '';
    return text.slice(0, 60) + (text.length > 60 ? '…' : '');
  }
  function getHeaderText(t: any) {
    const comps: any[] = t.components || [];
    const h = comps.find((c: any) => c.type === 'HEADER');
    if (!h) return '';
    if (h.format === 'TEXT') return h.text || '';
    if (h.format === 'IMAGE') return '🖼 Image';
    if (h.format === 'VIDEO') return '🎬 Video';
    if (h.format === 'DOCUMENT') return '📄 Document';
    return '';
  }
  function getFooterText(t: any) {
    const comps: any[] = t.components || [];
    return comps.find((c: any) => c.type === 'FOOTER')?.text || '';
  }
  function getButtonsList(t: any) {
    const comps: any[] = t.components || [];
    return (comps.find((c: any) => c.type === 'BUTTONS')?.buttons || []) as Array<{ text: string; type: string }>;
  }
  function fmtDate(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 animate-fade-in p-4 md:p-6">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <LayoutTemplate className="h-6 w-6 text-brand-600" />
            <h1 className="text-xl font-bold">Templates</h1>
          </div>
          {listQuery.data?.lastSyncedAt && (
            <p className="text-xs text-text-tertiary mt-0.5">
              Last synced: {new Date(listQuery.data.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canSync && (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              disabled={superAdminBlocked || syncMutation.isPending || !ready}
              onClick={() => syncMutation.mutate()}
              title="Sync from Meta"
            >
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync from Meta</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={superAdminBlocked || !ready}
              onClick={openCreateWizard}
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          )}
        </div>
      </div>

      {/* Auto-refresh notice when templates are pending review */}
      {!superAdminBlocked && allTemplates.some((t) => ['PENDING', 'PAUSED', 'IN_APPEAL'].includes((t.status ?? '').toUpperCase())) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 opacity-70" />
          <span>Some templates are pending Meta review — status will auto-refresh every 60 seconds.</span>
        </div>
      )}

      {superAdminBlocked && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span>Select a <strong>division</strong> in the header switcher to load templates.</span>
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

      {/* ── Filter bar ── */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border-subtle justify-between">
          {/* Search */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
            <input
              className="bg-transparent outline-none text-sm w-full placeholder:text-text-tertiary"
              placeholder="Search template…"
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-end">
            <select
              className="input input-sm text-xs py-1 h-7 min-w-[100px]"
              value={tplStatusFilter}
              onChange={(e) => setTplStatusFilter(e.target.value)}
            >
              <option value="ALL">All status</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAUSED">Paused</option>
            </select>
            <select
              className="input input-sm text-xs py-1 h-7 min-w-[120px]"
              value={tplCategoryFilter}
              onChange={(e) => setTplCategoryFilter(e.target.value)}
            >
              <option value="ALL">All categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
            <span className="text-xs text-text-tertiary ml-1 whitespace-nowrap">
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary text-left text-[11px] uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-2.5 font-semibold">Template name</th>
                <th className="px-4 py-2.5 font-semibold w-56">Preview</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 font-semibold hidden lg:table-cell">Created on</th>
                <th className="px-4 py-2.5 font-semibold hidden lg:table-cell">Last updated</th>
                {canManage && <th className="px-4 py-2.5 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-text-tertiary">
                    Loading…
                  </td>
                </tr>
              )}
              {!listQuery.isLoading && filteredTemplates.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-text-tertiary">
                    {superAdminBlocked
                      ? 'Select a division to load templates.'
                      : tplSearch || tplStatusFilter !== 'ALL' || tplCategoryFilter !== 'ALL'
                        ? 'No templates match your filters.'
                        : 'No templates cached yet — sync from Meta to get started.'}
                  </td>
                </tr>
              )}
              {filteredTemplates.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-0 hover:bg-surface-secondary/50 relative group"
                >
                  {/* Template name + pills — single inline row */}
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-text-primary truncate text-sm">{t.name}</p>
                      {t.category && (
                        <span className="text-[10px] font-semibold uppercase bg-surface-tertiary text-text-tertiary rounded px-1.5 py-0.5 shrink-0">
                          {t.category}
                        </span>
                      )}
                      {t.language && (
                        <span className="text-[10px] text-text-tertiary shrink-0">{t.language}</span>
                      )}
                    </div>
                  </td>

                  {/* Preview cell — hover shows popover, click opens full modal */}
                  <td
                    className="px-4 py-3 w-56 cursor-pointer"
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoveredTpl({ id: t.id, top: rect.top, right: window.innerWidth - rect.right + rect.width });
                    }}
                    onMouseLeave={() => setHoveredTpl(null)}
                    onClick={() => { setHoveredTpl(null); setPreviewTpl(t); }}
                  >
                    <span className="text-xs text-brand-600 hover:text-brand-700 truncate block max-w-[200px] underline decoration-dotted underline-offset-2">
                      {getPreviewText(t) || <em className="text-text-tertiary italic">No body text</em>}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(t.status)}`}>
                      {t.status === 'APPROVED' && <span className="mr-1">✓</span>}
                      {t.status || '—'}
                    </span>
                    {t.rejectedReason && (
                      <p className="text-[10px] text-red-600 mt-0.5 max-w-[140px] truncate" title={t.rejectedReason}>
                       Rejection: {t.rejectedReason}
                      </p>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 text-xs text-text-secondary hidden md:table-cell">{t.category || '—'}</td>

                  {/* Created on */}
                  <td className="px-4 py-3 text-xs text-text-tertiary hidden lg:table-cell whitespace-nowrap">{fmtDate((t as any).createdAt)}</td>

                  {/* Last updated */}
                  <td className="px-4 py-3 text-xs text-text-tertiary hidden lg:table-cell whitespace-nowrap">{fmtDate((t as any).updatedAt)}</td>

                  {/* Actions */}
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit template"
                          onClick={() => openEditWizard(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon text-red-600"
                          title="Delete template"
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            const ok = window.confirm(`Delete template "${t.name}" from Meta and cache?`);
                            if (!ok) return;
                            await deleteMutation.mutateAsync(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Fixed-position hover preview — outside table so no scroll bleed ── */}
      {hoveredTpl && (() => {
        const t = filteredTemplates.find((x) => x.id === hoveredTpl.id);
        if (!t) return null;
        const POPOVER_W = 280;
        const MARGIN = 12;
        // Position to the LEFT of the table row (so it never overflows right edge)
        const leftPos = Math.max(8, window.innerWidth - hoveredTpl.right - POPOVER_W - MARGIN);
        // Clamp vertically so it doesn't fall off screen bottom
        const topPos = Math.min(hoveredTpl.top, window.innerHeight - 420);
        return (
          <div
            className="fixed z-[9999] w-[280px] bg-white rounded-xl shadow-2xl border border-border overflow-hidden pointer-events-none"
            style={{ top: topPos, left: leftPos }}
          >
            <div className="bg-[#e5ddd5] p-3">
              <div className="bg-[#d9fdd3] rounded-xl rounded-tl-none shadow-sm overflow-hidden">
                <div className="px-3 pt-2.5 pb-2 space-y-1.5">
                  {getHeaderText(t) && (
                    <p className="text-[13px] font-bold text-gray-900">{getHeaderText(t)}</p>
                  )}
                  {getPreviewText(t) ? (
                    <p className="text-[12.5px] text-gray-800 leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {(t.components || []).find((c: any) => c.type === 'BODY')?.text || ''}
                    </p>
                  ) : (
                    <p className="text-[12px] italic text-gray-400">No body text</p>
                  )}
                  {getFooterText(t) && (
                    <p className="text-[11px] text-gray-500">{getFooterText(t)}</p>
                  )}
                  <div className="flex justify-end pt-0.5">
                    <span className="text-[10px] text-gray-400">Preview</span>
                  </div>
                </div>
                {getButtonsList(t).length > 0 && (
                  <div className="border-t border-black/10 flex flex-col">
                    {getButtonsList(t).map((b: any, i: number) => (
                      <div key={i} className="px-3 py-2 text-center text-[12px] font-medium text-sky-600 border-b border-black/[0.05] last:border-0">
                        {b.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-3 py-2 bg-surface-secondary border-t border-border-subtle flex items-center gap-2 flex-wrap">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(t.status)}`}>
                {t.status || '—'}
              </span>
              {(t as any).rejectedReason && (
                <span className="text-[10px] text-red-600 truncate max-w-[160px]" title={(t as any).rejectedReason}>
                  {(t as any).rejectedReason}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Click-to-open template preview modal ── */}
      {previewTpl && (
        <div
          className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPreviewTpl(null)}
        >
          <div
            className="relative bg-[#e5ddd5] rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#075e54] text-white">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold uppercase">
                  {previewTpl.name?.[0] || 'T'}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{previewTpl.name?.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-white/70 leading-tight">{previewTpl.category} · {previewTpl.language}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewTpl(null)}
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chat bubble area */}
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <div className="flex justify-end">
                <div className="max-w-[90%] bg-[#d9fdd3] rounded-xl rounded-tr-none shadow-sm overflow-hidden">
                  {/* Header component */}
                  {getHeaderText(previewTpl) && (
                    <div className="px-3 pt-3 pb-1">
                      {(previewTpl.components || []).find((c: any) => c.type === 'HEADER')?.format === 'TEXT' ? (
                        <p className="text-[14px] font-bold text-gray-900">{getHeaderText(previewTpl)}</p>
                      ) : (
                        <div className="flex items-center gap-2 text-[12px] text-gray-500">
                          <span>{getHeaderText(previewTpl)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Body */}
                  <div className="px-3 py-2">
                    {(previewTpl.components || []).find((c: any) => c.type === 'BODY')?.text ? (
                      <p className="text-[13.5px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {(previewTpl.components || []).find((c: any) => c.type === 'BODY')?.text}
                      </p>
                    ) : (
                      <p className="text-[13px] italic text-gray-400">No body text</p>
                    )}
                  </div>

                  {/* Footer */}
                  {getFooterText(previewTpl) && (
                    <div className="px-3 pb-2">
                      <p className="text-[11px] text-gray-500">{getFooterText(previewTpl)}</p>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="px-3 pb-2 flex justify-end">
                    <span className="text-[10px] text-gray-400">Preview</span>
                  </div>

                  {/* Buttons */}
                  {getButtonsList(previewTpl).length > 0 && (
                    <div className="border-t border-black/10 flex flex-col">
                      {getButtonsList(previewTpl).map((b: any, i: number) => (
                        <div key={i} className="px-3 py-2.5 text-center text-[13px] font-medium text-sky-600 border-b border-black/[0.06] last:border-0">
                          {b.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status bar */}
            <div className="px-4 py-2.5 bg-white/80 border-t border-black/10 flex items-center justify-between gap-3">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(previewTpl.status)}`}>
                {previewTpl.status === 'APPROVED' && '✓ '}{previewTpl.status || '—'}
              </span>
              {previewTpl.rejectedReason && (
                <p className="text-[11px] text-red-600 flex-1 truncate" title={previewTpl.rejectedReason}>
                  {previewTpl.rejectedReason}
                </p>
              )}
              <p className="text-[11px] text-text-tertiary ml-auto">Press Esc to close</p>
            </div>
          </div>
        </div>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-2 md:p-4 flex items-center justify-center overflow-auto">
          <div className="w-full max-w-7xl bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {wizardMode === 'create' ? 'Create WhatsApp template' : 'Edit WhatsApp template'}
                </h2>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Step {wizardStep} of 4
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setWizardOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-0">
              <div className="p-5 space-y-4 border-r border-border lg:col-span-3">
                <div className="flex items-center gap-4 text-xs text-text-tertiary border-b border-border pb-3">
                  {(['Basic info', 'Content', 'Buttons', 'Variables'] as const).map((s, idx) => (
                    <span key={s} className={`inline-flex items-center gap-1 ${wizardStep === (idx + 1) ? 'text-brand-700 font-semibold' : ''}`}>
                      <span className={`h-4 w-4 rounded-full inline-flex items-center justify-center text-[10px] ${wizardStep === (idx + 1) ? 'bg-brand-100 text-brand-700' : 'bg-surface-tertiary text-text-tertiary'}`}>
                        {idx + 1}
                      </span>
                      {s}
                    </span>
                  ))}
                </div>

                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Template name</label>
                      <input
                        className="input"
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. booking_confirmation"
                        disabled={wizardMode === 'edit'}
                      />
                      <p className="text-2xs text-text-tertiary mt-1">Will be normalized to: {toNameSlug(draft.name) || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-surface-secondary/40">
                      <p className="text-xs font-semibold text-text-primary mb-2">Category</p>
                      <p className="text-2xs text-text-tertiary mb-3">Choose a category that best describes your message template.</p>
                      <div className="space-y-2">
                        {[
                          { key: 'MARKETING', title: 'Marketing', desc: 'Send promotions or announcements for products/services.', eta: '40-50%' },
                          { key: 'UTILITY', title: 'Utility', desc: 'Send updates about an existing order or account.', eta: '99%' },
                          { key: 'AUTHENTICATION', title: 'Authentication', desc: 'Send verification codes or identity confirmation.', eta: '89%' },
                        ].map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            className={`w-full text-left rounded-lg border px-3 py-2 ${draft.category === c.key ? 'border-brand-400 bg-brand-50' : 'border-border bg-white hover:bg-surface-secondary'}`}
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                category: c.key as TemplateDraft['category'],
                                buttons: c.key === 'AUTHENTICATION' ? [] : d.buttons.slice(0, 3),
                              }))
                            }
                          >
                            <p className="text-sm font-medium text-text-primary">{c.title}</p>
                            <p className="text-2xs text-text-tertiary">{c.desc}</p>
                            <p className="text-2xs text-text-tertiary mt-1">~ {c.eta} estimated delivery rate</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">Language</label>
                      <select
                        className="input"
                        value={draft.language}
                        onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                        disabled={wizardMode === 'edit'}
                      >
                        {TEMPLATE_LANGUAGES.map((lang) => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        id="headerEnabled"
                        type="checkbox"
                        checked={draft.headerEnabled}
                        onChange={(e) => setDraft((d) => ({ ...d, headerEnabled: e.target.checked, headerFormat: e.target.checked ? 'TEXT' : 'NONE' }))}
                      />
                      <label htmlFor="headerEnabled" className="text-sm text-text-primary">Include header</label>
                    </div>
                    {draft.headerEnabled && (
                      <div className="space-y-2 rounded-xl border border-border p-3 bg-surface-secondary/40">
                        <label className="label">Header (Optional)</label>
                        <p className="text-2xs text-text-tertiary -mt-1">
                          Add a title for your message. Your title can include up to one variable.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((fmt) => (
                            <button
                              key={fmt}
                              type="button"
                              className={`px-3 py-1.5 rounded-lg text-xs border ${draft.headerFormat === fmt ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-border bg-white text-text-secondary'}`}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  headerFormat: fmt,
                                  headerMediaFileName: '',
                                  headerMediaUrl: '',
                                  headerMediaObjectUrl: '',
                                }))
                              }
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                        {draft.headerFormat === 'TEXT' && (
                          <input
                            className="input"
                            value={draft.headerText}
                            onChange={(e) => setDraft((d) => ({ ...d, headerText: e.target.value }))}
                            placeholder="Header text"
                          />
                        )}
                        {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(draft.headerFormat) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-xs">
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="radio"
                                  checked={draft.headerMediaMode === 'upload'}
                                  onChange={() => setDraft((d) => ({ ...d, headerMediaMode: 'upload' }))}
                                />
                                Upload file
                              </label>
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="radio"
                                  checked={draft.headerMediaMode === 'url'}
                                  onChange={() => setDraft((d) => ({ ...d, headerMediaMode: 'url' }))}
                                />
                                Enter URL
                              </label>
                            </div>
                            <p className="text-2xs text-text-tertiary">
                              {draft.headerFormat === 'IMAGE'
                                ? 'Image type allowed: JPG, JPEG, PNG. File size limit: 5 MB.'
                                : draft.headerFormat === 'VIDEO'
                                ? 'Video type allowed: MP4. File size limit: 16 MB.'
                                : 'Document types allowed: PDF, DOC, DOCX. File size limit: 100 MB.'}
                            </p>
                            {draft.headerMediaMode === 'upload' ? (
                              <div className="space-y-1.5">
                                {/* Accepted-type pills */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {draft.headerFormat === 'IMAGE' && (
                                    <>
                                      {['.jpg', '.jpeg', '.png'].map((ext) => (
                                        <span key={ext} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-50 text-sky-700 border border-sky-200">{ext}</span>
                                      ))}
                                      <span className="text-[10px] text-text-tertiary ml-1">Max 5 MB</span>
                                    </>
                                  )}
                                  {draft.headerFormat === 'VIDEO' && (
                                    <>
                                      {['.mp4', '.3gpp'].map((ext) => (
                                        <span key={ext} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-50 text-purple-700 border border-purple-200">{ext}</span>
                                      ))}
                                      <span className="text-[10px] text-text-tertiary ml-1">Max 16 MB</span>
                                    </>
                                  )}
                                  {draft.headerFormat === 'DOCUMENT' && (
                                    <>
                                      {['.pdf', '.doc', '.docx'].map((ext) => (
                                        <span key={ext} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">{ext}</span>
                                      ))}
                                      <span className="text-[10px] text-text-tertiary ml-1">Max 100 MB</span>
                                    </>
                                  )}
                                </div>

                                <input
                                  type="file"
                                  className="input"
                                  accept={
                                    draft.headerFormat === 'IMAGE'
                                      ? 'image/jpeg,image/png,image/jpg'
                                      : draft.headerFormat === 'VIDEO'
                                      ? 'video/mp4,video/3gpp'
                                      : '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                  }
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    const objectUrl = file ? URL.createObjectURL(file) : '';
                                    if (!file) {
                                      setDraft((d) => ({
                                        ...d,
                                        headerMediaFileName: '',
                                        headerMediaUrl: '',
                                        headerMediaObjectUrl: '',
                                      }));
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                                      setDraft((d) => ({
                                        ...d,
                                        headerMediaFileName: file.name || '',
                                        // Store data URL for backend to upload & produce valid sample handle.
                                        headerMediaUrl: dataUrl,
                                        headerMediaObjectUrl: objectUrl,
                                      }));
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                                {draft.headerMediaFileName && (
                                  <p className="text-2xs text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                    <span>✓</span> {draft.headerMediaFileName}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <input
                                className="input"
                                placeholder="https://example.com/media.jpg"
                                value={draft.headerMediaUrl}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    headerMediaUrl: e.target.value,
                                    headerMediaFileName: '',
                                    headerMediaObjectUrl: '',
                                  }))
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="label">Body</label>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {PREDEFINED_VARIABLE_LABELS.map((label) => (
                          <button
                            key={label}
                            type="button"
                            className="px-2 py-1 text-2xs rounded-md border border-border bg-white hover:bg-surface-secondary"
                            onClick={() => {
                              const key = toPlaceholderKey(label);
                              insertBodyVariableAtCursor(`{{${key}}}`);
                            }}
                            title={`Insert ${label}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        ref={bodyTextareaRef}
                        className="input min-h-[120px]"
                        value={draft.bodyText}
                        onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
                        placeholder="Use placeholders like {{1}}, {{2}}"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-2xs text-text-tertiary">
                          To add custom variable, please add a variable in double curly brackets without spaces, e.g. {'{{1}}'}.
                        </p>
                        <button
                          type="button"
                          className="text-2xs text-brand-700 hover:text-brand-800 font-medium"
                          onClick={() => {
                            const nextIdx = extractPlaceholderTokens(draft.bodyText).length + 1;
                            insertBodyVariableAtCursor(`{{Variable${nextIdx}}}`);
                          }}
                        >
                          + Add Variable
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="label">Footer (Optional)</label>
                      <input
                        className="input"
                        value={draft.footerText}
                        onChange={(e) => setDraft((d) => ({ ...d, footerText: e.target.value }))}
                        placeholder="Footer text"
                      />
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Buttons</label>
                      <p className="text-2xs text-text-tertiary mb-2">
                        Create buttons that customers can use to interact quickly with your message.
                      </p>
                      <div className="space-y-2">
                        {draft.buttons.map((b, idx) => (
                          <div key={idx} className="border border-border rounded-lg p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <select
                                className="input"
                                value={b.type}
                                onChange={(e) => {
                                  const type = e.target.value as TemplateButton['type'];
                                  setDraft((d) => ({
                                    ...d,
                                    buttons: d.buttons.map((x, i) =>
                                      i !== idx
                                        ? x
                                        : type === 'QUICK_REPLY'
                                        ? { type, text: x.text || '' }
                                        : type === 'URL'
                                        ? { type, text: x.text || '', url: (x as any).url || '' }
                                        : { type, text: x.text || '', phone_number: (x as any).phone_number || '' }
                                    ),
                                  }));
                                }}
                              >
                                <option value="QUICK_REPLY">QUICK_REPLY</option>
                                <option value="URL">URL</option>
                                <option value="PHONE_NUMBER">PHONE_NUMBER</option>
                              </select>
                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, i) => i !== idx) }))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              className="input"
                              placeholder="Button text"
                              value={b.text}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  buttons: d.buttons.map((x, i) => (i === idx ? ({ ...x, text: e.target.value } as any) : x)),
                                }))
                              }
                            />
                            {b.type === 'URL' && (
                              <input
                                className="input"
                                placeholder="https://example.com"
                                value={b.url}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    buttons: d.buttons.map((x, i) => (i === idx ? ({ ...x, url: e.target.value } as any) : x)),
                                  }))
                                }
                              />
                            )}
                            {b.type === 'PHONE_NUMBER' && (
                              <input
                                className="input"
                                placeholder="+971501234567"
                                value={b.phone_number}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    buttons: d.buttons.map((x, i) => (i === idx ? ({ ...x, phone_number: e.target.value } as any) : x)),
                                  }))
                                }
                              />
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn-secondary w-full"
                          disabled={draft.buttons.length >= maxButtons}
                          onClick={() => setDraft((d) => ({ ...d, buttons: [...d.buttons, { type: 'QUICK_REPLY', text: '' }] }))}
                        >
                          {maxButtons === 0 ? 'Buttons not allowed for AUTHENTICATION' : 'Add button'}
                        </button>
                        {maxButtons > 0 && (
                          <p className="text-2xs text-text-tertiary">Max {maxButtons} buttons for {draft.category} templates.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 4 && (
                  <div className="space-y-3">
                    <p className="text-2xs text-text-tertiary">
                      Add sample values for variables so Meta can review your template content.
                    </p>
                    {allVariableTokens.length === 0 ? (
                      <p className="text-sm text-text-tertiary">No variables detected in header/body.</p>
                    ) : (
                      allVariableTokens.map((token) => (
                        <div key={token}>
                          <label className="label">Sample for {`{{${token}}}`}</label>
                          <input
                            className="input"
                            value={draft.sampleValues[token] || ''}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                sampleValues: { ...d.sampleValues, [token]: e.target.value },
                              }))
                            }
                            placeholder={`Sample value for ${token}`}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {wizardError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {wizardError}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-1"
                    onClick={() => setWizardStep((s) => Math.max(1, s - 1) as WizardStep)}
                    disabled={wizardStep === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  {wizardStep < 4 ? (
                    <button
                      type="button"
                      className="btn-primary inline-flex items-center gap-1"
                      onClick={() => {
                        const err = validateStep(wizardStep);
                        if (err) {
                          setWizardError(err);
                          return;
                        }
                        setWizardError('');
                        setWizardStep((s) => Math.min(4, s + 1) as WizardStep);
                      }}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={submitWizard}
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {createMutation.isPending || updateMutation.isPending ? 'Submitting...' : 'Submit Template'}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 bg-surface-secondary/30 lg:col-span-1">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Live preview</h3>
                <div className="rounded-[28px] border border-border bg-[#e5ddd5] min-h-[540px] h-[calc(100%-28px)] flex items-stretch justify-stretch overflow-hidden">
                  <div className="w-full h-full rounded-[28px] bg-black p-2 shadow-xl">
                    <div className="h-full rounded-[22px] bg-[#ece5dd] p-2 flex flex-col">
                      <div className="flex-1 p-2 overflow-hidden">
                        <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                    {draft.headerEnabled && draft.headerFormat === 'TEXT' && draft.headerText.trim() && (
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        {replaceVars(draft.headerText, draft.sampleValues)}
                      </p>
                    )}
                    {draft.headerEnabled && draft.headerFormat === 'IMAGE' && (draft.headerMediaUrl || draft.headerMediaObjectUrl) && (
                      <img
                        src={draft.headerMediaObjectUrl || draft.headerMediaUrl}
                        alt={draft.headerMediaFileName || 'Header image'}
                        className="w-full max-h-[160px] object-cover rounded-md mb-1"
                      />
                    )}
                    {draft.headerEnabled && draft.headerFormat === 'VIDEO' && (draft.headerMediaUrl || draft.headerMediaObjectUrl) && (
                      <video
                        src={draft.headerMediaObjectUrl || draft.headerMediaUrl}
                        controls
                        className="w-full max-h-[160px] rounded-md mb-1"
                      />
                    )}
                    {draft.headerEnabled && draft.headerFormat === 'DOCUMENT' && (
                      <div className="text-xs text-gray-600 mb-1 px-2 py-1 rounded bg-gray-100 border border-gray-200">
                        📄 {draft.headerMediaFileName || draft.headerMediaUrl || 'Document'}
                      </div>
                    )}
                    {draft.headerEnabled &&
                      draft.headerFormat !== 'TEXT' &&
                      draft.headerFormat !== 'NONE' &&
                      !draft.headerMediaUrl &&
                      !draft.headerMediaObjectUrl && (
                        <p className="text-xs text-gray-500 mb-1">
                          [{draft.headerFormat} header: no media selected]
                        </p>
                      )}
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {replaceVars(draft.bodyText || 'Template body preview', draft.sampleValues)}
                    </p>
                    {draft.footerText.trim() && (
                      <p className="text-2xs text-gray-500 mt-2">{draft.footerText}</p>
                    )}
                    {draft.buttons.length > 0 && (
                      <div className="mt-2 border-t border-gray-200 pt-2 space-y-1">
                        {draft.buttons.map((b, idx) => (
                          <div key={idx} className="text-xs text-brand-700 py-1.5 px-2 rounded bg-brand-50 text-center">
                            <span className="font-medium">{b.text || `Button ${idx + 1}`}</span>
                          </div>
                        ))}
                      </div>
                    )}
                        </div>
                      </div>
                      <div className="h-7 rounded-md bg-white border border-gray-200 text-[10px] text-gray-400 px-2 flex items-center">
                        Message
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
