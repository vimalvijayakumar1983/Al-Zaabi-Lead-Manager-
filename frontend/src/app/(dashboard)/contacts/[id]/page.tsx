'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Contact, Deal } from '@/types';
import {
  ArrowLeft, Mail, Phone, Building2, MapPin, Globe, Linkedin,
  Twitter, Calendar, User2, Clock, Tag, Edit3, Trash2, Plus,
  Send, MessageSquare, FileText, CheckSquare, DollarSign,
  Briefcase, UserCheck, Star, Shield, ChevronDown, X, Loader2,
  ExternalLink, Hash, TrendingUp, MoreHorizontal, Save,
} from 'lucide-react';

const lifecycleColors: Record<string, string> = {
  SUBSCRIBER: 'bg-gray-100 text-gray-700',
  LEAD: 'bg-blue-100 text-blue-700',
  MARKETING_QUALIFIED: 'bg-indigo-100 text-indigo-700',
  SALES_QUALIFIED: 'bg-violet-100 text-violet-700',
  OPPORTUNITY: 'bg-amber-100 text-amber-700',
  CUSTOMER: 'bg-emerald-100 text-emerald-700',
  EVANGELIST: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

const lifecycleLabels: Record<string, string> = {
  SUBSCRIBER: 'Subscriber', LEAD: 'Lead', MARKETING_QUALIFIED: 'Marketing Qualified',
  SALES_QUALIFIED: 'Sales Qualified', OPPORTUNITY: 'Opportunity',
  CUSTOMER: 'Customer', EVANGELIST: 'Evangelist', OTHER: 'Other',
};

const typeLabels: Record<string, string> = {
  PROSPECT: 'Prospect', CUSTOMER: 'Customer', PARTNER: 'Partner',
  VENDOR: 'Vendor', INFLUENCER: 'Influencer', OTHER: 'Other',
};

const dealStageLabels: Record<string, { label: string; color: string }> = {
  QUALIFICATION: { label: 'Qualification', color: 'bg-blue-100 text-blue-700' },
  NEEDS_ANALYSIS: { label: 'Needs Analysis', color: 'bg-indigo-100 text-indigo-700' },
  PROPOSAL: { label: 'Proposal', color: 'bg-violet-100 text-violet-700' },
  NEGOTIATION: { label: 'Negotiation', color: 'bg-amber-100 text-amber-700' },
  CLOSED_WON: { label: 'Closed Won', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED_LOST: { label: 'Closed Lost', color: 'bg-red-100 text-red-700' },
};

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks' | 'deals' | 'details'>('timeline');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);

  const fetchContact = useCallback(async () => {
    try {
      const data = await api.getContact(params.id as string);
      setContact(data);
    } catch {
      router.push('/contacts');
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { fetchContact(); }, [fetchContact]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.addContactNote(contact!.id, noteText);
      setNoteText('');
      fetchContact();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Archive this contact?')) return;
    await api.deleteContact(contact!.id);
    router.push('/contacts');
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-text-tertiary" /></div>;
  if (!contact) return null;

  const tabs = [
    { key: 'timeline' as const, label: 'Timeline', count: contact._count?.activities },
    { key: 'notes' as const, label: 'Notes', count: contact._count?.notes },
    { key: 'tasks' as const, label: 'Tasks', count: contact._count?.tasks },
    { key: 'deals' as const, label: 'Deals', count: contact._count?.deals },
    { key: 'details' as const, label: 'Details' },
  ];

  return (
    <div className="animate-fade-in max-w-6xl mx-auto pb-8">
      {/* Back */}
      <button onClick={() => router.push('/contacts')} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Contacts
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile Header */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xl font-bold">
                {contact.firstName[0]}{contact.lastName[0]}
              </div>
              <div className="flex gap-1">
                <button onClick={() => router.push(`/contacts?edit=${contact.id}`)} className="btn-icon h-8 w-8" title="Edit"><Edit3 className="h-4 w-4" /></button>
                <button onClick={handleDelete} className="btn-icon h-8 w-8 text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <h1 className="text-xl font-bold text-text-primary">
              {contact.salutation ? `${contact.salutation} ` : ''}{contact.firstName} {contact.lastName}
            </h1>
            {contact.jobTitle && <p className="text-sm text-text-secondary mt-0.5">{contact.jobTitle}{contact.department ? `, ${contact.department}` : ''}</p>}
            {contact.company && (
              <p className="text-sm text-text-tertiary flex items-center gap-1 mt-0.5">
                <Building2 className="h-3.5 w-3.5" /> {contact.company}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${lifecycleColors[contact.lifecycle] || 'bg-gray-100'}`}>
                {lifecycleLabels[contact.lifecycle] || contact.lifecycle}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-tertiary text-text-secondary">
                {typeLabels[contact.type] || contact.type}
              </span>
            </div>

            {/* Score */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-text-tertiary">Contact Score</span>
                  <span className="font-bold text-text-primary">{contact.score}/100</span>
                </div>
                <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${contact.score >= 70 ? 'bg-emerald-500' : contact.score >= 40 ? 'bg-amber-500' : 'bg-gray-400'}`} style={{ width: `${contact.score}%` }} />
                </div>
              </div>
            </div>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {contact.tags.map(t => (
                  <span key={t.tag.id} className="px-2 py-0.5 rounded text-2xs font-medium bg-surface-tertiary text-text-secondary">
                    {t.tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div className="card p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Contact Information</h3>
            {contact.email && <InfoRow icon={Mail} label="Email" value={contact.email} isLink={`mailto:${contact.email}`} />}
            {contact.phone && <InfoRow icon={Phone} label="Phone" value={contact.phone} isLink={`tel:${contact.phone}`} />}
            {contact.mobile && <InfoRow icon={Phone} label="Mobile" value={contact.mobile} isLink={`tel:${contact.mobile}`} />}
            {contact.website && <InfoRow icon={Globe} label="Website" value={contact.website} isLink={contact.website} />}
            {contact.linkedin && <InfoRow icon={Linkedin} label="LinkedIn" value="Profile" isLink={contact.linkedin} />}
            {contact.twitter && <InfoRow icon={Twitter} label="Twitter" value={contact.twitter} />}
            {contact.dateOfBirth && <InfoRow icon={Calendar} label="Birthday" value={new Date(contact.dateOfBirth).toLocaleDateString()} />}
          </div>

          {/* Address */}
          {(contact.address || contact.city || contact.country) && (
            <div className="card p-5 space-y-3">
              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Address</h3>
              <div className="text-sm text-text-secondary space-y-0.5">
                {contact.address && <p>{contact.address}</p>}
                {(contact.city || contact.state) && <p>{[contact.city, contact.state].filter(Boolean).join(', ')}</p>}
                {(contact.country || contact.postalCode) && <p>{[contact.country, contact.postalCode].filter(Boolean).join(' ')}</p>}
              </div>
            </div>
          )}

          {/* Owner & Meta */}
          <div className="card p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Record Info</h3>
            {contact.owner && <InfoRow icon={User2} label="Owner" value={`${contact.owner.firstName} ${contact.owner.lastName}`} />}
            {contact.convertedFromLead && (
              <InfoRow icon={TrendingUp} label="Converted From" value={`${contact.convertedFromLead.firstName} ${contact.convertedFromLead.lastName}`} />
            )}
            <InfoRow icon={Calendar} label="Created" value={new Date(contact.createdAt).toLocaleDateString()} />
            <InfoRow icon={Clock} label="Updated" value={new Date(contact.updatedAt).toLocaleDateString()} />
            {contact.lastContactedAt && <InfoRow icon={MessageSquare} label="Last Contacted" value={new Date(contact.lastContactedAt).toLocaleDateString()} />}

            {/* Preferences */}
            <div className="pt-2 border-t border-border-subtle space-y-1.5">
              {contact.doNotEmail && <span className="block text-2xs text-red-600 font-medium">Do Not Email</span>}
              {contact.doNotCall && <span className="block text-2xs text-red-600 font-medium">Do Not Call</span>}
              {contact.hasOptedOutEmail && <span className="block text-2xs text-red-600 font-medium">Email Opted Out</span>}
              {!contact.doNotEmail && !contact.doNotCall && !contact.hasOptedOutEmail && (
                <span className="block text-2xs text-emerald-600 font-medium">All communication allowed</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Tabs */}
        <div className="lg:col-span-2">
          {/* Tab Bar */}
          <div className="flex gap-1 border-b border-border-subtle mb-4 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'text-brand-700 border-brand-600'
                    : 'text-text-tertiary border-transparent hover:text-text-secondary'
                }`}>
                {tab.label}
                {tab.count !== undefined && <span className="ml-1.5 text-2xs bg-surface-tertiary rounded-full px-1.5 py-0.5">{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {contact.activities && contact.activities.length > 0 ? (
                contact.activities.map(activity => (
                  <div key={activity.id} className="card p-4 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-surface-tertiary flex items-center justify-center flex-shrink-0">
                      <Clock className="h-4 w-4 text-text-tertiary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {activity.user && <span className="text-2xs text-text-tertiary">{activity.user.firstName} {activity.user.lastName}</span>}
                        <span className="text-2xs text-text-quaternary">{new Date(activity.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card p-8 text-center">
                  <Clock className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No activity yet</p>
                </div>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <div className="card p-4">
                <textarea className="input text-sm" rows={3} placeholder="Add a note..." value={noteText} onChange={e => setNoteText(e.target.value)} />
                <div className="flex justify-end mt-2">
                  <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()} className="btn-primary text-xs">
                    {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add Note
                  </button>
                </div>
              </div>
              {contact.notes && contact.notes.map(note => (
                <div key={note.id} className={`card p-4 ${note.isPinned ? 'border-l-4 border-brand-500' : ''}`}>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-2xs text-text-tertiary">{note.user.firstName} {note.user.lastName}</span>
                    <span className="text-2xs text-text-quaternary">{new Date(note.createdAt).toLocaleString()}</span>
                    {note.isPinned && <span className="text-2xs text-brand-600 font-medium">Pinned</span>}
                  </div>
                </div>
              ))}
              {(!contact.notes || contact.notes.length === 0) && (
                <div className="card p-8 text-center">
                  <FileText className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No notes yet</p>
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="space-y-3">
              {contact.tasks && contact.tasks.length > 0 ? (
                contact.tasks.map(task => (
                  <div key={task.id} className="card p-4 flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
                      task.status === 'COMPLETED' ? 'bg-emerald-500' : task.status === 'IN_PROGRESS' ? 'bg-blue-500' : task.status === 'CANCELLED' ? 'bg-gray-400' : 'bg-amber-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'COMPLETED' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-2xs text-text-tertiary">{task.type?.replace(/_/g, ' ')}</span>
                        <span className="text-2xs text-text-quaternary">Due {new Date(task.dueAt).toLocaleDateString()}</span>
                        {task.assignee && <span className="text-2xs text-text-tertiary">{task.assignee.firstName}</span>}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-2xs font-medium ${
                      task.priority === 'URGENT' ? 'bg-red-100 text-red-700' : task.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : task.priority === 'MEDIUM' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>{task.priority}</span>
                  </div>
                ))
              ) : (
                <div className="card p-8 text-center">
                  <CheckSquare className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No tasks yet</p>
                </div>
              )}
            </div>
          )}

          {/* Deals Tab */}
          {activeTab === 'deals' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setShowDealForm(!showDealForm)} className="btn-primary text-xs">
                  <Plus className="h-3.5 w-3.5" /> New Deal
                </button>
              </div>

              {showDealForm && (
                <DealForm contactId={contact.id} onClose={() => setShowDealForm(false)} onCreated={() => { setShowDealForm(false); fetchContact(); }} />
              )}

              {contact.deals && contact.deals.length > 0 ? (
                contact.deals.map(deal => {
                  const stageInfo = dealStageLabels[deal.stage] || { label: deal.stage, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <div key={deal.id} className="card p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary">{deal.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-2xs font-medium ${stageInfo.color}`}>{stageInfo.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-2xs font-medium ${
                              deal.status === 'WON' ? 'bg-emerald-100 text-emerald-700' : deal.status === 'LOST' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}>{deal.status}</span>
                          </div>
                        </div>
                        {deal.amount && (
                          <span className="text-lg font-bold text-text-primary">${Number(deal.amount).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-2xs text-text-tertiary">
                        {deal.probability > 0 && <span>Probability: {deal.probability}%</span>}
                        {deal.closeDate && <span>Close: {new Date(deal.closeDate).toLocaleDateString()}</span>}
                        {deal.owner && <span>Owner: {deal.owner.firstName}</span>}
                      </div>
                    </div>
                  );
                })
              ) : !showDealForm && (
                <div className="card p-8 text-center">
                  <DollarSign className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No deals yet</p>
                  <p className="text-xs text-text-tertiary mt-1">Create a deal to track revenue</p>
                </div>
              )}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="card p-5 space-y-3">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Source & Classification</h3>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-text-tertiary">Source</span>
                  <span className="text-text-primary">{contact.source?.replace(/_/g, ' ')}</span>
                  <span className="text-text-tertiary">Lifecycle</span>
                  <span className="text-text-primary">{lifecycleLabels[contact.lifecycle]}</span>
                  <span className="text-text-tertiary">Type</span>
                  <span className="text-text-primary">{typeLabels[contact.type]}</span>
                  <span className="text-text-tertiary">Score</span>
                  <span className="text-text-primary">{contact.score}</span>
                </div>
              </div>
              {contact.description && (
                <div className="card p-5">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Description</h3>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">{contact.description}</p>
                </div>
              )}
              {contact.customData && Object.keys(contact.customData).length > 0 && (
                <div className="card p-5 space-y-3">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Custom Fields</h3>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    {Object.entries(contact.customData).map(([k, v]) => (
                      <><span key={`${k}-label`} className="text-text-tertiary">{k}</span><span key={`${k}-value`} className="text-text-primary">{String(v)}</span></>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Info Row Component ─────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, isLink }: { icon: any; label: string; value: string; isLink?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-text-tertiary flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-2xs text-text-tertiary">{label}</p>
        {isLink ? (
          <a href={isLink} target={isLink.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline truncate block">{value}</a>
        ) : (
          <p className="text-sm text-text-primary truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Deal Form ──────────────────────────────────────────────────

function DealForm({ contactId, onClose, onCreated }: { contactId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', amount: '', stage: 'QUALIFICATION', probability: '50', closeDate: '', description: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      await api.createDeal(contactId, {
        name: form.name,
        amount: form.amount ? parseFloat(form.amount) : undefined,
        stage: form.stage,
        probability: parseInt(form.probability, 10),
        closeDate: form.closeDate || undefined,
        description: form.description || undefined,
      });
      onCreated();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 border-2 border-brand-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-text-primary">New Deal</h4>
        <button onClick={onClose} className="btn-icon h-7 w-7"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Deal Name *</label>
            <input className="input text-sm" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Enterprise Package" />
          </div>
          <div>
            <label className="label">Amount</label>
            <input className="input text-sm" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Stage</label>
            <select className="input text-sm" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
              {Object.entries(dealStageLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Probability %</label>
            <input className="input text-sm" type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} />
          </div>
          <div>
            <label className="label">Close Date</label>
            <input className="input text-sm" type="date" value={form.closeDate} onChange={e => setForm({ ...form, closeDate: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Create Deal
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-xs">Cancel</button>
        </div>
      </form>
    </div>
  );
}
