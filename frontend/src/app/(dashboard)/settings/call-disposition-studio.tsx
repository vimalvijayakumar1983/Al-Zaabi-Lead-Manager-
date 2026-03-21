'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Plus, Save, Loader2, Settings2, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

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

const CATEGORY_OPTIONS = ['Follow-up', 'Positive', 'Retry', 'Closed', 'Other', 'Custom'];
const STATUS_OPTIONS = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];
const TASK_TYPE_OPTIONS = ['FOLLOW_UP_CALL', 'EMAIL', 'MEETING', 'PROPOSAL', 'OTHER'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const ACTION_LABELS: Record<StudioAction['type'], string> = {
  CREATE_TASK: 'Create follow-up task',
  UPDATE_STATUS: 'Update lead status',
  ADD_TAG: 'Add tag to lead',
  NOTIFY_ASSIGNEE: 'Notify assignee',
};

type IconOption = { emoji: string; name: string; keywords: string[] };

const ICON_LIBRARY: Record<string, IconOption[]> = {
  Popular: [
    { emoji: '📞', name: 'Phone', keywords: ['call', 'phone'] },
    { emoji: '📅', name: 'Calendar', keywords: ['meeting', 'appointment'] },
    { emoji: '✅', name: 'Check', keywords: ['done', 'confirmed'] },
    { emoji: '👍', name: 'Thumbs up', keywords: ['positive', 'good'] },
    { emoji: '👎', name: 'Thumbs down', keywords: ['negative', 'no'] },
    { emoji: '🏁', name: 'Finish', keywords: ['completed', 'done'] },
    { emoji: '🤝', name: 'Handshake', keywords: ['follow up', 'relationship'] },
    { emoji: '📝', name: 'Notes', keywords: ['other', 'notes'] },
    { emoji: '🚫', name: 'Do not call', keywords: ['blocked', 'stop'] },
    { emoji: '⭐', name: 'Star', keywords: ['qualified', 'important'] },
  ],
  Communication: [
    { emoji: '☎️', name: 'Telephone', keywords: ['call'] },
    { emoji: '📧', name: 'Email', keywords: ['mail'] },
    { emoji: '💬', name: 'Chat', keywords: ['message'] },
    { emoji: '📨', name: 'Inbox', keywords: ['voicemail', 'message'] },
    { emoji: '📵', name: 'No signal', keywords: ['no answer'] },
    { emoji: '📞', name: 'Receiver', keywords: ['phone'] },
    { emoji: '🔄', name: 'Repeat', keywords: ['call again', 'retry'] },
    { emoji: '🕐', name: 'Clock one', keywords: ['call later', 'time'] },
    { emoji: '🔔', name: 'Bell', keywords: ['reminder', 'notify'] },
    { emoji: '📱', name: 'Mobile', keywords: ['phone'] },
  ],
  Outcomes: [
    { emoji: '🎯', name: 'Target', keywords: ['goal', 'qualified'] },
    { emoji: '📋', name: 'Clipboard', keywords: ['proposal'] },
    { emoji: '✅', name: 'Completed', keywords: ['booked', 'confirmed'] },
    { emoji: '❌', name: 'Cross mark', keywords: ['wrong', 'failed'] },
    { emoji: '🚧', name: 'Barrier', keywords: ['gatekeeper', 'blocked'] },
    { emoji: '⚠️', name: 'Warning', keywords: ['attention'] },
    { emoji: '🟢', name: 'Green circle', keywords: ['positive'] },
    { emoji: '🟡', name: 'Yellow circle', keywords: ['retry'] },
    { emoji: '🔴', name: 'Red circle', keywords: ['closed', 'negative'] },
    { emoji: '🏆', name: 'Trophy', keywords: ['won', 'success'] },
  ],
  Business: [
    { emoji: '💼', name: 'Briefcase', keywords: ['business', 'service'] },
    { emoji: '🏢', name: 'Office', keywords: ['center', 'inside'] },
    { emoji: '🌐', name: 'Global', keywords: ['outside', 'external'] },
    { emoji: '📈', name: 'Growth', keywords: ['analytics'] },
    { emoji: '📊', name: 'Chart', keywords: ['analysis'] },
    { emoji: '💰', name: 'Money bag', keywords: ['price', 'budget'] },
    { emoji: '🧾', name: 'Receipt', keywords: ['billing'] },
    { emoji: '🛠️', name: 'Tools', keywords: ['service'] },
    { emoji: '📦', name: 'Package', keywords: ['delivery', 'service'] },
    { emoji: '🏷️', name: 'Tag', keywords: ['tag'] },
  ],
  People: [
    { emoji: '🙋', name: 'Raised hand', keywords: ['interested'] },
    { emoji: '🤷', name: 'Shrug', keywords: ['not sure'] },
    { emoji: '🙅', name: 'No gesture', keywords: ['not interested'] },
    { emoji: '👤', name: 'Person', keywords: ['lead'] },
    { emoji: '👥', name: 'People', keywords: ['team'] },
    { emoji: '🧑‍💼', name: 'Professional', keywords: ['client'] },
    { emoji: '🤔', name: 'Thinking', keywords: ['follow up'] },
    { emoji: '😊', name: 'Smile', keywords: ['positive'] },
    { emoji: '😐', name: 'Neutral face', keywords: ['neutral'] },
    { emoji: '😕', name: 'Confused', keywords: ['mismatch'] },
  ],
};

const ICON_CATEGORIES = Object.keys(ICON_LIBRARY);

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

function toOptionValue(input: string) {
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconCategory, setIconCategory] = useState<string>('Popular');
  const [iconQuery, setIconQuery] = useState('');

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
  const visibleIcons = useMemo(() => {
    const source = ICON_LIBRARY[iconCategory] || ICON_LIBRARY.Popular;
    const query = iconQuery.trim().toLowerCase();
    if (!query) return source;
    const all = ICON_CATEGORIES.flatMap((category) => ICON_LIBRARY[category] || []);
    const filtered = all.filter((item) => {
      const hay = `${item.name} ${item.keywords.join(' ')}`.toLowerCase();
      return hay.includes(query);
    });
    const deduped: IconOption[] = [];
    const seen = new Set<string>();
    for (const icon of filtered) {
      if (seen.has(icon.emoji)) continue;
      seen.add(icon.emoji);
      deduped.push(icon);
    }
    return deduped;
  }, [iconCategory, iconQuery]);

  const openEditor = (index: number | null) => {
    if (index === null) {
      setDraft(blankDisposition());
    } else {
      setDraft(JSON.parse(JSON.stringify(dispositions[index])));
    }
    setShowAdvanced(false);
    setIconPickerOpen(false);
    setIconCategory('Popular');
    setIconQuery('');
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
                    {d.category || 'Other'} • {d.requireNotes ? 'Notes required' : 'Notes optional'} • Fields: {d.fields?.length || 0} • Actions: {d.actions?.length || 0}
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="label">Display name *</label>
                  <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Meeting Arranged" />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                    {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Icon</label>
                  <div className="flex items-center gap-2">
                    <input className="input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="e.g. 📅" />
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs whitespace-nowrap"
                      onClick={() => setIconPickerOpen((prev) => !prev)}
                    >
                      {iconPickerOpen ? 'Hide Icons' : 'Choose Icon'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Color</label>
                  <input type="color" className="input h-10" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <label className="label">Description (optional)</label>
                  <input className="input" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short helper text shown to agents" />
                </div>
              </div>

              {iconPickerOpen && (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <input
                      className="input"
                      placeholder="Search icon by meaning (e.g. call, meeting, completed)"
                      value={iconQuery}
                      onChange={(e) => setIconQuery(e.target.value)}
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">Selected: <span className="font-semibold">{draft.icon || 'none'}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ICON_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setIconCategory(category)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          iconCategory === category
                            ? 'bg-brand-50 text-brand-700 border-brand-300'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-8 md:grid-cols-12 gap-1.5 mt-3 max-h-56 overflow-y-auto pr-1">
                    {visibleIcons.map((option) => (
                      <button
                        key={`${option.emoji}_${option.name}`}
                        type="button"
                        title={`${option.name} (${option.keywords.join(', ')})`}
                        onClick={() => setDraft((prev) => ({ ...prev, icon: option.emoji }))}
                        className={`h-9 rounded-md border text-lg hover:bg-gray-50 ${
                          draft.icon === option.emoji ? 'border-brand-400 bg-brand-50' : 'border-gray-200'
                        }`}
                      >
                        {option.emoji}
                      </button>
                    ))}
                    {visibleIcons.length === 0 && (
                      <div className="col-span-full text-xs text-gray-500 py-6 text-center">
                        No icons found for this search.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                Internal ID auto-generated: <code className="font-semibold">{toKey(draft.key || draft.label || 'NEW_DISPOSITION')}</code>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.requireNotes} onChange={(e) => setDraft({ ...draft, requireNotes: e.target.checked })} /> Make notes mandatory</label>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
              </button>

              {showAdvanced && (
                <div className="card p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="label">Internal key override</label>
                      <input className="input" value={draft.key} onChange={(e) => setDraft({ ...draft, key: toKey(e.target.value) })} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="label">Store as backend disposition</label>
                      <select className="input" value={draft.mapsTo} onChange={(e) => setDraft({ ...draft, mapsTo: e.target.value })}>
                        {BUILTIN_MAP_TARGETS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Sort order</label>
                      <input type="number" className="input" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value || 0) })} />
                    </div>
                  </div>
                </div>
              )}

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
                {(draft.fields || []).map((field, index) => {
                  const currentKey = toKey(field.key || field.label || `FIELD_${index + 1}`);
                  const otherFields = (draft.fields || []).filter((_, i) => i !== index);
                  return (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border border-gray-100 rounded-lg p-2">
                      <div className="md:col-span-2">
                        <label className="label">Field label</label>
                        <input className="input" value={field.label} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, label: e.target.value, key: toKey(e.target.value || f.key) } : f) }))} placeholder="e.g. Meeting Date & Time" />
                        <p className="text-[10px] text-gray-400 mt-1">ID: <code>{currentKey}</code></p>
                      </div>
                      <div>
                        <label className="label">Type</label>
                        <select className="input" value={field.type} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, type: e.target.value as any } : f) }))}>
                          <option value="text">Short text</option>
                          <option value="textarea">Long text</option>
                          <option value="number">Number</option>
                          <option value="select">Dropdown</option>
                          <option value="datetime">Date & time</option>
                          <option value="boolean">Yes / No</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Show only when</label>
                        <select
                          className="input"
                          value={field.showWhen?.fieldKey || ''}
                          onChange={(e) => setDraft((prev) => ({
                            ...prev,
                            fields: prev.fields.map((f, i) => i === index
                              ? { ...f, showWhen: e.target.value ? { fieldKey: e.target.value, equals: f.showWhen?.equals || '' } : null }
                              : f),
                          }))}
                        >
                          <option value="">Always show</option>
                          {otherFields.map((f, i) => {
                            const key = toKey(f.key || f.label || `FIELD_${i + 1}`);
                            return <option key={key} value={key}>{f.label || key}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="label">Equals value</label>
                        <input className="input" value={field.showWhen?.equals || ''} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, showWhen: f.showWhen ? { ...f.showWhen, equals: e.target.value } : null } : f) }))} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={field.required} onChange={(e) => setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, required: e.target.checked } : f) }))} /> required</label>
                        <button onClick={() => setDraft((prev) => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }))} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
                      </div>
                      {field.type === 'select' && (
                        <div className="md:col-span-6">
                          <label className="label">Dropdown options (one per line)</label>
                          <textarea
                            className="input"
                            rows={3}
                            value={(field.options || []).map((o) => o.label).join('\n')}
                            onChange={(e) => {
                              const options = e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .map((label) => ({ value: toOptionValue(label), label }));
                              setDraft((prev) => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, options } : f) }));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <div key={index} className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="label">Action</label>
                        <select className="input" value={action.type} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, type: e.target.value as any, config: {} } : a) }))}>
                          {(Object.keys(ACTION_LABELS) as StudioAction['type'][]).map((type) => (
                            <option key={type} value={type}>{ACTION_LABELS[type]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Only for lead status (comma-separated)</label>
                        <input className="input" value={(action.conditions?.leadStatusIn || []).join(',')} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, conditions: { ...(a.conditions || {}), leadStatusIn: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } } : a) }))} placeholder={STATUS_OPTIONS.join(', ')} />
                      </div>
                      <div>
                        <label className="label">Min score</label>
                        <input type="number" className="input" value={action.conditions?.minScore ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, conditions: { ...(a.conditions || {}), minScore: e.target.value ? Number(e.target.value) : undefined } } : a) }))} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={action.isActive !== false} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, isActive: e.target.checked } : a) }))} /> enabled</label>
                        <button onClick={() => setDraft((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }))} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
                      </div>
                    </div>

                    {action.type === 'CREATE_TASK' && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div><label className="label">Task title</label><input className="input" value={action.config?.title || ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), title: e.target.value } } : a) }))} /></div>
                        <div><label className="label">Task type</label><select className="input" value={action.config?.taskType || 'FOLLOW_UP_CALL'} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), taskType: e.target.value } } : a) }))}>{TASK_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className="label">Priority</label><select className="input" value={action.config?.priority || 'MEDIUM'} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), priority: e.target.value } } : a) }))}>{PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                        <div><label className="label">Due in hours</label><input type="number" className="input" value={action.config?.dueInHours ?? 24} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), dueInHours: Number(e.target.value || 24) } } : a) }))} /></div>
                      </div>
                    )}

                    {action.type === 'UPDATE_STATUS' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="label">Set lead status to</label>
                          <select className="input" value={action.config?.status || 'CONTACTED'} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), status: e.target.value } } : a) }))}>
                            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    {action.type === 'ADD_TAG' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div><label className="label">Tag name</label><input className="input" value={action.config?.tagName || ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), tagName: e.target.value } } : a) }))} /></div>
                        <div><label className="label">Tag color</label><input type="color" className="input h-10" value={action.config?.tagColor || '#6366f1'} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), tagColor: e.target.value } } : a) }))} /></div>
                      </div>
                    )}

                    {action.type === 'NOTIFY_ASSIGNEE' && (
                      <div className="grid grid-cols-1 gap-2">
                        <div><label className="label">Notification title</label><input className="input" value={action.config?.title || ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), title: e.target.value } } : a) }))} /></div>
                        <div><label className="label">Message</label><textarea className="input" rows={2} value={action.config?.message || ''} onChange={(e) => setDraft((prev) => ({ ...prev, actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...(a.config || {}), message: e.target.value } } : a) }))} /></div>
                      </div>
                    )}
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
