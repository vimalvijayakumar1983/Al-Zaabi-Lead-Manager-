'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const FALLBACK_OPTIONS = [
  { value: 'CALL_LATER', label: 'Call Later (Scheduled)', group: 'Follow-up', icon: '🕐' },
  { value: 'CALL_AGAIN', label: 'Call Again (Anytime)', group: 'Follow-up', icon: '🔄' },
  { value: 'WILL_CALL_US_AGAIN', label: 'Will Call Us Again', group: 'Follow-up', icon: '🤝' },
  { value: 'MEETING_ARRANGED', label: 'Meeting Arranged', group: 'Positive', icon: '📅' },
  { value: 'APPOINTMENT_BOOKED', label: 'Appointment Booked', group: 'Positive', icon: '✅' },
  { value: 'INTERESTED', label: 'Interested - Send Info', group: 'Positive', icon: '👍' },
  { value: 'QUALIFIED', label: 'Lead Qualified', group: 'Positive', icon: '⭐' },
  { value: 'PROPOSAL_REQUESTED', label: 'Proposal Requested', group: 'Positive', icon: '📋' },
  { value: 'FOLLOW_UP_EMAIL', label: 'Follow-up Email Requested', group: 'Follow-up', icon: '📧' },
  { value: 'NO_ANSWER', label: 'No Answer', group: 'Retry', icon: '📵' },
  { value: 'VOICEMAIL_LEFT', label: 'Voicemail Left', group: 'Retry', icon: '📨' },
  { value: 'BUSY', label: 'Line Busy', group: 'Retry', icon: '📞' },
  { value: 'GATEKEEPER', label: 'Reached Gatekeeper', group: 'Retry', icon: '🚧' },
  { value: 'NOT_INTERESTED', label: 'Not Interested', group: 'Closed', icon: '👎' },
  { value: 'ALREADY_COMPLETED_SERVICES', label: 'Already Completed Services', group: 'Closed', icon: '🏁' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number', group: 'Closed', icon: '❌' },
  { value: 'DO_NOT_CALL', label: 'Do Not Call', group: 'Closed', icon: '🚫' },
  { value: 'OTHER', label: 'Other', group: 'Other', icon: '📝' },
];

function isFieldVisible(field: any, values: Record<string, any>) {
  if (!field?.showWhen?.fieldKey) return true;
  return values[field.showWhen.fieldKey] === field.showWhen.equals;
}

function isMissing(value: any) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function LogCallModalDynamic({
  onClose,
  onSubmit,
  leadName,
  leadId,
}: {
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  leadName: string;
  leadId: string;
}) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    disposition: '',
    notes: '',
    duration: '',
    dynamicFieldValues: {} as Record<string, any>,
    createFollowUp: true,
  });

  useEffect(() => {
    api.getDispositions({ leadId })
      .then((rows) => setCatalog(Array.isArray(rows) && rows.length > 0 ? rows : FALLBACK_OPTIONS))
      .catch(() => setCatalog(FALLBACK_OPTIONS));
  }, [leadId]);

  const selected = catalog.find((x: any) => x.value === form.disposition);
  const notesRequired = selected?.requireNotes === true || form.disposition === 'OTHER';
  const notesMissing = notesRequired && !form.notes.trim();
  const visibleFields = (selected?.fields || []).filter((field: any) => isFieldVisible(field, form.dynamicFieldValues));
  const requiredFieldError = visibleFields.find((field: any) => field.required && isMissing(form.dynamicFieldValues[field.key]));
  const futureDateError = visibleFields.find((field: any) => {
    if (field.type !== 'datetime' || field?.validation?.futureOnly !== true) return false;
    const value = form.dynamicFieldValues[field.key];
    if (!value) return false;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) || parsed <= new Date();
  });

  const setField = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      dynamicFieldValues: { ...prev.dynamicFieldValues, [key]: value },
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.disposition || notesMissing || requiredFieldError || futureDateError) return;
    setSubmitting(true);
    try {
      const values = form.dynamicFieldValues || {};
      const toIsoOrNull = (raw: any) => (raw ? new Date(String(raw)).toISOString() : null);
      await onSubmit({
        disposition: form.disposition,
        notes: form.notes || null,
        duration: form.duration ? parseInt(form.duration, 10) * 60 : null,
        callbackDate: toIsoOrNull(values.callbackDate),
        meetingDate: toIsoOrNull(values.meetingDate),
        appointmentDate: toIsoOrNull(values.appointmentDate),
        expectedCallbackWindow: values.expectedCallbackWindow || null,
        notInterestedReason: values.notInterestedReason || null,
        notInterestedOtherText: values.notInterestedOtherText?.trim?.() || null,
        completedServiceLocation: values.completedServiceLocation || null,
        dynamicFieldValues: values,
        createFollowUp: form.createFollowUp,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Log Call</h2>
            <p className="text-sm text-gray-500 mt-0.5">Record call outcome for {leadName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">Call Outcome *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {catalog.map((opt: any) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, disposition: opt.value, dynamicFieldValues: {} }))}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all ${
                    form.disposition === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{opt.icon || '📝'}</span>
                  <span className="font-medium leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {visibleFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
              <p className="text-xs font-medium text-brand-700">Disposition Fields</p>
              {visibleFields.map((field: any) => {
                const value = form.dynamicFieldValues[field.key] ?? '';
                const missing = field.required && isMissing(value);
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="label mb-0">{field.label}{field.required ? ' *' : ''}</label>
                    {field.type === 'select' ? (
                      <select className={`input ${missing ? 'border-red-400 ring-1 ring-red-400' : ''}`} value={String(value || '')} onChange={(e) => setField(field.key, e.target.value)}>
                        <option value="">Select...</option>
                        {(field.options || []).map((option: any) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                        className={`input ${missing ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                        value={String(value || '')}
                        min={field.type === 'datetime' && field?.validation?.futureOnly ? new Date().toISOString().slice(0, 16) : undefined}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    )}
                    {missing && <p className="text-xs text-red-500">{field.label} is required.</p>}
                  </div>
                );
              })}
              {futureDateError && <p className="text-xs text-red-500">{futureDateError.label} must be in the future.</p>}
            </div>
          )}

          <div>
            <label className="label">Call Duration (minutes)</label>
            <input type="number" min="0" className="input" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>

          <div>
            <label className="label">Call Notes {notesRequired && <span className="text-red-500 font-semibold">*</span>}</label>
            <textarea rows={3} className={`input ${notesMissing ? 'border-red-400 ring-1 ring-red-400' : ''}`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
            <input type="checkbox" id="createFollowUp" checked={form.createFollowUp} onChange={(e) => setForm({ ...form, createFollowUp: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            <label htmlFor="createFollowUp" className="text-sm text-gray-700">Auto-create follow-up task based on call outcome</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting || !form.disposition || notesMissing || !!requiredFieldError || !!futureDateError} className="btn-primary gap-1.5">
              {submitting ? 'Saving...' : 'Log Call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
