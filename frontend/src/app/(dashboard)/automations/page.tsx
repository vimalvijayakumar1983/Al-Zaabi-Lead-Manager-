'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AutomationRule } from '@/types';
import { Zap, Plus, X, Play, Pause, Hash, Clock } from 'lucide-react';

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

  const activeCount = rules.filter(r => r.isActive).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Automations</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {rules.length} rules &middot; {activeCount} active
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          New Automation
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <div className="skeleton h-10 w-10 rounded-lg" />
              <div className="flex-1"><div className="skeleton h-4 w-48 mb-2" /><div className="skeleton h-3 w-64" /></div>
              <div className="skeleton h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Zap className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">No automation rules yet</p>
            <p className="text-xs text-text-tertiary mt-1 mb-3">Automate repetitive tasks and workflows</p>
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Create your first automation</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className={`card p-5 transition-all duration-200 hover:shadow-card-hover ${!rule.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                    rule.isActive ? 'bg-emerald-100' : 'bg-surface-tertiary'
                  }`}>
                    <Zap className={`h-5 w-5 ${rule.isActive ? 'text-emerald-600' : 'text-text-tertiary'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{rule.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{triggerLabels[rule.trigger] || rule.trigger}</p>
                    {rule.description && <p className="text-xs text-text-tertiary mt-0.5">{rule.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Hash className="h-3 w-3" />
                      <span>{rule.executionCount} runs</span>
                    </div>
                    {rule.lastExecutedAt && (
                      <div className="flex items-center gap-1 text-xs text-text-tertiary">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(rule.lastExecutedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggle(rule.id)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                      rule.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform duration-200 mt-0.5 ${
                      rule.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Conditions & Actions summary */}
              <div className="mt-3 flex gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">IF</span>
                  <span className="badge bg-surface-tertiary text-text-secondary ring-0 text-2xs">
                    {rule.conditions.length === 0 ? 'Always' : rule.conditions.map((c) => `${c.field} ${c.operator} ${String(c.value)}`).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">THEN</span>
                  <div className="flex gap-1 flex-wrap">
                    {rule.actions.map((a, i) => (
                      <span key={i} className="badge bg-brand-50 text-brand-700 ring-brand-200 text-2xs">
                        {a.type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
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
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">New Automation</h2>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Auto-assign new leads" />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." />
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
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Automation</button>
          </div>
        </form>
      </div>
    </div>
  );
}
