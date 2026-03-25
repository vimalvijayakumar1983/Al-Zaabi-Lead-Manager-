'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLeadsFieldConfigQuery } from '@/features/leads/hooks/useLeadsQueries';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  useInboxAttachmentsQuery,
  useInboxBootstrapQuery,
  useInboxConversationsQuery,
  useInboxMessageMutations,
  useInboxMessagesQuery,
  useInboxNotesQuery,
  useInboxRealtimeInvalidation,
  useInboxStatsQuery,
} from '@/features/inbox/hooks/useInboxQueries';
import { useAuthStore } from '@/store/authStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useNotificationStore } from '@/store/notificationStore';
import { premiumConfirm } from '@/lib/premiumDialogs';
import {
  MessageCircle, Send, Search, Phone, Mail, ArrowLeft,
  User, Building2, Star, Clock, ChevronDown, Smile, X, ExternalLink,
  MessageSquare, Globe, RefreshCw, StickyNote, Zap, Check, CheckCheck,
  Archive, Tag, Filter, MoreHorizontal, Bookmark, Pin,
  ChevronRight, AlertCircle, UserPlus, Hash, AtSign, Briefcase, Paperclip,
  Calendar, DollarSign, MapPin, Link2, Copy, CornerUpLeft, FileText, Image, Download,
  Pencil, Trash2, Ban, ArrowUpDown, Mic, Square,
} from 'lucide-react';

// ─── Platform Icons (SVG) ───────────────────────────────────────────

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const s = size;
  switch (platform?.toUpperCase()) {
    case 'WHATSAPP':
      return (
        <svg viewBox="0 0 24 24" width={s} height={s} fill="#25D366">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      );
    case 'FACEBOOK':
      return (
        <svg viewBox="0 0 24 24" width={s} height={s} fill="#1877F2">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    case 'INSTAGRAM':
      return (
        <svg viewBox="0 0 24 24" width={s} height={s} fill="#E4405F">
          <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/>
        </svg>
      );
    case 'GOOGLE':
      return (
        <svg viewBox="0 0 24 24" width={s} height={s} fill="#4285F4">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      );
    case 'EMAIL':
      return <Mail size={s} className="text-red-500" />;
    case 'SMS':
      return <MessageSquare size={s} className="text-indigo-500" />;
    case 'PHONE':
      return <Phone size={s} className="text-cyan-500" />;
    case 'WEBCHAT':
      return <Globe size={s} className="text-violet-500" />;
    default:
      return <MessageCircle size={s} className="text-blue-500" />;
  }
}

const PLATFORM_COLORS: Record<string, string> = {
  WHATSAPP: '#25D366', FACEBOOK: '#1877F2', INSTAGRAM: '#E4405F',
  GOOGLE: '#4285F4', EMAIL: '#EA4335', SMS: '#6366f1',
  PHONE: '#06b6d4', WEBCHAT: '#8b5cf6', CHAT: '#3b82f6',
};

const PLATFORM_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp', FACEBOOK: 'Facebook Messenger', INSTAGRAM: 'Instagram DM',
  GOOGLE: 'Google Business', EMAIL: 'Email', SMS: 'SMS',
  PHONE: 'Phone', WEBCHAT: 'Website Chat', CHAT: 'Live Chat', ALL: 'All Channels',
};

const CHANNEL_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'INSTAGRAM', label: 'Instagram' },
  { key: 'GOOGLE', label: 'Google' },
  { key: 'WEBCHAT', label: 'Website' },
  { key: 'SMS', label: 'SMS' },
  { key: 'PHONE', label: 'Phone' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  NEW: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  CONTACTED: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  QUALIFIED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PROPOSAL_SENT: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  NEGOTIATION: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  WON: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  LOST: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

// ─── Types ──────────────────────────────────────────────────────────

interface Conversation {
  leadId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company: string;
  leadStatus: string;
  leadScore: number;
  source: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  messageCount: number;
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string;
    direction: string;
    channel: string;
    platform: string;
    platformInfo: { label: string; color: string; icon: string };
    createdAt: string;
    metadata?: any;
  } | null;
}

interface Message {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string;
  metadata: any;
  createdAt: string;
  platform: string;
  platformInfo: { label: string; color: string; icon: string };
  user: { id: string; firstName: string; lastName: string } | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  _optimistic?: boolean;
}

interface LeadInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  score: number;
  source: string;
  jobTitle: string;
  budget: number;
  createdAt: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  stage: { id: string; name: string; color: string } | null;
}

interface CannedResponse {
  id: string;
  title: string;
  body: string;
  category: string;
}

// ─── Phone formatting - auto-add UAE country code if missing ────
function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  return '+971' + cleaned;
}

// ─── Name Display Helpers ────────────────────────────────────────────

function getDisplayName(first?: string | null, last?: string | null): string {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f && l && f.toLowerCase() === l.toLowerCase()) return f;
  if (f && l && f.toLowerCase().includes(l.toLowerCase())) return f;
  if (f && l && l.toLowerCase().includes(f.toLowerCase())) return l;
  return [f, l].filter(Boolean).join(' ') || 'Unknown';
}

function getDisplayInitials(first?: string | null, last?: string | null): string {
  const name = getDisplayName(first, last);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

// ─── Main Component ─────────────────────────────────────────────────

function InboxLoadingSkeleton() {
  return (
    <div className="flex h-[calc(100vh-7.5rem)] sm:h-[calc(100vh-5rem)] -m-3 sm:-m-4 md:-m-6 bg-white overflow-hidden border border-border rounded-xl animate-pulse">
      <div className="hidden md:flex flex-col w-80 lg:w-[340px] border-r border-border p-3 gap-3">
        <div className="h-8 bg-surface-tertiary rounded-lg w-2/3" />
        <div className="h-9 bg-surface-tertiary rounded-lg" />
        <div className="space-y-2 mt-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="h-11 w-11 rounded-full bg-surface-tertiary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-tertiary rounded w-3/4" />
                <div className="h-2 bg-surface-tertiary rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4">
        <div className="h-10 bg-surface-tertiary rounded-lg w-1/2" />
        <div className="flex-1 rounded-xl bg-surface-tertiary/60 min-h-[200px]" />
        <div className="h-12 bg-surface-tertiary rounded-xl" />
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxLoadingSkeleton />}>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sendChannel, setSendChannel] = useState('WHATSAPP');
  const [showChannelPicker, setShowChannelPicker] = useState(false);

  const [sending, setSending] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Right panel tabs: info | notes | canned | attachments
  const [rightTab, setRightTab] = useState<'info' | 'notes' | 'canned' | 'attachments'>('info');

  const [showRightPanel, setShowRightPanel] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showConvoActions, setShowConvoActions] = useState<string | null>(null);
  const [pinnedConvos, setPinnedConvos] = useState<Set<string>>(new Set());
  const [inboxSortBy, setInboxSortBy] = useState<'latest' | 'oldest' | 'unread' | 'name'>('latest');

  // Attachments (pending uploads — server attachments come from TanStack Query)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);

  // Edit/delete state
  const [menuOpenMsgId, setMenuOpenMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeout = useRef<any>(null);

  // ─── Debounce search ──────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  const conversationQueryParams = useMemo(() => {
    const params: Record<string, unknown> = {};
    if (channelFilter !== 'ALL') params.channel = channelFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    if (activeDivisionId) params.divisionId = activeDivisionId;
    return params;
  }, [channelFilter, debouncedSearch, statusFilter]);

  const messageQueryParams = useMemo(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    return activeDivisionId ? { divisionId: activeDivisionId } : {};
  }, []);

  const divisionScope = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null),
    []
  );

  const fieldConfigQuery = useLeadsFieldConfigQuery(divisionScope);
  const statusLabels = (fieldConfigQuery.data?.statusLabels || {}) as Record<string, string>;
  const getStatusLabel = (status: string): string => statusLabels[status] || status.replace(/_/g, ' ');

  const conversationsQuery = useInboxConversationsQuery(conversationQueryParams as any);
  const messagesQuery = useInboxMessagesQuery(selectedLeadId, messageQueryParams as any);
  const notesQuery = useInboxNotesQuery(selectedLeadId);
  const attachmentsQuery = useInboxAttachmentsQuery(selectedLeadId);
  const statsQuery = useInboxStatsQuery(divisionScope);
  const { cannedResponses: cannedQuery, pipelineStages: pipelineQuery } = useInboxBootstrapQuery();
  const inboxMutations = useInboxMessageMutations(selectedLeadId);
  const { onCommunicationChanged, onLeadChanged } = useInboxRealtimeInvalidation(selectedLeadId);

  const conversations = (conversationsQuery.data?.conversations || []) as Conversation[];
  const messages = (messagesQuery.data?.messages || []) as Message[];
  const leadInfo = (messagesQuery.data?.lead || null) as LeadInfo | null;
  const notes = (notesQuery.data || []) as any[];
  const stats = statsQuery.data ?? null;
  const cannedResponses = (cannedQuery.data || []) as CannedResponse[];
  const rawPipeline = pipelineQuery.data as any;
  const pipelineStages = (rawPipeline?.stages ?? (Array.isArray(rawPipeline) ? rawPipeline : [])) as {
    id: string;
    name: string;
    color: string;
  }[];
  const leadAttachments = (attachmentsQuery.data || []) as any[];

  const loadingConversations = conversationsQuery.isLoading;
  const loadingMessages = !!selectedLeadId && messagesQuery.isLoading;

  // Default send channel from the latest loaded server message (skip optimistic rows)
  useEffect(() => {
    const list = messagesQuery.data?.messages as Message[] | undefined;
    if (!list?.length) return;
    const lastServer = [...list].reverse().find((m) => !m.id?.startsWith('temp-'));
    if (!lastServer) return;
    setSendChannel(
      lastServer.channel === 'CHAT'
        ? lastServer.platform?.toUpperCase() || 'CHAT'
        : lastServer.channel
    );
  }, [messagesQuery.data?.messages, selectedLeadId]);

  // Auto-select lead from URL query param (e.g., /inbox?lead=<id>)
  useEffect(() => {
    const leadParam = searchParams.get('lead');
    if (leadParam && !selectedLeadId) {
      setSelectedLeadId(leadParam);
      setMobileView('chat');
    }
  }, [searchParams, selectedLeadId]);

  // Map pipeline stage names to lead statuses for auto-sync
  const STAGE_NAME_TO_STATUS: Record<string, string> = {
    'new lead': 'NEW',
    'contacted': 'CONTACTED',
    'qualified': 'QUALIFIED',
    'proposal sent': 'PROPOSAL_SENT',
    'negotiation': 'NEGOTIATION',
    'won': 'WON',
    'lost': 'LOST',
  };

  // ─── Update lead stage ─────────────────────────────────────────────
  const handleStageChange = useCallback(async (stageId: string) => {
    if (!selectedLeadId || !leadInfo) return;
    setUpdatingStage(true);
    try {
      const stage = pipelineStages.find(s => s.id === stageId);
      const updateData: any = { stageId };
      if (stage) {
        const matchedStatus = STAGE_NAME_TO_STATUS[stage.name.toLowerCase()];
        if (matchedStatus) {
          updateData.status = matchedStatus;
        }
      }
      await api.updateLead(selectedLeadId, updateData);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.inbox.messages(selectedLeadId, messageQueryParams as Record<string, unknown>),
      });
    } catch (err) {
      console.error('Failed to update stage:', err);
    } finally {
      setUpdatingStage(false);
      setShowStageDropdown(false);
    }
  }, [selectedLeadId, leadInfo, pipelineStages, queryClient, messageQueryParams]);

  useEffect(() => {
    if (selectedLeadId) setAttachedFiles([]);
  }, [selectedLeadId]);

  // Auto-scroll within the messages container (not the page)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useRealtimeSync(['communication'], useCallback((event) => {
    onCommunicationChanged(event.entityId);
  }, [onCommunicationChanged]));

  useRealtimeSync(['lead'], useCallback((event) => {
    onLeadChanged(event.entityId);
  }, [onLeadChanged]));

  useRealtimeSync(['note'], useCallback((event) => {
    if (event.entityId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.notes(event.entityId) });
    }
  }, [queryClient]));

  useRealtimeSync(['task'], useCallback(() => {
    if (selectedLeadId) {
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'inbox' &&
          q.queryKey[1] === 'messages' &&
          q.queryKey[2] === selectedLeadId,
      });
    }
  }, [queryClient, selectedLeadId]));

  const refreshConversationList = useCallback(() => {
    conversationsQuery.refetch();
  }, [conversationsQuery]);

  // ─── Send message (optimistic) ──────────────────────────────────
  const handleSend = async () => {
    if ((!messageText.trim() && attachedFiles.length === 0) || !selectedLeadId || sending) return;
    const body = messageText.trim();
    const tempId = `temp-${Date.now()}`;
    const msgKey = queryKeys.inbox.messages(selectedLeadId, messageQueryParams as Record<string, unknown>);

    let channel = sendChannel;
    let platform: string | undefined;
    if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(sendChannel)) {
      channel = 'CHAT';
      platform = sendChannel.toLowerCase();
    }

    if (attachedFiles.length === 0) {
      const optimisticMsg: Message = {
        id: tempId,
        direction: 'OUTBOUND',
        channel,
        body,
        subject: null,
        platform: (platform || sendChannel).toUpperCase(),
        platformInfo: { label: PLATFORM_LABELS[sendChannel] || sendChannel, color: PLATFORM_COLORS[sendChannel] || '#6366f1', icon: '' },
        metadata: platform ? { platform } : {},
        createdAt: new Date().toISOString(),
        user: user ? { id: user.id, firstName: user.firstName || 'You', lastName: user.lastName || '' } : null,
        _optimistic: true,
      };
      queryClient.setQueryData(msgKey, (old: any) => {
        if (!old) return { messages: [optimisticMsg], lead: null };
        return { ...old, messages: [...(old.messages || []), optimisticMsg] };
      });
    }

    setMessageText('');
    setSending(true);

    try {
      if (attachedFiles.length > 0) {
        await inboxMutations.sendMessageWithAttachments.mutateAsync({
          leadId: selectedLeadId,
          channel,
          body,
          platform,
          files: attachedFiles,
        });
        setAttachedFiles([]);
      } else {
        await inboxMutations.sendMessage.mutateAsync({
          leadId: selectedLeadId,
          channel,
          body,
          platform,
        });
      }
      inputRef.current?.focus();
    } catch (err: any) {
      queryClient.setQueryData(msgKey, (old: any) => ({
        ...old,
        messages: (old?.messages || []).filter((m: Message) => m.id !== tempId),
      }));
      console.error('Failed to send:', err);
    } finally {
      setSending(false);
    }
  };

  // ─── Edit message ──────────────────────────────────────────────
  const handleEditMessage = async (messageId: string) => {
    if (!editingBody.trim()) return;
    try {
      await inboxMutations.editMessage.mutateAsync({
        messageId,
        body: editingBody.trim(),
      });
      setEditingMsgId(null);
      setEditingBody('');
    } catch (err: any) {
      console.error('Failed to edit:', err);
    }
  };

  // ─── Delete message ────────────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await premiumConfirm({
      title: 'Delete this message?',
      message: 'It will remain visible as "message was deleted".',
      confirmText: 'Delete message',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await inboxMutations.deleteMessage.mutateAsync(messageId);
      setMenuOpenMsgId(null);
    } catch (err: any) {
      console.error('Failed to delete:', err);
    }
  };

  // ─── File handling ────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
  };

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function isImageFile(mimeType: string) {
    return mimeType?.startsWith('image/') && !mimeType?.includes('webp');
  }

  function isImageOrSticker(mimeType: string) {
    return mimeType?.startsWith('image/');
  }

  function isAudioFile(mimeType: string) {
    return mimeType?.startsWith('audio/');
  }

  function isVideoFile(mimeType: string) {
    return mimeType?.startsWith('video/');
  }

  function getFileIcon(mimeType: string) {
    if (mimeType?.startsWith('image/')) return '🖼';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType?.startsWith('video/')) return '🎬';
    if (mimeType?.startsWith('audio/')) return '🎵';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '📊';
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return '📽';
    if (mimeType?.includes('document') || mimeType?.includes('word')) return '📝';
    return '📎';
  }

  function isMediaPlaceholderBody(body: string) {
    if (!body) return false;
    return /^\[(Photo|Video|Voice message|Document|Sticker|Audio)\]$/.test(body.trim()) || body.trim() === '(no text)';
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  const stopAndSendRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      const prevOnStop = recorder.onstop;
      recorder.onstop = async (e) => {
        if (prevOnStop) (prevOnStop as any).call(recorder, e);
        setIsRecording(false);

        const chunks = recordingChunksRef.current;
        if (chunks.length === 0 || !selectedLeadId) { resolve(); return; }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const ext = (recorder.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type });

        setSending(true);
        try {
          let channel = sendChannel;
          let platform: string | undefined;
          if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(sendChannel)) {
            channel = 'CHAT';
            platform = sendChannel.toLowerCase();
          }
          await inboxMutations.sendMessageWithAttachments.mutateAsync({
            leadId: selectedLeadId,
            channel,
            body: '',
            platform,
            files: [file],
          });
        } catch (err) {
          console.error('Failed to send voice note:', err);
        } finally {
          setSending(false);
        }
        resolve();
      };
      recorder.stop();
    });
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
    recordingChunksRef.current = [];
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingTime(0);
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Save internal note ───────────────────────────────────────────
  const handleSaveNote = async () => {
    if (!noteText.trim() || !selectedLeadId || savingNote) return;
    try {
      setSavingNote(true);
      await inboxMutations.addNote.mutateAsync({ leadId: selectedLeadId, body: noteText.trim() });
      setNoteText('');
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  // ─── Update lead status ───────────────────────────────────────────
  const handleStatusUpdate = async (status: string) => {
    if (!selectedLeadId) return;
    try {
      await api.updateConversationStatus(selectedLeadId, status);
      setShowStatusDropdown(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.inbox.messages(selectedLeadId, messageQueryParams as Record<string, unknown>),
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // ─── Insert canned response ───────────────────────────────────────
  const insertCanned = (response: CannedResponse) => {
    setMessageText(response.body);
    setRightTab('info');
    inputRef.current?.focus();
  };

  // ─── Select conversation & mark as read ──────────────────────────
  const { fetchUnreadCount } = useNotificationStore();

  const selectConversation = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    setMobileView('chat');
    setShowConvoActions(null);

    const convo = conversations.find(c => c.leadId === leadId);
    if (convo && convo.unreadCount > 0) {
      queryClient.setQueryData(
        queryKeys.inbox.conversations(conversationQueryParams as Record<string, unknown>),
        (old: any) => {
          if (!old?.conversations) return old;
          return {
            ...old,
            conversations: old.conversations.map((c: Conversation) =>
              c.leadId === leadId ? { ...c, unreadCount: 0 } : c
            ),
          };
        }
      );
      api.markConversationRead(leadId).catch(() => {});
      fetchUnreadCount();
    }
  }, [conversations, conversationQueryParams, fetchUnreadCount, queryClient]);

  // ─── Toggle pin ───────────────────────────────────────────────────
  const togglePin = (leadId: string) => {
    setPinnedConvos(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
    setShowConvoActions(null);
  };

  // ─── Sorted conversations (pinned first, then by sort preference) ─
  const sortedConversations = useMemo(() => {
    const sortFn = (a: Conversation, b: Conversation) => {
      switch (inboxSortBy) {
        case 'oldest':
          return new Date(a.lastMessage?.createdAt || 0).getTime() - new Date(b.lastMessage?.createdAt || 0).getTime();
        case 'unread':
          return (b.unreadCount || 0) - (a.unreadCount || 0);
        case 'name':
          return (a.contactName || '').localeCompare(b.contactName || '');
        case 'latest':
        default:
          return new Date(b.lastMessage?.createdAt || 0).getTime() - new Date(a.lastMessage?.createdAt || 0).getTime();
      }
    };
    const pinned = conversations.filter(c => pinnedConvos.has(c.leadId)).sort(sortFn);
    const rest = conversations.filter(c => !pinnedConvos.has(c.leadId)).sort(sortFn);
    return [...pinned, ...rest];
  }, [conversations, pinnedConvos, inboxSortBy]);

  // ─── Time formatting ─────────────────────────────────────────────
  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function groupMessagesByDate(msgs: Message[]) {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    for (const msg of msgs) {
      const date = new Date(msg.createdAt).toDateString();
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date: formatDate(msg.createdAt), messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }

  const selectedConvo = conversations.find(c => c.leadId === selectedLeadId);

  // ─── Channel stats for sidebar ────────────────────────────────────
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    conversations.forEach(c => {
      const p = c.lastMessage?.platform || c.lastMessage?.channel || 'UNKNOWN';
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [conversations]);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-7.5rem)] sm:h-[calc(100vh-5rem)] -m-3 sm:-m-4 md:-m-6 bg-white overflow-hidden border border-border rounded-xl">

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LEFT: Conversation List                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-[340px] xl:w-[380px] border-r border-border bg-white flex-shrink-0`}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Omnichannel Inbox</h2>
                <p className="text-2xs text-text-tertiary">{conversations.length} conversations</p>
              </div>
            </div>
            <button onClick={() => refreshConversationList()} className="btn-icon" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${conversationsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-surface-tertiary border-0 placeholder:text-text-tertiary focus:bg-white focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-text-tertiary hover:text-text-primary" />
              </button>
            )}
          </div>

          {/* Channel filter pills */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-thin -mx-0.5 px-0.5">
            {CHANNEL_FILTERS.map(f => {
              const count = f.key === 'ALL' ? conversations.length : (channelCounts[f.key] || 0);
              return (
                <button
                  key={f.key}
                  onClick={() => setChannelFilter(f.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    channelFilter === f.key
                      ? 'text-white shadow-sm'
                      : 'bg-surface-tertiary text-text-secondary hover:bg-surface-secondary'
                  }`}
                  style={channelFilter === f.key ? { backgroundColor: f.key === 'ALL' ? '#6366f1' : (PLATFORM_COLORS[f.key] || '#6366f1') } : {}}
                >
                  {f.key !== 'ALL' && <PlatformIcon platform={f.key} size={10} />}
                  {f.label}
                  {count > 0 && f.key === channelFilter && (
                    <span className="ml-0.5 px-1 py-px rounded text-2xs bg-white/20">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Status filter row */}
          <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-thin">
            {['', 'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-0.5 rounded text-2xs font-medium transition-all flex-shrink-0 ${
                  statusFilter === s
                    ? 'bg-text-primary text-white'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {s ? getStatusLabel(s) : 'All Status'}
              </button>
            ))}
          </div>

          {/* Sort by */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <ArrowUpDown className="h-3 w-3 text-text-tertiary" />
            {(['latest', 'oldest', 'unread', 'name'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setInboxSortBy(opt)}
                className={`px-1.5 py-0.5 rounded text-2xs font-medium transition-all ${
                  inboxSortBy === opt
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {opt === 'latest' ? 'Latest' : opt === 'oldest' ? 'Oldest' : opt === 'unread' ? 'Unread' : 'Name'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Conversation list ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loadingConversations && conversations.length === 0 ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex gap-2.5 p-2 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-surface-tertiary flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-surface-tertiary rounded w-3/4" />
                    <div className="h-3 bg-surface-tertiary rounded w-full" />
                    <div className="h-2.5 bg-surface-tertiary rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="h-14 w-14 rounded-2xl bg-surface-tertiary flex items-center justify-center mb-3">
                <MessageCircle className="h-7 w-7 text-text-tertiary" />
              </div>
              <p className="text-sm font-semibold text-text-primary">No conversations found</p>
              <p className="text-xs text-text-tertiary mt-1 max-w-[200px]">
                {searchQuery ? 'Try a different search term' : 'Messages from all channels will appear here'}
              </p>
            </div>
          ) : (
            sortedConversations.map(convo => {
              const isPinned = pinnedConvos.has(convo.leadId);
              const isSelected = selectedLeadId === convo.leadId;
              const statusStyle = STATUS_COLORS[convo.leadStatus] || STATUS_COLORS.NEW;

              return (
                <div key={convo.leadId} className="relative group">
                  <button
                    onClick={() => selectConversation(convo.leadId)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border-subtle transition-all ${
                      isSelected
                        ? 'bg-brand-50 border-l-[3px] border-l-brand-500'
                        : 'hover:bg-surface-secondary border-l-[3px] border-l-transparent'
                    } ${isPinned ? 'bg-amber-50/30' : ''}`}
                  >
                    <div className="flex gap-2.5">
                      {/* Avatar with platform badge */}
                      <div className="relative flex-shrink-0">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
                          style={{ backgroundColor: PLATFORM_COLORS[convo.lastMessage?.platform || 'CHAT'] || '#6366f1' }}
                        >
                          {convo.contactName.charAt(0).toUpperCase()}
                        </div>
                        {convo.lastMessage && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 rounded-full bg-white flex items-center justify-center shadow-xs ring-1 ring-white">
                            <PlatformIcon platform={convo.lastMessage.platform} size={10} />
                          </div>
                        )}
                        {isPinned && (
                          <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-amber-400 flex items-center justify-center">
                            <Pin className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[13px] truncate ${convo.unreadCount > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>
                              {convo.contactName || 'Unknown Contact'}
                            </span>
                            {/* Score badge */}
                            {convo.leadScore >= 70 && (
                              <span className="flex-shrink-0 h-4 w-4 rounded-full bg-amber-100 flex items-center justify-center">
                                <Star className="h-2.5 w-2.5 text-amber-600" />
                              </span>
                            )}
                          </div>
                          {convo.lastMessage && (
                            <span className="text-2xs text-text-tertiary flex-shrink-0 tabular-nums">
                              {timeAgo(convo.lastMessage.createdAt)}
                            </span>
                          )}
                        </div>

                        {convo.company && (
                          <p className="text-2xs text-text-tertiary truncate flex items-center gap-1">
                            <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                            {convo.company}
                          </p>
                        )}

                        {convo.lastMessage && (
                          <p className={`text-xs truncate mt-0.5 leading-snug ${convo.unreadCount > 0 ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                            {convo.lastMessage.direction === 'OUTBOUND' && (
                              <span className="text-text-tertiary">
                                <CheckCheck className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                              </span>
                            )}
                            {convo.lastMessage.metadata?.mediaType === 'image' || convo.lastMessage.metadata?.mediaType === 'sticker' ? (
                              <span className="italic">📷 Photo{convo.lastMessage.metadata?.attachments?.[0]?.caption ? `: ${convo.lastMessage.metadata.attachments[0].caption}` : ''}</span>
                            ) : convo.lastMessage.metadata?.mediaType === 'video' ? (
                              <span className="italic">🎬 Video</span>
                            ) : convo.lastMessage.metadata?.mediaType === 'audio' || convo.lastMessage.metadata?.mediaType === 'voice' ? (
                              <span className="italic">🎤 Voice message</span>
                            ) : convo.lastMessage.metadata?.mediaType === 'document' ? (
                              <span className="italic">📄 {convo.lastMessage.metadata?.attachments?.[0]?.filename || 'Document'}</span>
                            ) : convo.lastMessage.body}
                          </p>
                        )}

                        {/* Tags row */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {/* Channel pill */}
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-2xs font-medium"
                            style={{
                              backgroundColor: `${PLATFORM_COLORS[convo.lastMessage?.platform || 'CHAT'] || '#6366f1'}10`,
                              color: PLATFORM_COLORS[convo.lastMessage?.platform || 'CHAT'] || '#6366f1',
                            }}
                          >
                            <PlatformIcon platform={convo.lastMessage?.platform || 'CHAT'} size={8} />
                            {convo.lastMessage?.platformInfo?.label || convo.lastMessage?.channel}
                          </span>

                          {/* Status pill */}
                          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-2xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                            {getStatusLabel(convo.leadStatus || 'NEW')}
                          </span>

                          {/* Unread count badge or message count */}
                          {convo.unreadCount > 0 ? (
                            <span className="ml-auto inline-flex items-center justify-center h-4.5 min-w-[18px] px-1 rounded-full bg-brand-600 text-white text-2xs font-bold tabular-nums">
                              {convo.unreadCount}
                            </span>
                          ) : (
                            <span className="text-2xs text-text-tertiary ml-auto tabular-nums">
                              {convo.messageCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(convo.leadId); }}
                      className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${isPinned ? 'bg-amber-100 text-amber-600' : 'bg-white/90 text-text-tertiary hover:text-text-primary shadow-xs'}`}
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Stats footer ──────────────────────────────────────────── */}
        {stats && (
          <div className="border-t border-border px-3 py-2 bg-surface-secondary/50">
            <div className="flex items-center justify-between text-2xs text-text-tertiary">
              <span>{stats.totalMessages} total messages</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {stats.recentInbound} inbound (24h)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CENTER: Message Thread                                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className={`${mobileView === 'chat' || !selectedLeadId ? '' : 'hidden'} md:flex flex-col flex-1 min-w-0 ${!selectedLeadId ? 'hidden md:flex' : 'flex'}`}>
        {!selectedLeadId ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface-secondary/30">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center mb-5 shadow-soft">
              <MessageCircle className="h-10 w-10 text-brand-500" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">Omnichannel Inbox</h3>
            <p className="text-sm text-text-tertiary max-w-md mb-8">
              All your conversations from WhatsApp, Facebook, Instagram, Email, Google, and Website Chat in one unified view
            </p>

            {/* Channel grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 max-w-lg mb-8">
              {['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'GOOGLE', 'WEBCHAT'].map(ch => (
                <div key={ch} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white border border-border shadow-xs hover:shadow-soft transition-shadow">
                  <PlatformIcon platform={ch} size={24} />
                  <span className="text-2xs font-medium text-text-secondary">{PLATFORM_LABELS[ch]?.split(' ')[0]}</span>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl">
                <div className="card p-3 text-center">
                  <p className="text-2xl font-bold text-brand-600">{stats.totalConversations}</p>
                  <p className="text-2xs text-text-tertiary mt-0.5">Conversations</p>
                </div>
                <div className="card p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{stats.totalMessages}</p>
                  <p className="text-2xs text-text-tertiary mt-0.5">Total Messages</p>
                </div>
                <div className="card p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{stats.recentInbound}</p>
                  <p className="text-2xs text-text-tertiary mt-0.5">Inbound (24h)</p>
                </div>
                <div className="card p-3 text-center">
                  <p className="text-2xl font-bold text-violet-600">{stats.byChannel?.length || 0}</p>
                  <p className="text-2xs text-text-tertiary mt-0.5">Active Channels</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Chat header ───────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-white shadow-xs z-10">
              <button className="btn-icon md:hidden -ml-1 flex-shrink-0" onClick={() => setMobileView('list')}>
                <ArrowLeft className="h-5 w-5" />
              </button>

              {/* Contact avatar */}
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                style={{ backgroundColor: PLATFORM_COLORS[selectedConvo?.lastMessage?.platform || 'CHAT'] || '#6366f1' }}
              >
                {getDisplayInitials(leadInfo?.firstName, leadInfo?.lastName)}
              </div>

              {/* Contact info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary truncate">
                    {leadInfo ? getDisplayName(leadInfo.firstName, leadInfo.lastName) : 'Loading...'}
                  </h3>
                  {/* Status badge with dropdown */}
                  {leadInfo && (
                    <div className="relative">
                      <button
                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium transition-colors ${
                          STATUS_COLORS[leadInfo.status]?.bg || 'bg-gray-50'
                        } ${STATUS_COLORS[leadInfo.status]?.text || 'text-gray-700'}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[leadInfo.status]?.dot || 'bg-gray-500'}`} />
                        {getStatusLabel(leadInfo.status || 'NEW')}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </button>

                      {showStatusDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-modal py-1 z-20 min-w-[140px]">
                          {Object.entries(STATUS_COLORS).map(([status, style]) => (
                            <button
                              key={status}
                              onClick={() => handleStatusUpdate(status)}
                              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-surface-secondary transition-colors ${
                                leadInfo.status === status ? 'bg-surface-tertiary font-medium' : ''
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                              {getStatusLabel(status)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-2xs text-text-tertiary">
                  {leadInfo?.company && <span className="truncate">{leadInfo.company}</span>}
                  {leadInfo?.email && <span className="truncate hidden sm:inline">&middot; {leadInfo.email}</span>}
                </div>
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => router.push(`/leads/${selectedLeadId}`)} className="btn-icon" title="View lead">
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button onClick={() => setShowRightPanel(!showRightPanel)} className="btn-icon hidden lg:flex" title="Toggle panel">
                  <User className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── Messages area (full loading only when no messages yet; refresh in place for real-time feel) ─────────────────────────────────────── */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 bg-[#e5ddd5]" onClick={() => setMenuOpenMsgId(null)}>
              {loadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-text-tertiary">Loading messages...</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageCircle className="h-10 w-10 text-text-tertiary mb-3" />
                  <p className="text-sm font-medium text-text-primary">No messages yet</p>
                  <p className="text-xs text-text-tertiary mt-1">Send the first message to start the conversation</p>
                </div>
              ) : (
                groupMessagesByDate(messages).map((group, gi) => (
                  <div key={gi}>
                    {/* Date separator */}
                    <div className="flex justify-center my-4">
                      <span className="text-2xs font-semibold text-text-tertiary bg-white/90 px-3 py-1 rounded-lg shadow-sm">
                        {group.date}
                      </span>
                    </div>

                    {group.messages.map((msg, mi) => {
                      const isOutbound = msg.direction === 'OUTBOUND';
                      const isOwnMessage = isOutbound && msg.user?.id === user?.id;
                      const isMenuOpen = menuOpenMsgId === msg.id;
                      const isEditing = editingMsgId === msg.id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex mb-1.5 ${isOutbound ? 'justify-end' : 'justify-start'} group/msg relative`}
                        >
                          {/* Action menu for own outbound messages */}
                          {isOwnMessage && !msg.isDeleted && !msg._optimistic && !isEditing && (
                            <div className={`flex items-start mr-1 opacity-0 group-hover/msg:opacity-100 ${isMenuOpen ? '!opacity-100' : ''} transition-opacity`}>
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMenuOpenMsgId(isMenuOpen ? null : msg.id); }}
                                  className="p-1 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-600"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                {isMenuOpen && (
                                  <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border py-1 min-w-[130px]" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => { setEditingMsgId(msg.id); setEditingBody(msg.body); setMenuOpenMsgId(null); setTimeout(() => editInputRef.current?.focus(), 50); }}
                                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMessage(msg.id)}
                                      className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className={`max-w-[75%] sm:max-w-[65%] relative`}>
                            {/* Channel indicator on first msg or channel change */}
                            {(mi === 0 || group.messages[mi - 1]?.platform !== msg.platform) && (
                              <div className={`flex items-center gap-1 mb-1 ${isOutbound ? 'justify-end' : ''}`}>
                                <PlatformIcon platform={msg.platform} size={10} />
                                <span className="text-2xs text-text-tertiary font-medium">
                                  {msg.platformInfo?.label || msg.channel}
                                </span>
                              </div>
                            )}

                            {/* WhatsApp-style bubble */}
                            <div className="relative group/bubble">
                              <div
                                className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed relative ${
                                  isOutbound
                                    ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none'
                                    : 'bg-white text-gray-900 rounded-tl-none shadow-sm'
                                } ${msg._optimistic ? 'opacity-70' : ''}`}
                              >
                                {/* WhatsApp tail */}
                                <div className={`absolute top-0 w-2 h-3 overflow-hidden ${isOutbound ? '-right-2' : '-left-2'}`}>
                                  <div className={`w-4 h-4 transform rotate-45 ${isOutbound ? 'bg-[#d9fdd3] -translate-x-2' : 'bg-white translate-x-0'}`} />
                                </div>

                                {/* Sender name */}
                                {isOutbound && msg.user && (
                                  <p className="text-xs font-semibold text-indigo-700 mb-0.5">
                                    {getDisplayName(msg.user.firstName, msg.user.lastName)}
                                  </p>
                                )}
                                {!isOutbound && (
                                  <p className="text-xs font-semibold text-teal-700 mb-0.5">
                                    {getDisplayName(leadInfo?.firstName, leadInfo?.lastName)}
                                  </p>
                                )}

                                {/* Deleted message */}
                                {msg.isDeleted ? (
                                  <p className="text-sm italic text-gray-400 flex items-center gap-1">
                                    <Ban className="h-3.5 w-3.5" />
                                    This message was deleted
                                  </p>
                                ) : isEditing ? (
                                  /* Inline edit */
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
                                      <p className="text-2xs font-bold mb-1 text-gray-500">
                                        Re: {msg.subject}
                                      </p>
                                    )}
                                    {/* Media attachments (images, audio, video, documents) */}
                                    {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                                      <div className="space-y-1.5">
                                        {msg.metadata.attachments.map((att: any, ai: number) => {
                                          const url = att.url ? `/api${att.url}` : null;
                                          if (!url) return null;

                                          if (isImageOrSticker(att.mimeType)) {
                                            return (
                                              <a key={ai} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img
                                                  src={url}
                                                  alt={att.filename || 'Image'}
                                                  className="max-w-[280px] max-h-[300px] rounded-lg object-contain cursor-pointer"
                                                  loading="lazy"
                                                />
                                              </a>
                                            );
                                          }

                                          if (isAudioFile(att.mimeType)) {
                                            return (
                                              <div key={ai} className="flex items-center gap-2 min-w-[200px] max-w-[300px]">
                                                <audio controls preload="none" className="w-full h-8 [&::-webkit-media-controls-panel]:bg-transparent">
                                                  <source src={url} type={att.mimeType} />
                                                </audio>
                                              </div>
                                            );
                                          }

                                          if (isVideoFile(att.mimeType)) {
                                            return (
                                              <div key={ai} className="max-w-[300px]">
                                                <video
                                                  controls
                                                  preload="metadata"
                                                  className="rounded-lg max-w-full max-h-[240px]"
                                                >
                                                  <source src={url} type={att.mimeType} />
                                                </video>
                                              </div>
                                            );
                                          }

                                          return (
                                            <a
                                              key={ai}
                                              href={url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-2 p-2 rounded-lg transition-colors bg-black/5 hover:bg-black/10"
                                            >
                                              <span className="text-lg flex-shrink-0">{getFileIcon(att.mimeType)}</span>
                                              <div className="min-w-0 flex-1">
                                                <p className="text-2xs font-medium truncate text-gray-800">{att.filename}</p>
                                                <p className="text-2xs text-gray-500">{formatFileSize(att.size)}</p>
                                              </div>
                                              <Download className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Text body — hide placeholder labels when media is present */}
                                    {msg.body && !(msg.metadata?.attachments?.length > 0 && isMediaPlaceholderBody(msg.body)) && (
                                      <p className={`whitespace-pre-wrap break-words ${msg.metadata?.attachments?.length > 0 ? 'mt-1' : ''}`}>{msg.body}</p>
                                    )}
                                  </>
                                )}

                                {/* Footer: time, edited, ticks */}
                                {!isEditing && (
                                  <div className="flex items-center gap-1 mt-1 justify-end">
                                    {msg.isEdited && !msg.isDeleted && (
                                      <span className="text-[10px] text-gray-400 italic">edited</span>
                                    )}
                                    <span className="text-[10px] text-gray-400">
                                      {formatTime(msg.createdAt)}
                                    </span>
                                    {isOutbound && !msg._optimistic && (
                                      <CheckCheck className="h-3 w-3 text-blue-500" />
                                    )}
                                    {msg._optimistic && (
                                      <Check className="h-3 w-3 text-gray-400" />
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Reply action on hover — for non-own messages */}
                              {!isOwnMessage && !msg.isDeleted && (
                                <div className={`absolute top-0 ${isOutbound ? '-left-8' : '-right-8'} hidden group-hover/bubble:flex`}>
                                  <button
                                    onClick={() => { setMessageText(`> ${msg.body.substring(0, 50)}...\n\n`); inputRef.current?.focus(); }}
                                    className="h-6 w-6 rounded-full bg-white shadow-sm border border-border flex items-center justify-center text-text-tertiary hover:text-text-primary"
                                    title="Reply"
                                  >
                                    <CornerUpLeft className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Message composer ───────────────────────────────────── */}
            <div
              className={`border-t bg-white transition-colors ${isDragging ? 'border-brand-400 bg-brand-50/30' : 'border-border'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag overlay */}
              {isDragging && (
                <div className="px-4 py-3 text-center border-2 border-dashed border-brand-400 rounded-lg mx-3 mt-2 bg-brand-50/50">
                  <Paperclip className="h-5 w-5 text-brand-500 mx-auto mb-1" />
                  <p className="text-xs font-medium text-brand-600">Drop files here to attach</p>
                  <p className="text-2xs text-brand-400">Max 10 files, 25MB each</p>
                </div>
              )}

              {/* Attachment previews */}
              {attachedFiles.length > 0 && (
                <div className="px-3 sm:px-4 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, i) => (
                      <div key={i} className="relative group/file flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-tertiary border border-border max-w-[200px]">
                        {file.type.startsWith('image/') ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-8 w-8 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <span className="text-sm flex-shrink-0">{getFileIcon(file.type)}</span>
                        )}
                        <div className="min-w-0">
                          <p className="text-2xs font-medium text-text-primary truncate">{file.name}</p>
                          <p className="text-2xs text-text-tertiary">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          onClick={() => removeAttachedFile(i)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Channel bar */}
              <div className="flex items-center gap-2 px-3 sm:px-4 pt-2.5 pb-1">
                <div className="relative">
                  <button
                    onClick={() => setShowChannelPicker(!showChannelPicker)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-semibold bg-surface-tertiary hover:bg-surface-secondary transition-colors"
                    style={{ color: PLATFORM_COLORS[sendChannel] || '#6366f1' }}
                  >
                    <PlatformIcon platform={sendChannel} size={12} />
                    {PLATFORM_LABELS[sendChannel]?.split(' ')[0] || sendChannel}
                    <ChevronDown className="h-3 w-3 text-text-tertiary" />
                  </button>

                  {showChannelPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowChannelPicker(false)} />
                      <div className="absolute bottom-full left-0 mb-1.5 bg-white border border-border rounded-xl shadow-modal py-1.5 z-20 min-w-[180px]">
                        <p className="px-3 py-1 text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Reply via</p>
                        {CHANNEL_FILTERS.filter(f => f.key !== 'ALL').map(f => (
                          <button
                            key={f.key}
                            onClick={() => { setSendChannel(f.key); setShowChannelPicker(false); }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-surface-secondary transition-colors ${
                              sendChannel === f.key ? 'bg-brand-50 font-medium' : ''
                            }`}
                          >
                            <PlatformIcon platform={f.key} size={14} />
                            <span>{PLATFORM_LABELS[f.key] || f.label}</span>
                            {sendChannel === f.key && <Check className="h-3.5 w-3.5 text-brand-600 ml-auto" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-1" />

                {/* Quick actions */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-2xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
                  title="Attach files"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="hidden sm:inline">Attach</span>
                </button>
                <button
                  onClick={() => setRightTab('canned')}
                  className="text-2xs text-text-tertiary hover:text-brand-600 flex items-center gap-1 transition-colors"
                  title="Canned responses"
                >
                  <Zap className="h-3 w-3" />
                  <span className="hidden sm:inline">Quick Replies</span>
                </button>
                <button
                  onClick={() => setRightTab('notes')}
                  className="text-2xs text-text-tertiary hover:text-amber-600 flex items-center gap-1 transition-colors"
                  title="Internal notes"
                >
                  <StickyNote className="h-3 w-3" />
                  <span className="hidden sm:inline">Notes</span>
                </button>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.wav,.mp4,.webm,.zip,.rar"
              />

              {/* Input area */}
              <div className="flex items-end gap-2 px-3 sm:px-4 pb-3">
                {isRecording ? (
                  <>
                    <button
                      onClick={cancelRecording}
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50 hover:bg-red-100 text-red-500 transition-all"
                      title="Cancel recording"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50/50 min-h-[40px]">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                      <span className="text-sm text-red-600 font-medium tabular-nums">{formatRecordingTime(recordingTime)}</span>
                      <span className="text-xs text-red-400">Recording...</span>
                    </div>
                    <button
                      onClick={stopAndSendRecording}
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-500 hover:bg-green-600 text-white transition-all"
                      title="Send voice note"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-tertiary hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-all"
                      title="Attach file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <textarea
                      ref={inputRef}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message via ${PLATFORM_LABELS[sendChannel]?.split(' ')[0] || sendChannel}...`}
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-border bg-surface-secondary/50 px-3.5 py-2.5 text-sm
                        placeholder:text-text-tertiary focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15
                        focus:outline-none transition-all max-h-28 min-h-[40px]"
                      onInput={(e) => {
                        const el = e.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 112) + 'px';
                      }}
                    />
                    {!messageText.trim() && attachedFiles.length === 0 ? (
                      <button
                        onClick={startRecording}
                        disabled={sending}
                        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-tertiary hover:bg-green-50 text-text-tertiary hover:text-green-600 transition-all disabled:opacity-40"
                        title="Record voice note"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={(!messageText.trim() && attachedFiles.length === 0) || sending}
                        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
                        style={{ backgroundColor: PLATFORM_COLORS[sendChannel] || '#6366f1' }}
                        title="Send"
                      >
                        {sending ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 text-white" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RIGHT: Lead Info / Notes / Canned Responses                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selectedLeadId && showRightPanel && leadInfo && (
        <div className="hidden lg:flex flex-col w-72 xl:w-80 border-l border-border bg-white overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {([
              { key: 'info', label: 'Contact', icon: User },
              { key: 'notes', label: 'Notes', icon: StickyNote },
              { key: 'attachments', label: 'Files', icon: Paperclip },
              { key: 'canned', label: 'Quick Replies', icon: Zap },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-2xs font-semibold transition-colors ${
                  rightTab === tab.key
                    ? 'text-brand-600 border-b-2 border-brand-600'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── Contact Info Tab ──────────────────────────────────── */}
            {rightTab === 'info' && (
              <div className="p-4">
                {/* Contact card */}
                <div className="flex flex-col items-center text-center mb-5">
                  <div
                    className="h-16 w-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-md"
                    style={{ backgroundColor: PLATFORM_COLORS[selectedConvo?.lastMessage?.platform || 'CHAT'] || '#6366f1' }}
                  >
                    {getDisplayInitials(leadInfo.firstName, leadInfo.lastName)}
                  </div>
                  <p className="text-sm font-bold text-text-primary">
                    {getDisplayName(leadInfo.firstName, leadInfo.lastName)}
                  </p>
                  {leadInfo.jobTitle && (
                    <p className="text-xs text-text-tertiary mt-0.5">{leadInfo.jobTitle}</p>
                  )}
                  {leadInfo.company && (
                    <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3 w-3" /> {leadInfo.company}
                    </p>
                  )}

                  {/* Score ring + View Lead link */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                      <Star className="h-3.5 w-3.5" />
                      Score: {leadInfo.score}/100
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/leads/${leadInfo.id}`)}
                    className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Lead Details
                  </button>
                </div>

                {/* Contact details */}
                <div className="space-y-0.5 mb-4">
                  <p className="text-2xs font-bold text-text-tertiary uppercase tracking-wider mb-2">Contact Details</p>
                  {[
                    { icon: Mail, label: 'Email', value: leadInfo.email },
                    { icon: Phone, label: 'Phone', value: formatPhone(leadInfo.phone) },
                    { icon: Building2, label: 'Company', value: leadInfo.company },
                    { icon: Briefcase, label: 'Job Title', value: leadInfo.jobTitle },
                  ].filter(d => d.value).map(d => (
                    <div key={d.label} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-surface-secondary transition-colors group/detail">
                      <d.icon className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs text-text-tertiary">{d.label}</p>
                        <p className="text-xs text-text-primary truncate">{d.value}</p>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(d.value || '')}
                        className="opacity-0 group-hover/detail:opacity-100 transition-opacity"
                        title="Copy"
                      >
                        <Copy className="h-3 w-3 text-text-tertiary" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-border-subtle my-3" />

                {/* Lead properties */}
                <div className="space-y-0.5">
                  <p className="text-2xs font-bold text-text-tertiary uppercase tracking-wider mb-2">Lead Properties</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-surface-secondary/50 relative">
                      <p className="text-2xs text-text-tertiary mb-0.5">Stage</p>
                      <button
                        onClick={() => setShowStageDropdown(!showStageDropdown)}
                        disabled={updatingStage}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: leadInfo.stage?.color || '#6366f1' }}
                      >
                        {updatingStage ? 'Updating...' : (leadInfo.stage?.name || 'No Stage')}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {showStageDropdown && (
                        <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowStageDropdown(false)} />
                        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-border-subtle py-1 min-w-[160px] max-h-48 overflow-y-auto">
                          {pipelineStages.map(stage => (
                            <button
                              key={stage.id}
                              onClick={() => handleStageChange(stage.id)}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary flex items-center gap-2 ${leadInfo.stage?.id === stage.id ? 'font-bold' : ''}`}
                            >
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#6366f1' }} />
                              {stage.name}
                              {leadInfo.stage?.id === stage.id && <Check className="h-3 w-3 ml-auto text-brand-600" />}
                            </button>
                          ))}
                        </div>
                        </>
                      )}
                    </div>
                    <div className="p-2 rounded-lg bg-surface-secondary/50">
                      <p className="text-2xs text-text-tertiary mb-0.5">Status</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium ${STATUS_COLORS[leadInfo.status]?.bg || 'bg-gray-50'} ${STATUS_COLORS[leadInfo.status]?.text || 'text-gray-700'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[leadInfo.status]?.dot || 'bg-gray-500'}`} />
                        {getStatusLabel(leadInfo.status || 'NEW')}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-secondary/50">
                      <p className="text-2xs text-text-tertiary mb-0.5">Source</p>
                      <p className="text-xs font-medium text-text-primary">{leadInfo.source}</p>
                    </div>
                    {leadInfo.budget > 0 && (
                      <div className="p-2 rounded-lg bg-surface-secondary/50">
                        <p className="text-2xs text-text-tertiary mb-0.5">Budget</p>
                        <p className="text-xs font-bold text-emerald-600">${leadInfo.budget.toLocaleString()}</p>
                      </div>
                    )}
                    <div className="p-2 rounded-lg bg-surface-secondary/50">
                      <p className="text-2xs text-text-tertiary mb-0.5">Created</p>
                      <p className="text-xs font-medium text-text-primary">
                        {new Date(leadInfo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {leadInfo.assignedTo && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-brand-50/50">
                      <div className="h-6 w-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-2xs font-bold">
                        {getDisplayInitials(leadInfo.assignedTo.firstName, leadInfo.assignedTo.lastName)}
                      </div>
                      <div>
                        <p className="text-2xs text-text-tertiary">Assigned to</p>
                        <p className="text-xs font-medium text-text-primary">
                          {getDisplayName(leadInfo.assignedTo.firstName, leadInfo.assignedTo.lastName)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border-subtle my-3" />

                <button
                  onClick={() => router.push(`/leads/${selectedLeadId}`)}
                  className="btn-secondary w-full text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full Profile
                </button>
              </div>
            )}

            {/* ── Notes Tab ─────────────────────────────────────────── */}
            {rightTab === 'notes' && (
              <div className="p-4">
                <div className="mb-4">
                  <p className="text-xs font-semibold text-text-primary mb-2">Internal Notes</p>
                  <p className="text-2xs text-text-tertiary mb-3">Notes are only visible to your team</p>

                  <div className="flex gap-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a private note..."
                      rows={3}
                      className="flex-1 resize-none rounded-lg border border-border bg-amber-50/30 px-3 py-2 text-xs
                        placeholder:text-text-tertiary focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20
                        focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSaveNote}
                    disabled={!noteText.trim() || savingNote}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg
                      bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {savingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </div>

                {/* Notes list */}
                <div className="space-y-2">
                  {notes.length === 0 ? (
                    <div className="text-center py-6">
                      <StickyNote className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                      <p className="text-xs text-text-tertiary">No notes yet</p>
                    </div>
                  ) : (
                    notes.map((note: any) => (
                      <div key={note.id} className="p-3 rounded-lg bg-amber-50 border border-amber-200/50">
                        <p className="text-xs text-text-primary whitespace-pre-wrap">{note.content}</p>
                        <div className="flex items-center gap-2 mt-2 text-2xs text-amber-700">
                          <span className="font-medium">
                            {getDisplayName(note.user?.firstName, note.user?.lastName)}
                          </span>
                          <span>&middot;</span>
                          <span>{new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Canned Responses Tab ──────────────────────────────── */}
            {/* ── Attachments Tab ──────────────────────────────────── */}
            {rightTab === 'attachments' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-text-primary">Shared Files</p>
                    <p className="text-2xs text-text-tertiary">{leadAttachments.length} file{leadAttachments.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-2xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    Upload
                  </button>
                </div>

                {leadAttachments.length === 0 ? (
                  <div className="text-center py-8">
                    <Paperclip className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                    <p className="text-xs text-text-tertiary">No files shared yet</p>
                    <p className="text-2xs text-text-tertiary mt-0.5">Attachments sent in messages will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {leadAttachments.map((att: any) => (
                      <a
                        key={att.id}
                        href={`/api${att.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50/20 transition-all group/att"
                      >
                        {isImageFile(att.mimeType) ? (
                          <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-tertiary">
                            <img
                              src={`/api${att.url}`}
                              alt={att.filename}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-surface-tertiary flex items-center justify-center flex-shrink-0 text-lg">
                            {getFileIcon(att.mimeType)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text-primary truncate">{att.filename}</p>
                          <div className="flex items-center gap-2 text-2xs text-text-tertiary">
                            <span>{formatFileSize(att.size)}</span>
                            <span>&middot;</span>
                            <span>{new Date(att.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                        <Download className="h-3.5 w-3.5 text-text-tertiary opacity-0 group-hover/att:opacity-100 transition-opacity flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rightTab === 'canned' && (
              <div className="p-4">
                <p className="text-xs font-semibold text-text-primary mb-1">Quick Replies</p>
                <p className="text-2xs text-text-tertiary mb-3">Click to insert into message</p>

                <div className="space-y-2">
                  {cannedResponses.map(cr => (
                    <button
                      key={cr.id}
                      onClick={() => insertCanned(cr)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50/30 transition-all group/canned"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-text-primary">{cr.title}</span>
                        <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${
                          cr.category === 'sales' ? 'bg-emerald-50 text-emerald-700' :
                          cr.category === 'support' ? 'bg-blue-50 text-blue-700' :
                          cr.category === 'meeting' ? 'bg-purple-50 text-purple-700' :
                          cr.category === 'follow-up' ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-50 text-gray-700'
                        }`}>
                          {cr.category}
                        </span>
                      </div>
                      <p className="text-2xs text-text-secondary line-clamp-2">{cr.body}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-2xs text-brand-600 opacity-0 group-hover/canned:opacity-100 transition-opacity">
                        <Zap className="h-3 w-3" />
                        Click to use
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
