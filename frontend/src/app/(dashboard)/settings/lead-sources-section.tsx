'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, Tag, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { premiumAlert, premiumConfirm } from '@/lib/premiumDialogs';

type LeadSourceRow = {
  key: string;
  label: string;
  source: string;
  isSystem: boolean;
  isActive: boolean;
};

const BASE_SOURCE_OPTIONS = [
  'WEBSITE_FORM', 'LIVE_CHAT', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
  'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
];

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toSourceKey(label: string): string {
  return String(label || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

function uniqueKey(base: string, used: Set<string>): string {
  const seed = toSourceKey(base) || 'CUSTOM_SOURCE';
  if (!used.has(seed)) return seed;
  let i = 2;
  while (used.has(`${seed}_${i}`)) i += 1;
  return `${seed}_${i}`;
}

export function LeadSourcesSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [rows, setRows] = useState<LeadSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [success, setSuccess] = useState(false);

  const [divisions, setDivisions] = useState<Array<{ id: string; name: string; tradeName?: string }>>([]);
  const [divisionId, setDivisionId] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined' || !isSuperAdmin) return;
    try {
      const parsed = JSON.parse(localStorage.getItem('divisions') || '[]');
      setDivisions(Array.isArray(parsed) ? parsed : []);
      setDivisionId(localStorage.getItem('activeDivisionId') || '');
    } catch {
      setDivisions([]);
      setDivisionId('');
    }
  }, [isSuperAdmin]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setSuccess(false);
    try {
      const response = await api.getLeadSources(isSuperAdmin ? (divisionId || undefined) : undefined);
      setRows(response.sources || []);
      setDirty(false);
    } catch (err: any) {
      await premiumAlert({
        title: 'Unable to load lead sources',
        message: err?.message || 'Please try again.',
        confirmText: 'OK',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [divisionId, isSuperAdmin]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const updateRow = useCallback((idx: number, patch: Partial<LeadSourceRow>) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, ...patch };
      if (!updated.isSystem && (!updated.key || updated.key === 'CUSTOM_SOURCE')) {
        updated.key = toSourceKey(updated.label) || updated.key;
      }
      return updated;
    }));
    setDirty(true);
    setSuccess(false);
  }, []);

  const addCustomSource = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { key: 'CUSTOM_SOURCE', label: '', source: 'OTHER', isSystem: false, isActive: true },
    ]);
    setDirty(true);
    setSuccess(false);
  }, []);

  const removeCustomSource = useCallback(async (idx: number) => {
    const row = rows[idx];
    if (!row || row.isSystem) return;
    const confirmed = await premiumConfirm({
      title: 'Delete source?',
      message: `Remove "${row.label || row.key}" from lead sources?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setSuccess(false);
  }, [rows]);

  const hasInvalid = useMemo(
    () => rows.some((row) => !String(row.label || '').trim()),
    [rows]
  );

  const save = useCallback(async () => {
    const used = new Set<string>();
    const normalized: LeadSourceRow[] = [];

    for (const row of rows) {
      const label = String(row.label || '').trim();
      if (!label) {
        await premiumAlert({
          title: 'Label required',
          message: 'Each source must have a display name.',
          confirmText: 'OK',
          variant: 'danger',
        });
        return;
      }

      const key = row.isSystem
        ? row.key
        : uniqueKey(row.key || label, used);

      if (used.has(key)) {
        await premiumAlert({
          title: 'Duplicate source key',
          message: `Two sources resolved to "${key}". Please rename one source.`,
          confirmText: 'OK',
          variant: 'danger',
        });
        return;
      }
      used.add(key);

      normalized.push({
        key,
        label,
        source: row.isSystem ? row.key : (BASE_SOURCE_OPTIONS.includes(row.source) ? row.source : 'OTHER'),
        isSystem: row.isSystem,
        isActive: row.isActive !== false,
      });
    }

    setSaving(true);
    setSuccess(false);
    try {
      const response = await api.saveLeadSources({
        divisionId: isSuperAdmin ? (divisionId || null) : null,
        sources: normalized,
      });
      setRows(response.sources || []);
      setDirty(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      await premiumAlert({
        title: 'Save failed',
        message: err?.message || 'Unable to save lead sources.',
        confirmText: 'OK',
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  }, [divisionId, isSuperAdmin, rows]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <Tag className="h-5 w-5 text-brand-600" />
            Lead Sources
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Add and edit selectable lead sources used in lead creation and filters.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSources}
          disabled={loading}
          className="btn-ghost inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="card p-5 space-y-4">
        {isSuperAdmin && divisions.length > 0 && (
          <div>
            <label className="label">Division</label>
            <select
              className="input max-w-sm"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">Current division</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.tradeName || d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-text-secondary">Loading sources...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary border-b border-border">
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Stored As</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-0">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.key}-${idx}`} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3">
                      <input
                        value={row.label}
                        onChange={(e) => updateRow(idx, { label: e.target.value })}
                        className="input w-full"
                        placeholder="Source label"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs font-mono px-2 py-1 rounded bg-surface-secondary text-text-secondary">
                        {row.key || 'AUTO_KEY'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {row.isSystem ? (
                        <span className="text-sm text-text-secondary">{humanize(row.key)}</span>
                      ) : (
                        <select
                          className="input"
                          value={row.source}
                          onChange={(e) => updateRow(idx, { source: e.target.value })}
                        >
                          {BASE_SOURCE_OPTIONS.map((base) => (
                            <option key={base} value={base}>
                              {humanize(base)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={row.isActive !== false}
                          onChange={(e) => updateRow(idx, { isActive: e.target.checked })}
                          className="h-4 w-4 rounded border-border"
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="py-2 pr-0">
                      {row.isSystem ? (
                        <span className="text-xs px-2 py-1 rounded bg-brand-50 text-brand-700">System</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeCustomSource(idx)}
                          className="btn-ghost text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button type="button" onClick={addCustomSource} className="btn-secondary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Custom Source
          </button>

          <div className="flex items-center gap-3">
            {success && <span className="text-sm text-emerald-600">Lead sources updated.</span>}
            <button
              type="button"
              onClick={save}
              disabled={saving || loading || hasInvalid || !dirty}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
