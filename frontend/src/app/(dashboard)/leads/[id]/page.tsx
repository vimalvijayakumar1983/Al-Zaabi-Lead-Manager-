'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Lead, CustomField, User, AssignmentHistoryEntry } from '@/types';
import { ReassignmentPanel } from '../components/ReassignmentPanel';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CONTACTED: 'bg-blue-100 text-blue-800 border-blue-200',
  QUALIFIED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800 border-amber-200',
  NEGOTIATION: 'bg-orange-100 text-orange-800 border-orange-200',
  WON: 'bg-green-100 text-green-800 border-green-200',
  LOST: 'bg-red-100 text-red-800 border-red-200',
};

const activityIcons: Record<string, { icon: string; color: string }> = {
  STATUS_CHANGE: { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', color: 'text-blue-500 bg-blue-100' },
  STAGE_CHANGE: { icon: 'M9 5l7 7-7 7', color: 'text-purple-500 bg-purple-100' },
  NOTE_ADDED: { icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-yellow-600 bg-yellow-100' },
  TASK_CREATED: { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'text-indigo-500 bg-indigo-100' },
  TASK_COMPLETED: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-green-500 bg-green-100' },
  EMAIL_SENT: { icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', color: 'text-blue-500 bg-blue-100' },
  CALL_MADE: { icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', color: 'text-cyan-500 bg-cyan-100' },
  CALL_RECEIVED: { icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', color: 'text-teal-500 bg-teal-100' },
  MEETING_SCHEDULED: { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'text-emerald-500 bg-emerald-100' },
  ASSIGNMENT_CHANGED: { icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: 'text-orange-500 bg-orange-100' },
  LEAD_CREATED: { icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', color: 'text-green-500 bg-green-100' },
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks' | 'communications' | 'call_logs'>('timeline');
  const [noteContent, setNoteContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showCallLogModal, setShowCallLogModal] = useState(false);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showConvertToContact, setShowConvertToContact] = useState(false);
  const [convertingToContact, setConvertingToContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customEditValues, setCustomEditValues] = useState<Record<string, unknown>>({});
  const [fullUsers, setFullUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  // Chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatChannel, setChatChannel] = useState<string>('WHATSAPP');
  const [chatPlatform, setChatPlatform] = useState<string>('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // WhatsApp-like features
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [menuOpenMsgId, setMenuOpenMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [pipelineStages, setPipelineStages] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    // Scope custom fields to the lead's division when available
    const divisionId = lead?.organizationId;
    api.getCustomFields(divisionId || undefined).then(setCustomFields).catch(() => {});
  }, [lead?.organizationId]);

  useEffect(() => {
    api.getPipelineStages()
      .then((data: any) => {
        const allStages = data.stages || data || [];
        // Scope to the lead's division if available
        if (lead?.organizationId) {
          const divisionStages = allStages.filter((s: any) => s.organizationId === lead.organizationId);
          setPipelineStages(divisionStages.length > 0 ? divisionStages : allStages);
        } else {
          setPipelineStages(allStages);
        }
      })
      .catch(() => setPipelineStages([]));
  }, [lead?.organizationId]);

  // Fetch users for assignment panel
  useEffect(() => {
    Promise.all([api.getUsers(), api.getMe()]).then(([userList, me]: [any, any]) => {
      setFullUsers(Array.isArray(userList) ? userList : []);
      setCurrentUserId(me?.id || '');
    }).catch(() => {});
  }, []);

  // Fetch assignment history
  useEffect(() => {
    if (lead?.id) {
      api.getAssignmentHistory(lead.id)
        .then((data: any) => setAssignmentHistory(Array.isArray(data) ? data : []))
        .catch(() => setAssignmentHistory([]));
    }
  }, [lead?.id]);

  const refreshLead = useCallback(async () => {
    const data = await api.getLead(id);
    setLead(data);
  }, [id]);

  useEffect(() => {
    api.getLead(id)
      .then(setLead)
      .catch((err) => console.error('Failed to load lead:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStageClick = async (stage: { id: string; name: string; color: string; isWonStage?: boolean; isLostStage?: boolean }) => {
    if (!lead) return;
    if (stage.id === lead.stageId) return;
    try {
      await api.moveLead(lead.id, stage.id, 0);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddNote = async () => {
    if (!lead || !noteContent.trim()) return;
    await api.addLeadNote(lead.id, noteContent);
    setNoteContent('');
    await refreshLead();
  };

  const handleDelete = async () => {
    if (!lead || !confirm('Archive this lead?')) return;
    await api.deleteLead(lead.id);
    router.push('/leads');
  };

  const startEditing = () => {
    if (!lead) return;
    setEditForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      jobTitle: lead.jobTitle || '',
      location: lead.location || '',
      website: lead.website || '',
      productInterest: lead.productInterest || '',
      budget: lead.budget?.toString() || '',
      campaign: lead.campaign || '',
      stageId: lead.stage?.id || '',
    });
    // Load custom field values for editing
    const cd = (lead.customData || {}) as Record<string, unknown>;
    const cfVals: Record<string, unknown> = {};
    for (const cf of customFields) {
      cfVals[cf.name] = cd[cf.name] ?? '';
    }
    setCustomEditValues(cfVals);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const data: any = { ...editForm };
      if (data.budget) data.budget = parseFloat(data.budget);
      else data.budget = null;
      // Convert empty strings to null
      for (const key of ['email', 'phone', 'company', 'jobTitle', 'location', 'website', 'productInterest', 'campaign', 'stageId']) {
        if (!data[key]) data[key] = null;
      }
      // Build custom data
      const existingCustomData = (lead.customData || {}) as Record<string, unknown>;
      const newCustomData = { ...existingCustomData };
      for (const cf of customFields) {
        const val = customEditValues[cf.name];
        if (val === '' || val === undefined || val === null) {
          delete newCustomData[cf.name];
        } else if (cf.type === 'NUMBER') {
          newCustomData[cf.name] = parseFloat(String(val)) || null;
        } else if (cf.type === 'BOOLEAN') {
          newCustomData[cf.name] = val === true || val === 'true';
        } else {
          newCustomData[cf.name] = val;
        }
      }
      data.customData = newCustomData;
      await api.updateLead(lead.id, data);
      setIsEditing(false);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async (taskData: any) => {
    try {
      await api.createTask({ ...taskData, leadId: lead!.id });
      setShowTaskModal(false);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogComm = async (commData: any) => {
    try {
      await api.logCommunication({ ...commData, leadId: lead!.id });
      setShowCommModal(false);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadCallLogs = useCallback(async () => {
    if (!lead?.id) return;
    setCallLogsLoading(true);
    try {
      const logs = await api.getCallLogs(lead.id);
      setCallLogs(logs);
    } catch {
      setCallLogs([]);
    } finally {
      setCallLogsLoading(false);
    }
  }, [lead?.id]);

  const handleLogCall = async (callData: any) => {
    try {
      await api.logCall({ ...callData, leadId: lead!.id });
      setShowCallLogModal(false);
      await Promise.all([refreshLead(), loadCallLogs()]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendEmail = async (emailData: { to: string; subject: string; body: string }) => {
    try {
      await api.sendEmail({ leadId: lead!.id, ...emailData });
      setShowEmailComposer(false);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConvertToWon = async () => {
    if (!lead) return;
    try {
      await api.updateLead(lead.id, { status: 'WON' });
      setShowConvertModal(false);
      await refreshLead();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConvertToContact = async (createDeal: boolean) => {
    if (!lead) return;
    setConvertingToContact(true);
    try {
      const contact = await api.convertLeadToContact({
        leadId: lead.id,
        lifecycle: 'CUSTOMER',
        type: 'CUSTOMER',
        createDeal,
        dealName: lead.company ? `${lead.company} - Deal` : `${lead.firstName} ${lead.lastName} - Deal`,
        dealAmount: lead.budget ? Number(lead.budget) : undefined,
      });
      setShowConvertToContact(false);
      router.push(`/contacts/${contact.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to convert lead to contact');
    } finally {
      setConvertingToContact(false);
    }
  };

  // Load chat messages when Communications tab is active
  const loadChatMessages = useCallback(async () => {
    if (!id) return;
    setChatLoading(true);
    try {
      const data = await api.getInboxMessages(id, { limit: 100 });
      setChatMessages(data.messages || []);
    } catch {
      // Fallback to lead's communications if inbox API fails
      if (lead?.communications) {
        setChatMessages([...lead.communications].sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ));
      }
    } finally {
      setChatLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (activeTab === 'communications' && lead?.id) {
      loadChatMessages();
    }
    if (activeTab === 'call_logs' && lead?.id) {
      loadCallLogs();
    }
  }, [activeTab, lead?.id, loadChatMessages, loadCallLogs]);

  // Real-time sync: refresh lead data when lead or note changes
  useRealtimeSync(['lead', 'note'], useCallback((event) => {
    // For lead events, only refresh if it's this lead (or no entityId specified)
    if (event.entity === 'lead' && event.entityId && event.entityId !== id) return;
    refreshLead();
  }, [id, refreshLead]));

  // Real-time sync: refresh chat messages when communications change (from other users)
  useRealtimeSync(['communication'], useCallback((event) => {
    if (event.entityId && event.entityId !== id) return;
    loadChatMessages();
  }, [id, loadChatMessages]));

  // Real-time sync: refresh lead when tasks change (tasks are embedded in lead response)
  useRealtimeSync(['task'], useCallback(() => {
    refreshLead();
  }, [refreshLead]));

  // Auto-scroll chat container to bottom (without moving the page)
  useEffect(() => {
    if (chatContainerRef.current && activeTab === 'communications') {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, activeTab]);

  // Update chat channel/platform together
  const handleChannelSelect = (value: string) => {
    if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(value)) {
      setChatChannel('CHAT');
      setChatPlatform(value.toLowerCase());
    } else {
      setChatChannel(value);
      setChatPlatform('');
    }
  };

  const handleSendChatMessage = async () => {
    if (!lead || !chatMessage.trim()) return;
    const body = chatMessage.trim();
    const tempId = `temp-${Date.now()}`;
    const platform = chatPlatform || chatChannel;

    // Optimistic: add message instantly
    const optimisticMsg = {
      id: tempId,
      direction: 'OUTBOUND',
      channel: chatChannel,
      body,
      platform: platform.toUpperCase(),
      metadata: chatPlatform ? { platform: chatPlatform } : {},
      createdAt: new Date().toISOString(),
      user: { id: currentUserId, firstName: 'You', lastName: '' },
      _optimistic: true,
    };
    setChatMessages(prev => [...prev, optimisticMsg]);
    setChatMessage('');
    setSendingChat(true);

    try {
      const sent = await api.sendInboxMessage({
        leadId: lead.id,
        channel: chatChannel,
        body,
        platform: chatPlatform || undefined,
      });
      // Replace optimistic message with real one
      setChatMessages(prev => prev.map(m => m.id === tempId ? { ...sent, platform: platform.toUpperCase() } : m));
    } catch (err: any) {
      // Remove optimistic message on failure
      setChatMessages(prev => prev.filter(m => m.id !== tempId));
      alert(err.message);
    } finally {
      setSendingChat(false);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingBody.trim()) return;
    try {
      const updated = await api.editInboxMessage(messageId, editingBody.trim());
      setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, body: updated.body, isEdited: true } : m));
      setEditingMsgId(null);
      setEditingBody('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message? It will be shown as "message was deleted".')) return;
    try {
      await api.deleteInboxMessage(messageId);
      setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, body: '' } : m));
      setMenuOpenMsgId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          <span className="text-sm text-gray-500">Loading lead...</span>
        </div>
      </div>
    );
  }

  if (!lead) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <p className="text-gray-500 font-medium">Lead not found</p>
      <button onClick={() => router.push('/leads')} className="text-sm text-brand-600 hover:text-brand-700">Back to leads</button>
    </div>
  );

  // Build stage flow from division's pipeline stages (excluding lost stage which is shown separately)
  const mainStages = pipelineStages.filter((s: any) => !s.isLostStage).sort((a: any, b: any) => a.order - b.order);
  const lostStage = pipelineStages.find((s: any) => s.isLostStage);
  const currentStageIndex = mainStages.findIndex((s: any) => s.id === lead.stageId);
  const isOnLostStage = lostStage && lead.stageId === lostStage.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-lg font-semibold text-white shadow-md">
            {lead.firstName[0]}{lead.lastName[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{lead.firstName} {lead.lastName}</h1>
            <p className="text-gray-500">{lead.company || 'No company'} {lead.jobTitle ? `· ${lead.jobTitle}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge text-sm px-3 py-1.5 border ${statusColors[lead.status]}`}>{lead.status.replace(/_/g, ' ')}</span>
          {!isEditing && (
            <button onClick={startEditing} className="btn-secondary text-xs gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Edit
            </button>
          )}
          <button onClick={handleDelete} className="btn-secondary text-xs text-red-600 hover:text-red-700 gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Archive
          </button>
        </div>
      </div>

      {/* Stage Progress Bar — driven by division's custom pipeline stages */}
      {mainStages.length > 0 ? (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            {mainStages.map((stage: any, i: number) => {
              const isActive = i <= currentStageIndex && !isOnLostStage;
              const isCurrent = stage.id === lead.stageId;
              return (
                <div key={stage.id} className="flex items-center flex-1">
                  <button
                    onClick={() => handleStageClick(stage)}
                    className={`relative flex flex-col items-center group ${i < mainStages.length - 1 ? 'flex-1' : ''}`}
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isCurrent ? 'text-white ring-4 ring-opacity-30 scale-110' :
                        isActive ? 'text-white' :
                        'bg-gray-200 text-gray-500 group-hover:bg-gray-300'
                      }`}
                      style={isCurrent ? { backgroundColor: stage.color, boxShadow: `0 0 0 4px ${stage.color}33` } :
                             isActive ? { backgroundColor: stage.color } : undefined}
                    >
                      {isActive && !isCurrent ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${isCurrent ? 'font-semibold' : 'text-gray-500'}`}
                      style={isCurrent ? { color: stage.color } : undefined}
                    >
                      {stage.name}
                    </span>
                  </button>
                  {i < mainStages.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 rounded ${i < currentStageIndex && !isOnLostStage ? '' : 'bg-gray-200'}`}
                      style={i < currentStageIndex && !isOnLostStage ? { backgroundColor: stage.color } : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {isOnLostStage && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              This lead is marked as Lost {lead.lostReason ? `— ${lead.lostReason}` : ''}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Details */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Contact Info
              </h3>
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">First Name</label>
                    <input className="input text-sm" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Last Name</label>
                    <input className="input text-sm" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Email</label>
                  <input type="email" className="input text-sm" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Phone</label>
                  <input className="input text-sm" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Location</label>
                  <input className="input text-sm" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Website</label>
                  <input className="input text-sm" value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
                </div>
              </div>
            ) : (
              <>
                <ContactRow icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" label="Email" value={lead.email} isLink={lead.email ? `mailto:${lead.email}` : undefined} />
                <ContactRow icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" label="Phone" value={lead.phone} isLink={lead.phone ? `tel:${lead.phone}` : undefined} />
                <ContactRow icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" label="Location" value={lead.location} />
                <ContactRow icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" label="Website" value={lead.website} isLink={lead.website || undefined} />
              </>
            )}
          </div>

          {/* Lead Details */}
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Lead Details
            </h3>
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">Company</label>
                  <input className="input text-sm" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Job Title</label>
                  <input className="input text-sm" value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Product Interest</label>
                  <input className="input text-sm" value={editForm.productInterest} onChange={(e) => setEditForm({ ...editForm, productInterest: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Budget</label>
                  <input type="number" className="input text-sm" value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Campaign</label>
                  <input className="input text-sm" value={editForm.campaign} onChange={(e) => setEditForm({ ...editForm, campaign: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Pipeline Stage</label>
                  <select className="input text-sm" value={editForm.stageId || ''} onChange={(e) => setEditForm({ ...editForm, stageId: e.target.value || null })}>
                    <option value="">No Stage</option>
                    {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {/* Custom fields in edit mode */}
                {customFields.map(cf => (
                  <div key={cf.id}>
                    <label className="text-xs text-gray-500">{cf.label}{cf.isRequired ? ' *' : ''}</label>
                    {(cf.type === 'TEXT' || cf.type === 'EMAIL' || cf.type === 'PHONE' || cf.type === 'URL') && (
                      <input type={cf.type === 'EMAIL' ? 'email' : cf.type === 'URL' ? 'url' : 'text'} className="input text-sm" required={cf.isRequired}
                        value={String(customEditValues[cf.name] || '')} onChange={(e) => setCustomEditValues({ ...customEditValues, [cf.name]: e.target.value })} />
                    )}
                    {cf.type === 'NUMBER' && (
                      <input type="number" className="input text-sm" required={cf.isRequired}
                        value={String(customEditValues[cf.name] || '')} onChange={(e) => setCustomEditValues({ ...customEditValues, [cf.name]: e.target.value })} />
                    )}
                    {cf.type === 'DATE' && (
                      <input type="date" className="input text-sm" required={cf.isRequired}
                        value={String(customEditValues[cf.name] || '')} onChange={(e) => setCustomEditValues({ ...customEditValues, [cf.name]: e.target.value })} />
                    )}
                    {cf.type === 'SELECT' && (
                      <select className="input text-sm" required={cf.isRequired}
                        value={String(customEditValues[cf.name] || '')} onChange={(e) => setCustomEditValues({ ...customEditValues, [cf.name]: e.target.value })}>
                        <option value="">Select...</option>
                        {(cf.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {cf.type === 'BOOLEAN' && (
                      <div className="flex items-center gap-4 mt-1">
                        <label className="flex items-center gap-1.5 text-sm"><input type="radio" name={`cfe_${cf.name}`} checked={customEditValues[cf.name] === true} onChange={() => setCustomEditValues({ ...customEditValues, [cf.name]: true })} /> Yes</label>
                        <label className="flex items-center gap-1.5 text-sm"><input type="radio" name={`cfe_${cf.name}`} checked={customEditValues[cf.name] === false} onChange={() => setCustomEditValues({ ...customEditValues, [cf.name]: false })} /> No</label>
                      </div>
                    )}
                    {cf.type === 'MULTI_SELECT' && (
                      <select className="input text-sm" value="" onChange={(e) => {
                        if (e.target.value) {
                          const current = (customEditValues[cf.name] as string[]) || [];
                          if (!current.includes(e.target.value)) setCustomEditValues({ ...customEditValues, [cf.name]: [...current, e.target.value] });
                          e.target.value = '';
                        }
                      }}>
                        <option value="">Add option...</option>
                        {(cf.options || []).filter(o => !((customEditValues[cf.name] as string[]) || []).includes(o)).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveEdit} disabled={saving} className="btn-primary text-xs flex-1">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="Source" value={lead.source ? lead.source.replace(/_/g, ' ') : '-'} />
                <InfoRow label="Campaign" value={lead.campaign || '-'} />
                <InfoRow label="Product Interest" value={lead.productInterest || '-'} />
                <InfoRow label="Budget" value={lead.budget ? `AED ${Number(lead.budget).toLocaleString()}` : '-'} />
                <InfoRow label="Stage" value={lead.stage?.name || '-'} />
                {/* Custom fields */}
                {customFields.map(cf => {
                  const cd = (lead.customData || {}) as Record<string, unknown>;
                  const val = cd[cf.name];
                  let display = '-';
                  if (val !== undefined && val !== null && val !== '') {
                    if (cf.type === 'BOOLEAN') display = val ? 'Yes' : 'No';
                    else if (cf.type === 'MULTI_SELECT' && Array.isArray(val)) display = val.join(', ');
                    else if (cf.type === 'DATE') display = new Date(String(val)).toLocaleDateString();
                    else display = String(val);
                  }
                  return <InfoRow key={cf.id} label={cf.label} value={display} />;
                })}
              </>
            )}
          </div>

          {/* AI Score */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              Lead Intelligence
            </h3>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Lead Score</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: (lead.score || 0) >= 70 ? '#16a34a' : (lead.score || 0) >= 40 ? '#d97706' : '#dc2626' }}>
                {lead.score || 0}<span className="text-sm font-normal text-gray-400">/100</span>
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${lead.score || 0}%`,
                background: (lead.score || 0) >= 70 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : (lead.score || 0) >= 40 ? 'linear-gradient(90deg, #fbbf24, #d97706)' : 'linear-gradient(90deg, #f87171, #dc2626)',
              }} />
            </div>
            {lead.conversionProb != null && (
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Conversion Probability</span>
                <span className="font-bold" style={{ color: lead.conversionProb >= 0.6 ? '#16a34a' : lead.conversionProb >= 0.3 ? '#d97706' : '#dc2626' }}>
                  {Math.round(lead.conversionProb * 100)}%
                </span>
              </div>
            )}
            {lead.aiSummary && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 italic">{lead.aiSummary}</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setActiveTab('tasks'); setShowTaskModal(true); }} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Add Task
              </button>
              <button onClick={() => { setShowCallLogModal(true); }} className="flex items-center gap-2 p-2.5 rounded-lg border border-cyan-200 text-sm text-cyan-700 bg-cyan-50 hover:bg-cyan-100 hover:border-cyan-300 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Log Call
              </button>
              <button onClick={() => { setActiveTab('communications'); setShowCommModal(true); }} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                Log Comm
              </button>
              <button onClick={() => { setActiveTab('notes'); }} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Add Note
              </button>
              {lead.email && (
                <button onClick={() => setShowEmailComposer(true)} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                  <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Send Email
                </button>
              )}
              {lead.status !== 'WON' && lead.status !== 'LOST' && (
                <button onClick={() => setShowConvertModal(true)} className="flex items-center gap-2 p-2.5 rounded-lg border border-green-200 text-sm text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors col-span-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  Convert to Won Deal
                </button>
              )}
              <button onClick={() => setShowConvertToContact(true)} className="flex items-center gap-2 p-2.5 rounded-lg border border-brand-200 text-sm text-brand-700 bg-brand-50 hover:bg-brand-100 hover:border-brand-300 transition-colors col-span-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Convert to Contact
              </button>
            </div>
          </div>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map((t) => (
                  <span key={t.tag.id} className="badge px-3 py-1" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color, border: `1px solid ${t.tag.color}40` }}>
                    {t.tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assignment Panel */}
          <ReassignmentPanel
            lead={lead}
            users={fullUsers as User[]}
            currentUserId={currentUserId}
            onReassign={async (leadId: string, assignedToId: string, reason?: string) => {
              await api.reassignLead(leadId, assignedToId, reason);
              refreshLead();
            }}
            assignmentHistory={assignmentHistory}
          />

          {/* Meta Info */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Timestamps
            </h3>
            <InfoRow label="Created" value={lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '-'} />
            <InfoRow label="Updated" value={lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : '-'} />

          </div>
        </div>

        {/* Right: Activity Feed */}
        <div className="lg:col-span-2">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 mb-4">
            {([
              { key: 'timeline', label: 'Timeline', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', count: lead._count?.activities },
              { key: 'notes', label: 'Notes', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', count: lead.notes?.length },
              { key: 'tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', count: lead.tasks?.length },
              { key: 'call_logs', label: 'Call Logs', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', count: callLogs.length || undefined },
              { key: 'communications', label: 'Communications', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', count: lead.communications?.length },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
                {tab.label}
                {tab.count ? <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span> : null}
              </button>
            ))}
          </div>

          <div className="card p-5">
            {/* Timeline */}
            {activeTab === 'timeline' && (
              <div className="space-y-1">
                {lead.activities && lead.activities.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200" />
                    {lead.activities.map((activity, i) => {
                      const iconInfo = activityIcons[activity.type] || { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-gray-500 bg-gray-100' };
                      return (
                        <div key={activity.id} className="relative flex gap-4 py-3">
                          <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconInfo.color}`}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconInfo.icon} /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">{activity.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System'} · {formatTimeAgo(activity.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" message="No activities yet" />
                )}
              </div>
            )}

            {/* Notes */}
            {activeTab === 'notes' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <textarea
                      className="input w-full"
                      rows={3}
                      placeholder="Write a note... (e.g. meeting summary, follow-up plan)"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                    />
                  </div>
                  <button onClick={handleAddNote} disabled={!noteContent.trim()} className="btn-primary self-end disabled:opacity-50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  </button>
                </div>
                {lead.notes && lead.notes.length > 0 ? (
                  lead.notes.map((note) => (
                    <div key={note.id} className={`border rounded-lg p-4 ${note.isPinned ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
                            {note.user.firstName[0]}{note.user.lastName[0]}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{note.user.firstName} {note.user.lastName}</span>
                          <span className="text-xs text-gray-500">{formatTimeAgo(note.createdAt)}</span>
                        </div>
                        {note.isPinned && (
                          <span className="badge bg-amber-100 text-amber-800 gap-1">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8.736 4.065A6 6 0 0116 10a.75.75 0 01-1.5 0 4.5 4.5 0 00-5.449-4.398.75.75 0 11-.315-1.467z" /></svg>
                            Pinned
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" message="No notes yet. Add your first note above." />
                )}
              </div>
            )}

            {/* Tasks */}
            {activeTab === 'tasks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {lead.tasks && lead.tasks.length > 0 && (
                      <>
                        <span className="text-xs text-gray-500">
                          {lead.tasks.filter(t => t.status === 'COMPLETED').length}/{lead.tasks.length} completed
                        </span>
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(lead.tasks.filter(t => t.status === 'COMPLETED').length / lead.tasks.length) * 100}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => setShowTaskModal(true)} className="btn-primary text-xs gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    Add Task
                  </button>
                </div>
                {lead.tasks && lead.tasks.length > 0 ? (
                  lead.tasks.map((task) => {
                    const isOverdue = task.status !== 'COMPLETED' && new Date(task.dueAt) < new Date();
                    return (
                      <div key={task.id} className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${task.status === 'COMPLETED' ? 'bg-gray-50 border-gray-100' : isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input
                          type="checkbox"
                          checked={task.status === 'COMPLETED'}
                          onChange={() => api.completeTask(task.id).then(() => refreshLead())}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.status === 'COMPLETED' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{task.type.replace(/_/g, ' ')}</span>
                            <span className="text-gray-300">·</span>
                            <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {isOverdue ? 'Overdue · ' : ''}Due {new Date(task.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                        <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" message="No tasks yet" action="Add Task" onAction={() => setShowTaskModal(true)} />
                )}
              </div>
            )}

            {/* Call Logs Tab */}
            {activeTab === 'call_logs' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Call History</h3>
                  <button onClick={() => setShowCallLogModal(true)} className="btn-primary text-xs gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Log Call
                  </button>
                </div>
                {callLogsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                  </div>
                ) : callLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="h-10 w-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <p className="text-sm text-gray-500">No calls logged yet</p>
                    <button onClick={() => setShowCallLogModal(true)} className="text-sm text-brand-600 hover:text-brand-700 mt-1">Log your first call</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {callLogs.map((log) => {
                      const dispositionStyles: Record<string, { bg: string; text: string; border: string }> = {
                        CALLBACK: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                        MEETING_ARRANGED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                        APPOINTMENT_BOOKED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                        INTERESTED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                        NOT_INTERESTED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                        NO_ANSWER: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
                        VOICEMAIL_LEFT: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
                        WRONG_NUMBER: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
                        BUSY: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
                        GATEKEEPER: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
                        FOLLOW_UP_EMAIL: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
                        QUALIFIED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                        PROPOSAL_REQUESTED: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
                        DO_NOT_CALL: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                        OTHER: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
                      };
                      const style = dispositionStyles[log.disposition] || dispositionStyles.OTHER;
                      const dispositionLabel: Record<string, string> = {
                        CALLBACK: 'Call Back Requested', MEETING_ARRANGED: 'Meeting Arranged',
                        APPOINTMENT_BOOKED: 'Appointment Booked', INTERESTED: 'Interested',
                        NOT_INTERESTED: 'Not Interested', NO_ANSWER: 'No Answer',
                        VOICEMAIL_LEFT: 'Voicemail Left', WRONG_NUMBER: 'Wrong Number',
                        BUSY: 'Line Busy', GATEKEEPER: 'Reached Gatekeeper',
                        FOLLOW_UP_EMAIL: 'Follow-up Email', QUALIFIED: 'Lead Qualified',
                        PROPOSAL_REQUESTED: 'Proposal Requested', DO_NOT_CALL: 'Do Not Call',
                        OTHER: 'Other',
                      };
                      return (
                        <div key={log.id} className={`p-4 rounded-lg border ${style.border} ${style.bg}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <svg className={`h-5 w-5 ${style.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              <span className={`text-sm font-semibold ${style.text}`}>{dispositionLabel[log.disposition] || log.disposition}</span>
                            </div>
                            <span className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          {log.notes && <p className="text-sm text-gray-700 mt-2">{log.notes}</p>}
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                            {log.user && <span>By {log.user.firstName} {log.user.lastName}</span>}
                            {log.duration && <span>Duration: {Math.floor(log.duration / 60)}m {log.duration % 60}s</span>}
                            {log.callbackDate && <span>Callback: {new Date(log.callbackDate).toLocaleString()}</span>}
                            {log.meetingDate && <span>Meeting: {new Date(log.meetingDate).toLocaleString()}</span>}
                            {log.appointmentDate && <span>Appointment: {new Date(log.appointmentDate).toLocaleString()}</span>}
                            {log.followUpTaskId && (
                              <span className="text-brand-600 flex items-center gap-0.5">
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                Follow-up task created
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Communications Chat */}
            {activeTab === 'communications' && (
              <div className="flex flex-col h-[400px] sm:h-[500px]">
                {/* Chat Header */}
                <div className="flex items-center justify-between pb-3 border-b mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">Conversation</h3>
                    <span className="text-xs text-gray-400">({chatMessages.length} messages)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowCommModal(true)} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      Log
                    </button>
                    <Link href={`/inbox?lead=${lead.id}`} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      Open in Inbox
                    </Link>
                  </div>
                </div>

                {/* Messages Area — WhatsApp-like */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto pr-1 min-h-0 bg-[#f0f2f5] rounded-lg p-3" onClick={() => setMenuOpenMsgId(null)}>
                  {chatLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                    </div>
                  ) : chatMessages.length > 0 ? (
                    <>
                      {chatMessages.reduce((acc: { elements: React.ReactNode[]; lastDate: string }, msg, idx) => {
                        const msgDate = new Date(msg.createdAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
                        if (msgDate !== acc.lastDate) {
                          acc.elements.push(
                            <div key={`date-${idx}`} className="flex justify-center my-3">
                              <span className="bg-white/80 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm">{msgDate}</span>
                            </div>
                          );
                          acc.lastDate = msgDate;
                        }

                        const isOutbound = msg.direction === 'OUTBOUND';
                        const platform = msg.platform || msg.metadata?.platform || msg.channel;
                        const platformLabel = (platform || msg.channel).toUpperCase();
                        const isOwnMessage = isOutbound && msg.user?.id === currentUserId;
                        const isHovered = hoveredMsgId === msg.id;
                        const isMenuOpen = menuOpenMsgId === msg.id;
                        const isEditing = editingMsgId === msg.id;

                        acc.elements.push(
                          <div
                            key={msg.id}
                            className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-1 group relative`}
                            onMouseEnter={() => setHoveredMsgId(msg.id)}
                            onMouseLeave={() => { if (!isMenuOpen) setHoveredMsgId(null); }}
                          >
                            {/* Action button — appears on hover for own outbound messages */}
                            {isOwnMessage && !msg.isDeleted && !msg._optimistic && (isHovered || isMenuOpen) && !isEditing && (
                              <div className={`flex items-center mr-1 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMenuOpenMsgId(isMenuOpen ? null : msg.id); }}
                                  className="p-1 rounded-full hover:bg-gray-200/80 text-gray-400 hover:text-gray-600"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {/* Dropdown menu */}
                                {isMenuOpen && (
                                  <div className="absolute right-[85%] top-0 z-20 bg-white rounded-lg shadow-lg border py-1 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => { setEditingMsgId(msg.id); setEditingBody(msg.body); setMenuOpenMsgId(null); setTimeout(() => editInputRef.current?.focus(), 50); }}
                                      className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMessage(msg.id)}
                                      className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className={`max-w-[80%] relative ${isOutbound
                              ? 'bg-[#d9fdd3] text-gray-900 rounded-lg rounded-tr-none'
                              : 'bg-white text-gray-900 rounded-lg rounded-tl-none'
                            } px-3 py-2 shadow-sm ${msg._optimistic ? 'opacity-70' : ''}`}>
                              {/* WhatsApp tail */}
                              <div className={`absolute top-0 w-3 h-3 ${isOutbound
                                ? '-right-1.5 text-[#d9fdd3]'
                                : '-left-1.5 text-white'
                              }`}>
                                <svg viewBox="0 0 8 13" className="w-full h-full fill-current">
                                  {isOutbound
                                    ? <path d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z" />
                                    : <path d="M2.812 0H8v11.193L1.533 2.568C.474 1.156 1.042 0 2.812 0z" />
                                  }
                                </svg>
                              </div>

                              {/* Sender name for inbound */}
                              {!isOutbound && (
                                <p className="text-xs font-semibold text-teal-700 mb-0.5">
                                  {lead.firstName} {lead.lastName}
                                </p>
                              )}
                              {isOutbound && msg.user && (
                                <p className="text-xs font-semibold text-indigo-700 mb-0.5">
                                  {msg.user.firstName} {msg.user.lastName}
                                </p>
                              )}

                              {/* Deleted message */}
                              {msg.isDeleted ? (
                                <p className="text-sm italic text-gray-400 flex items-center gap-1">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                  This message was deleted
                                </p>
                              ) : isEditing ? (
                                /* Inline edit mode */
                                <div className="space-y-1.5">
                                  <textarea
                                    ref={editInputRef}
                                    value={editingBody}
                                    onChange={(e) => setEditingBody(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMessage(msg.id); }
                                      if (e.key === 'Escape') { setEditingMsgId(null); setEditingBody(''); }
                                    }}
                                    className="w-full text-sm border rounded-md px-2 py-1 resize-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 bg-white"
                                    rows={2}
                                  />
                                  <div className="flex justify-end gap-1">
                                    <button onClick={() => { setEditingMsgId(null); setEditingBody(''); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded hover:bg-gray-100">Cancel</button>
                                    <button onClick={() => handleEditMessage(msg.id)} className="text-xs text-white bg-brand-600 hover:bg-brand-700 px-2 py-0.5 rounded" disabled={!editingBody.trim()}>Save</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {msg.subject && (
                                    <p className="text-xs font-semibold text-gray-500 mb-0.5">{msg.subject}</p>
                                  )}
                                  {msg.body && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>}

                                  {/* Attachments */}
                                  {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                                    <div className="mt-2 space-y-1.5">
                                      {msg.metadata.attachments.map((att: any, ai: number) => (
                                        <a
                                          key={ai}
                                          href={`/api${att.url}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 p-2 rounded-lg transition-colors bg-black/5 hover:bg-black/10"
                                        >
                                          {att.mimeType?.startsWith('image/') ? (
                                            <img
                                              src={`/api${att.url}`}
                                              alt={att.filename}
                                              className="h-16 w-16 rounded object-cover flex-shrink-0"
                                            />
                                          ) : (
                                            <span className="text-lg flex-shrink-0">
                                              {att.mimeType === 'application/pdf' ? '📄' : att.mimeType?.startsWith('video/') ? '🎬' : att.mimeType?.startsWith('audio/') ? '🎵' : '📎'}
                                            </span>
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium truncate text-gray-800">{att.filename}</p>
                                            {att.size && <p className="text-xs text-gray-500">{att.size < 1024 ? att.size + ' B' : att.size < 1048576 ? (att.size / 1024).toFixed(1) + ' KB' : (att.size / 1048576).toFixed(1) + ' MB'}</p>}
                                          </div>
                                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Footer: time, channel, edited badge */}
                              {!isEditing && (
                                <div className="flex items-center gap-1 mt-1 justify-end">
                                  <ChatChannelBadge channel={platformLabel} isOutbound={false} />
                                  {msg.isEdited && !msg.isDeleted && (
                                    <span className="text-[10px] text-gray-400 italic">edited</span>
                                  )}
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {/* Double-tick for outbound */}
                                  {isOutbound && !msg._optimistic && (
                                    <svg className="h-3.5 w-3.5 text-blue-500" viewBox="0 0 16 15" fill="currentColor">
                                      <path d="M15.01 3.316l-.478-.372a.365.365 0 00-.51.063L8.666 9.88a.32.32 0 01-.484.032l-.358-.325a.32.32 0 00-.484.032l-.378.48a.418.418 0 00.036.54l1.32 1.267a.32.32 0 00.484-.034l6.272-8.048a.366.366 0 00-.064-.512zm-4.1 0l-.478-.372a.365.365 0 00-.51.063L4.566 9.88a.32.32 0 01-.484.032L1.892 7.77a.366.366 0 00-.516.005l-.423.433a.364.364 0 00.006.514l3.255 3.185a.32.32 0 00.484-.033l6.272-8.048a.365.365 0 00-.063-.51z" />
                                    </svg>
                                  )}
                                  {/* Single tick (sending) for optimistic */}
                                  {msg._optimistic && (
                                    <svg className="h-3 w-3 text-gray-400" viewBox="0 0 16 15" fill="currentColor">
                                      <path d="M10.91 3.316l-.478-.372a.365.365 0 00-.51.063L4.566 9.88a.32.32 0 01-.484.032L1.892 7.77a.366.366 0 00-.516.005l-.423.433a.364.364 0 00.006.514l3.255 3.185a.32.32 0 00.484-.033l6.272-8.048a.365.365 0 00-.063-.51z" />
                                    </svg>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                        return acc;
                      }, { elements: [] as React.ReactNode[], lastDate: '' }).elements}
                      <div ref={chatEndRef} />
                    </>
                  ) : (
                    <EmptyState icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" message="No messages yet. Send the first message!" />
                  )}
                </div>

                {/* Compose Area — WhatsApp-style */}
                <div className="pt-3 border-t mt-3 bg-[#f0f2f5] rounded-b-lg px-2 pb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs text-gray-500">Channel:</label>
                    <select
                      value={chatPlatform ? chatPlatform.toUpperCase() : chatChannel}
                      onChange={(e) => handleChannelSelect(e.target.value)}
                      className="text-xs border rounded-full px-2.5 py-1 text-gray-700 bg-white focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="EMAIL">Email</option>
                      <option value="SMS">SMS</option>
                      <option value="FACEBOOK">Facebook</option>
                      <option value="INSTAGRAM">Instagram</option>
                      <option value="GOOGLE">Google Business</option>
                      <option value="WEBCHAT">Website Chat</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-end">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
                      placeholder="Type a message"
                      className="flex-1 text-sm rounded-full border border-gray-300 bg-white px-4 py-2 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
                      disabled={sendingChat}
                    />
                    <button
                      onClick={handleSendChatMessage}
                      disabled={sendingChat || !chatMessage.trim()}
                      className="h-9 w-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white flex-shrink-0 transition-colors"
                    >
                      {sendingChat ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} onSubmit={handleCreateTask} />}

      {/* Log Call Modal */}
      {showCallLogModal && <LogCallModal onClose={() => setShowCallLogModal(false)} onSubmit={handleLogCall} leadName={`${lead.firstName} ${lead.lastName}`} />}

      {/* Log Communication Modal */}
      {showCommModal && <LogCommModal onClose={() => setShowCommModal(false)} onSubmit={handleLogComm} leadEmail={lead.email} />}

      {/* Email Composer Modal */}
      {showEmailComposer && lead.email && (
        <EmailComposerModal
          onClose={() => setShowEmailComposer(false)}
          onSend={handleSendEmail}
          toEmail={lead.email}
          leadName={`${lead.firstName} ${lead.lastName}`}
        />
      )}

      {/* Convert to Contact Modal */}
      {showConvertToContact && lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="text-center mb-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center mb-3">
                <svg className="h-6 w-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Convert to Contact</h2>
              <p className="text-sm text-gray-500 mt-1">Convert <strong>{lead.firstName} {lead.lastName}</strong> into a contact record.</p>
            </div>
            <div className="space-y-3 mb-5">
              <p className="text-xs text-gray-500">This will create a new contact with all existing lead information. You can optionally create a deal at the same time.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConvertToContact(false)}
                disabled={convertingToContact}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConvertToContact(false)}
                disabled={convertingToContact}
                className="btn-secondary flex-1 border-brand-200 text-brand-700 hover:bg-brand-50"
              >
                {convertingToContact ? 'Converting...' : 'Contact Only'}
              </button>
              <button
                onClick={() => handleConvertToContact(true)}
                disabled={convertingToContact}
                className="btn-primary flex-1"
              >
                {convertingToContact ? 'Converting...' : 'Contact + Deal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Lead Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="text-center mb-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Convert to Won Deal</h2>
              <p className="text-sm text-gray-500 mt-1">Mark <strong>{lead.firstName} {lead.lastName}</strong> as a won deal? This will update the status to WON.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConvertModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleConvertToWon} className="btn-primary flex-1 bg-green-600 hover:bg-green-700">Convert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function ContactRow({ icon, label, value, isLink }: { icon: string; label: string; value?: string | null; isLink?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        {value ? (
          isLink ? (
            <a href={isLink} target={isLink.startsWith('http') ? '_blank' : undefined} className="text-sm text-brand-600 hover:text-brand-700 truncate block">{value}</a>
          ) : (
            <p className="text-sm text-gray-900 truncate">{value}</p>
          )
        ) : (
          <p className="text-sm text-gray-400">Not provided</p>
        )}
      </div>
    </div>
  );
}

function ChatChannelBadge({ channel, isOutbound }: { channel: string; isOutbound: boolean }) {
  const labels: Record<string, { label: string; color: string }> = {
    WHATSAPP: { label: 'WhatsApp', color: isOutbound ? 'text-white/70' : 'text-green-600' },
    EMAIL: { label: 'Email', color: isOutbound ? 'text-white/70' : 'text-red-500' },
    SMS: { label: 'SMS', color: isOutbound ? 'text-white/70' : 'text-indigo-500' },
    PHONE: { label: 'Phone', color: isOutbound ? 'text-white/70' : 'text-cyan-500' },
    CHAT: { label: 'Chat', color: isOutbound ? 'text-white/70' : 'text-blue-500' },
    FACEBOOK: { label: 'Facebook', color: isOutbound ? 'text-white/70' : 'text-blue-600' },
    INSTAGRAM: { label: 'Instagram', color: isOutbound ? 'text-white/70' : 'text-pink-500' },
    GOOGLE: { label: 'Google', color: isOutbound ? 'text-white/70' : 'text-blue-500' },
    WEBCHAT: { label: 'Web Chat', color: isOutbound ? 'text-white/70' : 'text-purple-500' },
  };
  const info = labels[channel] || { label: channel, color: isOutbound ? 'text-white/70' : 'text-gray-500' };
  return <span className={`text-[10px] font-medium ${info.color}`}>{info.label}</span>;
}

function ChannelIcon({ channel }: { channel: string }) {
  const icons: Record<string, string> = {
    EMAIL: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    PHONE: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    WHATSAPP: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    SMS: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
    CHAT: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z',
  };
  return (
    <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[channel] || icons.CHAT} />
    </svg>
  );
}

function EmptyState({ icon, message, action, onAction }: { icon: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 gap-2">
      <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} /></svg>
      <p className="text-sm text-gray-500">{message}</p>
      {action && onAction && (
        <button onClick={onAction} className="text-sm text-brand-600 hover:text-brand-700 font-medium">{action}</button>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ─── Create Task Modal ───────────────────────────────────────────

function CreateTaskModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const defaultDate = tomorrow.toISOString().split('T')[0];
  const defaultTime = '09:00';

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'FOLLOW_UP_CALL',
    priority: 'MEDIUM',
    dueDate: defaultDate,
    dueTime: defaultTime,
    assigneeId: '',
    reminderDate: '',
    reminderTime: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [fullUsers, setFullUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [meId, setMeId] = useState('');

  useEffect(() => {
    Promise.all([api.getUsers(), api.getMe()]).then(([userList, me]) => {
      setUsers(Array.isArray(userList) ? userList : []);
      setFullUsers(Array.isArray(userList) ? userList : []);
      setCurrentUserId(me?.id || '');
      if (me?.id) {
        setMeId(me.id);
        setForm((f) => ({ ...f, assigneeId: f.assigneeId || me.id }));
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description,
        type: form.type,
        priority: form.priority,
        assigneeId: form.assigneeId,
        dueAt: new Date(`${form.dueDate}T${form.dueTime}:00`).toISOString(),
      };
      if (form.reminderDate && form.reminderTime) {
        payload.reminder = new Date(`${form.reminderDate}T${form.reminderTime}:00`).toISOString();
      }
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Create Task</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow up on proposal" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Additional details..." />
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
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Assign To *</label>
              {meId && form.assigneeId !== meId && (
                <button type="button" onClick={() => setForm({ ...form, assigneeId: meId })} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  Assign to myself
                </button>
              )}
              {meId && form.assigneeId === meId && (
                <span className="text-xs text-green-600 font-medium">Assigned to you</span>
              )}
            </div>
            <select className="input" required value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select assignee...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.id === meId ? ' (Me)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due Date & Time *</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              <input type="time" className="input" required value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Reminder</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} placeholder="Date" />
              <input type="time" className="input" value={form.reminderTime} onChange={(e) => setForm({ ...form, reminderTime: e.target.value })} placeholder="Time" />
            </div>
            <p className="text-xs text-gray-500 mt-1">Set a date and time to be reminded about this task</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Call Modal ──────────────────────────────────────────────

const DISPOSITION_OPTIONS: { value: string; label: string; group: string; icon: string }[] = [
  { value: 'CALLBACK', label: 'Call Back Requested', group: 'Follow-up', icon: '🔄' },
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
  { value: 'WRONG_NUMBER', label: 'Wrong Number', group: 'Closed', icon: '❌' },
  { value: 'DO_NOT_CALL', label: 'Do Not Call', group: 'Closed', icon: '🚫' },
  { value: 'OTHER', label: 'Other', group: 'Other', icon: '📝' },
];

function LogCallModal({ onClose, onSubmit, leadName }: { onClose: () => void; onSubmit: (data: any) => Promise<void>; leadName: string }) {
  const [form, setForm] = useState({
    disposition: '',
    notes: '',
    duration: '',
    callbackDate: '',
    meetingDate: '',
    appointmentDate: '',
    createFollowUp: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const selectedDisposition = form.disposition;
  const showCallback = selectedDisposition === 'CALLBACK' || selectedDisposition === 'BUSY' || selectedDisposition === 'NO_ANSWER' || selectedDisposition === 'VOICEMAIL_LEFT' || selectedDisposition === 'GATEKEEPER';
  const showMeeting = selectedDisposition === 'MEETING_ARRANGED';
  const showAppointment = selectedDisposition === 'APPOINTMENT_BOOKED';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.disposition) return;
    setSubmitting(true);
    try {
      const durationSeconds = form.duration ? parseInt(form.duration) * 60 : null;
      await onSubmit({
        disposition: form.disposition,
        notes: form.notes || null,
        duration: durationSeconds,
        callbackDate: form.callbackDate ? new Date(form.callbackDate).toISOString() : null,
        meetingDate: form.meetingDate ? new Date(form.meetingDate).toISOString() : null,
        appointmentDate: form.appointmentDate ? new Date(form.appointmentDate).toISOString() : null,
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Disposition Selection */}
          <div>
            <label className="label">Call Outcome *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {DISPOSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, disposition: opt.value })}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all ${
                    form.disposition === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{opt.icon}</span>
                  <span className="font-medium leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Conditional date fields */}
          {showCallback && (
            <div>
              <label className="label">Callback Date & Time</label>
              <input
                type="datetime-local"
                className="input"
                value={form.callbackDate}
                onChange={(e) => setForm({ ...form, callbackDate: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">When should we call back?</p>
            </div>
          )}

          {showMeeting && (
            <div>
              <label className="label">Meeting Date & Time *</label>
              <input
                type="datetime-local"
                className="input"
                required
                value={form.meetingDate}
                onChange={(e) => setForm({ ...form, meetingDate: e.target.value })}
              />
            </div>
          )}

          {showAppointment && (
            <div>
              <label className="label">Appointment Date & Time *</label>
              <input
                type="datetime-local"
                className="input"
                required
                value={form.appointmentDate}
                onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
              />
            </div>
          )}

          {/* Call Duration */}
          <div>
            <label className="label">Call Duration (minutes)</label>
            <input
              type="number"
              className="input"
              min="0"
              placeholder="e.g. 5"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Call Notes</label>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Key points from the conversation..."
            />
          </div>

          {/* Auto Follow-up */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
            <input
              type="checkbox"
              id="createFollowUp"
              checked={form.createFollowUp}
              onChange={(e) => setForm({ ...form, createFollowUp: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
            />
            <label htmlFor="createFollowUp" className="text-sm text-gray-700">
              Auto-create follow-up task based on call outcome
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting || !form.disposition} className="btn-primary gap-1.5">
              {submitting ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving...</>
              ) : (
                <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>Log Call</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Communication Modal ─────────────────────────────────────

// ─── Email Composer Modal ─────────────────────────────────────

function EmailComposerModal({ onClose, onSend, toEmail, leadName }: {
  onClose: () => void;
  onSend: (data: { to: string; subject: string; body: string }) => Promise<void>;
  toEmail: string;
  leadName: string;
}) {
  const [form, setForm] = useState({ to: toEmail, subject: '', body: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await onSend(form);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Compose Email</h2>
            <p className="text-sm text-gray-500 mt-0.5">Send an email to {leadName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">To</label>
            <input type="email" className="input bg-gray-50" value={form.to} readOnly />
          </div>
          <div>
            <label className="label">Subject *</label>
            <input className="input" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Follow up on our conversation" />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea className="input" rows={8} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={`Hi ${leadName.split(' ')[0]},\n\n`} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={sending} className="btn-primary gap-1.5">
              {sending ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Sending...</>
              ) : (
                <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Email</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Communication Modal ─────────────────────────────────────

function LogCommModal({ onClose, onSubmit, leadEmail }: { onClose: () => void; onSubmit: (data: any) => void; leadEmail?: string }) {
  const [form, setForm] = useState({
    channel: 'PHONE',
    direction: 'OUTBOUND',
    subject: '',
    body: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        subject: form.subject || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Log Communication</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Channel</label>
              <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {['EMAIL', 'PHONE', 'WHATSAPP', 'SMS', 'CHAT'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Direction</label>
              <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="OUTBOUND">Outbound (Sent)</option>
                <option value="INBOUND">Inbound (Received)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Optional subject line" />
          </div>
          <div>
            <label className="label">Details *</label>
            <textarea className="input" rows={4} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Summarize the communication..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving...' : 'Log Communication'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
