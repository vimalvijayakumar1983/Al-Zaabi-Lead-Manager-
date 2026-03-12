'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Task, PaginatedResponse } from '@/types';
import { CheckCircle2, Circle, Clock, AlertTriangle, Plus, Calendar, User2, X } from 'lucide-react';

const priorityConfig: Record<string, { bg: string; text: string; ring: string; dot: string; label: string }> = {
  LOW: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-400', label: 'Low' },
  MEDIUM: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', dot: 'bg-blue-500', label: 'Medium' },
  HIGH: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/10', dot: 'bg-orange-500', label: 'High' },
  URGENT: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/10', dot: 'bg-red-500', label: 'Urgent' },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue'>('all');
  const [showForm, setShowForm] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (filter === 'pending') params.status = 'PENDING';
      if (filter === 'overdue') params.overdue = 1;
      const res: PaginatedResponse<Task> = await api.getTasks(params);
      setTasks(res.data);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleComplete = async (taskId: string) => {
    await api.completeTask(taskId);
    fetchTasks();
  };

  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
  const overdueCount = tasks.filter(t => t.status !== 'COMPLETED' && new Date(t.dueAt) < new Date()).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Tasks</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {tasks.length} tasks &middot; {completedCount} completed
            {overdueCount > 0 && <span className="text-red-600"> &middot; {overdueCount} overdue</span>}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1 w-fit">
        {([
          { key: 'all' as const, label: 'All Tasks' },
          { key: 'pending' as const, label: 'Pending' },
          { key: 'overdue' as const, label: 'Overdue' },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
              filter === f.key
                ? 'bg-white shadow-soft text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="card p-4 flex items-center gap-4">
                <div className="skeleton h-5 w-5 rounded" />
                <div className="flex-1"><div className="skeleton h-4 w-48 mb-2" /><div className="skeleton h-3 w-32" /></div>
                <div className="skeleton h-5 w-16 rounded-md" />
                <div className="skeleton h-4 w-20" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-text-primary">No tasks found</p>
              <p className="text-xs text-text-tertiary mt-1 mb-3">
                {filter === 'overdue' ? 'No overdue tasks - great job!' : 'Create your first task to get started'}
              </p>
              {filter === 'all' && (
                <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Create Task</button>
              )}
            </div>
          </div>
        ) : (
          tasks.map((task) => {
            const isOverdue = new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED';
            const isCompleted = task.status === 'COMPLETED';
            const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
            const dueDate = new Date(task.dueAt);

            return (
              <div
                key={task.id}
                className={`card p-4 flex items-center gap-4 transition-all duration-150 group ${
                  isOverdue ? 'border-red-200 bg-red-50/30' : isCompleted ? 'opacity-60' : 'hover:shadow-card-hover'
                }`}
              >
                <button
                  onClick={() => handleComplete(task.id)}
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-border-strong hover:border-brand-500 hover:bg-brand-50'
                  }`}
                >
                  {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                      <Calendar className="h-3 w-3" />
                      {task.type.replace(/_/g, ' ')}
                    </span>
                    {task.lead && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                        <User2 className="h-3 w-3" />
                        {task.lead.firstName} {task.lead.lastName}
                      </span>
                    )}
                    {task.assignee && (
                      <span className="text-xs text-text-tertiary">&middot; {task.assignee.firstName}</span>
                    )}
                  </div>
                </div>

                <span className={`badge ${priority.bg} ${priority.text} ring-1 ${priority.ring}`}>
                  {priority.label}
                </span>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                  <Clock className={`h-3.5 w-3.5 ${isOverdue ? 'text-red-500' : 'text-text-tertiary'}`} />
                  <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-text-secondary'}`}>
                    {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showForm && <CreateTaskModal onClose={() => setShowForm(false)} onCreated={fetchTasks} />}
    </div>
  );
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', type: 'FOLLOW_UP_CALL', priority: 'MEDIUM', dueAt: '',
    assigneeId: '', description: '',
  });
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    api.getUsers().then(setUsers);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTask({
        ...form,
        dueAt: new Date(form.dueAt).toISOString(),
      });
      onClose();
      onCreated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-md relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">New Task</h2>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Follow up with client" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['FOLLOW_UP_CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'DEMO', 'PROPOSAL', 'OTHER'].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Due Date *</label>
            <input type="datetime-local" className="input" required value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </div>
          <div>
            <label className="label">Assign To *</label>
            <select className="input" required value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select team member...</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Task</button>
          </div>
        </form>
      </div>
    </div>
  );
}
