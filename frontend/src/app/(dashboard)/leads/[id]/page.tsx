'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useInboxMessagesQuery } from '@/features/inbox/hooks/useInboxQueries';
import {
  useLeadDetailQuery,
  usePipelineStagesAllQuery,
  useLeadAssignmentHistoryQuery,
  useLeadCallLogsQuery,
  useLeadsCustomFieldsQuery,
  useLeadsTagsQuery,
  useLeadsFieldConfigQuery,
  useLeadsUsersQuery,
  useLeadsMeQuery,
  useLeadsInvalidate,
} from '@/features/leads/hooks/useLeadsQueries';
import type { Lead, User } from '@/types';
import { ReassignmentPanel } from '../components/ReassignmentPanel';
import { LogCallModalDynamic } from '../components/log-call-modal';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useNotificationStore } from '@/store/notificationStore';
import { premiumConfirm } from '@/lib/premiumDialogs';

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CONTACTED: 'bg-blue-100 text-blue-800 border-blue-200',
  QUALIFIED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800 border-amber-200',
  NEGOTIATION: 'bg-orange-100 text-orange-800 border-orange-200',
  WON: 'bg-green-100 text-green-800 border-green-200',
  LOST: 'bg-red-100 text-red-800 border-red-200',
  DO_NOT_CALL: 'bg-red-900 text-white border-red-900',
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
  SLA_REMINDER_SENT: { icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', color: 'text-amber-600 bg-amber-100' },
  SLA_ESCALATED: { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: 'text-red-600 bg-red-100' },
  SLA_REASSIGNED: { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', color: 'text-red-700 bg-red-100' },
  SLA_BREACHED: { icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-red-600 bg-red-100' },
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const offerLifecycleLabel: Record<string, string> = {
  ELIGIBLE: 'Eligible',
  CONTACTED: 'Contacted',
  ACCEPTED: 'Accepted',
  REDEEMED: 'Redeemed',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
};

// ─── Smart Name Display (handles duplicate firstName/lastName) ────
const getLeadDisplayName = (obj: { firstName?: string; lastName?: string }) => {
  const fn = (obj.firstName || '').trim();
  const ln = (obj.lastName || '').trim();
  if (!ln || fn.toLowerCase() === ln.toLowerCase()) return fn || 'Unknown';
  if (fn.toLowerCase().endsWith(ln.toLowerCase())) return fn;
  return `${fn} ${ln}`.trim() || 'Unknown';
};
const getLeadInitials = (obj: { firstName?: string; lastName?: string }) => {
  const name = getLeadDisplayName(obj);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
};

function sortCommunicationsByDate(comms: { createdAt?: string | Date }[]) {
  return [...comms].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
}

/** After realtime lead refetches, wait this long with no further events before syncing list + dashboard. */
const REFRESH_LEAD_LIST_DEBOUNCE_MS = 20_000;

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const dispatchDataChange = useNotificationStore((s) => s.dispatchDataChange);
  const addToast = useNotificationStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { invalidateListAndDashboard } = useLeadsInvalidate();
  const leadIdStr = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const leadQuery = useLeadDetailQuery(leadIdStr || undefined);
  const lead = leadQuery.data ?? null;
  const pipelineStagesAllQuery = usePipelineStagesAllQuery();
  const orgId = lead?.organizationId ?? null;
  const tagsScopeKey = `detail-org-${orgId ?? 'none'}`;
  const tagsQuery = useLeadsTagsQuery(tagsScopeKey, orgId, { enabled: !!orgId });
  const customFieldsQuery = useLeadsCustomFieldsQuery(orgId);
  const fieldConfigQuery = useLeadsFieldConfigQuery(orgId, { enabled: !!orgId });
  const usersQuery = useLeadsUsersQuery(null);
  const meQuery = useLeadsMeQuery();
  const assignmentHistoryQuery = useLeadAssignmentHistoryQuery(lead?.id);

  const availableTags = useMemo(() => {
    const rows = tagsQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [tagsQuery.data]);

  const customFields = useMemo(
    () => (Array.isArray(customFieldsQuery.data) ? customFieldsQuery.data : []),
    [customFieldsQuery.data]
  );

  const fieldConfig = fieldConfigQuery.data?.builtInFields ? fieldConfigQuery.data : null;

  const fullUsers = useMemo(
    () => (Array.isArray(usersQuery.data) ? usersQuery.data : []),
    [usersQuery.data]
  );
  const currentUserId = meQuery.data?.id ?? '';

  const assignmentHistory = useMemo(
    () => (Array.isArray(assignmentHistoryQuery.data) ? assignmentHistoryQuery.data : []),
    [assignmentHistoryQuery.data]
  );

  const pipelineStages = useMemo(() => {
    const leadData = leadQuery.data;
    const stagesData = pipelineStagesAllQuery.data;
    if (!leadData || !stagesData) return [];
    const allStages = (stagesData as { stages?: unknown[] }).stages || (stagesData as unknown[]) || [];
    const stageOrgId = leadData?.stage?.organizationId || leadData?.organizationId;
    const matchingStages = stageOrgId
      ? (allStages as { organizationId?: string }[]).filter((s) => s.organizationId === stageOrgId)
      : [];
    if (matchingStages.length > 0) return matchingStages as { id: string; name: string; color: string }[];
    if (allStages.length > 0) {
      const firstOrgId = (allStages[0] as { organizationId?: string }).organizationId;
      return (allStages as { organizationId?: string }[]).filter((s) => s.organizationId === firstOrgId) as {
        id: string;
        name: string;
        color: string;
      }[];
    }
    return [];
  }, [leadQuery.data, pipelineStagesAllQuery.data]);

  const loading = leadQuery.isPending && !leadQuery.data;
  const [aiSummaryData, setAiSummaryData] = useState<any | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [aiSummaryCopied, setAiSummaryCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes' | 'tasks' | 'communications' | 'call_logs'>('timeline');

  const callLogsQuery = useLeadCallLogsQuery(leadIdStr || undefined, {
    enabled: activeTab === 'call_logs' && !!leadIdStr,
  });
  const callLogs = Array.isArray(callLogsQuery.data) ? callLogsQuery.data : [];
  const callLogsLoading = callLogsQuery.isLoading && activeTab === 'call_logs';

  const [noteContent, setNoteContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showCallLogModal, setShowCallLogModal] = useState(false);
  const [updatingOfferAssignmentId, setUpdatingOfferAssignmentId] = useState<string | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showConvertToContact, setShowConvertToContact] = useState(false);
  const [convertingToContact, setConvertingToContact] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customEditValues, setCustomEditValues] = useState<Record<string, unknown>>({});
  // Chat state
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

  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  // ─── Lead Navigation System ────────────────────────────────────────
  type LeadPreview = { id: string; name: string; status: string; company: string; callCount: number };
  type NavData = { leadIds: string[]; leadPreviews: LeadPreview[]; viewName: string; totalInView: number; currentPage: number; pageSize: number; timestamp: number };
  const [navData, setNavData] = useState<NavData | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());

  const inboxMessagesParams = useMemo(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    const divisionId = lead?.organizationId || activeDivisionId || undefined;
    return { limit: 100, ...(divisionId ? { divisionId } : {}) };
  }, [lead?.organizationId]);

  const chatMessagesLeadId =
    activeTab === 'communications' && lead?.id && leadIdStr ? leadIdStr : null;

  const messagesQuery = useInboxMessagesQuery(chatMessagesLeadId, inboxMessagesParams, {
    refetchInterval: chatMessagesLeadId ? 10_000 : false,
  });

  const chatMessages = useMemo(() => {
    const raw = messagesQuery.data?.messages;
    if (messagesQuery.isError && lead?.communications?.length) {
      return sortCommunicationsByDate(lead.communications);
    }
    return Array.isArray(raw) ? raw : [];
  }, [messagesQuery.data, messagesQuery.isError, lead?.communications]);

  const chatLoading = messagesQuery.isLoading && chatMessages.length === 0;
  const refetchInboxMessages = messagesQuery.refetch;

  // Read navigation data from sessionStorage (set by leads list page)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('lead-navigation');
      if (raw) {
        const data = JSON.parse(raw) as NavData;
        // Only use if less than 30 minutes old
        if (Date.now() - data.timestamp < 30 * 60 * 1000) {
          setNavData(data);
        }
      }
      // Track visited leads
      const visitedRaw = sessionStorage.getItem('lead-nav-visited');
      const visited = visitedRaw ? new Set<string>(JSON.parse(visitedRaw)) : new Set<string>();
      visited.add(id);
      setVisitedIds(visited);
      sessionStorage.setItem('lead-nav-visited', JSON.stringify(Array.from(visited)));
    } catch (_) { /* sessionStorage unavailable */ }
  }, [id]);

  useEffect(() => {
    if (lead?.unreadCommunications != null) {
      setUnreadCommsCount(lead.unreadCommunications);
    }
  }, [lead?.id, lead?.unreadCommunications]);

  const currentNavIndex = navData ? navData.leadIds.indexOf(id) : -1;
  const hasPrev = navData !== null && currentNavIndex > 0;
  const hasNext = navData !== null && currentNavIndex >= 0 && currentNavIndex < navData.leadIds.length - 1;
  const globalPosition = navData ? (navData.currentPage - 1) * navData.pageSize + currentNavIndex + 1 : 0;
  const visitedCount = navData ? navData.leadIds.filter(lid => visitedIds.has(lid)).length : 0;

  const goToPrevious = useCallback(() => {
    if (hasPrev && navData) router.push(`/leads/${navData.leadIds[currentNavIndex - 1]}`);
  }, [hasPrev, navData, currentNavIndex, router]);

  const goToNext = useCallback(() => {
    if (hasNext && navData) router.push(`/leads/${navData.leadIds[currentNavIndex + 1]}`);
  }, [hasNext, navData, currentNavIndex, router]);

  const nextLeadPreviews = navData && currentNavIndex >= 0
    ? navData.leadPreviews.slice(currentNavIndex + 1, currentNavIndex + 4)
    : [];

  // Keyboard shortcuts ref (actual handler defined after handleSaveAndNext)
  const saveAndNextRef = useRef<(() => void) | null>(null);
  /** Debounced list/dashboard invalidation after realtime `refreshLead` (bursts coalesce into one sync). */
  const realtimeListSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getFieldLabel = (key: string, defaultLabel: string): string => {
    if (!fieldConfig) return defaultLabel;
    const f = fieldConfig.builtInFields?.find((b: any) => b.key === key);
    return f?.customLabel || defaultLabel;
  };

  // Phone formatting - auto-add UAE country code if missing
  const formatPhone = (phone: string | null | undefined): string => {
    if (!phone) return '';
    const cleaned = phone.trim();
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
    return '+971' + cleaned;
  };

  const fetchLeadDetail = useCallback(async () => {
    if (!id) return;
    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.leads.detail(id as string),
      queryFn: () => api.getLead(id as string),
    });
    setUnreadCommsCount(data?.unreadCommunications || 0);
  }, [id, queryClient]);

  /** Refetch lead detail + unread; schedule list/dashboard sync after quiet period (realtime / websocket). */
  const refreshLead = useCallback(async () => {
    await fetchLeadDetail();
    if (realtimeListSyncTimerRef.current) clearTimeout(realtimeListSyncTimerRef.current);
    realtimeListSyncTimerRef.current = setTimeout(() => {
      realtimeListSyncTimerRef.current = null;
      void invalidateListAndDashboard();
    }, REFRESH_LEAD_LIST_DEBOUNCE_MS);
  }, [fetchLeadDetail, invalidateListAndDashboard]);

  /** After user-driven mutations: sync immediately and cancel any pending debounced realtime sync. */
  const refreshLeadAndSyncLists = useCallback(async () => {
    if (realtimeListSyncTimerRef.current) {
      clearTimeout(realtimeListSyncTimerRef.current);
      realtimeListSyncTimerRef.current = null;
    }
    await fetchLeadDetail();
    await invalidateListAndDashboard();
  }, [fetchLeadDetail, invalidateListAndDashboard]);

  useEffect(() => {
    return () => {
      if (realtimeListSyncTimerRef.current) clearTimeout(realtimeListSyncTimerRef.current);
    };
  }, []);

  const invalidateInboxSurfaces = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot });
    await queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] });
  }, [queryClient]);

  const handleOfferLifecycleUpdate = useCallback(async (assignmentId: string, status: string) => {
    setUpdatingOfferAssignmentId(assignmentId);
    try {
      await api.updateCampaignAssignment(assignmentId, {
        status,
        ...(status === 'CONTACTED' ? { discussedAt: new Date().toISOString() } : {}),
        ...(status === 'REDEEMED' ? { redeemedAt: new Date().toISOString() } : {}),
      });
      await refreshLeadAndSyncLists();
      addToast({ type: 'success', title: 'Offer Updated', message: `Lifecycle changed to ${offerLifecycleLabel[status] || status}.` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Offer Update Failed', message: err?.message || 'Unable to update offer lifecycle.' });
    } finally {
      setUpdatingOfferAssignmentId(null);
    }
  }, [addToast, refreshLeadAndSyncLists]);

  const loadLeadAISummary = useCallback(async (force = false) => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const response = await api.generateLeadAISummary(id, force);
      const payload = response?.data || null;
      setAiSummaryData(payload);
      if (payload?.summary) {
        queryClient.setQueryData(queryKeys.leads.detail(id), (prev: Lead | undefined) =>
          prev ? { ...prev, aiSummary: payload.summary } : prev
        );
      }
    } catch (err: any) {
      setAiSummaryError(err?.message || 'Failed to generate AI summary');
    } finally {
      setAiSummaryLoading(false);
    }
  }, [id, queryClient]);

  useEffect(() => {
    loadLeadAISummary(false).catch(() => {});
  }, [loadLeadAISummary]);

  const handleStageClick = async (stage: { id: string; name: string; color: string; isWonStage?: boolean; isLostStage?: boolean }) => {
    if (!lead) return;
    if (stage.id === lead.stageId) return;
    try {
      await api.moveLead(lead.id, stage.id, 0);
      await refreshLeadAndSyncLists();
      addToast({ type: 'success', title: 'Stage Updated', message: `Lead moved to ${stage.name}` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Stage Update Failed', message: err.message });
    }
  };

  const handleAddNote = async () => {
    if (!lead || !noteContent.trim()) return;
    await api.addLeadNote(lead.id, noteContent);
    setNoteContent('');
    await Promise.all([refreshLeadAndSyncLists(), loadLeadAISummary(true)]);
  };

  const handleDelete = async () => {
    if (!lead) return;
    const confirmed = await premiumConfirm({
      title: 'Delete this lead?',
      message: 'This lead will move to Recycle Bin and can be restored within 60 days.',
      confirmText: 'Move to Recycle Bin',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    await api.deleteLead(lead.id);
    router.push('/leads');
  };

  const startEditing = () => {
    if (!lead) return;
    setEditForm({
      name: getLeadDisplayName(lead),
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

  const handleSaveEdit = async (): Promise<boolean> => {
    if (!lead) return false;
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

      // Smart-split unified Name field into firstName/lastName
      if (data.name && typeof data.name === 'string') {
        const nameParts = data.name.trim().split(/\s+/);
        if (nameParts.length <= 1) {
          data.firstName = nameParts[0] || lead.firstName;
          data.lastName = '';
        } else {
          data.lastName = nameParts.pop() || '';
          data.firstName = nameParts.join(' ');
        }
        delete data.name;
      }

      await api.updateLead(lead.id, data);
      setIsEditing(false);
      await refreshLeadAndSyncLists();
      addToast({ type: 'success', title: 'Lead Saved', message: 'Lead details updated successfully' });
      return true;
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Failed', message: err.message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save & Next: save edits then jump to next lead in the queue
  const handleSaveAndNext = async () => {
    const success = await handleSaveEdit();
    if (success && hasNext && navData) {
      router.push(`/leads/${navData.leadIds[currentNavIndex + 1]}`);
    }
  };

  // Keep ref in sync for keyboard handler
  saveAndNextRef.current = handleSaveAndNext;

  // ─── Keyboard Shortcuts (Alt+← Alt+→ Alt+S) ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger in input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (isEditing && saveAndNextRef.current) saveAndNextRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goToPrevious, goToNext, isEditing]);

  const handleCreateTask = async (taskData: any) => {
    try {
      await api.createTask({ ...taskData, leadId: lead!.id });
      setShowTaskModal(false);
      await Promise.all([refreshLeadAndSyncLists(), loadLeadAISummary(true)]);
      addToast({ type: 'success', title: 'Task Created', message: 'New task has been created' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Task Creation Failed', message: err.message });
    }
  };

  const handleLogComm = async (commData: any) => {
    try {
      await api.logCommunication({ ...commData, leadId: lead!.id });
      setShowCommModal(false);
      await Promise.all([refreshLeadAndSyncLists(), loadLeadAISummary(true)]);
      addToast({ type: 'success', title: 'Communication Logged', message: 'Communication has been recorded' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Log Communication Failed', message: err.message });
    }
  };

  const handleLogCall = async (callData: any) => {
    try {
      await api.logCall({ ...callData, leadId: lead!.id });
      setShowCallLogModal(false);
      await Promise.all([
        refreshLeadAndSyncLists(),
        queryClient.invalidateQueries({ queryKey: queryKeys.leads.callLogs(lead!.id) }),
        loadLeadAISummary(true),
      ]);
      addToast({ type: 'success', title: 'Call Logged', message: 'Call log has been recorded' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Log Call Failed', message: err.message });
    }
  };

  const handleSendEmail = async (emailData: { to: string; subject: string; body: string }) => {
    try {
      await api.sendEmail({ leadId: lead!.id, ...emailData });
      setShowEmailComposer(false);
      await Promise.all([refreshLeadAndSyncLists(), loadLeadAISummary(true)]);
      addToast({ type: 'success', title: 'Email Sent', message: 'Email has been sent successfully' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Send Email Failed', message: err.message });
    }
  };

  const handleConvertToWon = async () => {
    if (!lead) return;
    try {
      await api.updateLead(lead.id, { status: 'WON' });
      setShowConvertModal(false);
      await refreshLeadAndSyncLists();
      addToast({ type: 'success', title: 'Lead Converted', message: 'Lead has been marked as Won' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Conversion Failed', message: err.message });
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
        dealName: lead.company ? `${lead.company} - Deal` : `${getLeadDisplayName(lead)} - Deal`,
        dealAmount: lead.budget ? Number(lead.budget) : undefined,
      });
      setShowConvertToContact(false);
      addToast({ type: 'success', title: 'Converted to Contact', message: 'Lead has been converted to a contact' });
      router.push(`/contacts/${contact.id}`);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Conversion Failed', message: err.message || 'Failed to convert lead to contact' });
    } finally {
      setConvertingToContact(false);
    }
  };

  const handleAddExistingTag = useCallback(async (tagId: string) => {
    if (!lead?.id) return;
    setTagBusy(true);
    try {
      await api.addLeadTags(lead.id, { tagIds: [tagId] });
      await refreshLeadAndSyncLists();
      setTagInput('');
      setTagPickerOpen(false);
      addToast({ type: 'success', title: 'Tag Added', message: 'Tag has been added to this lead.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to Add Tag', message: err?.message || 'Unable to add tag.' });
    } finally {
      setTagBusy(false);
    }
  }, [addToast, lead?.id, refreshLeadAndSyncLists]);

  const handleCreateAndAddTag = useCallback(async () => {
    const name = tagInput.trim();
    if (!lead?.id || !lead.organizationId || !name) return;
    setTagBusy(true);
    try {
      let createdTag: any = null;
      try {
        createdTag = await api.createTag({ name, organizationId: lead.organizationId });
      } catch (createErr: any) {
        const msg = String(createErr?.message || '').toLowerCase();
        if (!msg.includes('already exists')) throw createErr;
      }

      if (createdTag?.id) {
        await api.addLeadTags(lead.id, { tagIds: [createdTag.id] });
      } else {
        // Fallback path for duplicate tag names: backend will upsert by name.
        await api.addLeadTags(lead.id, { tagNames: [name] });
      }

      await Promise.all([
        refreshLeadAndSyncLists(),
        queryClient.invalidateQueries({ queryKey: queryKeys.leads.tags(tagsScopeKey) }),
      ]);
      setTagInput('');
      setTagPickerOpen(false);
      addToast({ type: 'success', title: 'Tag Added', message: `"${name}" has been added.` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to Add Tag', message: err?.message || 'Unable to create/add tag.' });
    } finally {
      setTagBusy(false);
    }
  }, [addToast, lead?.id, lead?.organizationId, refreshLeadAndSyncLists, tagInput, queryClient, tagsScopeKey]);

  const handleRemoveTag = useCallback(async (tagId: string) => {
    if (!lead?.id || !tagId) return;
    setTagBusy(true);
    try {
      await api.removeLeadTag(lead.id, tagId);
      await refreshLeadAndSyncLists();
      addToast({ type: 'success', title: 'Tag Removed', message: 'Tag has been removed from this lead.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to Remove Tag', message: err?.message || 'Unable to remove tag.' });
    } finally {
      setTagBusy(false);
    }
  }, [addToast, lead?.id, refreshLeadAndSyncLists]);

  useEffect(() => {
    if (activeTab === 'communications' && lead?.id) {
      api.markConversationRead(lead.id).then(() => {
        setUnreadCommsCount(0);
        dispatchDataChange({ entity: 'communication', action: 'updated', entityId: lead.id });
      }).catch((err) => console.error('Failed to mark conversation read:', err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lead?.id]);

  // Real-time sync: refresh lead data when lead or note changes
  useRealtimeSync(['lead', 'note'], useCallback((event) => {
    // For lead events, only refresh if it's this lead (or no entityId specified)
    if (event.entity === 'lead' && event.entityId && event.entityId !== id) return;
    refreshLead();
    loadLeadAISummary(true).catch(() => {});
  }, [id, refreshLead, loadLeadAISummary]));

  // Real-time sync: refresh chat messages when communications change (background, no loading overlay)
  useRealtimeSync(['communication'], useCallback((event) => {
    if (event.entityId && event.entityId !== id) return;
    refetchInboxMessages();
    loadLeadAISummary(true).catch(() => {});
  }, [id, refetchInboxMessages, loadLeadAISummary]));

  // Real-time sync: refresh lead when tasks change (tasks are embedded in lead response)
  useRealtimeSync(['task'], useCallback(() => {
    refreshLead();
    loadLeadAISummary(true).catch(() => {});
  }, [refreshLead, loadLeadAISummary]));

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
    const msgKey = queryKeys.inbox.messages(lead.id, inboxMessagesParams);
    queryClient.setQueryData(msgKey, (old: { messages?: any[] } | undefined) => ({
      ...(old || {}),
      messages: [...(old?.messages || []), optimisticMsg],
    }));
    setChatMessage('');
    setSendingChat(true);

    try {
      const sent = await api.sendInboxMessage({
        leadId: lead.id,
        channel: chatChannel,
        body,
        platform: chatPlatform || undefined,
      });
      queryClient.setQueryData(msgKey, (old: { messages?: any[] } | undefined) => ({
        ...(old || {}),
        messages: (old?.messages || []).map((m) =>
          m.id === tempId ? { ...sent, platform: platform.toUpperCase() } : m
        ),
      }));
      void invalidateInboxSurfaces();
    } catch (err: any) {
      queryClient.setQueryData(msgKey, (old: { messages?: any[] } | undefined) => ({
        ...(old || {}),
        messages: (old?.messages || []).filter((m) => m.id !== tempId),
      }));
      addToast({ type: 'error', title: 'Message Failed', message: err.message });
    } finally {
      setSendingChat(false);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingBody.trim()) return;
    const msgKey = queryKeys.inbox.messages(lead!.id, inboxMessagesParams);
    try {
      const updated = await api.editInboxMessage(messageId, editingBody.trim());
      queryClient.setQueryData(msgKey, (old: { messages?: any[] } | undefined) => ({
        ...(old || {}),
        messages: (old?.messages || []).map((m) =>
          m.id === messageId ? { ...m, body: updated.body, isEdited: true } : m
        ),
      }));
      setEditingMsgId(null);
      setEditingBody('');
      void invalidateInboxSurfaces();
      addToast({ type: 'success', title: 'Message Edited', message: 'Message has been updated' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Edit Failed', message: err.message });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await premiumConfirm({
      title: 'Delete this message?',
      message: 'This message will remain in timeline as "message was deleted".',
      confirmText: 'Delete message',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    const msgKey = queryKeys.inbox.messages(lead!.id, inboxMessagesParams);
    try {
      await api.deleteInboxMessage(messageId);
      queryClient.setQueryData(msgKey, (old: { messages?: any[] } | undefined) => ({
        ...(old || {}),
        messages: (old?.messages || []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, body: '' } : m
        ),
      }));
      setMenuOpenMsgId(null);
      void invalidateInboxSurfaces();
      addToast({ type: 'success', title: 'Message Deleted', message: 'Message has been deleted' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete Failed', message: err.message });
    }
  };

  // Built-in fields that are rendered in dedicated sections elsewhere on the page.
  const FIELDS_SHOWN_ELSEWHERE = new Set([
    'firstName', 'lastName',
    'status',
    'assignedTo',
    'email', 'phone', 'location', 'website',
    'score', 'conversionProb',
    'createdAt', 'updatedAt',
  ]);

  const BUILT_IN_FIELD_RENDERER: Record<string, (lead: any) => string> = {
    name: (l) => getLeadDisplayName(l) || '-',
    email: (l) => l.email || '-',
    phone: (l) => formatPhone(l.phone) || '-',
    company: (l) => l.company || '-',
    jobTitle: (l) => l.jobTitle || '-',
    source: (l) => l.source ? `${l.source.replace(/_/g, ' ')}${l.sourceDetail ? ` (${l.sourceDetail})` : ''}` : '-',
    status: (l) => l.status ? l.status.replace(/_/g, ' ') : '-',
    score: (l) => l.score !== undefined && l.score !== null ? String(l.score) : '-',
    budget: (l) => l.budget ? `AED ${Number(l.budget).toLocaleString()}` : '-',
    productInterest: (l) => l.productInterest || '-',
    campaign: (l) => l.campaign || '-',
    location: (l) => l.location || '-',
    website: (l) => l.website || '-',
    conversionProb: (l) => l.conversionProb != null ? `${Math.round(l.conversionProb * 100)}%` : '-',
    stage: (l) => l.stage?.name || '-',
    stageId: (l) => l.stage?.name || '-',
    tags: (l) => Array.isArray(l.tags) && l.tags.length > 0 ? l.tags.map((t: any) => t.tag?.name || t.name || String(t)).join(', ') : '-',
    assignedTo: (l) => l.assignedTo ? getLeadDisplayName(l.assignedTo) : '-',
    createdAt: (l) => l.createdAt ? new Date(l.createdAt).toLocaleString() : '-',
    updatedAt: (l) => l.updatedAt ? new Date(l.updatedAt).toLocaleString() : '-',
  };

  function renderCustomFieldValue(cf: any, lead: any): string {
    const cd = (lead.customData || {}) as Record<string, unknown>;
    const val = cd[cf.name];
    if (val === undefined || val === null || val === '') return '-';
    switch (cf.type) {
      case 'BOOLEAN': return val ? 'Yes' : 'No';
      case 'MULTI_SELECT': return Array.isArray(val) ? val.join(', ') : String(val);
      case 'DATE': return new Date(String(val)).toLocaleDateString();
      case 'CURRENCY': return `AED ${Number(val).toLocaleString()}`;
      case 'URL': return String(val);
      default: return String(val);
    }
  }

  const DETAIL_CATEGORIES = [
    { key: 'contact',  label: 'Contact' },
    { key: 'lead',     label: 'Lead Info' },
    { key: 'business', label: 'Business' },
    { key: 'system',   label: 'System' },
  ];

  const handleCopyAISummary = useCallback(async () => {
    const text = aiSummaryData?.summary || lead?.aiSummary;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setAiSummaryCopied(true);
      setTimeout(() => setAiSummaryCopied(false), 1500);
      addToast({ type: 'success', title: 'Copied', message: 'AI summary copied to clipboard' });
    } catch {
      addToast({ type: 'error', title: 'Copy Failed', message: 'Unable to copy summary' });
    }
  }, [aiSummaryData?.summary, lead?.aiSummary, addToast]);


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
  const aiSignals = aiSummaryData?.signals || null;
  const displayScore = Number(aiSignals?.score ?? lead.score ?? 0);
  const displayConversionProb = typeof aiSignals?.conversionProb === 'number'
    ? aiSignals.conversionProb
    : lead.conversionProb;

  return (
    <div className="flex flex-col -m-3 sm:-m-4 md:-m-6 overflow-hidden" style={{ height: 'calc(100dvh - 3.5rem)' }}>
      {/* ═══ FROZEN TOP BAR — Compact one-line nav + identification ═══ */}
      <div className="flex-shrink-0 z-10 px-3 sm:px-4 md:px-6 py-2 border-b border-gray-200 bg-white" style={{ boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}>
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back + Lead identity */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button onClick={() => router.back()} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[10px] font-semibold text-white">
              {getLeadInitials(lead)}
            </div>
            <h1 className="text-sm font-bold text-gray-900 truncate">{getLeadDisplayName(lead)}</h1>
            <span className="hidden sm:inline text-xs text-gray-400 truncate">{lead.company || ''}</span>
            <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${lead.doNotCall ? statusColors.DO_NOT_CALL : statusColors[lead.status]}`}>
              {lead.doNotCall ? '🚫 DNC' : lead.status.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Center: Navigation arrows + position (if navigating from list) */}
          {navData && navData.leadIds.length > 1 && currentNavIndex >= 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevious}
                disabled={!hasPrev}
                className={`p-1 rounded transition-colors ${hasPrev ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-200 cursor-not-allowed'}`}
                title="Previous lead (Alt+←)"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                <span className="font-bold text-brand-600">{currentNavIndex + 1}</span>
                <span className="text-gray-400">/{navData.leadIds.length}</span>
                {navData.viewName && <span className="hidden md:inline text-gray-400"> · {navData.viewName}</span>}
              </span>
              <button
                onClick={goToNext}
                disabled={!hasNext}
                className={`p-1 rounded transition-colors ${hasNext ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-200 cursor-not-allowed'}`}
                title="Next lead (Alt+→)"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              {/* Progress dots */}
              <div className="hidden lg:flex items-center gap-1 ml-1">
                <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${visitedCount >= navData.leadIds.length ? 'bg-green-500' : 'bg-brand-500'}`}
                    style={{ width: `${Math.min(100, (visitedCount / navData.leadIds.length) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400">{visitedCount}/{navData.leadIds.length}</span>
              </div>
            </div>
          )}

          {/* Right: Quick actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isEditing && (
              <button onClick={startEditing} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors" title="Edit lead">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
            )}
            <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete lead">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
            {hasNext && !isEditing && navData && navData.leadIds.length > 1 && (
              <button
                onClick={goToNext}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-95 transition-all"
              >
                Next
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* ← end frozen top bar */}

      {/* ═══ SCROLLABLE CONTENT ZONE — everything else scrolls ═══ */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 py-4 space-y-4">

      {/* DNC compact stripe */}
      {lead.doNotCall && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-red-700">🚫 DO NOT CALL</span>
            <span className="text-[11px] text-red-500">
              {lead.doNotCallAt ? `Blocked ${new Date(lead.doNotCallAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Blocked'}
              {(lead as any).doNotCallByUser ? ` by ${(lead as any).doNotCallByUser.firstName}` : ''}
            </span>
          </div>
          {fullUsers.find(u => u.id === currentUserId && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(u.role)) && (
            <button
              onClick={async () => {
                const confirmed = await premiumConfirm({
                  title: 'Unblock this lead?',
                  message: 'The lead will appear again in active lead views.',
                  confirmText: 'Unblock',
                  cancelText: 'Cancel',
                  variant: 'default',
                });
                if (!confirmed) return;
                try {
                  await api.unblockLead(lead.id);
                  await refreshLeadAndSyncLists();
                  addToast({ type: 'success', title: 'Lead Unblocked', message: 'Lead has been unblocked' });
                } catch (err: any) {
                  addToast({ type: 'error', title: 'Unblock Failed', message: err.message || 'Failed to unblock lead' });
                }
              }}
              className="text-[11px] font-semibold text-red-600 hover:text-red-800 px-2 py-0.5 rounded hover:bg-red-100 transition-colors"
            >
              Unblock
            </button>
          )}
        </div>
      )}

      {/* Stage Progress Bar */}
      {mainStages.length > 0 ? (
        <div className="px-1 py-1">
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
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
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
                    <label className="text-xs text-gray-500">Name</label>
                    <input className="input text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Ahmed Al-Zaabi" />
                  </div>
                  <div>

                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('email', 'Email')}</label>
                  <input type="email" className="input text-sm" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('phone', 'Phone')}</label>
                  <input className="input text-sm" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('location', 'Location')}</label>
                  <input className="input text-sm" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('website', 'Website')}</label>
                  <input className="input text-sm" value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
                </div>
              </div>
            ) : (
              <>
                <ContactRow icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" label={getFieldLabel('email', 'Email')} value={lead.email} isLink={lead.email ? `mailto:${lead.email}` : undefined} />
                <ContactRow icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" label={getFieldLabel('phone', 'Phone')} value={formatPhone(lead.phone)} isLink={lead.phone ? `tel:${formatPhone(lead.phone)}` : undefined} />
                <ContactRow icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" label={getFieldLabel('location', 'Location')} value={lead.location} />
                <ContactRow icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" label={getFieldLabel('website', 'Website')} value={lead.website} isLink={lead.website || undefined} />
              </>
            )}
            <hr className="my-3 border-gray-100" />
            <h3 className="font-semibold text-gray-900 flex items-center gap-1.5 -mt-1">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Lead Details
            </h3>
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('company', 'Company')}</label>
                  <input className="input text-sm" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('jobTitle', 'Job Title')}</label>
                  <input className="input text-sm" value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('productInterest', 'Product Interest')}</label>
                  <input className="input text-sm" value={editForm.productInterest} onChange={(e) => setEditForm({ ...editForm, productInterest: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('budget', 'Budget')}</label>
                  <input type="number" className="input text-sm" value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{getFieldLabel('campaign', 'Campaign')}</label>
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
                    {cf.type === 'CURRENCY' && (
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
                        {(cf.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
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
                        {(cf.options || []).filter((o: string) => !((customEditValues[cf.name] as string[]) || []).includes(o)).map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {cf.type === 'TEXTAREA' && (
                      <textarea className="input text-sm" rows={3} required={cf.isRequired}
                        value={String(customEditValues[cf.name] || '')} onChange={(e) => setCustomEditValues({ ...customEditValues, [cf.name]: e.target.value })} />
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveEdit} disabled={saving} className="btn-primary text-xs flex-1">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {hasNext && (
                    <button
                      onClick={handleSaveAndNext}
                      disabled={saving}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold flex-1 px-3 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                    >
                      {saving ? (
                        <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Saving...</>
                      ) : (
                        <>Save & Next <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                      )}
                    </button>
                  )}
                  <button onClick={() => setIsEditing(false)} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              fieldConfig ? (
                <>
                  {DETAIL_CATEGORIES.map(cat => {
                    const fields = fieldConfig.builtInFields
                      .filter((f: any) => f.category === cat.key && f.showInDetail && !FIELDS_SHOWN_ELSEWHERE.has(f.key))
                      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
                    if (fields.length === 0) return null;
                    return (
                      <div key={cat.key}>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-0.5">{cat.label}</p>
                        {fields.map((field: any) => (
                          <InfoRow
                            key={field.key}
                            label={field.customLabel || field.label}
                            value={(BUILT_IN_FIELD_RENDERER[field.key] || (() => '-'))(lead)}
                          />
                        ))}
                      </div>
                    );
                  })}
                  {/* Dynamic custom fields */}
                  {(() => {
                    const visibleCF = fieldConfig.customFields
                      .filter((cf: any) => cf.showInDetail !== false)
                      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
                    if (visibleCF.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-0.5">Custom Fields</p>
                        {visibleCF.map((cf: any) => (
                          <InfoRow
                            key={cf.id || cf.name}
                            label={cf.label}
                            value={renderCustomFieldValue(cf, lead)}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* Fallback: original hardcoded fields when field config API is unavailable */
                <>
                  <InfoRow label={getFieldLabel('source', 'Source')} value={lead.source ? `${lead.source.replace(/_/g, ' ')}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}` : '-'} />
                  <InfoRow label={getFieldLabel('campaign', 'Campaign')} value={lead.campaign || '-'} />
                  <InfoRow label={getFieldLabel('productInterest', 'Product Interest')} value={lead.productInterest || '-'} />
                  <InfoRow label={getFieldLabel('budget', 'Budget')} value={lead.budget ? `AED ${Number(lead.budget).toLocaleString()}` : '-'} />
                  <InfoRow label="Stage" value={lead.stage?.name || '-'} />
                  {/* Custom fields (fallback) */}
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
              )
            )}
          </div>

          {/* Offer Campaigns */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Offer Campaigns</h3>
              <span className="text-xs text-gray-500">
                {(lead.campaignAssignments || []).length} attached
              </span>
            </div>
            {(lead.campaignAssignments || []).length === 0 ? (
              <p className="text-sm text-gray-500">No active offers are attached to this lead yet.</p>
            ) : (
              <div className="space-y-2.5">
                {(lead.campaignAssignments || []).map((assignment) => {
                  const status = assignment.status || 'ELIGIBLE';
                  return (
                    <div key={assignment.id} className="rounded-lg border border-gray-200 p-3 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{assignment.campaign?.name || 'Campaign'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
                            {assignment.expiresAt ? ` · Expires ${new Date(assignment.expiresAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
                          {offerLifecycleLabel[status] || status}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-auto sm:min-w-[170px]">
                          <select
                            className="w-full appearance-none rounded-md border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-xs leading-5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-60"
                            value={status}
                            disabled={updatingOfferAssignmentId === assignment.id}
                            onChange={(e) => handleOfferLifecycleUpdate(assignment.id, e.target.value)}
                          >
                            <option value="ELIGIBLE">Eligible</option>
                            <option value="CONTACTED">Contacted</option>
                            <option value="ACCEPTED">Accepted</option>
                            <option value="REDEEMED">Redeemed</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="REJECTED">Rejected</option>
                          </select>
                          <svg
                            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                        {assignment.notes && (
                          <span className="text-xs text-gray-500 truncate max-w-full">
                            Note: {assignment.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Lead Summary */}
          <div className="card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                AI Lead Summary
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => loadLeadAISummary(true)}
                  disabled={aiSummaryLoading}
                  className="px-2 py-1 rounded-md border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {aiSummaryLoading ? 'Refreshing...' : 'Regenerate'}
                </button>
                <button
                  onClick={handleCopyAISummary}
                  disabled={!aiSummaryData?.summary && !lead.aiSummary}
                  className="px-2 py-1 rounded-md border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {aiSummaryCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Lead Score</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: displayScore >= 70 ? '#16a34a' : displayScore >= 40 ? '#d97706' : '#dc2626' }}>
                {displayScore}<span className="text-sm font-normal text-gray-400">/100</span>
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${displayScore}%`,
                background: displayScore >= 70 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : displayScore >= 40 ? 'linear-gradient(90deg, #fbbf24, #d97706)' : 'linear-gradient(90deg, #f87171, #dc2626)',
              }} />
            </div>

            {displayConversionProb != null && (
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-gray-600">Conversion Probability</span>
                <span className="font-bold" style={{ color: displayConversionProb >= 0.6 ? '#16a34a' : displayConversionProb >= 0.3 ? '#d97706' : '#dc2626' }}>
                  {Math.round(displayConversionProb * 100)}%
                </span>
              </div>
            )}

            {aiSummaryLoading && !aiSummaryData ? (
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-4/6 rounded bg-gray-100 animate-pulse" />
              </div>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {aiSummaryData?.summary || lead.aiSummary || 'Generate AI summary to get lead insights and recommended actions.'}
                  </p>
                </div>

                {aiSummaryData?.highlights?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {aiSummaryData.highlights.slice(0, 6).map((item: string, idx: number) => (
                      <span key={`ai-highlight-${idx}`} className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[11px] font-medium">
                        {item}
                      </span>
                    ))}
                  </div>
                )}

                {(aiSummaryData?.risks?.length > 0 || aiSummaryData?.opportunities?.length > 0) && (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {aiSummaryData?.risks?.length > 0 && (
                      <div className="rounded-lg border border-red-100 bg-red-50/40 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1">Risks</p>
                        <ul className="space-y-1">
                          {aiSummaryData.risks.slice(0, 2).map((risk: string, idx: number) => (
                            <li key={`ai-risk-${idx}`} className="text-xs text-red-800">{risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiSummaryData?.opportunities?.length > 0 && (
                      <div className="rounded-lg border border-green-100 bg-green-50/40 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700 mb-1">Opportunities</p>
                        <ul className="space-y-1">
                          {aiSummaryData.opportunities.slice(0, 2).map((opp: string, idx: number) => (
                            <li key={`ai-opp-${idx}`} className="text-xs text-green-800">{opp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {aiSummaryData?.recommendedActions?.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Next Best Actions</p>
                    <div className="space-y-1.5">
                      {aiSummaryData.recommendedActions.slice(0, 2).map((action: any, idx: number) => (
                        <div key={`ai-action-${idx}`} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800">{action.title}</p>
                            <p className="text-[11px] text-gray-500">{action.reason}</p>
                          </div>
                          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${priorityColors[action.priority] || 'bg-gray-100 text-gray-700'}`}>
                            {action.priority || 'MEDIUM'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {(aiSummaryData?.confidence || aiSummaryData?.generatedAt || aiSummaryError) && (
              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                <span className={`${aiSummaryError ? 'text-red-600' : 'text-gray-500'}`}>
                  {aiSummaryError
                    ? aiSummaryError
                    : `Confidence ${Math.round(aiSummaryData?.confidence || 0)}%`}
                </span>
                {aiSummaryData?.generatedAt && (
                  <span className="text-gray-400">
                    Updated {new Date(aiSummaryData.generatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions compact toolbar */}
          <div className="card px-3 py-2">
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={() => { setActiveTab('tasks'); setShowTaskModal(true); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Add Task">
                <svg className="h-3.5 w-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Task
              </button>
              <button onClick={() => { setShowCallLogModal(true); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors" title="Log Call">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Call
              </button>
              <button onClick={() => { setActiveTab('communications'); setShowCommModal(true); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Log Comm">
                <svg className="h-3.5 w-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                Comm
              </button>
              <button onClick={() => { setActiveTab('notes'); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Add Note">
                <svg className="h-3.5 w-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Note
              </button>
              {lead.email && (
                <button onClick={() => setShowEmailComposer(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Send Email">
                  <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Email
                </button>
              )}
              <div className="flex-1" />
              {lead.status !== 'WON' && lead.status !== 'LOST' && (
                <button onClick={() => setShowConvertModal(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors" title="Convert to Won">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  Won
                </button>
              )}
              <button onClick={() => setShowConvertToContact(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors" title="Convert to Contact">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Contact
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
              Tags
            </h3>

            <div className="flex flex-wrap gap-2 mb-3">
              {(lead.tags || []).length > 0 ? (
                (lead.tags || []).map((t: any) => (
                  <span
                    key={t?.tag?.id || t?.id}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: `${t?.tag?.color || '#6366f1'}20`,
                      color: t?.tag?.color || '#6366f1',
                      border: `1px solid ${(t?.tag?.color || '#6366f1')}40`,
                    }}
                  >
                    {t?.tag?.name || t?.name || 'Tag'}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t?.tag?.id || t?.id)}
                      disabled={tagBusy}
                      className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
                      title="Remove tag"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">No tags assigned yet.</span>
              )}
            </div>

            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setTagPickerOpen(true);
                  }}
                  onFocus={() => setTagPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const normalized = tagInput.trim().toLowerCase();
                      const existing = availableTags.find((tag) => tag.name.toLowerCase() === normalized);
                      if (existing) {
                        handleAddExistingTag(existing.id);
                      } else if (normalized) {
                        handleCreateAndAddTag();
                      }
                    }
                    if (e.key === 'Escape') setTagPickerOpen(false);
                  }}
                  placeholder="Add tag: search existing or type new name"
                  className="input text-sm"
                  disabled={tagBusy}
                />
                <button
                  type="button"
                  onClick={handleCreateAndAddTag}
                  disabled={tagBusy || !tagInput.trim()}
                  className="btn btn-secondary text-sm whitespace-nowrap disabled:opacity-50"
                >
                  {tagBusy ? 'Saving…' : 'Add Tag'}
                </button>
              </div>

              {tagPickerOpen && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {availableTags
                    .filter((tag) => !(lead.tags || []).some((t: any) => (t?.tag?.id || t?.id) === tag.id))
                    .filter((tag) => !tagInput.trim() || tag.name.toLowerCase().includes(tagInput.trim().toLowerCase()))
                    .slice(0, 12)
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddExistingTag(tag.id);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        disabled={tagBusy}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || '#6366f1' }} />
                          <span>{tag.name}</span>
                        </span>
                        <span className="text-xs text-gray-400">Add</span>
                      </button>
                    ))}
                  {availableTags
                    .filter((tag) => !(lead.tags || []).some((t: any) => (t?.tag?.id || t?.id) === tag.id))
                    .filter((tag) => !tagInput.trim() || tag.name.toLowerCase().includes(tagInput.trim().toLowerCase()))
                    .length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {tagInput.trim() ? 'No matching tags. Click "Add Tag" to create this tag.' : 'No more tags available.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Assignment Panel */}
          <ReassignmentPanel
            lead={lead}
            users={fullUsers as User[]}
            currentUserId={currentUserId}
            onReassign={async (leadId: string, assignedToId: string, reason?: string) => {
              await api.reassignLead(leadId, assignedToId, reason);
              await refreshLeadAndSyncLists();
            }}
            assignmentHistory={assignmentHistory}
          />

          {/* Meta Info */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Timestamps
            </h3>
            <InfoRow label="Created" value={lead.createdAt ? `${new Date(lead.createdAt).toLocaleString()} (${formatTimeAgo(lead.createdAt)})` : '-'} />
            <InfoRow label="Updated" value={lead.updatedAt ? `${new Date(lead.updatedAt).toLocaleString()} (${formatTimeAgo(lead.updatedAt)})` : '-'} />
            {(lead as any).firstRespondedAt && (
              <InfoRow label="First Response" value={`${new Date((lead as any).firstRespondedAt).toLocaleString()} (${formatTimeAgo((lead as any).firstRespondedAt)})`} />
            )}
          </div>

          {/* SLA Status */}
          {(lead as any).slaInfo?.enabled && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                SLA Status
              </h3>
              <SLADetailCard slaInfo={(lead as any).slaInfo} />
            </div>
          )}
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
              { key: 'communications', label: 'Communications', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', count: unreadCommsCount || undefined },
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
                          onChange={() => api.completeTask(task.id).then(() => refreshLeadAndSyncLists())}
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
                        CALL_LATER: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                        CALL_AGAIN: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                        WILL_CALL_US_AGAIN: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
                        MEETING_ARRANGED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                        APPOINTMENT_BOOKED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                        INTERESTED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                        NOT_INTERESTED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                        ALREADY_COMPLETED_SERVICES: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
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
                        CALLBACK: 'Call Back Requested', CALL_LATER: 'Call Later (Scheduled)',
                        CALL_AGAIN: 'Call Again (Anytime)', WILL_CALL_US_AGAIN: 'Will Call Us Again',
                        MEETING_ARRANGED: 'Meeting Arranged',
                        APPOINTMENT_BOOKED: 'Appointment Booked', INTERESTED: 'Interested',
                        NOT_INTERESTED: 'Not Interested', ALREADY_COMPLETED_SERVICES: 'Already Completed Services', NO_ANSWER: 'No Answer',
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
                              <span className={`text-sm font-semibold ${style.text}`}>
                                {String((log.metadata as any)?.dispositionLabel || dispositionLabel[log.disposition] || log.disposition)}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          {log.notes && <p className="text-sm text-gray-700 mt-2">{log.notes}</p>}
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                            {log.user && <span>By {log.user.firstName} {log.user.lastName}</span>}
                            {log.duration && <span>Duration: {Math.floor(log.duration / 60)}m {log.duration % 60}s</span>}
                            {log.callbackDate && <span>Callback: {new Date(log.callbackDate).toLocaleString()}</span>}
                            {log.metadata?.expectedCallbackWindowLabel && (
                              <span>Expected callback: {String(log.metadata.expectedCallbackWindowLabel)}</span>
                            )}
                            {log.metadata?.notInterestedReasonLabel && (
                              <span>Reason: {String(log.metadata.notInterestedReasonLabel)}</span>
                            )}
                            {log.metadata?.notInterestedOtherText && (
                              <span>Detail: {String(log.metadata.notInterestedOtherText)}</span>
                            )}
                            {log.metadata?.completedServiceLocationLabel && (
                              <span>Completed: {String(log.metadata.completedServiceLocationLabel)}</span>
                            )}
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

                {/* Messages Area — WhatsApp-like (full loading only when no messages yet; refresh in place for real-time feel) */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto pr-1 min-h-0 bg-[#f0f2f5] rounded-lg p-3" onClick={() => setMenuOpenMsgId(null)}>
                  {chatLoading && chatMessages.length === 0 ? (
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
                                  {getLeadDisplayName(lead)}
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
                                  {/* Media attachments */}
                                  {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                                    <div className="space-y-1.5">
                                      {msg.metadata.attachments.map((att: any, ai: number) => {
                                        const url = att.url ? `/api${att.url}` : null;
                                        if (!url) return null;

                                        if (att.mimeType?.startsWith('image/')) {
                                          return (
                                            <a key={ai} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                              <img src={url} alt={att.filename || 'Image'} className="max-w-[280px] max-h-[300px] rounded-lg object-contain cursor-pointer" loading="lazy" />
                                            </a>
                                          );
                                        }
                                        if (att.mimeType?.startsWith('audio/')) {
                                          return (
                                            <div key={ai} className="flex items-center gap-2 min-w-[200px] max-w-[300px]">
                                              <audio controls preload="none" className="w-full h-8"><source src={url} type={att.mimeType} /></audio>
                                            </div>
                                          );
                                        }
                                        if (att.mimeType?.startsWith('video/')) {
                                          return (
                                            <div key={ai} className="max-w-[300px]">
                                              <video controls preload="metadata" className="rounded-lg max-w-full max-h-[240px]"><source src={url} type={att.mimeType} /></video>
                                            </div>
                                          );
                                        }
                                        return (
                                          <a key={ai} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg transition-colors bg-black/5 hover:bg-black/10">
                                            <span className="text-lg flex-shrink-0">{att.mimeType === 'application/pdf' ? '📄' : '📎'}</span>
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-medium truncate text-gray-800">{att.filename}</p>
                                              {att.size && <p className="text-xs text-gray-500">{att.size < 1024 ? att.size + ' B' : att.size < 1048576 ? (att.size / 1024).toFixed(1) + ' KB' : (att.size / 1048576).toFixed(1) + ' MB'}</p>}
                                            </div>
                                            <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Text body — hide placeholder labels when media is present */}
                                  {msg.body && !(msg.metadata?.attachments?.length > 0 && /^\[(Photo|Video|Voice message|Document|Sticker|Audio)\]$/.test(msg.body.trim())) && msg.body !== '(no text)' && (
                                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.metadata?.attachments?.length > 0 ? 'mt-1' : ''}`}>{msg.body}</p>
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
      </div>
      {/* ← end scrollable content zone */}

      {/* ═══ FROZEN BOTTOM — Compact single-line preview strip ═══ */}
      {navData && nextLeadPreviews.length > 0 && currentNavIndex >= 0 && (
        <div className="flex-shrink-0 z-10 px-3 sm:px-4 md:px-6 py-1.5 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2 text-xs overflow-x-auto">
            <span className="text-gray-400 font-medium flex-shrink-0">Next →</span>
            {nextLeadPreviews.map((preview, i) => (
              <button
                key={preview.id}
                onClick={() => router.push(`/leads/${preview.id}`)}
                className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all group"
              >
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                  {preview.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
                </div>
                <span className="font-medium text-gray-700 group-hover:text-brand-600 truncate max-w-[120px]">{preview.name}</span>
                <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                  preview.status === 'NEW' ? 'bg-indigo-50 text-indigo-600' :
                  preview.status === 'CONTACTED' ? 'bg-blue-50 text-blue-600' :
                  preview.status === 'QUALIFIED' ? 'bg-cyan-50 text-cyan-600' :
                  preview.status === 'WON' ? 'bg-green-50 text-green-600' :
                  preview.status === 'LOST' ? 'bg-red-50 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>{preview.status.replace(/_/g, ' ')}</span>
                <span className={`text-[10px] ${preview.callCount === 0 ? 'text-gray-400' : preview.callCount <= 2 ? 'text-blue-500' : preview.callCount <= 5 ? 'text-amber-500' : 'text-red-500'}`}>📞{preview.callCount}</span>
                {i < nextLeadPreviews.length - 1 && <span className="text-gray-300 ml-1">│</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTaskModal && (
        <CreateTaskModal
          onClose={() => setShowTaskModal(false)}
          onSubmit={handleCreateTask}
          divisionId={lead.organizationId}
        />
      )}

      {/* Log Call Modal */}
      {showCallLogModal && <LogCallModalDynamic onClose={() => setShowCallLogModal(false)} onSubmit={handleLogCall} leadName={getLeadDisplayName(lead)} leadId={lead.id} />}

      {/* Log Communication Modal */}
      {showCommModal && <LogCommModal onClose={() => setShowCommModal(false)} onSubmit={handleLogComm} leadEmail={lead.email} />}

      {/* Email Composer Modal */}
      {showEmailComposer && lead.email && (
        <EmailComposerModal
          onClose={() => setShowEmailComposer(false)}
          onSend={handleSendEmail}
          toEmail={lead.email}
          leadName={getLeadDisplayName(lead)}
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
              <p className="text-sm text-gray-500 mt-1">Convert <strong>{lead.firstName}{lead.lastName ? ` ${lead.lastName}` : ""}</strong> into a contact record.</p>
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
              <p className="text-sm text-gray-500 mt-1">Mark <strong>{lead.firstName}{lead.lastName ? ` ${lead.lastName}` : ""}</strong> as a won deal? This will update the status to WON.</p>
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

function SLADetailCard({ slaInfo }: { slaInfo: any }) {
  if (!slaInfo || !slaInfo.enabled) return null;

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; desc: string }> = {
    ON_TIME: { label: 'On Time', color: 'text-green-700', bg: 'bg-green-50 ring-green-200', desc: 'Lead is within SLA response window' },
    AT_RISK: { label: 'At Risk', color: 'text-amber-700', bg: 'bg-amber-50 ring-amber-200', desc: 'Approaching SLA breach threshold' },
    BREACHED: { label: 'SLA Breached', color: 'text-red-700', bg: 'bg-red-50 ring-red-300', desc: 'Response time has exceeded SLA threshold' },
    ESCALATED: { label: 'Escalated', color: 'text-red-800', bg: 'bg-red-100 ring-red-400', desc: 'Lead has been escalated due to SLA breach' },
    RESPONDED: { label: 'Responded', color: 'text-green-700', bg: 'bg-green-50 ring-green-200', desc: 'Lead has been attended to' },
  };

  const cfg = statusConfig[slaInfo.status] || statusConfig.ON_TIME;

  return (
    <div className="space-y-3">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${cfg.bg} ${cfg.color}`}>
          {(slaInfo.status === 'BREACHED' || slaInfo.status === 'ESCALATED' || slaInfo.status === 'AT_RISK') && (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${slaInfo.status === 'AT_RISK' ? 'bg-amber-500' : 'bg-red-500'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${slaInfo.status === 'AT_RISK' ? 'bg-amber-500' : 'bg-red-600'}`} />
            </span>
          )}
          {slaInfo.status === 'ON_TIME' && <span className="h-2 w-2 rounded-full bg-green-500" />}
          {slaInfo.status === 'RESPONDED' && <span className="h-2 w-2 rounded-full bg-green-500" />}
          {cfg.label}
        </span>
        {slaInfo.escalationLevel > 0 && (
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full ring-1 ring-red-200">
            Level {slaInfo.escalationLevel}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500">{cfg.desc}</p>

      {/* Progress Bar (for non-responded) */}
      {slaInfo.status !== 'RESPONDED' && slaInfo.percentUsed !== undefined && (
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>{formatDuration(slaInfo.elapsedMinutes || 0)} elapsed</span>
            <span>{slaInfo.timeRemainingMinutes > 0 ? `${formatDuration(slaInfo.timeRemainingMinutes)} remaining` : 'Overdue'}</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{
              width: `${Math.min(slaInfo.percentUsed, 100)}%`,
              backgroundColor: slaInfo.percentUsed >= 100 ? '#dc2626' : slaInfo.percentUsed >= 75 ? '#f59e0b' : '#22c55e',
            }} />
          </div>
        </div>
      )}

      {/* Response Time (for responded leads) */}
      {slaInfo.status === 'RESPONDED' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Response time:</span>
          <span className={`text-sm font-semibold ${slaInfo.withinSLA ? 'text-green-700' : 'text-amber-700'}`}>
            {formatDuration(slaInfo.respondedInMinutes || 0)}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${slaInfo.withinSLA ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
            {slaInfo.withinSLA ? 'Within SLA' : 'SLA Exceeded'}
          </span>
        </div>
      )}

      {/* Thresholds */}
      {slaInfo.thresholds && (
        <div className="border-t border-gray-100 pt-2 mt-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">SLA Thresholds</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-gray-500">Warning:</span>
            <span className="text-gray-700 font-medium">{formatDuration(slaInfo.thresholds.warningMinutes)}</span>
            <span className="text-gray-500">Breach:</span>
            <span className="text-gray-700 font-medium">{formatDuration(slaInfo.thresholds.breachMinutes)}</span>
            <span className="text-gray-500">Escalation:</span>
            <span className="text-gray-700 font-medium">{formatDuration(slaInfo.thresholds.escalationMinutes)}</span>
            <span className="text-gray-500">Reassign:</span>
            <span className="text-gray-700 font-medium">{formatDuration(slaInfo.thresholds.reassignMinutes)}</span>
          </div>
        </div>
      )}

      {/* Breach/Escalation timestamps */}
      {slaInfo.slaBreachedAt && (
        <div className="text-xs text-red-600">
          Breached at: {new Date(slaInfo.slaBreachedAt).toLocaleString()}
        </div>
      )}
      {slaInfo.lastEscalatedAt && (
        <div className="text-xs text-red-600">
          Last escalated: {new Date(slaInfo.lastEscalatedAt).toLocaleString()}
        </div>
      )}
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

function CreateTaskModal({
  onClose,
  onSubmit,
  divisionId,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  divisionId?: string;
}) {
  const addToast = useNotificationStore((s) => s.addToast);
  const TYPE_LABELS: Record<string, string> = {
    FOLLOW_UP_CALL: 'Follow-up Call',
    MEETING: 'Meeting',
    EMAIL: 'Email',
    WHATSAPP: 'WhatsApp',
    DEMO: 'Demo',
    PROPOSAL: 'Proposal',
    OTHER: 'Other',
  };

  const toLocalInputValue = (date: Date) => {
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
  };

  const combineDateAndTimeToISO = (date?: string, time?: string) => {
    if (!date || !time) return null;
    const dt = new Date(`${date}T${time}`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-AE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'FOLLOW_UP_CALL',
    priority: 'MEDIUM',
    dueAt: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    assigneeId: '',
    reminderDate: '',
    reminderTime: '',
    isRecurring: false,
    recurRule: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [meId, setMeId] = useState('');

  useEffect(() => {
    Promise.all([api.getUsers(divisionId), api.getMe()]).then(([userList, me]) => {
      setUsers(Array.isArray(userList) ? userList : []);
      if (me?.id) {
        setMeId(me.id);
        setForm((f) => ({ ...f, assigneeId: f.assigneeId || me.id }));
      }
    }).catch(() => {});
  }, [divisionId]);

  const dueAtDate = form.dueAt ? new Date(form.dueAt) : null;
  const dueAtValid = !!dueAtDate && !Number.isNaN(dueAtDate.getTime());
  const reminderIso = combineDateAndTimeToISO(form.reminderDate, form.reminderTime);
  const selectedAssignee = users.find((u) => u.id === form.assigneeId);

  const setDuePreset = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60_000);
    setForm((prev) => ({ ...prev, dueAt: toLocalInputValue(d) }));
  };

  const setReminderBeforeDue = (minutesBeforeDue: number) => {
    if (!dueAtValid || !dueAtDate) {
      addToast({ type: 'info', title: 'Set due date first', message: 'Choose due date/time before applying reminder presets.' });
      return;
    }
    const r = new Date(dueAtDate.getTime() - minutesBeforeDue * 60_000);
    const local = toLocalInputValue(r);
    setForm((prev) => ({ ...prev, reminderDate: local.split('T')[0] || '', reminderTime: local.split('T')[1] || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!form.title.trim() || form.title.trim().length < 3) {
        addToast({ type: 'error', title: 'Invalid title', message: 'Please enter at least 3 characters.' });
        return;
      }
      if (!form.assigneeId) {
        addToast({ type: 'error', title: 'Assignee required', message: 'Select a division member to assign this task.' });
        return;
      }
      if (!dueAtValid || !dueAtDate) {
        addToast({ type: 'error', title: 'Invalid due date', message: 'Please set a valid due date and time.' });
        return;
      }
      if (dueAtDate < new Date()) {
        addToast({ type: 'error', title: 'Invalid due date', message: 'Due date cannot be in the past.' });
        return;
      }
      if ((form.reminderDate || form.reminderTime) && !reminderIso) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Please provide both reminder date and time.' });
        return;
      }
      if (reminderIso && new Date(reminderIso) > dueAtDate) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Reminder cannot be after due date.' });
        return;
      }
      if (form.isRecurring && !form.recurRule) {
        addToast({ type: 'error', title: 'Recurrence missing', message: 'Choose recurrence pattern or disable recurring.' });
        return;
      }

      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        priority: form.priority,
        assigneeId: form.assigneeId,
        dueAt: dueAtDate.toISOString(),
        divisionId,
        isRecurring: form.isRecurring,
        recurRule: form.isRecurring ? form.recurRule : null,
      };
      if (reminderIso) {
        payload.reminder = reminderIso;
      }
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Create Smart Task</h2>
            <p className="text-xs text-gray-500 mt-0.5">Feature-rich task composer for this lead.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {divisionId && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Division-scoped assignment is enabled. Only users from this lead&apos;s division are shown.
            </div>
          )}

          <div>
            <label className="label">Quick Start</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50" onClick={() => setForm((p) => ({ ...p, type: 'FOLLOW_UP_CALL', priority: 'MEDIUM', title: p.title || 'Follow-up call' }))}>Follow-up</button>
              <button type="button" className="px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50" onClick={() => setForm((p) => ({ ...p, type: 'MEETING', priority: 'HIGH', title: p.title || 'Client meeting' }))}>Meeting</button>
              <button type="button" className="px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50" onClick={() => setForm((p) => ({ ...p, type: 'PROPOSAL', priority: 'HIGH', title: p.title || 'Send proposal' }))}>Proposal</button>
              <button type="button" className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50" onClick={() => setForm((p) => ({ ...p, priority: 'URGENT', title: p.title || 'Urgent follow-up' }))}>Urgent</button>
            </div>
          </div>

          <div>
            <label className="label">Title *</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow up on proposal" />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-gray-500">Action-oriented titles improve clarity and execution.</p>
              <p className="text-[11px] text-gray-500">{form.title.length}/120</p>
            </div>
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
                  <option key={t} value={t}>{TYPE_LABELS[t] || t.replace(/_/g, ' ')}</option>
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
            {divisionId && (
              <p className="text-[11px] text-gray-500 mb-1.5">Only members in this lead&apos;s division are shown.</p>
            )}
            <select className="input" required value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select assignee...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.id === meId ? ' (Me)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due Date & Time *</label>
            <input type="datetime-local" className="input" required value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setDuePreset(60)}>In 1 hour</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setDuePreset(180)}>In 3 hours</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setDuePreset(24 * 60)}>Tomorrow</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setDuePreset(2 * 24 * 60)}>In 2 days</button>
            </div>
          </div>
          <div>
            <label className="label">Reminder</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} placeholder="Date" />
              <input type="time" className="input" value={form.reminderTime} onChange={(e) => setForm({ ...form, reminderTime: e.target.value })} placeholder="Time" />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setReminderBeforeDue(15)}>15 min before</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setReminderBeforeDue(60)}>1 hour before</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setReminderBeforeDue(24 * 60)}>1 day before</button>
              <button type="button" className="px-2 py-1 rounded-md border text-xs hover:bg-gray-50" onClick={() => setForm((p) => ({ ...p, reminderDate: '', reminderTime: '' }))}>Clear</button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={form.isRecurring}
                onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked, recurRule: e.target.checked ? p.recurRule || 'weekly' : '' }))}
              />
              Recurring task
            </label>
            {form.isRecurring && (
              <select className="input" value={form.recurRule} onChange={(e) => setForm((p) => ({ ...p, recurRule: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-medium text-gray-800">Live summary</p>
            <p>Type: {TYPE_LABELS[form.type] || form.type.replace(/_/g, ' ')} • Priority: {form.priority}</p>
            <p>Due: {dueAtValid && dueAtDate ? formatDateTime(dueAtDate.toISOString()) : 'Not set'}</p>
            <p>Reminder: {reminderIso ? formatDateTime(reminderIso) : 'No reminder'}</p>
            <p>Assignee: {selectedAssignee ? `${selectedAssignee.firstName} ${selectedAssignee.lastName}` : 'Not selected'}</p>
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

const DISPOSITION_OPTIONS: { value: string; label: string; group: string; icon: string; description?: string }[] = [
  { value: 'CALL_LATER', label: 'Call Later (Scheduled)', group: 'Follow-up', icon: '🕐', description: 'Client requested a specific date & time' },
  { value: 'CALL_AGAIN', label: 'Call Again (Anytime)', group: 'Follow-up', icon: '🔄', description: 'Follow up anytime — no specific schedule' },
  { value: 'WILL_CALL_US_AGAIN', label: 'Will Call Us Again', group: 'Follow-up', icon: '🤝', description: 'Client said they will call us back; keep soft engagement' },
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
  { value: 'ALREADY_COMPLETED_SERVICES', label: 'Already Completed Services', group: 'Closed', icon: '🏁', description: 'Service already completed; track where it was done' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number', group: 'Closed', icon: '❌' },
  { value: 'DO_NOT_CALL', label: 'Do Not Call', group: 'Closed', icon: '🚫' },
  { value: 'OTHER', label: 'Other', group: 'Other', icon: '📝' },
];

const FALLBACK_DISPOSITION_FIELDS: Record<string, any[]> = {
  CALL_LATER: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: true, validation: { futureOnly: true } }],
  CALL_AGAIN: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  CALLBACK: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  NO_ANSWER: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  VOICEMAIL_LEFT: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  BUSY: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  GATEKEEPER: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }],
  MEETING_ARRANGED: [{ key: 'meetingDate', label: 'Meeting Date & Time', type: 'datetime', required: true }],
  APPOINTMENT_BOOKED: [{ key: 'appointmentDate', label: 'Appointment Date & Time', type: 'datetime', required: true }],
};

function fallbackDispositions() {
  return DISPOSITION_OPTIONS.map((opt, idx) => ({
    value: opt.value,
    label: opt.label,
    group: opt.group,
    icon: opt.icon,
    description: opt.description || '',
    requireNotes: opt.value === 'OTHER',
    fields: FALLBACK_DISPOSITION_FIELDS[opt.value] || [],
    sortOrder: (idx + 1) * 10,
  }));
}

function isFieldVisible(field: any, values: Record<string, any>) {
  if (!field?.showWhen?.fieldKey) return true;
  return values[field.showWhen.fieldKey] === field.showWhen.equals;
}

function isMissing(value: any) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function LogCallModal({ onClose, onSubmit, leadName, leadId }: { onClose: () => void; onSubmit: (data: any) => Promise<void>; leadName: string; leadId: string }) {
  const [form, setForm] = useState({
    disposition: '',
    notes: '',
    duration: '',
    dynamicFieldValues: {} as Record<string, any>,
    createFollowUp: true,
  });
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getDispositions({ leadId })
      .then((rows) => {
        const normalized = Array.isArray(rows) ? rows.map((row: any) => ({
          value: row.value,
          label: row.label,
          group: row.group || 'Other',
          icon: row.icon || '📝',
          description: row.description || '',
          requireNotes: row.requireNotes === true,
          fields: Array.isArray(row.fields) ? row.fields : [],
          sortOrder: Number(row.sortOrder || 0),
        })) : [];
        setCatalog(normalized.length > 0 ? normalized : fallbackDispositions());
      })
      .catch(() => setCatalog(fallbackDispositions()));
  }, [leadId]);

  const selectedDisposition = form.disposition;
  const selectedDefinition = catalog.find((item) => item.value === selectedDisposition);
  const notesRequired = selectedDefinition ? selectedDefinition.requireNotes : selectedDisposition === 'OTHER';
  const notesEmpty = !form.notes || !form.notes.trim();
  const visibleFields = (selectedDefinition?.fields || []).filter((field: any) => isFieldVisible(field, form.dynamicFieldValues));
  const requiredFieldErrors = visibleFields
    .filter((field: any) => field.required)
    .filter((field: any) => isMissing(form.dynamicFieldValues[field.key]));
  const datetimeFutureError = visibleFields.find((field: any) => {
    if (field.type !== 'datetime' || field?.validation?.futureOnly !== true) return false;
    const raw = form.dynamicFieldValues[field.key];
    if (!raw) return false;
    const parsed = new Date(String(raw));
    return Number.isNaN(parsed.getTime()) || parsed <= new Date();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.disposition) return;
    if (notesRequired && notesEmpty) return;
    if (requiredFieldErrors.length > 0 || datetimeFutureError) return;
    setSubmitting(true);
    try {
      const durationSeconds = form.duration ? parseInt(form.duration) * 60 : null;
      const values = form.dynamicFieldValues || {};
      const toIsoOrNull = (raw: any) => (raw ? new Date(String(raw)).toISOString() : null);
      await onSubmit({
        disposition: form.disposition,
        notes: form.notes || null,
        duration: durationSeconds,
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                  <span className="text-base">{opt.icon}</span>
                  <div>
                    <span className="font-medium leading-tight">{opt.label}</span>
                    {opt.description && <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{opt.description}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedDefinition && visibleFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
              <p className="text-xs font-medium text-brand-700">Disposition Fields</p>
              {visibleFields.map((field: any) => {
                const value = form.dynamicFieldValues[field.key] ?? '';
                const missing = field.required && isMissing(value);
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="label mb-0">{field.label}{field.required ? ' *' : ''}</label>
                    {field.type === 'select' ? (
                      <select
                        className={`input ${missing ? 'border-red-400 ring-1 ring-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
                        value={String(value || '')}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          dynamicFieldValues: { ...prev.dynamicFieldValues, [field.key]: e.target.value },
                        }))}
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((option: any) => (
                          <option key={option.value} value={option.value}>{option.label || option.value}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                        className={`input ${missing ? 'border-red-400 ring-1 ring-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
                        value={String(value || '')}
                        placeholder={field.placeholder || ''}
                        min={field.type === 'datetime' && field?.validation?.futureOnly ? new Date().toISOString().slice(0, 16) : undefined}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          dynamicFieldValues: { ...prev.dynamicFieldValues, [field.key]: e.target.value },
                        }))}
                      />
                    )}
                    {missing && <p className="text-xs text-red-500">{field.label} is required.</p>}
                  </div>
                );
              })}
              {datetimeFutureError && (
                <p className="text-xs text-red-500">{datetimeFutureError.label} must be in the future.</p>
              )}
            </div>
          )}

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

          <div>
            <label className="label">
              Call Notes {notesRequired && <span className="text-red-500 font-semibold">*</span>}
            </label>
            <textarea
              className={`input ${notesRequired && notesEmpty ? 'border-red-400 ring-1 ring-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={notesRequired ? 'Required — describe the call outcome in detail...' : 'Key points from the conversation...'}
              required={notesRequired}
            />
            {notesRequired && notesEmpty && (
              <p className="text-xs text-red-500 mt-1">Notes are mandatory for this call outcome.</p>
            )}
          </div>

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
            <button
              type="submit"
              disabled={submitting || !form.disposition || (notesRequired && notesEmpty) || requiredFieldErrors.length > 0 || !!datetimeFutureError}
              className="btn-primary gap-1.5"
            >
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
