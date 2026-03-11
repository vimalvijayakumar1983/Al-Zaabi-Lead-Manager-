'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AutomationRule } from '@/types';

const triggerLabels: Record<string, string> = {
  LEAD_CREATED: 'When a lead is created',
  LEAD_STATUS_CHANGED: 'When lead status changes',
  LEAD_STAGE_CHANGED: 'When lead stage changes',
  LEAD_ASSIGNED: 'When a lead is assigned',
  LEAD_SCORE_CHANGED: 'When lead score changes',
  LEAD_INACTIVE: 'When lead becomes inactive',
  TASK_DUE: 'When a task is due',
  TASK_OVERDUE: 'When a task is overdue',
};

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.getAutomations().then(setRules).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string) => {
    await api.toggleAutomation(id);
    const updated = await api.getAutomations();
    setRules(updated);
  };

  const handleCreate = async (data: any) => {
    await api.createAutomation(data);
    setShowForm(false);
    const updated = await api.getAutomations();
    setRules(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <p className="text-gray-500 mt-1">Create rules to automate your workflow</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ New Automation</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : rules.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500 mb-4">No automation rules yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">Create your first automation</button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${rule.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <svg className={`h-5 w-5 ${rule.isActive ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                    <p className="text-xs text-gray-500">{triggerLabels[rule.trigger] || rule.trigger}</p>
                    {rule.description && <p className="text-xs text-gray-400 mt-1">{rule.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-gray-500">
                    <p>Executed {rule.executionCount} times</p>
                    {rule.lastExecutedAt && <p>Last: {new Date(rule.lastExecutedAt).toLocaleDateString()}</p>}
                  </div>
                  <button
                    onClick={() => handleToggle(rule.id)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${rule.isActive ? 'bg-brand-600' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${rule.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Conditions & Actions summary */}
              <div className="mt-3 flex gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Conditions: </span>
                  <span className="text-gray-700">
                    {rule.conditions.length === 0 ? 'None (always)' : rule.conditions.map((c) => `${c.field} ${c.operator} ${String(c.value)}`).join(', ')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Actions: </span>
                  <span className="text-gray-700">{rule.actions.map((a) => a.type.replace('_', ' ')).join(', ')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <CreateAutomationModal onClose={() => setShowForm(false)} onSubmit={handleCreate} />}
    </div>
  );
}

function CreateAutomationModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger: 'LEAD_CREATED',
    conditions: [] as any[],
    actions: [{ type: 'notify_user', config: { message: '' } }],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">New Automation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Trigger</label>
            <select className="input" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
              {Object.entries(triggerLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Action Type</label>
            <select
              className="input"
              value={form.actions[0]?.type || 'notify_user'}
              onChange={(e) => setForm({ ...form, actions: [{ type: e.target.value, config: { message: '' } }] })}
            >
              {['notify_user', 'send_email', 'send_whatsapp', 'assign_lead', 'change_status', 'add_tag', 'create_task'].map((a) => (
                <option key={a} value={a}>{a.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Automation</button>
          </div>
        </form>
      </div>
    </div>
  );
}
