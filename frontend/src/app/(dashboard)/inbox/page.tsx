'use client';

import { Suspense, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useLeadsFieldConfigQuery } from '@/features/leads/hooks/useLeadsQueries';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { ACTIVE_DIVISION_CHANGED, type ActiveDivisionChangedDetail } from '@/lib/activeDivisionEvents';
import {
  useInboxAttachmentsQuery,
  useInboxBootstrapQuery,
  useInboxConversationsQuery,
  useInboxMessageMutations,
  INBOX_THREAD_LIMIT,
  patchInboxThreadAfterOutbound,
  useInboxThreadQuery,
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
  Pencil, Trash2, Ban, ArrowUpDown, Mic, Square, TrendingUp,
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

// Large virtual offset — same technique as ChatWindow.js.
// When older messages are prepended, firstItemIndex shrinks to preserve scroll position automatically.
const INITIAL_FIRST_ITEM_INDEX = 100_000;

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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSending, setTemplateSending] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [templateOptions, setTemplateOptions] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  const [sendingCount, setSendingCount] = useState(0);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Right panel tabs: info | notes | attachments (quick replies open from composer popover)
  const [rightTab, setRightTab] = useState<'info' | 'notes' | 'attachments'>('info');

  const [showRightPanel, setShowRightPanel] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);
  const [showQuickRepliesPopover, setShowQuickRepliesPopover] = useState(false);
  const [showConvoActions, setShowConvoActions] = useState<string | null>(null);
  const [pinnedConvos, setPinnedConvos] = useState<Set<string>>(new Set());
  const [inboxSortBy, setInboxSortBy] = useState<'latest' | 'oldest' | 'unread' | 'name'>('latest');

  // Division scope (SUPER_ADMIN switcher writes to localStorage). In production builds,
  // client-side navigation won't remount this page, so read localStorage into state
  // and refresh on focus to avoid stale division-scoped inbox data.
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const v = localStorage.getItem('activeDivisionId');
        setActiveDivisionId(v && v.trim() ? v : null);
      } catch {
        setActiveDivisionId(null);
      }
    };
    read();
    window.addEventListener('focus', read);
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<ActiveDivisionChangedDetail>).detail;
      setActiveDivisionId(detail?.divisionId ?? null);
    };
    window.addEventListener(ACTIVE_DIVISION_CHANGED, onChanged);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      window.removeEventListener(ACTIVE_DIVISION_CHANGED, onChanged);
      document.removeEventListener('visibilitychange', read);
    };
  }, []);

  // When division changes, force-refresh inbox queries so the menu/list reflects the new scope.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot });
    queryClient.invalidateQueries({ queryKey: queryKeys.inbox.messagesRoot });
    queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] });
  }, [activeDivisionId, queryClient]);

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const threadVirtuosoRef = useRef<VirtuosoHandle>(null);
  // Scroll tracking refs — mirrors ChatWindow.js pattern exactly.
  const firstGroupKeyRef = useRef<string | null>(null);
  const lastGroupKeyRef = useRef<string | null>(null);
  const prevGroupsLengthRef = useRef(0);
  const firstPageSizeRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  // Track previous selectedLeadId so we can reset scroll refs synchronously
  // in the render body (not in a useEffect) — this guarantees the scroll effect
  // sees prevLen=0 even when react-query has cached data ready immediately.
  const prevLeadIdForScrollRef = useRef<string | null>(null);
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
    if (activeDivisionId) params.divisionId = activeDivisionId;
    return params;
  }, [channelFilter, debouncedSearch, statusFilter, activeDivisionId]);

  const messageQueryParams = useMemo(() => {
    return activeDivisionId ? { divisionId: activeDivisionId } : {};
  }, [activeDivisionId]);

  const threadCacheParams = useMemo(
    () => ({ ...messageQueryParams, limit: INBOX_THREAD_LIMIT }),
    [messageQueryParams]
  );

  const divisionScope = activeDivisionId;

  const fieldConfigQuery = useLeadsFieldConfigQuery(divisionScope);
  const statusLabels = (fieldConfigQuery.data?.statusLabels || {}) as Record<string, string>;
  const getStatusLabel = (status: string): string => statusLabels[status] || status.replace(/_/g, ' ');

  const conversationsQuery = useInboxConversationsQuery(conversationQueryParams as any);
  const threadQuery = useInboxThreadQuery(selectedLeadId, messageQueryParams as any);
  const notesQuery = useInboxNotesQuery(selectedLeadId);
  const attachmentsQuery = useInboxAttachmentsQuery(selectedLeadId);
  const statsQuery = useInboxStatsQuery(divisionScope);
  const { cannedResponses: cannedQuery, pipelineStages: pipelineQuery } = useInboxBootstrapQuery();
  const inboxMutations = useInboxMessageMutations(selectedLeadId);
  const { onCommunicationChanged, onLeadChanged } = useInboxRealtimeInvalidation(selectedLeadId);

  const conversations = (conversationsQuery.data?.conversations || []) as Conversation[];
  const messages = useMemo(() => {
    const pages = threadQuery.data?.pages;
    if (!pages?.length) return [] as Message[];
    return pages
      .slice()
      .reverse()
      .flatMap((p) => (p.messages || []) as Message[]);
  }, [threadQuery.data?.pages]);
  // Synchronously reset scroll-tracking refs when the selected conversation changes.
  // This MUST run in the render body (not in a useEffect) so the scroll effect always
  // sees prevLen=0 for the new conversation, even when react-query returns cached data
  // in the same render cycle as the selectedLeadId change.
  if (prevLeadIdForScrollRef.current !== selectedLeadId) {
    prevLeadIdForScrollRef.current = selectedLeadId;
    prevGroupsLengthRef.current = 0;
    firstGroupKeyRef.current = null;
    lastGroupKeyRef.current = null;
    firstPageSizeRef.current = null;
    shouldScrollToBottomRef.current = false;
  }

  // Derive firstItemIndex from flat messages.length — exactly like ChatWindow.js.
  // When older messages are prepended, firstItemIndex shrinks by the number of new messages,
  // giving Virtuoso the precise count it needs to lock scroll position.
  if (messages.length > 0 && firstPageSizeRef.current === null) {
    firstPageSizeRef.current = messages.length;
  }
  const threadFirstItemIndex = INITIAL_FIRST_ITEM_INDEX - Math.max(0, messages.length - (firstPageSizeRef.current ?? messages.length));

  const leadInfo = (threadQuery.data?.pages?.[0]?.lead ?? null) as LeadInfo | null;
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
  const selectedTemplate = useMemo(
    () => templateOptions.find((t) => t.id === selectedTemplateId) || null,
    [templateOptions, selectedTemplateId]
  );
  const selectedTemplateVarKeys = useMemo(() => {
    if (!selectedTemplate?.components || !Array.isArray(selectedTemplate.components)) return [] as string[];
    const indexes = new Set<number>();
    for (const c of selectedTemplate.components) {
      const text = typeof c?.text === 'string' ? c.text : '';
      const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
      for (const m of matches) indexes.add(Number(m[1]));
    }
    return Array.from(indexes).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b).map((n) => String(n));
  }, [selectedTemplate]);

  const loadingConversations = conversationsQuery.isLoading;
  const loadingMessages = !!selectedLeadId && threadQuery.isPending;

  // Default send channel from the latest loaded server message (skip optimistic rows)
  useEffect(() => {
    if (!messages.length) return;
    const lastServer = [...messages].reverse().find((m) => !m.id?.startsWith('temp-'));
    if (!lastServer) return;
    setSendChannel(
      lastServer.channel === 'CHAT'
        ? lastServer.platform?.toUpperCase() || 'CHAT'
        : lastServer.channel
    );
  }, [messages, selectedLeadId]);

  // Auto-select lead from URL query param (e.g., /inbox?lead=<id>)
  useEffect(() => {
    const leadParam = searchParams.get('lead');
    if (leadParam && !selectedLeadId) {
      setSelectedLeadId(leadParam);
      setMobileView('chat');
    }
  }, [searchParams, selectedLeadId]);

  // Reset all scroll refs when switching conversations.
  useEffect(() => {
    firstGroupKeyRef.current = null;
    lastGroupKeyRef.current = null;
    prevGroupsLengthRef.current = 0;
    firstPageSizeRef.current = null;
    shouldScrollToBottomRef.current = false;
  }, [selectedLeadId]);

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
      await queryClient.invalidateQueries({ queryKey: ['inbox', 'messages', selectedLeadId] });
    } catch (err) {
      console.error('Failed to update stage:', err);
    } finally {
      setUpdatingStage(false);
      setShowStageDropdown(false);
    }
  }, [selectedLeadId, leadInfo, pipelineStages, queryClient]);

  useEffect(() => {
    if (selectedLeadId) setAttachedFiles([]);
  }, [selectedLeadId]);

  // Exact ChatWindow.js scroll pattern — proven production-stable.
  // initialTopMostItemIndex handles initial scroll-to-bottom natively (no JS needed).
  // followOutput={true} handles new-message auto-scroll natively.
  // This effect only fires scrollToIndex for:
  //   (a) initial load (safety belt over initialTopMostItemIndex)
  //   (b) new message at bottom
  //   (c) forced scroll after sending
  // Prepend (load-more) needs NO manual scroll — Virtuoso's firstItemIndex handles it.
  // Native DOM scroll to absolute bottom — the only reliable mechanism
  // for variable-height content that includes images / media.
  const scrollToAbsoluteBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!messages?.length) return;

    const currentLen = messages.length;
    const prevLen = prevGroupsLengthRef.current;
    const firstId = messages[0].id;
    const lastId = messages[currentLen - 1].id;

    const isInitialLoad = prevLen === 0;
    const isNewMessageAtBottom = !isInitialLoad
      && lastId !== lastGroupKeyRef.current
      && firstId === firstGroupKeyRef.current;
    const shouldForceScroll = shouldScrollToBottomRef.current;

    prevGroupsLengthRef.current = currentLen;
    firstGroupKeyRef.current = firstId;
    lastGroupKeyRef.current = lastId;

    // Prepend (load-more): firstItemIndex handles scroll preservation automatically.

    if (isInitialLoad) {
      // Conversation switch / first load.
      // First pass: let Virtuoso render items, then native-scroll to bottom.
      // Second pass: safety net after images/media finish loading.
      const t1 = setTimeout(() => scrollToAbsoluteBottom('auto'), 100);
      const t2 = setTimeout(() => scrollToAbsoluteBottom('auto'), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    if (shouldForceScroll) {
      // After sending — two-pass: immediate then safety net.
      shouldScrollToBottomRef.current = false;
      const t1 = setTimeout(() => scrollToAbsoluteBottom('smooth'), 50);
      const t2 = setTimeout(() => scrollToAbsoluteBottom('auto'), 350);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    if (isNewMessageAtBottom) {
      // Incoming real-time message — two-pass scroll.
      const t1 = setTimeout(() => scrollToAbsoluteBottom('smooth'), 60);
      const t2 = setTimeout(() => scrollToAbsoluteBottom('auto'), 350);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, scrollToAbsoluteBottom]);

  const handleLoadOlderMessages = useCallback(() => {
    if (!threadQuery.hasNextPage || threadQuery.isFetchingNextPage) return;
    threadQuery.fetchNextPage();
  }, [threadQuery]);

  useRealtimeSync(['communication'], useCallback((event) => {
    onCommunicationChanged({
      entityId: event.entityId,
      message: event.message != null && typeof event.message === 'object'
        ? (event.message as Record<string, unknown>)
        : undefined,
    });
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
          q.queryKey[2] === selectedLeadId &&
          q.queryKey[3] === 'thread',
      });
    }
  }, [queryClient, selectedLeadId]));

  const refreshConversationList = useCallback(() => {
    conversationsQuery.refetch();
  }, [conversationsQuery]);

  const scrollThreadToBottomSoon = useCallback(() => {
    requestAnimationFrame(() => {
      if (messages.length > 0) {
        threadVirtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      }
    });
  }, [messages.length]);

  // ─── Send message (optimistic) ──────────────────────────────────
  const handleSend = async () => {
    if ((!messageText.trim() && attachedFiles.length === 0) || !selectedLeadId) return;
    const body = messageText.trim();
    const tempId = `temp-${Date.now()}`;
    const msgKey = queryKeys.inbox.messagesThread(selectedLeadId, threadCacheParams as Record<string, unknown>);

    let channel = sendChannel;
    let platform: string | undefined;
    if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(sendChannel)) {
      channel = 'CHAT';
      platform = sendChannel.toLowerCase();
    }

    const optimisticAttachments =
      attachedFiles.length > 0
        ? attachedFiles.map((f) => ({
            url: null,
            filename: f.name,
            mimeType: f.type || 'application/octet-stream',
            size: f.size || 0,
            _uploading: true,
          }))
        : [];
    const optimisticMsg: Message = {
      id: tempId,
      direction: 'OUTBOUND',
      channel,
      body: body || (optimisticAttachments.length > 0 ? '(no text)' : ''),
      subject: null,
      platform: (platform || sendChannel).toUpperCase(),
      platformInfo: {
        label: PLATFORM_LABELS[sendChannel] || sendChannel,
        color: PLATFORM_COLORS[sendChannel] || '#6366f1',
        icon: '',
      },
      metadata: {
        ...(platform ? { platform } : {}),
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
      },
      createdAt: new Date().toISOString(),
      user: user ? { id: user.id, firstName: user.firstName || 'You', lastName: user.lastName || '' } : null,
      _optimistic: true,
    };
    queryClient.setQueryData(msgKey, (old: any) => {
      if (!old?.pages?.length) {
        return {
          pages: [{ messages: [optimisticMsg], lead: null, pagination: { page: 1, totalPages: 1, hasMore: false } }],
          pageParams: [1],
        };
      }
      const pages = [...old.pages];
      const newest = 0;
      pages[newest] = {
        ...pages[newest],
        messages: [...(pages[newest].messages || []), optimisticMsg],
      };
      return { ...old, pages };
    });

    setMessageText('');
    setSendingCount((v) => v + 1);
    shouldScrollToBottomRef.current = true;

    try {
      const threadParams = threadCacheParams as Record<string, unknown>;
      if (attachedFiles.length > 0) {
        const sent = await inboxMutations.sendMessageWithAttachments.mutateAsync({
          leadId: selectedLeadId,
          channel,
          body,
          platform,
          files: attachedFiles,
        });
        patchInboxThreadAfterOutbound(queryClient, selectedLeadId, threadParams, {
          tempId,
          message: sent,
        });
        setAttachedFiles([]);
      } else {
        const sent = await inboxMutations.sendMessage.mutateAsync({
          leadId: selectedLeadId,
          channel,
          body,
          platform,
        });
        patchInboxThreadAfterOutbound(queryClient, selectedLeadId, threadParams, {
          tempId,
          message: sent,
        });
      }
      shouldScrollToBottomRef.current = true;
      inputRef.current?.focus();
    } catch (err: any) {
      queryClient.setQueryData(msgKey, (old: any) => {
        if (!old?.pages?.length) return old;
        const pages = [...old.pages];
        const newest = 0;
        pages[newest] = {
          ...pages[newest],
          messages: (pages[newest].messages || []).filter((m: Message) => m.id !== tempId),
        };
        return { ...old, pages };
      });
      console.error('Failed to send:', err);
    } finally {
      setSendingCount((v) => Math.max(0, v - 1));
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

  const handleRetryWhatsAppMessage = async (messageId: string) => {
    try {
      await inboxMutations.retryWhatsAppMessage.mutateAsync(messageId);
    } catch (err: any) {
      console.error('Failed to retry WhatsApp message:', err);
    }
  };

  const openTemplateModal = async () => {
    if (!selectedLeadId) return;
    setShowTemplateModal(true);
    setTemplateError('');
    setTemplateSending(false);
    setTemplateVars({});
    setTemplateLoading(true);
    try {
      const list = await api.listWhatsAppTemplates(activeDivisionId || undefined);
      const approved = (list?.templates || []).filter((t: any) => String(t.status || '').toUpperCase() === 'APPROVED');
      setTemplateOptions(approved);
      setSelectedTemplateId(approved[0]?.id || '');
    } catch (err: any) {
      setTemplateError(err?.message || 'Failed to load templates');
      setTemplateOptions([]);
      setSelectedTemplateId('');
    } finally {
      setTemplateLoading(false);
    }
  };

  const sendSelectedTemplate = async () => {
    if (!selectedLeadId || !selectedTemplateId) return;
    setTemplateSending(true);
    setTemplateError('');
    try {
      for (const key of selectedTemplateVarKeys) {
        if (!templateVars[key] || !templateVars[key].trim()) {
          throw new Error(`Variable ${key} is required`);
        }
      }
      const sent = await api.sendInboxWhatsAppTemplateMessage(selectedLeadId, {
        templateId: selectedTemplateId,
        variables: templateVars,
      });
      patchInboxThreadAfterOutbound(queryClient, selectedLeadId, threadCacheParams as Record<string, unknown>, { message: sent });
      setShowTemplateModal(false);
      setTemplateVars({});
    } catch (err: any) {
      setTemplateError(err?.message || 'Failed to send template');
    } finally {
      setTemplateSending(false);
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
    return /^\[(Photo|Video|Voice message|Document|Sticker|Audio|Location)\]$/.test(body.trim()) || body.trim() === '(no text)';
  }

  function isLocationMessage(msg: Message) {
    return msg?.metadata?.mediaType === 'location' || !!msg?.metadata?.location;
  }

  function getGoogleMapsLink(location: any) {
    if (!location) return '';
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return `https://maps.google.com/?q=${lat},${lng}`;
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

        setSendingCount((v) => v + 1);
        try {
          let channel = sendChannel;
          let platform: string | undefined;
          if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(sendChannel)) {
            channel = 'CHAT';
            platform = sendChannel.toLowerCase();
          }
          const sent = await inboxMutations.sendMessageWithAttachments.mutateAsync({
            leadId: selectedLeadId,
            channel,
            body: '',
            platform,
            files: [file],
          });
          patchInboxThreadAfterOutbound(queryClient, selectedLeadId, threadCacheParams as Record<string, unknown>, {
            message: sent,
          });
        } catch (err) {
          console.error('Failed to send voice note:', err);
        } finally {
          setSendingCount((v) => Math.max(0, v - 1));
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
      await queryClient.invalidateQueries({ queryKey: ['inbox', 'messages', selectedLeadId] });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // ─── Insert canned response ───────────────────────────────────────
  const insertCanned = (response: CannedResponse) => {
    setMessageText(response.body);
    setShowQuickRepliesPopover(false);
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
        <div className="flex-1">
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
            <Virtuoso
              style={{ height: '100%' }}
              data={sortedConversations}
              computeItemKey={(_, convo) => convo.leadId}
              overscan={320}
              increaseViewportBy={{ top: 240, bottom: 480 }}
              itemContent={(_, convo) => {
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
              }}
            />
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
            <div className="relative z-10 flex items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5">
              <button className="btn-icon md:hidden -ml-1 flex-shrink-0 rounded-full hover:bg-slate-100" onClick={() => setMobileView('list')}>
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div
                className="h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md ring-2 ring-white"
                style={{ backgroundColor: PLATFORM_COLORS[selectedConvo?.lastMessage?.platform || 'WHATSAPP'] || '#25D366' }}
              >
                {getDisplayInitials(leadInfo?.firstName, leadInfo?.lastName)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15px] font-bold text-slate-900 truncate tracking-tight">
                    {leadInfo ? getDisplayName(leadInfo.firstName, leadInfo.lastName) : 'Loading...'}
                  </h3>
                  {leadInfo?.status === 'NEW' && (
                    <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-700">
                      New
                    </span>
                  )}
                </div>
                {(leadInfo?.company || leadInfo?.email) && (
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {[leadInfo?.company, leadInfo?.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                {leadInfo?.phone && (
                  <a
                    href={`tel:${formatPhone(leadInfo.phone).replace(/\s/g, '')}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="Call"
                  >
                    <Phone className="h-[18px] w-[18px]" />
                  </a>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowChatHeaderMenu((v) => !v)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="More"
                  >
                    <MoreHorizontal className="h-[18px] w-[18px]" />
                  </button>
                  {showChatHeaderMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowChatHeaderMenu(false)} />
                      <div
                        className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            setShowChatHeaderMenu(false);
                            router.push(`/leads/${selectedLeadId}`);
                          }}
                        >
                          <ExternalLink className="h-4 w-4 text-slate-500" />
                          View lead
                        </button>
                        <button
                          type="button"
                          className="hidden w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 lg:flex"
                          onClick={() => {
                            setShowChatHeaderMenu(false);
                            setShowRightPanel((v) => !v);
                          }}
                        >
                          <User className="h-4 w-4 text-slate-500" />
                          {showRightPanel ? 'Hide sidebar' : 'Show sidebar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Messages area (full loading only when no messages yet; refresh in place for real-time feel) ─────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-hidden bg-slate-100/90" onClick={() => { setMenuOpenMsgId(null); setShowQuickRepliesPopover(false); }}>
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
                <>
                <Virtuoso
                  ref={threadVirtuosoRef}
                  style={{ height: '100%' }}
                  data={messages}
                  firstItemIndex={threadFirstItemIndex}
                  initialTopMostItemIndex={INITIAL_FIRST_ITEM_INDEX + messages.length - 1}
                  overscan={600}
                  increaseViewportBy={{ top: 300, bottom: 300 }}
                  atTopThreshold={150}
                  startReached={() => {
                    handleLoadOlderMessages();
                  }}
                  scrollerRef={(el) => {
                    messagesContainerRef.current = (el as HTMLDivElement | null);
                  }}
                  components={{
                    Header: () =>
                      threadQuery.isFetchingNextPage ? (
                        <div className="py-3 text-center text-xs text-text-tertiary">
                          Loading older messages…
                        </div>
                      ) : null,
                    Footer: () => <div className="h-4" />,
                  }}
                  itemContent={(virtualIdx, msg) => {
                    // Map virtual index → data array index to find the previous message.
                    // Use Math.max to guard against any transient mismatch between
                    // firstItemIndex and virtualIdx during load-more transitions.
                    const arrayIdx = Math.max(0, virtualIdx - threadFirstItemIndex);
                    const prevMsg = arrayIdx > 0 && arrayIdx <= messages.length ? messages[arrayIdx - 1] : null;
                    const msgDateKey = new Date(msg.createdAt).toDateString();
                    const prevDateKey = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
                    const showDateSeparator = !prevMsg || msgDateKey !== prevDateKey;
                    // Show platform indicator when platform changes between adjacent messages
                    const showPlatformIndicator = !prevMsg || prevMsg.platform !== msg.platform;

                    const isOutbound = msg.direction === 'OUTBOUND';
                    const isOwnMessage = isOutbound && msg.user?.id === user?.id;
                    const isMenuOpen = menuOpenMsgId === msg.id;
                    const isEditing = editingMsgId === msg.id;
                    const attachmentCount = msg.metadata?.attachments?.length ?? 0;
                    const hasAttachments = attachmentCount > 0;
                    return (
                      <div className="px-3 sm:px-5">
                        {showDateSeparator && (
                          <div className="flex justify-center my-4">
                            <span className="text-2xs font-semibold text-text-tertiary bg-white/90 px-3 py-1 rounded-lg shadow-sm">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
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
                            {showPlatformIndicator && (
                              <div className={`flex items-center gap-1 mb-1 ${isOutbound ? 'justify-end' : ''}`}>
                                <PlatformIcon platform={msg.platform} size={10} />
                                <span className="text-2xs text-text-tertiary font-medium">
                                  {msg.platformInfo?.label || msg.channel}
                                </span>
                              </div>
                            )}

                            {/* Message card */}
                            <div className="relative group/bubble">
                              <div
                                className={`relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-[13px] leading-relaxed text-slate-900 shadow-sm ${
                                  isOutbound ? 'rounded-tr-md' : 'rounded-tl-md'
                                } ${msg._optimistic ? 'opacity-70' : ''}`}
                              >
                                {!msg.isDeleted && !isEditing && (
                                  <div className="px-3.5 pt-2.5 pb-1">
                                    {isOutbound && msg.user && (
                                      <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                                        {getDisplayName(msg.user.firstName, msg.user.lastName)}
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-100" title="Active" />
                                      </p>
                                    )}
                                    {!isOutbound && (
                                      <p className="mb-0.5 text-xs font-semibold text-slate-700">
                                        {getDisplayName(leadInfo?.firstName, leadInfo?.lastName)}
                                      </p>
                                    )}
                                    {(msg.metadata?.referral || msg.metadata?.adReferral) && (
                                      <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                        <Zap className="h-3 w-3" />
                                        Ad Message
                                      </div>
                                    )}
                                  </div>
                                )}

                                {msg.isDeleted ? (
                                  <div className="flex items-center gap-1 px-3.5 py-3 text-sm italic text-slate-400">
                                    <Ban className="h-3.5 w-3.5" />
                                    This message was deleted
                                  </div>
                                ) : isEditing ? (
                                  <div className="space-y-1.5 px-3.5 pb-3">
                                    <textarea
                                      ref={editInputRef}
                                      value={editingBody}
                                      onChange={(e) => setEditingBody(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMessage(msg.id); }
                                        if (e.key === 'Escape') { setEditingMsgId(null); setEditingBody(''); }
                                      }}
                                      className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                                      rows={2}
                                    />
                                    <div className="flex justify-end gap-1">
                                      <button type="button" onClick={() => { setEditingMsgId(null); setEditingBody(''); }} className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700">Cancel</button>
                                      <button type="button" onClick={() => handleEditMessage(msg.id)} className="rounded bg-brand-600 px-2 py-0.5 text-xs text-white hover:bg-brand-700" disabled={!editingBody.trim()}>Save</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {msg.subject && (
                                      <p className="px-3.5 text-2xs font-bold text-slate-500">
                                        Re: {msg.subject}
                                      </p>
                                    )}
                                    {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                                      <div className="space-y-1.5">
                                        {msg.metadata.attachments.map((att: any, ai: number) => {
                                          const url = att.url
                                            ? att.url.startsWith('http') ? att.url : `/api${att.url}`
                                            : null;
                                          if (!url) {
                                            return (
                                              <div
                                                key={ai}
                                                className="mx-3.5 flex min-w-[220px] max-w-[320px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                                              >
                                                <span className="flex-shrink-0 text-lg">{getFileIcon(att.mimeType)}</span>
                                                <div className="min-w-0 flex-1">
                                                  <p className="truncate text-2xs font-medium text-slate-800">
                                                    {att.filename || 'Attachment'}
                                                  </p>
                                                  <p className="text-2xs text-slate-500">
                                                    {att.size ? formatFileSize(att.size) : ''} {att._uploading ? 'Uploading…' : ''}
                                                  </p>
                                                </div>
                                              </div>
                                            );
                                          }

                                          if (isImageOrSticker(att.mimeType)) {
                                            return (
                                              <a key={ai} href={url} target="_blank" rel="noopener noreferrer" className="block bg-slate-100">
                                                <img
                                                  src={url}
                                                  alt={att.filename || 'Image'}
                                                  className="max-h-[300px] w-full cursor-pointer object-contain"
                                                  loading="lazy"
                                                />
                                              </a>
                                            );
                                          }

                                          if (isAudioFile(att.mimeType)) {
                                            return (
                                              <div key={ai} className="mx-3.5 flex min-w-[200px] max-w-[300px] items-center gap-2">
                                                <audio controls preload="none" className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent">
                                                  <source src={url} type={att.mimeType} />
                                                </audio>
                                              </div>
                                            );
                                          }

                                          if (isVideoFile(att.mimeType)) {
                                            return (
                                              <div key={ai} className="mx-3.5 max-w-[300px]">
                                                <video
                                                  controls
                                                  preload="metadata"
                                                  className="max-h-[240px] w-full rounded-lg"
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
                                              className="mx-3.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 transition-colors hover:bg-slate-100"
                                            >
                                              <span className="flex-shrink-0 text-lg">{getFileIcon(att.mimeType)}</span>
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate text-2xs font-medium text-slate-800">{att.filename}</p>
                                                <p className="text-2xs text-slate-500">{formatFileSize(att.size)}</p>
                                              </div>
                                              <Download className="h-3 w-3 flex-shrink-0 text-slate-400" />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {isLocationMessage(msg) && (
                                      <div className="mx-3.5 mb-1 min-w-[220px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                                          Location
                                        </div>
                                        {msg.metadata?.location?.name ? (
                                          <p className="mt-1 text-xs text-slate-700">{msg.metadata.location.name}</p>
                                        ) : null}
                                        {msg.metadata?.location?.address ? (
                                          <p className="mt-0.5 text-2xs text-slate-500">{msg.metadata.location.address}</p>
                                        ) : null}
                                        {getGoogleMapsLink(msg.metadata?.location) ? (
                                          <a
                                            href={getGoogleMapsLink(msg.metadata?.location)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-blue-600 hover:text-blue-700"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            Open in Maps
                                          </a>
                                        ) : null}
                                      </div>
                                    )}

                                    {msg.body && !(msg.metadata?.attachments?.length > 0 && isMediaPlaceholderBody(msg.body)) && (
                                      <p className={`whitespace-pre-wrap break-words px-3.5 ${hasAttachments || isLocationMessage(msg) ? 'pb-2 pt-1' : 'pb-1'}`}>{msg.body}</p>
                                    )}

                                    {!isEditing && !msg.isDeleted && !hasAttachments && (
                                      <div className="flex items-center justify-end gap-1 border-t border-slate-100/80 px-3.5 py-2">
                                        {msg.isEdited && (
                                          <span className="text-[10px] italic text-slate-400">edited</span>
                                        )}
                                        <span className="text-[10px] text-slate-400">
                                          {formatTime(msg.createdAt)}
                                        </span>
                                        {isOutbound && (
                                          <>
                                            {msg._optimistic ? (
                                              <Check className="h-3 w-3 text-slate-400" />
                                            ) : msg.channel === 'WHATSAPP' ? (
                                              (() => {
                                                const waStatusRaw = msg.metadata?.waStatus ?? msg.metadata?.waStatusRaw;
                                                const waStatus =
                                                  typeof waStatusRaw === 'string' ? waStatusRaw.toUpperCase() : '';

                                                if (waStatus === 'READ') return <CheckCheck className="h-3 w-3 text-blue-500" />;
                                                if (waStatus === 'DELIVERED')
                                                  return <CheckCheck className="h-3 w-3 text-slate-400" />;
                                                if (waStatus === 'SENT') return <Check className="h-3 w-3 text-slate-400" />;
                                                if (waStatus === 'FAILED') return <AlertCircle className="h-3 w-3 text-red-500" />;
                                                return <CheckCheck className="h-3 w-3 text-blue-500" />;
                                              })()
                                            ) : (
                                              <CheckCheck className="h-3 w-3 text-blue-500" />
                                            )}
                                          </>
                                        )}
                                        {isOutbound && msg.channel === 'WHATSAPP' && (() => {
                                          const waStatusRaw = msg.metadata?.waStatus ?? msg.metadata?.waStatusRaw;
                                          const waStatus = typeof waStatusRaw === 'string' ? waStatusRaw.toUpperCase() : '';
                                          if (waStatus !== 'FAILED') return null;
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => handleRetryWhatsAppMessage(msg.id)}
                                              className="ml-1 text-[10px] text-red-600 underline hover:text-red-700"
                                              disabled={inboxMutations.retryWhatsAppMessage.isPending}
                                              title="Retry WhatsApp send"
                                            >
                                              Retry
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {!isEditing && !msg.isDeleted && hasAttachments && (
                                      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 px-3 py-2 text-[11px] font-medium text-white">
                                        <span>
                                          [{attachmentCount} attachment{attachmentCount !== 1 ? 's' : ''}]
                                        </span>
                                        <span className="flex flex-shrink-0 items-center gap-1">
                                          {msg.isEdited && (
                                            <span className="text-[10px] italic text-white/80">edited</span>
                                          )}
                                          <span className="tabular-nums text-white/95">{formatTime(msg.createdAt)}</span>
                                          {isOutbound && (
                                            <>
                                              {msg._optimistic ? (
                                                <Check className="h-3 w-3 text-white/80" />
                                              ) : msg.channel === 'WHATSAPP' ? (
                                                (() => {
                                                  const waStatusRaw = msg.metadata?.waStatus ?? msg.metadata?.waStatusRaw;
                                                  const waStatus =
                                                    typeof waStatusRaw === 'string' ? waStatusRaw.toUpperCase() : '';

                                                  if (waStatus === 'READ') return <CheckCheck className="h-3 w-3 text-sky-200" />;
                                                  if (waStatus === 'DELIVERED')
                                                    return <CheckCheck className="h-3 w-3 text-white/70" />;
                                                  if (waStatus === 'SENT') return <Check className="h-3 w-3 text-white/70" />;
                                                  if (waStatus === 'FAILED') return <AlertCircle className="h-3 w-3 text-amber-200" />;
                                                  return <CheckCheck className="h-3 w-3 text-sky-200" />;
                                                })()
                                              ) : (
                                                <CheckCheck className="h-3 w-3 text-sky-200" />
                                              )}
                                            </>
                                          )}
                                          {isOutbound && msg.channel === 'WHATSAPP' && (() => {
                                            const waStatusRaw = msg.metadata?.waStatus ?? msg.metadata?.waStatusRaw;
                                            const waStatus = typeof waStatusRaw === 'string' ? waStatusRaw.toUpperCase() : '';
                                            if (waStatus !== 'FAILED') return null;
                                            return (
                                              <button
                                                type="button"
                                                onClick={() => handleRetryWhatsAppMessage(msg.id)}
                                                className="ml-1 text-[10px] font-semibold text-white underline hover:text-white/90"
                                                disabled={inboxMutations.retryWhatsAppMessage.isPending}
                                                title="Retry WhatsApp send"
                                              >
                                                Retry
                                              </button>
                                            );
                                          })()}
                                        </span>
                                      </div>
                                    )}
                                  </>
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
                      </div>
                    );
                  }}
                />
              </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Message composer ───────────────────────────────────── */}
            <div
              className={`border-t border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 transition-colors ${isDragging ? 'border-emerald-300 bg-emerald-50/40' : ''}`}
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

              <div className="relative px-4 pb-3 pt-2.5">
                {showQuickRepliesPopover && (
                  <>
                    <div className="fixed inset-0 z-[35]" onClick={() => setShowQuickRepliesPopover(false)} />
                    <div className="absolute bottom-full left-0 right-0 z-[45] mb-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:left-auto sm:right-0 sm:w-[min(100%,360px)]">
                      <p className="px-2 py-1.5 text-2xs font-bold uppercase tracking-wider text-slate-400">Quick replies</p>
                      {cannedResponses.length === 0 ? (
                        <p className="px-2 py-4 text-center text-xs text-slate-500">No quick replies configured</p>
                      ) : (
                        <div className="space-y-1">
                          {cannedResponses.map((cr) => (
                            <button
                              key={cr.id}
                              type="button"
                              onClick={() => insertCanned(cr)}
                              className="w-full rounded-xl border border-transparent p-3 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
                            >
                              <span className="text-xs font-semibold text-slate-800">{cr.title}</span>
                              <p className="mt-0.5 line-clamp-2 text-2xs text-slate-500">{cr.body}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

              {/* Channel bar */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickRepliesPopover(false);
                      setShowChannelPicker(!showChannelPicker);
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-2xs font-semibold shadow-sm transition-colors hover:bg-slate-50"
                    style={{ color: PLATFORM_COLORS[sendChannel] || '#6366f1' }}
                  >
                    <PlatformIcon platform={sendChannel} size={12} />
                    {PLATFORM_LABELS[sendChannel]?.split(' ')[0] || sendChannel}
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </button>

                  {showChannelPicker && (
                    <>
                      <div className="fixed inset-0 z-[35]" onClick={() => setShowChannelPicker(false)} />
                      <div className="absolute bottom-full left-0 z-[45] mb-1.5 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
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
                {sendChannel === 'WHATSAPP' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickRepliesPopover(false);
                      openTemplateModal();
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-2xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Template
                  </button>
                )}

                <div className="min-w-[8px] flex-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowChannelPicker(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-2xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                  title="Attach files"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Attach</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowChannelPicker(false);
                    setShowQuickRepliesPopover((v) => !v);
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-2xs font-medium transition-colors ${
                    showQuickRepliesPopover ? 'bg-violet-100 text-violet-800' : 'text-slate-500 hover:bg-white hover:text-violet-700'
                  }`}
                  title="Quick replies"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Quick Replies</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowChannelPicker(false);
                    setShowQuickRepliesPopover(false);
                    setShowRightPanel(true);
                    setRightTab('notes');
                  }}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-2xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-amber-700"
                  title="Internal notes"
                >
                  <StickyNote className="h-3.5 w-3.5" />
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
              <div className="flex items-end gap-2">
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
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-800"
                      title="Attach file"
                    >
                      <Paperclip className="h-[18px] w-[18px]" />
                    </button>
                    <textarea
                      ref={inputRef}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message via ${PLATFORM_LABELS[sendChannel] || sendChannel}...`}
                      rows={1}
                      className="min-h-[44px] max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                      onInput={(e) => {
                        const el = e.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 112) + 'px';
                      }}
                    />
                    {!messageText.trim() && attachedFiles.length === 0 ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                        title="Record voice note"
                      >
                        <Mic className="h-[18px] w-[18px]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={(!messageText.trim() && attachedFiles.length === 0)}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-md transition-all disabled:opacity-40 disabled:shadow-none"
                        style={{
                          background: `linear-gradient(135deg, ${PLATFORM_COLORS[sendChannel] || '#6366f1'} 0%, #a855f7 100%)`,
                        }}
                        title="Send"
                      >
                        {sendingCount > 0 ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Send className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
              </div>
            </div>
            {showTemplateModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-border">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-text-primary">Send WhatsApp template</h3>
                    <button type="button" onClick={() => setShowTemplateModal(false)} className="btn-icon">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {templateLoading ? (
                      <p className="text-sm text-text-tertiary">Loading templates...</p>
                    ) : (
                      <>
                        <div>
                          <label className="label">Template</label>
                          <select
                            className="input"
                            value={selectedTemplateId}
                            onChange={(e) => {
                              setSelectedTemplateId(e.target.value);
                              setTemplateVars({});
                            }}
                          >
                            <option value="">Select template</option>
                            {templateOptions.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.language})
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedTemplateVarKeys.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-text-tertiary">
                              Fill template variables:
                            </p>
                            {selectedTemplateVarKeys.map((key) => (
                              <div key={key}>
                                <label className="label">Variable {key}</label>
                                <input
                                  className="input"
                                  value={templateVars[key] || ''}
                                  onChange={(e) => setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`Value for {{${key}}}`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {templateError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {templateError}
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <button type="button" onClick={() => setShowTemplateModal(false)} className="btn-secondary">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={sendSelectedTemplate}
                            className="btn-primary"
                            disabled={!selectedTemplateId || templateSending}
                          >
                            {templateSending ? 'Sending...' : 'Send template'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RIGHT: Lead sidebar (Contact / Notes / Files)                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selectedLeadId && showRightPanel && leadInfo && (
        <div className="hidden lg:flex min-w-[300px] max-w-[400px] w-[min(100%,380px)] flex-shrink-0 flex-col overflow-hidden border-l border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80">
          <div className="flex gap-1 border-b border-slate-200/80 bg-white px-3 py-3">
            {([
              { key: 'info' as const, label: 'Contact' },
              { key: 'notes' as const, label: 'Notes' },
              { key: 'attachments' as const, label: 'Files' },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRightTab(tab.key)}
                className={`flex-1 rounded-full px-3 py-2 text-center text-2xs font-semibold transition-all ${
                  rightTab === tab.key
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── Contact Info Tab ──────────────────────────────────── */}
            {rightTab === 'info' && (
              <div className="flex h-full flex-col p-4">
                <div className="mb-5 flex flex-col items-center text-center">
                  <div
                    className="mb-3 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg ring-4 ring-white"
                    style={{ backgroundColor: PLATFORM_COLORS[selectedConvo?.lastMessage?.platform || 'WHATSAPP'] || '#25D366' }}
                  >
                    {getDisplayInitials(leadInfo.firstName, leadInfo.lastName)}
                  </div>
                  <p className="text-base font-bold text-slate-900">
                    {getDisplayName(leadInfo.firstName, leadInfo.lastName)}
                  </p>
                  {leadInfo.jobTitle && (
                    <p className="mt-0.5 text-xs text-slate-500">{leadInfo.jobTitle}</p>
                  )}
                  {leadInfo.company && (
                    <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-slate-600">
                      <Building2 className="h-3 w-3 shrink-0" /> {leadInfo.company}
                    </p>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-pink-100 bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-900">
                    <TrendingUp className="h-3.5 w-3.5 text-pink-600" />
                    Score: {leadInfo.score}/100
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/leads/${leadInfo.id}`)}
                    className="mt-2 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800"
                  >
                    View Lead Details →
                  </button>
                </div>

                <div className="mb-4 space-y-0.5">
                  <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-slate-400">Contact details</p>
                  {[
                    { icon: Mail, label: 'Email', value: leadInfo.email },
                    { icon: Phone, label: 'Phone', value: formatPhone(leadInfo.phone) },
                    { icon: Building2, label: 'Company', value: leadInfo.company },
                    { icon: Briefcase, label: 'Job Title', value: leadInfo.jobTitle },
                  ].filter(d => d.value).map(d => (
                    <div key={d.label} className="group/detail flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white">
                      <d.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs text-slate-400">{d.label}</p>
                        <p className="truncate text-xs font-medium text-slate-800">{d.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(d.value || '')}
                        className="opacity-0 transition-opacity group-hover/detail:opacity-100"
                        title="Copy"
                      >
                        <Copy className="h-3 w-3 text-slate-400" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="my-3 h-px bg-slate-200/80" />

                <div className="min-h-0 flex-1 space-y-0.5">
                  <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-slate-400">Lead properties</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative col-span-2 rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60">
                      <p className="mb-1 text-2xs text-slate-500">Status</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStageDropdown(false);
                          setShowStatusDropdown(!showStatusDropdown);
                        }}
                        className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold ${
                          leadInfo.status === 'NEW'
                            ? 'bg-pink-100 text-pink-800'
                            : `${STATUS_COLORS[leadInfo.status]?.bg || 'bg-slate-100'} ${STATUS_COLORS[leadInfo.status]?.text || 'text-slate-700'}`
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLORS[leadInfo.status]?.dot || 'bg-slate-500'}`} />
                        <span className="truncate">{getStatusLabel(leadInfo.status || 'NEW')}</span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                      </button>
                      {showStatusDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
                          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                            {Object.entries(STATUS_COLORS).map(([status, style]) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => handleStatusUpdate(status)}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                                  leadInfo.status === status ? 'bg-slate-50 font-medium' : ''
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                                {getStatusLabel(status)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="col-span-2 rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60">
                      <p className="mb-1 text-2xs text-slate-500">Activity</p>
                      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200/80 bg-pink-50 px-2.5 py-0.5 text-2xs font-medium text-pink-900">
                        <Star className="h-3 w-3 text-pink-600" />
                        {leadInfo.stage?.name || getStatusLabel(leadInfo.status || 'NEW')}
                      </span>
                    </div>

                    <div className={`relative rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60 ${leadInfo.budget > 0 ? '' : 'col-span-2'}`}>
                      <p className="mb-1 text-2xs text-slate-500">Stage</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStatusDropdown(false);
                          setShowStageDropdown(!showStageDropdown);
                        }}
                        disabled={updatingStage}
                        className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-semibold text-white"
                        style={{ backgroundColor: leadInfo.stage?.color || '#6366f1' }}
                      >
                        {updatingStage ? '...' : (leadInfo.stage?.name || 'No stage')}
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      </button>
                      {showStageDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowStageDropdown(false)} />
                          <div className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[160px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                            {pipelineStages.map((stage) => (
                              <button
                                key={stage.id}
                                type="button"
                                onClick={() => handleStageChange(stage.id)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${leadInfo.stage?.id === stage.id ? 'font-bold' : ''}`}
                              >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color || '#6366f1' }} />
                                {stage.name}
                                {leadInfo.stage?.id === stage.id && <Check className="ml-auto h-3 w-3 text-violet-600" />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {leadInfo.budget > 0 && (
                      <div className="rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60">
                        <p className="mb-1 text-2xs text-slate-500">Budget</p>
                        <p className="text-xs font-bold text-emerald-600">${leadInfo.budget.toLocaleString()}</p>
                      </div>
                    )}

                    <div className="rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60">
                      <p className="mb-1 text-2xs text-slate-500">Source</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-800">
                        {(leadInfo.source || '—').replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-slate-200/60">
                      <p className="mb-1 text-2xs text-slate-500">Created</p>
                      <p className="text-xs font-medium text-slate-800">
                        {new Date(leadInfo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {leadInfo.assignedTo && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-200 text-2xs font-bold text-violet-800">
                        {getDisplayInitials(leadInfo.assignedTo.firstName, leadInfo.assignedTo.lastName)}
                      </div>
                      <div>
                        <p className="text-2xs text-slate-500">Assigned to</p>
                        <p className="text-xs font-medium text-slate-800">
                          {getDisplayName(leadInfo.assignedTo.firstName, leadInfo.assignedTo.lastName)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto shrink-0 pt-4">
                  <button
                    type="button"
                    onClick={() => router.push(`/leads/${selectedLeadId}`)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-95"
                    style={{
                      background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 45%, #ec4899 100%)',
                    }}
                  >
                    Open Full Profile
                  </button>
                </div>
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
                    {leadAttachments.map((att: any) => {
                      const attUrl = att.url
                        ? att.url.startsWith('http') ? att.url : `/api${att.url}`
                        : '#';
                      return (
                      <a
                        key={att.id}
                        href={attUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50/20 transition-all group/att"
                      >
                        {isImageFile(att.mimeType) ? (
                          <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-tertiary">
                            <img
                              src={attUrl}
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
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
