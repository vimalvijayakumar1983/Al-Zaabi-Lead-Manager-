'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from 'react';
import { useRouter } from 'next/navigation';
import { useNotificationStore } from '@/store/notificationStore';
import type { AppNotification, NotificationType } from '@/types';
import {
  Bell,
  BellOff,
  UserPlus,
  UserCheck,
  Trophy,
  XCircle,
  RefreshCw,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Megaphone,
  Flag,
  Plug,
  AlertOctagon,
  Upload,
  Building2,
  Info,
  Check,
  CheckCheck,
  Archive,
  Trash2,
  X,
  Settings,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  Inbox,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIFICATION_PAGE_SIZE = 20;

/** Filter tab definitions */
type FilterTab = 'all' | 'unread' | 'leads' | 'tasks' | 'system';

interface TabDefinition {
  key: FilterTab;
  label: string;
  /** Notification type prefixes to match, or undefined for all */
  matcher?: (n: AppNotification) => boolean;
}

const FILTER_TABS: TabDefinition[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread', matcher: (n) => !n.isRead },
  {
    key: 'leads',
    label: 'Leads',
    matcher: (n) =>
      n.type.startsWith('LEAD_') || n.type.startsWith('PIPELINE_'),
  },
  {
    key: 'tasks',
    label: 'Tasks',
    matcher: (n) => n.type.startsWith('TASK_'),
  },
  {
    key: 'system',
    label: 'System',
    matcher: (n) =>
      n.type.startsWith('SYSTEM_') ||
      n.type.startsWith('INTEGRATION_') ||
      n.type.startsWith('IMPORT_') ||
      n.type.startsWith('DIVISION_') ||
      n.type.startsWith('TEAM_') ||
      n.type.startsWith('CAMPAIGN_') ||
      n.type.startsWith('AUTOMATION_'),
  },
];

// ─── Icon mapping ─────────────────────────────────────────────────────────────

interface NotificationIconDef {
  icon: LucideIcon;
  color: string;
  bg: string;
}

const notificationIcons: Record<string, NotificationIconDef> = {
  LEAD_CREATED: { icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50' },
  LEAD_ASSIGNED: {
    icon: UserCheck,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  LEAD_WON: { icon: Trophy, color: 'text-green-600', bg: 'bg-green-50' },
  LEAD_LOST: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  LEAD_STATUS_CHANGED: {
    icon: RefreshCw,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  LEAD_SCORE_CHANGED: {
    icon: ArrowRight,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  TASK_ASSIGNED: {
    icon: ClipboardList,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  TASK_COMPLETED: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  TASK_DUE_SOON: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  TASK_OVERDUE: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  PIPELINE_STAGE_CHANGED: {
    icon: ArrowRight,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
  },
  CAMPAIGN_STARTED: {
    icon: Megaphone,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  CAMPAIGN_COMPLETED: {
    icon: Flag,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  CAMPAIGN_BUDGET_ALERT: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  INTEGRATION_CONNECTED: {
    icon: Plug,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  INTEGRATION_ERROR: {
    icon: AlertOctagon,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  INTEGRATION_LEAD_RECEIVED: {
    icon: UserPlus,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  TEAM_MEMBER_INVITED: {
    icon: UserPlus,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  TEAM_MEMBER_ROLE_CHANGED: {
    icon: RefreshCw,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  TEAM_MEMBER_DEACTIVATED: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  IMPORT_COMPLETED: {
    icon: Upload,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  IMPORT_FAILED: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  DIVISION_CREATED: {
    icon: Building2,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  DIVISION_USER_TRANSFERRED: {
    icon: ArrowRight,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  AUTOMATION_TRIGGERED: {
    icon: RefreshCw,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  AUTOMATION_ERROR: {
    icon: AlertOctagon,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  SYSTEM_ANNOUNCEMENT: {
    icon: Info,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  },
};

const defaultIconDef: NotificationIconDef = {
  icon: Bell,
  color: 'text-gray-600',
  bg: 'bg-gray-50',
};

function getNotificationIcon(type: NotificationType): NotificationIconDef {
  return notificationIcons[type] || defaultIconDef;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date string into a human-readable relative timestamp. */
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/** Classify a date into a group label for sectioning. */
function getDateGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'This Week';
  return 'Older';
}

/** Group notifications by date section, preserving order. */
function groupByDate(
  notifications: AppNotification[]
): { label: string; items: AppNotification[] }[] {
  const groups: { label: string; items: AppNotification[] }[] = [];
  const seenLabels = new Set<string>();

  for (const notif of notifications) {
    const label = getDateGroup(notif.createdAt);
    if (!seenLabels.has(label)) {
      seenLabels.add(label);
      groups.push({ label, items: [] });
    }
    groups.find((g) => g.label === label)!.items.push(notif);
  }
  return groups;
}

/** Build entity navigation path from notification metadata. */
function getEntityPath(n: AppNotification): string | null {
  if (!n.entityType || !n.entityId) return null;
  switch (n.entityType) {
    case 'lead':
      return `/leads/${n.entityId}`;
    case 'task':
      return `/tasks`;
    case 'pipeline':
      return `/pipeline`;
    case 'campaign':
      return `/campaigns`;
    case 'import':
      return `/import`;
    case 'integration':
      return `/settings`;
    case 'team':
      return `/team`;
    case 'division':
      return `/divisions`;
    default:
      return null;
  }
}

/** Generate initials from actor name. */
function getActorInitials(actor?: AppNotification['actor']): string {
  if (!actor) return '?';
  const first = actor.firstName?.[0] || '';
  const last = actor.lastName?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Skeleton placeholder for loading state. */
function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-pulse">
      <div className="h-9 w-9 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-32 rounded bg-gray-200" />
          <div className="h-3 w-12 rounded bg-gray-100 ml-auto" />
        </div>
        <div className="h-3 w-48 rounded bg-gray-100" />
      </div>
    </div>
  );
}

/** Individual notification item. */
interface NotificationItemProps {
  notification: AppNotification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (n: AppNotification) => void;
}

function NotificationItem({
  notification,
  onRead,
  onArchive,
  onDelete,
  onClick,
}: NotificationItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const iconDef = getNotificationIcon(notification.type);
  const IconComponent = iconDef.icon;
  const hasActor = !!notification.actor;

  const handleArchive = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRemoving(true);
      setTimeout(() => onArchive(notification.id), 200);
    },
    [notification.id, onArchive]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRemoving(true);
      setTimeout(() => onDelete(notification.id), 200);
    },
    [notification.id, onDelete]
  );

  const handleRead = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRead(notification.id);
    },
    [notification.id, onRead]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(notification);
        }
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`
        group relative flex items-start gap-3 px-4 py-3 cursor-pointer
        transition-all duration-200 ease-out
        ${isRemoving ? 'opacity-0 translate-x-4 max-h-0 py-0 overflow-hidden' : 'opacity-100 translate-x-0 max-h-40'}
        ${notification.isRead ? 'bg-transparent hover:bg-surface-secondary/60' : 'bg-brand-500/[0.04] hover:bg-brand-500/[0.08]'}
      `}
    >
      {/* Unread indicator */}
      {!notification.isRead && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
          <span className="block h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-brand-500/20" />
        </div>
      )}

      {/* Icon / Avatar */}
      <div className="shrink-0 pt-0.5">
        {hasActor && notification.actor?.avatar ? (
          <img
            src={notification.actor.avatar}
            alt={`${notification.actor.firstName} ${notification.actor.lastName}`}
            className="h-9 w-9 rounded-xl object-cover ring-1 ring-border-subtle"
          />
        ) : hasActor ? (
          <div
            className={`h-9 w-9 rounded-xl ${iconDef.bg} flex items-center justify-center ring-1 ring-black/5`}
          >
            <span className={`text-xs font-semibold ${iconDef.color}`}>
              {getActorInitials(notification.actor)}
            </span>
          </div>
        ) : (
          <div
            className={`h-9 w-9 rounded-xl ${iconDef.bg} flex items-center justify-center ring-1 ring-black/5`}
          >
            <IconComponent className={`h-4 w-4 ${iconDef.color}`} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-[13px] leading-snug line-clamp-1 ${
              notification.isRead
                ? 'font-medium text-text-secondary'
                : 'font-semibold text-text-primary'
            }`}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0 pt-px">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p className="text-[12px] text-text-tertiary leading-relaxed line-clamp-2 mt-0.5">
          {notification.message}
        </p>
      </div>

      {/* Hover actions */}
      <div
        className={`
          absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5
          transition-all duration-150 ease-out
          ${showActions ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1 pointer-events-none'}
        `}
      >
        {!notification.isRead && (
          <button
            onClick={handleRead}
            title="Mark as read"
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={handleArchive}
          title="Archive"
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          title="Delete"
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-text-tertiary hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Empty state illustration. */
function EmptyState({
  variant,
}: {
  variant: 'no-notifications' | 'all-caught-up' | 'no-match';
}) {
  if (variant === 'all-caught-up') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
        <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <PartyPopper className="h-7 w-7 text-green-500" />
        </div>
        <p className="text-sm font-semibold text-text-primary mb-1">
          All caught up! 🎉
        </p>
        <p className="text-xs text-text-tertiary max-w-[220px]">
          You&apos;ve read all your notifications. We&apos;ll let you know when
          something new arrives.
        </p>
      </div>
    );
  }

  if (variant === 'no-match') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
        <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <Inbox className="h-7 w-7 text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-text-primary mb-1">
          No matching notifications
        </p>
        <p className="text-xs text-text-tertiary max-w-[220px]">
          There are no notifications in this category right now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="h-14 w-14 rounded-2xl bg-surface-secondary flex items-center justify-center mb-4">
        <BellOff className="h-7 w-7 text-text-tertiary" />
      </div>
      <p className="text-sm font-semibold text-text-primary mb-1">
        No notifications yet
      </p>
      <p className="text-xs text-text-tertiary max-w-[220px]">
        When you receive notifications, they&apos;ll show up here. Stay tuned!
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLButtonElement>;
}

export default function NotificationCenter({
  isOpen,
  onClose,
}: NotificationCenterProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Store
  const {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    deleteNotification,
  } = useNotificationStore();

  // Local state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // ── Mount/unmount animation ───────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // ── Fetch on open ─────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && !hasLoadedOnce) {
      fetchNotifications({ limit: NOTIFICATION_PAGE_SIZE, page: 1 });
      setHasLoadedOnce(true);
      setPage(1);
      setHasMore(true);
    }
  }, [isOpen, hasLoadedOnce, fetchNotifications]);

  // ── Re-fetch when tab changes ─────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const tabDef = FILTER_TABS.find((t) => t.key === activeTab);

    // For 'unread', fetch with isRead=false; for others just client-side filter
    if (activeTab === 'unread') {
      fetchNotifications({ isRead: false, limit: NOTIFICATION_PAGE_SIZE, page: 1 });
    } else if (activeTab === 'all') {
      fetchNotifications({ limit: NOTIFICATION_PAGE_SIZE, page: 1 });
    }
    // For category tabs (leads/tasks/system) we filter client-side
    setPage(1);
    setHasMore(true);
    // Scroll to top
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, isOpen, fetchNotifications]);

  // ── Click outside to close ────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay listener to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ── Keyboard escape ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Filtered notifications ────────────────────────────────────────────

  const filteredNotifications = useMemo(() => {
    const tabDef = FILTER_TABS.find((t) => t.key === activeTab);
    if (!tabDef || !tabDef.matcher) return notifications;
    return notifications.filter(tabDef.matcher);
  }, [notifications, activeTab]);

  const groupedNotifications = useMemo(
    () => groupByDate(filteredNotifications),
    [filteredNotifications]
  );

  // ── Tab counts ────────────────────────────────────────────────────────

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: notifications.length,
      unread: notifications.filter((n) => !n.isRead).length,
      leads: notifications.filter(
        (n) => n.type.startsWith('LEAD_') || n.type.startsWith('PIPELINE_')
      ).length,
      tasks: notifications.filter((n) => n.type.startsWith('TASK_')).length,
      system: notifications.filter(
        (n) =>
          n.type.startsWith('SYSTEM_') ||
          n.type.startsWith('INTEGRATION_') ||
          n.type.startsWith('IMPORT_') ||
          n.type.startsWith('DIVISION_') ||
          n.type.startsWith('TEAM_') ||
          n.type.startsWith('CAMPAIGN_') ||
          n.type.startsWith('AUTOMATION_')
      ).length,
    };
    return counts;
  }, [notifications]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAll(true);
    await markAllAsRead();
    setIsMarkingAll(false);
  }, [markAllAsRead]);

  const handleNotificationClick = useCallback(
    (n: AppNotification) => {
      // Mark as read if unread
      if (!n.isRead) {
        markAsRead(n.id);
      }
      // Navigate to entity
      const path = getEntityPath(n);
      if (path) {
        router.push(path);
        onClose();
      }
    },
    [markAsRead, router, onClose]
  );

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      await fetchNotifications({
        limit: NOTIFICATION_PAGE_SIZE,
        page: nextPage,
        ...(activeTab === 'unread' ? { isRead: false } : {}),
      });
      setPage(nextPage);
      // If fewer results than page size, we've reached the end
      // We rely on the store updating `notifications`; if the count hasn't grown much, stop
    } catch {
      // Ignore
    }
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, page, fetchNotifications, activeTab]);

  const handleViewAll = useCallback(() => {
    router.push('/settings?tab=notifications');
    onClose();
  }, [router, onClose]);

  const handleSettings = useCallback(() => {
    router.push('/settings?tab=notification-preferences');
    onClose();
  }, [router, onClose]);

  // ── Infinite scroll detection ─────────────────────────────────────────

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !isOpen) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      if (scrollHeight - scrollTop - clientHeight < 80 && hasMore && !isLoadingMore) {
        handleLoadMore();
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [isOpen, hasMore, isLoadingMore, handleLoadMore]);

  // ── Don't render if not open ──────────────────────────────────────────

  if (!isOpen) return null;

  // ── Determine empty state variant ─────────────────────────────────────

  const getEmptyVariant = (): 'no-notifications' | 'all-caught-up' | 'no-match' => {
    if (notifications.length === 0) return 'no-notifications';
    if (activeTab === 'unread' && filteredNotifications.length === 0)
      return 'all-caught-up';
    if (filteredNotifications.length === 0) return 'no-match';
    return 'no-notifications';
  };

  return (
    <>
      {/* Backdrop overlay (subtle) */}
      <div
        className={`
          fixed inset-0 z-40 bg-black/10
          transition-opacity duration-200
          ${isVisible ? 'opacity-100' : 'opacity-0'}
        `}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notification Center"
        aria-modal="true"
        className={`
          fixed top-12 right-4 z-50
          w-[420px] max-w-[calc(100vw-2rem)]
          bg-white border border-border-subtle rounded-2xl
          shadow-float
          flex flex-col
          max-h-[calc(100vh-5rem)]
          transition-all duration-200 ease-out origin-top-right
          ${isVisible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-1'}
        `}
      >
        {/* ─── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-text-primary" />
              <h2 className="text-sm font-semibold text-text-primary">
                Notifications
              </h2>
            </div>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-brand-500 text-white text-[10px] font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {/* Connection status indicator */}
            <div
              title={isConnected ? 'Live updates active' : 'Reconnecting…'}
              className="flex items-center gap-1"
            >
              {isConnected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-red-400 animate-pulse" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-brand-600 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ─── Filter Tabs ─────────────────────────────────────────── */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-surface-secondary/80">
            {FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    relative flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium
                    transition-all duration-150 ease-out flex-1 justify-center
                    ${
                      isActive
                        ? 'bg-white text-text-primary shadow-sm'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }
                  `}
                >
                  {tab.label}
                  {count > 0 && !isActive && (
                    <span className="text-[10px] text-text-tertiary">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Divider ─────────────────────────────────────────────── */}
        <div className="h-px bg-border-subtle" />

        {/* ─── Notification List ───────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain min-h-0"
          style={{ maxHeight: 'calc(100vh - 16rem)' }}
        >
          {/* Loading state */}
          {isLoading && !hasLoadedOnce && (
            <div className="divide-y divide-border-subtle/60">
              {Array.from({ length: 5 }).map((_, i) => (
                <NotificationSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredNotifications.length === 0 && (
            <EmptyState variant={getEmptyVariant()} />
          )}

          {/* Notifications grouped by date */}
          {!isLoading && filteredNotifications.length > 0 && (
            <div className="pb-1">
              {groupedNotifications.map((group) => (
                <Fragment key={group.label}>
                  {/* Date group header */}
                  <div className="sticky top-0 z-10 px-4 py-2 bg-white/95 backdrop-blur-sm">
                    <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>

                  {/* Notification items */}
                  {group.items.map((notif, idx) => (
                    <NotificationItem
                      key={notif.id}
                      notification={notif}
                      onRead={markAsRead}
                      onArchive={archiveNotification}
                      onDelete={deleteNotification}
                      onClick={handleNotificationClick}
                    />
                  ))}
                </Fragment>
              ))}

              {/* Load more indicator */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
                  <span className="ml-2 text-xs text-text-tertiary">
                    Loading more…
                  </span>
                </div>
              )}

              {/* End of list */}
              {!hasMore && filteredNotifications.length > NOTIFICATION_PAGE_SIZE && (
                <div className="flex items-center justify-center py-4">
                  <span className="text-[11px] text-text-tertiary">
                    You&apos;ve seen all notifications
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Footer ──────────────────────────────────────────────── */}
        <div className="border-t border-border-subtle">
          <div className="flex items-center divide-x divide-border-subtle">
            <button
              onClick={handleViewAll}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary/60 transition-colors rounded-bl-2xl"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View all notifications
            </button>
            <button
              onClick={handleSettings}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary/60 transition-colors rounded-br-2xl"
            >
              <Settings className="h-3.5 w-3.5" />
              Notification settings
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
