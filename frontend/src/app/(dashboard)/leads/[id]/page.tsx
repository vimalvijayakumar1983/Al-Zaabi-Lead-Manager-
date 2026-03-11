'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Lead } from '@/types';

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-cyan-100 text-cyan-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks' | 'communications'>('timeline');
  const [noteContent, setNoteContent] = useState('');

  useEffect(() => {
    api.getLead(id).then(setLead).finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (status: string) => {
    if (!lead) return;
    const updated = await api.updateLead(lead.id, { status });
    setLead({ ...lead, ...updated });
  };

  const handleAddNote = async () => {
    if (!lead || !noteContent.trim()) return;
    await api.addLeadNote(lead.id, noteContent);
    setNoteContent('');
    const refreshed = await api.getLead(id);
    setLead(refreshed);
  };

  const handleDelete = async () => {
    if (!lead || !confirm('Archive this lead?')) return;
    await api.deleteLead(lead.id);
    router.push('/leads');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  if (!lead) return <p className="text-gray-500">Lead not found</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center text-lg font-semibold text-brand-700">
            {lead.firstName[0]}{lead.lastName[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{lead.firstName} {lead.lastName}</h1>
            <p className="text-gray-500">{lead.company || 'No company'} {lead.jobTitle ? `- ${lead.jobTitle}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge text-sm px-3 py-1 ${statusColors[lead.status]}`}>{lead.status.replace('_', ' ')}</span>
          <button onClick={handleDelete} className="btn-secondary text-red-600 hover:text-red-700">Archive</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Details */}
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-gray-900">Contact Info</h3>
            <InfoRow label="Email" value={lead.email || '-'} />
            <InfoRow label="Phone" value={lead.phone || '-'} />
            <InfoRow label="Location" value={lead.location || '-'} />
            <InfoRow label="Website" value={lead.website || '-'} />
          </div>

          {/* Lead Details */}
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-gray-900">Lead Details</h3>
            <InfoRow label="Source" value={lead.source.replace('_', ' ')} />
            <InfoRow label="Campaign" value={lead.campaign || '-'} />
            <InfoRow label="Product Interest" value={lead.productInterest || '-'} />
            <InfoRow label="Budget" value={lead.budget ? `$${Number(lead.budget).toLocaleString()}` : '-'} />
            <InfoRow label="Stage" value={lead.stage?.name || '-'} />
          </div>

          {/* AI Score */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Lead Intelligence</h3>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Lead Score</span>
              <span className="text-lg font-bold" style={{ color: lead.score >= 70 ? '#22c55e' : lead.score >= 40 ? '#f59e0b' : '#ef4444' }}>
                {lead.score}/100
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all" style={{
                width: `${lead.score}%`,
                backgroundColor: lead.score >= 70 ? '#22c55e' : lead.score >= 40 ? '#f59e0b' : '#ef4444',
              }} />
            </div>
            {lead.conversionProb != null && (
              <p className="text-sm text-gray-600">Conversion probability: <strong>{Math.round(lead.conversionProb * 100)}%</strong></p>
            )}
            {lead.aiSummary && <p className="text-sm text-gray-600 mt-2 italic">{lead.aiSummary}</p>}
          </div>

          {/* Status Update */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Update Status</h3>
            <div className="grid grid-cols-2 gap-2">
              {['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'].map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${lead.status === s ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map((t) => (
                  <span key={t.tag.id} className="badge" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                    {t.tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Activity Feed */}
        <div className="lg:col-span-2">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 mb-4">
            {(['timeline', 'notes', 'tasks', 'communications'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'timeline' && lead._count?.activities ? ` (${lead._count.activities})` : ''}
                {tab === 'tasks' && lead.tasks ? ` (${lead.tasks.length})` : ''}
              </button>
            ))}
          </div>

          <div className="card p-4">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                {lead.activities?.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-brand-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System'} &middot;{' '}
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {(!lead.activities || lead.activities.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-4">No activities yet</p>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <textarea
                    className="input flex-1"
                    rows={2}
                    placeholder="Add a note..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                  />
                  <button onClick={handleAddNote} className="btn-primary self-end">Add</button>
                </div>
                {lead.notes?.map((note) => (
                  <div key={note.id} className="border border-gray-200 rounded-lg p-3">
                    {note.isPinned && <span className="badge bg-amber-100 text-amber-800 mb-2">Pinned</span>}
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {note.user.firstName} {note.user.lastName} &middot; {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-3">
                {lead.tasks?.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg">
                    <input
                      type="checkbox"
                      checked={task.status === 'COMPLETED'}
                      onChange={() => api.completeTask(task.id).then(() => api.getLead(id).then(setLead))}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                    <div className="flex-1">
                      <p className={`text-sm ${task.status === 'COMPLETED' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                      <p className="text-xs text-gray-500">{task.type.replace('_', ' ')} &middot; Due {new Date(task.dueAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`badge ${task.priority === 'URGENT' ? 'bg-red-100 text-red-800' : task.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
                {(!lead.tasks || lead.tasks.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-4">No tasks</p>
                )}
              </div>
            )}

            {activeTab === 'communications' && (
              <div className="space-y-3">
                {lead.communications?.map((comm) => (
                  <div key={comm.id} className={`p-3 rounded-lg border ${comm.direction === 'OUTBOUND' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge bg-gray-100 text-gray-800">{comm.channel}</span>
                      <span className="text-xs text-gray-500">{comm.direction}</span>
                      {comm.subject && <span className="text-sm font-medium text-gray-900">{comm.subject}</span>}
                    </div>
                    <p className="text-sm text-gray-700">{comm.body}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(comm.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                {(!lead.communications || lead.communications.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-4">No communications</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
