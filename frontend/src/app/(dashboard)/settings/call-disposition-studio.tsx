'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Plus, Save, Loader2, Settings2, X, Trash2 } from 'lucide-react';

type StudioField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'datetime' | 'boolean';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  showWhen?: { fieldKey: string; equals: string } | null;
};

type StudioAction = {
  type: 'CREATE_TASK' | 'UPDATE_STATUS' | 'ADD_TAG' | 'NOTIFY_ASSIGNEE';
  isActive: boolean;
  conditions?: {
    leadStatusIn?: string[];
    leadSourceIn?: string[];
    minScore?: number;
    maxScore?: number;
  };
  config?: Record<string, any>;
};

type StudioDisposition = {
  key: string;
  label: string;
  description?: string;
  category: string;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  mapsTo: string;
  requireNotes: boolean;
  builtIn?: boolean;
  fields: StudioField[];
  actions: StudioAction[];
};

const BUILTIN_MAP_TARGETS = [
  'CALLBACK', 'CALL_LATER', 'CALL_AGAIN', 'WILL_CALL_US_AGAIN',
  'MEETING_ARRANGED', 'APPOINTMENT_BOOKED', 'INTERESTED', 'NOT_INTERESTED',
  'ALREADY_COMPLETED_SERVICES', 'NO_ANSWER', 'VOICEMAIL_LEFT', 'WRONG_NUMBER',
  'BUSY', 'GATEKEEPER', 'FOLLOW_UP_EMAIL', 'QUALIFIED', 'PROPOSAL_REQUESTED',
  'DO_NOT_CALL', 'OTHER',
];

const blankDisposition = (): StudioDisposition => ({
  key: '',
  label: '',
  description: '',
  category: 'Custom',
  icon: '📝',
  color: '#6366f1',
  isActive: true,
  sortOrder: 9999,
  mapsTo: 'OTHER',
  requireNotes: false,
  fields: [],
  actions: [],
});

function toKey(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

export function CallDispositionStudioSection() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [divisions, setDivisions] = useState<any[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dispositions, setDispositions] = useState<StudioDisposition[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<StudioDisposition>(blankDisposition());

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getDivisions().then((rows) => setDivisions(Array.isArray(rows) ? rows : [])).catch(() => setDivisions([]));
  }, [isSuperAdmin]);

  const loadStudio = async (divisionId?: string) => {
    setLoading(true);
    try {
      const data = await api.getDispositionStudio(divisionId);
      const rows = Array.isArray(data?.dispositions) ? data.dispositions : [];
      setDispositions(rows as StudioDisposition[]);
      setDirty(false);
    } catch {
      setDispositions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudio(selectedDivisionId || undefined);
  }, [selectedDivisionId]);

  const activeCount = useMemo(() => dispositions.filter((d) => d.isActive).length, [dispositions]);

  const openEditor = (index: number | null) => {
    if (index === null) {
      setDraft(blankDisposition());
    } else {
      setDraft(JSON.parse(JSON.stringify(dispositions[index])));
    }
    setEditingIndex(index);
    setEditorOpen(true);
  };

  const saveDraft = () => {
    if (!draft.label.trim()) return;
    const key = toKey(draft.key || draft.label);
    const normalized: StudioDisposition = {
      ...draft,
      key,
      label: draft.label.trim(),
      fields: (draft.fields || []).map((f) => ({ ...f, key: toKey(f.key || f.label), label: f.label || f.key })),
      actions: draft.actions || [],
    };
    setDispositions((prev) => {
      const next = [...prev];
      if (editingIndex === null) next.push(normalized);
      else next[editingIndex] = normalized;
      return next;
    });
    setDirty(true);
    setEditorOpen(false);
  };

  const deleteDisposition = (index: number) => {
    setDispositions((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await api.updateDispositionStudio(dispositions, selectedDivisionId || undefined);
      setDirty(false);
      setToast('Disposition Studio saved');
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setToast(err.message || 'Failed to save Disposition Studio');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand-600" />
            Disposition Studio
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Build call outcomes with conditional fields and rule-based actions. Published dispositions appear instantly in call log forms.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openEditor(null)} className="btn-secondary gap-1.5">
            <Plus className="h-4 w-4" /> New Disposition
          </button>
          <button onClick={handleSaveAll} disabled={!dirty || saving} className="btn-primary gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Studio'}
          </button>
        </div>
      </div>

      {isSuperAdmin && divisions.length > 0 && (
        <div className="card p-3 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500">Division</span>
          <select className="input max-w-xs" value={selectedDivisionId} onChange={(e) => setSelectedDivisionId(e.target.value)}>
            <option value="">My current division</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.tradeName || d.name}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 ml-auto">{activeCount} active disposition(s)</span>
        </div>
      )}

      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          <span className="ml-2 text-sm text-gray-500">Loading Disposition Studio...</span>
        </div>
      ) : (
        <div className="grid gap-3">
          {dispositions.map((d, idx) => (
            <div key={`${d.key}_${idx}`} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <span>{d.icon || '📝'}</span>
                    {d.label}
                    {!d.isActive && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Key: <code>{d.key}</code> • Maps to: <code>{d.mapsTo}</code> • Fields: {d.fields?.length || 0} • Actions: {d.actions?.length || 0}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditor(idx)} className="btn-secondary text-xs px-3 py-1.5">Edit</button>
                  {!d.builtIn && (
                    <button onClick={() => deleteDisposition(idx)} className="btn-secondary text-xs px-3 py-1.5 text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{editingIndex === null ? 'New Disposition' : 'Edit Disposition'}</h3>
              <button onClick={() => setEditorOpen(false)} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Label *</label>
                  <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                </div>
                <div>
                  <label className="label">Key</label>
                  <input className="input" value={draft.key} onChange={(e) => setDraft({ ...draft, key: toKey(e.target.value) })} placeholder="AUTO_FROM_LABEL" />
                </div>
                <div>
                  <label className="label">Category</label>
                  <input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                </div>
                <div>
                  <label className="label">Icon</label>
                  <input className="input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
                </div>
                <div>
                  <label className="label">Color</label>
                  <input type="color" className="input h-10" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
                </div>
                <div>
                  <label className="label">Maps To (stored disposition)</label>
                  <select className="input" value={draft.mapsTo} onChange={(e) => setDraft({ ...draft, mapsTo: e.target.value })}>
                    {BUILTIN_MAP_TARGETS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.requireNotes} onChange={(e) => setDraft({ ...draft, requireNotes: e.target.checked })} /> Require notes</label>
              </div>

              <div className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">Conditional Fields</p>
                  <button
                    onClick={() => setDraft((prev) => ({ ...prev, fields: [...(prev.fields || []), { key: '', label: '', type: 'text', required: false }] }))}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Field
                  </button>
                </div>
                {(draft.fields || []).map((field, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border border-gray-100 rounded-lg p-2">
                    <div><label className="label">Key</label><input className="input" value={field.key} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, key: toKey(e.target.value) } : f) }))} /></div>
                    <div><label className="label">Label</label><input className="input" value={field.label} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, label: e.target.value } : f) }))} /></div>
                    <div>
                      <label className="label">Type</label>
                      <select className="input" value={field.type} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, type: e.target.value as any } : f) }))}>
                        <option value="text">text</option>
                        <option value="textarea">textarea</option>
                        <option value="number">number</option>
                        <option value="select">select</option>
                        <option value="datetime">datetime</option>
                        <option value="boolean">boolean</option>
                      </select>
                    </div>
                    <div><label className="label">Show when field</label><input className="input" value={field.showWhen?.fieldKey || ''} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, showWhen: { fieldKey: e.target.value, equals: f.showWhen?.equals || '' } } : f) }))} /></div>
                    <div><label className="label">Equals</label><input className="input" value={field.showWhen?.equals || ''} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, showWhen: { fieldKey: f.showWhen?.fieldKey || '', equals: e.target.value } } : f) }))} /></div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={field.required} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, required: e.target.checked } : f) }))} /> req</label>
                      <button onClick={() => setDraft((prev) => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }))} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
                    </div>
                    {field.type === 'select' && (
                      <div className="md:col-span-6">
                        <label className="label">Options (comma-separated value:label)</label>
                        <input
                          className="input"
                          value={(field.options || []).map((o) => `${o.value}:${o.label}`).join(', ')}
                          onChange={(e) => {
                            const options = e.target.value.split(',').map((token) => token.trim()).filter(Boolean).map((token) => {
                              const [value, label] = token.split(':');
                              return { value: (value || '').trim(), label: (label || value || '').trim() };
                            }).filter((o) => o.value);
                            setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, options } : f) }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">Actions & Conditions</p>
                  <button
                    onClick={() => setDraft((prev) => ({ ...prev, actions: [...(prev.actions || []), { type: 'CREATE_TASK', isActive: true, conditions: {}, config: {} }] }))}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Action
                  </button>
                </div>
                {(draft.actions || []).map((action, index) => (
                  <div key={index} className="border border-gray-100 rounded-lg p-2 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                      <div>
                        <label className="label">Type</label>
                        <select className="input" value={action.type} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, type: e.target.value as any } : a) }))}>
                          <option value="CREATE_TASK">CREATE_TASK</option>
                          <option value="UPDATE_STATUS">UPDATE_STATUS</option>
                          <option value="ADD_TAG">ADD_TAG</option>
                          <option value="NOTIFY_ASSIGNEE">NOTIFY_ASSIGNEE</option>
                        </select>
                      </div>
                      <div><label className="label">Lead status in</label><input className="input" value={(action.conditions?.leadStatusIn || []).join(',')} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, conditions: { ...(a.conditions || {}), leadStatusIn: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } } : a) }))} /></div>
                      <div><label className="label">Source in</label><input className="input" value={(action.conditions?.leadSourceIn || []).join(',')} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, conditions: { ...(a.conditions || {}), leadSourceIn: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } } : a) }))} /></div>
                      <div><label className="label">Min score</label><input type="number" className="input" value={action.conditions?.minScore ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, conditions: { ...(a.conditions || {}), minScore: e.target.value ? Number(e.target.value) : undefined } } : a) }))} /></div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={action.isActive !== false} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, isActive: e.target.checked } : a) }))} /> active</label>
                        <button onClick={() => setDraft((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }))} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div><label className="label">Config key</label><input className="input" placeholder="e.g. title" value={Object.keys(action.config || {})[0] || ''} readOnly /></div>
                      <div className="md:col-span-2">
                        <label className="label">Config JSON</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={JSON.stringify(action.config || {})}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value || '{}');
                              setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: parsed } : a) }));
                            } catch {
                              // Ignore invalid json until corrected
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-2">
              <button onClick={() => setEditorOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveDraft} className="btn-primary">Save Disposition</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
