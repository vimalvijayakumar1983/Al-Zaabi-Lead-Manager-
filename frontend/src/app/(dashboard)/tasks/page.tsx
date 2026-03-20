'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import type { Task, PaginatedResponse, TaskStatus, Priority, TaskType } from '@/types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Calendar,
  User2,
  X,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutList,
  LayoutGrid,
  Loader2,
  ListTodo,
  CalendarDays,
  Target,
  RefreshCw,
  Bell,
  Trash2,
  Pencil,
  Columns3,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────
const priorityConfig: Record<string, { bg: string; text: string; ring: string; dot: string; label: string; order: number }> = {
  LOW: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-400', label: 'Low', order: 0 },
  MEDIUM: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', dot: 'bg-blue-500', label: 'Medium', order: 1 },
  HIGH: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/10', dot: 'bg-orange-500', label: 'High', order: 2 },
  URGENT: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/10', dot: 'bg-red-500', label: 'Urgent', order: 3 },
};

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
  IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'In Progress' },
  COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Cancelled' },
};

const TASK_TYPES = ['FOLLOW_UP_CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'DEMO', 'PROPOSAL', 'OTHER'] as const;

const TYPE_LABELS: Record<string, string> = {
  FOLLOW_UP_CALL: 'Follow-up Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  WHATSAPP: 'WhatsApp',
  DEMO: 'Demo',
  PROPOSAL: 'Proposal',
  OTHER: 'Other',
};

type SortField = 'dueAt' | 'createdAt' | 'priority' | 'status' | 'title';
type ViewMode = 'list' | 'card' | 'board';
type DatePreset = 'all' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'this-month' | 'overdue' | 'custom';

// ─── Helper Functions ───────────────────────────────────────────────
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfWeek(date: Date): Date {
  const d = getStartOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocalValue(date?: string | null): string {
  if (!date) return '';
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function combineDateAndTimeToISO(date?: string, time?: string): string | null {
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  if (Number.isNaN(combined.getTime())) return null;
  return combined.toISOString();
}

function isOverdue(task: Task): boolean {
  return new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED';
}

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

// ─── Filter Badge ───────────────────────────────────────────────────
function FilterBadge({ label, color, onRemove }: { label: string; color?: string; onRemove: () => void }) {
  const colorClasses = color || 'bg-brand-50 text-brand-700 ring-brand-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 transition-all hover:opacity-80 ${colorClasses}`}>
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ─── Multi-Select Chips ─────────────────────────────────────────────
function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ key: string; label: string; dot?: string }>;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            onClick={() => onToggle(opt.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              isSelected
                ? 'bg-brand-50 text-brand-700 border-brand-300 ring-1 ring-brand-100'
                : 'bg-white text-text-secondary border-border-subtle hover:border-border-strong hover:text-text-primary'
            }`}
          >
            {opt.dot && (
              <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stats Card ─────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  badge,
  onClick,
  active,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  badge?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left w-full ${
        active
          ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-100 shadow-sm'
          : 'bg-white border-border-subtle hover:border-border-strong hover:shadow-sm'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold text-text-primary leading-none">{value}</p>
        <p className="text-xs text-text-secondary mt-0.5">{label}</p>
      </div>
      {badge && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
          {badge}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── Main Tasks Page ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
export default function TasksPage() {
  const { user: currentUser } = useAuthStore();
  const addToast = useNotificationStore((s) => s.addToast);

  // ── Data ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalFromApi, setTotalFromApi] = useState(0);
  const [page, setPage] = useState(1);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // ── Search (debounced) ────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Filters ───────────────────────────────────────────────────────
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── Sort & View ───────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── Task Form ─────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);

  // ── Debounced search ──────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    const savedMode = typeof window !== 'undefined' ? localStorage.getItem('tasks:view-mode') : null;
    if (savedMode === 'list' || savedMode === 'card' || savedMode === 'board') {
      setViewMode(savedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tasks:view-mode', viewMode);
    }
  }, [viewMode]);

  // ── Fetch team members ────────────────────────────────────────────
  useEffect(() => {
    api.getUsers().then(setTeamMembers).catch(() => {});
  }, []);

  // ── Build API params & fetch ──────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 100 };

      // API-supported filters
      if (searchQuery) params.search = searchQuery;

      if (statusFilters.length === 1) {
        params.status = statusFilters[0];
      } else if (statusFilters.length > 1) {
        params.statuses = statusFilters.join(',');
      }

      if (priorityFilters.length === 1) {
        params.priority = priorityFilters[0];
      } else if (priorityFilters.length > 1) {
        params.priorities = priorityFilters.join(',');
      }

      if (sortField) params.sortBy = sortField;
      if (sortDir) params.sortOrder = sortDir;

      // Check if overdue-only filter
      if (datePreset === 'overdue') {
        params.overdue = 1;
      }

      const res: PaginatedResponse<Task> = await api.getTasks(params);
      setTasks(res.data);
      setTotalFromApi(res.pagination?.total || res.data.length);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilters, priorityFilters, sortField, sortDir, datePreset]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh when another user modifies task data
  useRealtimeSync(['task'], () => { fetchTasks(); });

  // ── Client-side filtering (for filters not supported by API) ──────
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Multi-status filter (client-side for multi-select)
    if (statusFilters.length > 1) {
      result = result.filter((t) => statusFilters.includes(t.status));
    }

    // Multi-priority filter (client-side for multi-select)
    if (priorityFilters.length > 1) {
      result = result.filter((t) => priorityFilters.includes(t.priority));
    }

    // Type filter
    if (typeFilter !== 'ALL') {
      result = result.filter((t) => t.type === typeFilter);
    }

    // Assignee filter
    if (assigneeFilter === 'ME' && currentUser) {
      result = result.filter((t) => t.assigneeId === currentUser.id || t.assignee?.id === currentUser.id);
    } else if (assigneeFilter === 'UNASSIGNED') {
      result = result.filter((t) => !t.assigneeId && !t.assignee);
    } else if (assigneeFilter !== 'ALL') {
      result = result.filter((t) => t.assigneeId === assigneeFilter || t.assignee?.id === assigneeFilter);
    }

    // Date range filter
    if (datePreset !== 'all' && datePreset !== 'overdue') {
      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      switch (datePreset) {
        case 'today':
          start = getStartOfDay(now);
          end = getEndOfDay(now);
          break;
        case 'tomorrow': {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          start = getStartOfDay(tomorrow);
          end = getEndOfDay(tomorrow);
          break;
        }
        case 'this-week':
          start = getStartOfWeek(now);
          end = getEndOfWeek(now);
          break;
        case 'next-week': {
          const nextWeek = new Date(now);
          nextWeek.setDate(nextWeek.getDate() + 7);
          start = getStartOfWeek(nextWeek);
          end = getEndOfWeek(nextWeek);
          break;
        }
        case 'this-month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case 'custom':
          if (customDateFrom) start = new Date(customDateFrom);
          if (customDateTo) end = getEndOfDay(new Date(customDateTo));
          break;
      }

      if (start || end) {
        result = result.filter((t) => {
          const due = new Date(t.dueAt);
          if (start && due < start) return false;
          if (end && due > end) return false;
          return true;
        });
      }
    }

    // Overdue filter (add completed check on client)
    if (datePreset === 'overdue') {
      result = result.filter((t) => isOverdue(t));
    }

    // Lead name search
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase();
      result = result.filter((t) => {
        if (!t.lead) return false;
        const name = getDisplayName(t.lead.firstName, t.lead.lastName).toLowerCase();
        return name.includes(q);
      });
    }

    // Full-text client search (for description and lead name not covered by API)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.lead && getDisplayName(t.lead.firstName, t.lead.lastName).toLowerCase().includes(q))
      );
    }

    return result;
  }, [tasks, statusFilters, priorityFilters, typeFilter, assigneeFilter, datePreset, customDateFrom, customDateTo, leadSearch, searchQuery, currentUser]);

  // ── Computed stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = getStartOfDay(now);
    const todayEnd = getEndOfDay(now);
    const weekEnd = getEndOfWeek(now);

    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'PENDING').length,
      overdue: tasks.filter((t) => isOverdue(t)).length,
      completedToday: tasks.filter(
        (t) => t.status === 'COMPLETED' && t.completedAt && new Date(t.completedAt) >= todayStart && new Date(t.completedAt) <= todayEnd
      ).length,
      dueThisWeek: tasks.filter((t) => {
        const due = new Date(t.dueAt);
        return t.status !== 'COMPLETED' && due >= todayStart && due <= weekEnd;
      }).length,
    };
  }, [tasks]);

  // ── Active filter count ───────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (statusFilters.length > 0) count++;
    if (priorityFilters.length > 0) count++;
    if (typeFilter !== 'ALL') count++;
    if (assigneeFilter !== 'ALL') count++;
    if (datePreset !== 'all') count++;
    if (leadSearch) count++;
    return count;
  }, [searchQuery, statusFilters, priorityFilters, typeFilter, assigneeFilter, datePreset, leadSearch]);

  const hasAnyFilter = activeFilterCount > 0;
  const selectedInViewCount = useMemo(
    () => filteredTasks.filter((task) => selectedTaskIds.includes(task.id)).length,
    [filteredTasks, selectedTaskIds]
  );
  const allVisibleSelected = filteredTasks.length > 0 && selectedInViewCount === filteredTasks.length;

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => filteredTasks.some((task) => task.id === id)));
  }, [filteredTasks]);

  const clearAllFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilters([]);
    setPriorityFilters([]);
    setTypeFilter('ALL');
    setAssigneeFilter('ALL');
    setDatePreset('all');
    setCustomDateFrom('');
    setCustomDateTo('');
    setLeadSearch('');
    setSelectedTaskIds([]);
  };

  // ── Toggle helpers ────────────────────────────────────────────────
  const toggleStatus = (s: string) => {
    setStatusFilters((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const togglePriority = (p: string) => {
    setPriorityFilters((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedTaskIds((prev) => prev.filter((id) => !filteredTasks.some((task) => task.id === id)));
      return;
    }
    const visibleIds = filteredTasks.map((task) => task.id);
    setSelectedTaskIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  // ── Task actions ──────────────────────────────────────────────────
  const handleComplete = async (taskId: string) => {
    try {
      await api.completeTask(taskId);
      addToast({ type: 'success', title: 'Task Completed', message: 'Task has been marked as completed' });
      fetchTasks();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to complete task' });
    }
  };

  const handleUpdateTask = async (taskId: string, data: Record<string, any>, successMessage = 'Task updated') => {
    try {
      await api.updateTask(taskId, data);
      addToast({ type: 'success', title: 'Success', message: successMessage });
      fetchTasks();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to update task' });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const confirmed = window.confirm('Delete this task permanently?');
    if (!confirmed) return;

    try {
      await api.deleteTask(taskId);
      addToast({ type: 'success', title: 'Task deleted', message: 'Task removed successfully' });
      setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
      fetchTasks();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to delete task' });
    }
  };

  const handleBulkAction = async (data: Record<string, any>, successMessage: string) => {
    if (!selectedTaskIds.length) return;
    setBulkBusy(true);
    try {
      await api.bulkUpdateTasks(selectedTaskIds, data);
      addToast({ type: 'success', title: 'Bulk update complete', message: successMessage });
      setSelectedTaskIds([]);
      fetchTasks();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Bulk update failed' });
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Sort label ────────────────────────────────────────────────────
  const sortLabels: Record<SortField, string> = {
    dueAt: 'Due Date',
    createdAt: 'Created Date',
    priority: 'Priority',
    status: 'Status',
    title: 'Title',
  };

  const datePresetLabels: Record<DatePreset, string> = {
    all: 'Any Time',
    today: 'Today',
    tomorrow: 'Tomorrow',
    'this-week': 'This Week',
    'next-week': 'Next Week',
    'this-month': 'This Month',
    overdue: 'Overdue',
    custom: 'Custom Range',
  };

  // ═══════════════════════════════════════════════════════════════════
  // ── Render ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <ListTodo className="h-7 w-7 text-brand-500" />
            Tasks
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Manage and track your team&apos;s tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="btn-icon h-9 w-9"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* ═══ Stats Row ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total Tasks"
          value={stats.total}
          icon={ListTodo}
          color="bg-gray-100 text-gray-600"
          onClick={() => clearAllFilters()}
          active={!hasAnyFilter}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-amber-100 text-amber-600"
          onClick={() => {
            clearAllFilters();
            setStatusFilters(['PENDING']);
          }}
          active={statusFilters.length === 1 && statusFilters[0] === 'PENDING' && activeFilterCount === 1}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          icon={AlertTriangle}
          color="bg-red-100 text-red-600"
          badge={stats.overdue > 0 ? `${stats.overdue}!` : undefined}
          onClick={() => {
            clearAllFilters();
            setDatePreset('overdue');
          }}
          active={datePreset === 'overdue' && activeFilterCount === 1}
        />
        <StatCard
          label="Completed Today"
          value={stats.completedToday}
          icon={CheckCircle2}
          color="bg-emerald-100 text-emerald-600"
          onClick={() => {
            clearAllFilters();
            setStatusFilters(['COMPLETED']);
            setDatePreset('today');
          }}
          active={statusFilters.includes('COMPLETED') && datePreset === 'today'}
        />
        <StatCard
          label="Due This Week"
          value={stats.dueThisWeek}
          icon={CalendarDays}
          color="bg-blue-100 text-blue-600"
          onClick={() => {
            clearAllFilters();
            setDatePreset('this-week');
          }}
          active={datePreset === 'this-week' && activeFilterCount === 1}
        />
      </div>

      {/* ═══ Search & Filter Toolbar ══════════════════════════════════ */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 border-b border-border-subtle/50 space-y-3">
        {/* Row 1: Search + Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type="text"
              className="input pl-9 pr-9 w-full"
              placeholder="Search tasks by title, description, or lead name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                showFilterPanel || hasAnyFilter
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-white text-text-secondary border-border-subtle hover:border-border-strong'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="h-5 min-w-[20px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border-subtle bg-white text-text-secondary hover:border-border-strong transition-all">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{sortLabels[sortField]}</span>
              </button>
              <div className="absolute top-full right-0 mt-1 z-50 w-48 bg-white rounded-xl shadow-lg border border-border-subtle py-1 hidden group-hover:block">
                {(Object.entries(sortLabels) as [SortField, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortField(key)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      sortField === key
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-text-primary hover:bg-surface-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Direction */}
            <button
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              className="btn-icon h-9 w-9"
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </button>

            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-border-subtle overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${
                  viewMode === 'list' ? 'bg-brand-50 text-brand-700' : 'bg-white text-text-tertiary hover:text-text-primary'
                }`}
                title="List view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 transition-colors ${
                  viewMode === 'card' ? 'bg-brand-50 text-brand-700' : 'bg-white text-text-tertiary hover:text-text-primary'
                }`}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`p-2 transition-colors ${
                  viewMode === 'board' ? 'bg-brand-50 text-brand-700' : 'bg-white text-text-tertiary hover:text-text-primary'
                }`}
                title="Board view"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Filter Panel */}
        {showFilterPanel && (
          <div className="space-y-3 pt-3 border-t border-border-subtle/50 animate-fade-in">
            {/* Status Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider w-16 flex-shrink-0">Status</span>
              <ChipGroup
                options={[
                  { key: 'PENDING', label: 'Pending' },
                  { key: 'IN_PROGRESS', label: 'In Progress' },
                  { key: 'COMPLETED', label: 'Completed' },
                  { key: 'CANCELLED', label: 'Cancelled' },
                ]}
                selected={statusFilters}
                onToggle={toggleStatus}
              />
            </div>

            {/* Priority Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider w-16 flex-shrink-0">Priority</span>
              <ChipGroup
                options={[
                  { key: 'URGENT', label: 'Urgent', dot: 'bg-red-500' },
                  { key: 'HIGH', label: 'High', dot: 'bg-orange-500' },
                  { key: 'MEDIUM', label: 'Medium', dot: 'bg-blue-500' },
                  { key: 'LOW', label: 'Low', dot: 'bg-gray-400' },
                ]}
                selected={priorityFilters}
                onToggle={togglePriority}
              />
            </div>

            {/* Row: Type + Assignee + Date + Lead */}
            <div className="flex flex-wrap items-end gap-3">
              {/* Type */}
              <div className="min-w-[160px]">
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Type</label>
                <select
                  className="input py-1.5 text-sm w-full"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Types</option>
                  {TASK_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t] || t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div className="min-w-[160px]">
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Assignee</label>
                <select
                  className="input py-1.5 text-sm w-full"
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                >
                  <option value="ALL">All Assignees</option>
                  <option value="ME">Me</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {teamMembers.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {getDisplayName(u.firstName, u.lastName)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Preset */}
              <div className="min-w-[160px]">
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Due Date</label>
                <select
                  className="input py-1.5 text-sm w-full"
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                >
                  {(Object.entries(datePresetLabels) as [DatePreset, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Custom Date Range */}
              {datePreset === 'custom' && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">From</label>
                    <input
                      type="date"
                      className="input py-1.5 text-sm"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">To</label>
                    <input
                      type="date"
                      className="input py-1.5 text-sm"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Lead Name */}
              <div className="min-w-[160px]">
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Related Lead</label>
                <div className="relative">
                  <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                  <input
                    type="text"
                    className="input pl-8 py-1.5 text-sm w-full"
                    placeholder="Filter by lead..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Active Filter Badges + Results Count */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {searchQuery && (
              <FilterBadge
                label={`Search: "${searchQuery}"`}
                onRemove={() => { setSearchInput(''); setSearchQuery(''); }}
              />
            )}
            {statusFilters.map((s) => (
              <FilterBadge
                key={s}
                label={statusConfig[s]?.label || s}
                color={`${statusConfig[s]?.bg || 'bg-gray-50'} ${statusConfig[s]?.text || 'text-gray-700'} ring-gray-200`}
                onRemove={() => toggleStatus(s)}
              />
            ))}
            {priorityFilters.map((p) => (
              <FilterBadge
                key={p}
                label={priorityConfig[p]?.label || p}
                color={`${priorityConfig[p]?.bg || 'bg-gray-50'} ${priorityConfig[p]?.text || 'text-gray-700'} ${priorityConfig[p]?.ring || 'ring-gray-200'}`}
                onRemove={() => togglePriority(p)}
              />
            ))}
            {typeFilter !== 'ALL' && (
              <FilterBadge
                label={`Type: ${TYPE_LABELS[typeFilter] || typeFilter}`}
                onRemove={() => setTypeFilter('ALL')}
              />
            )}
            {assigneeFilter !== 'ALL' && (
              <FilterBadge
                label={`Assignee: ${
                  assigneeFilter === 'ME' ? 'Me' :
                  assigneeFilter === 'UNASSIGNED' ? 'Unassigned' :
                  (() => { const u = teamMembers.find((u: any) => u.id === assigneeFilter); return u ? getDisplayName(u.firstName, u.lastName) : assigneeFilter; })()
                }`}
                onRemove={() => setAssigneeFilter('ALL')}
              />
            )}
            {datePreset !== 'all' && (
              <FilterBadge
                label={`Date: ${datePresetLabels[datePreset]}`}
                color="bg-blue-50 text-blue-700 ring-blue-200"
                onRemove={() => { setDatePreset('all'); setCustomDateFrom(''); setCustomDateTo(''); }}
              />
            )}
            {leadSearch && (
              <FilterBadge
                label={`Lead: "${leadSearch}"`}
                onRemove={() => setLeadSearch('')}
              />
            )}
            {hasAnyFilter && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-all"
              >
                <X className="h-3 w-3" />
                Clear All
              </button>
            )}
          </div>

          {/* Results Count */}
          {!loading && (
            <p className="text-xs text-text-tertiary font-medium flex-shrink-0">
              Showing <span className="text-text-primary font-semibold">{filteredTasks.length}</span> of{' '}
              <span className="text-text-primary font-semibold">{totalFromApi || tasks.length}</span> tasks
            </p>
          )}
        </div>
      </div>

      {/* ═══ Bulk Actions ═════════════════════════════════════════════ */}
      {filteredTasks.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-white/75 backdrop-blur px-3 py-2 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
            />
            Select all in view
          </label>
          <span className="text-[11px] sm:text-xs text-text-tertiary">
            {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} selected` : 'Select tasks to enable bulk actions'}
          </span>
        </div>
      )}

      {/* ═══ Task List / Grid ═════════════════════════════════════════ */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <div className="skeleton h-5 w-5 rounded" />
              <div className="flex-1">
                <div className="skeleton h-4 w-48 mb-2" />
                <div className="skeleton h-3 w-32" />
              </div>
              <div className="skeleton h-5 w-16 rounded-md" />
              <div className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">No tasks found</p>
            <p className="text-xs text-text-tertiary mt-1 mb-3">
              {hasAnyFilter
                ? 'Try adjusting your filters or search query'
                : 'Create your first task to get started'}
            </p>
            <div className="flex items-center gap-2">
              {hasAnyFilter && (
                <button onClick={clearAllFilters} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                  Clear all filters
                </button>
              )}
              {!hasAnyFilter && (
                <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
                  Create Task
                </button>
              )}
            </div>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* ── List View ──────────────────────────────────────────────── */
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const taskOverdue = isOverdue(task);
            const isCompleted = task.status === 'COMPLETED';
            const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
            const status = statusConfig[task.status];

            return (
              <div
                key={task.id}
                className={`card p-4 flex items-start gap-3 transition-all duration-150 group ${
                  taskOverdue
                    ? 'border-red-200 bg-red-50/30'
                    : isCompleted
                    ? 'opacity-70'
                    : 'hover:shadow-card-hover'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={() => toggleTaskSelection(task.id)}
                />

                <button
                  onClick={() => handleComplete(task.id)}
                  className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-border-strong hover:border-brand-500 hover:bg-brand-50'
                  }`}
                  title="Mark as completed"
                >
                  {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                      <Calendar className="h-3 w-3" />
                      {TYPE_LABELS[task.type] || task.type.replace(/_/g, ' ')}
                    </span>
                    {task.lead && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                        <Target className="h-3 w-3" />
                        {getDisplayName(task.lead.firstName, task.lead.lastName)}
                      </span>
                    )}
                    {task.assignee && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                        <User2 className="h-3 w-3" />
                        {getDisplayName(task.assignee.firstName, task.assignee.lastName)}
                      </span>
                    )}
                    {task.reminder && (
                      <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                        <Bell className="h-3 w-3" />
                        Reminder {formatDateShort(task.reminder)}
                      </span>
                    )}
                    {status && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={`badge ${priority.bg} ${priority.text} ring-1 ${priority.ring}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
                    {priority.label}
                  </span>
                  <select
                    className="input py-1 px-2 text-xs min-w-[126px]"
                    value={task.status}
                    onChange={(e) => handleUpdateTask(task.id, { status: e.target.value }, 'Task status updated')}
                  >
                    {Object.keys(statusConfig).map((statusKey) => (
                      <option key={statusKey} value={statusKey}>
                        {statusConfig[statusKey]?.label || statusKey}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col items-end gap-2 min-w-[152px]">
                  <div className="flex items-center gap-1.5">
                    {taskOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                    <Clock className={`h-3.5 w-3.5 ${taskOverdue ? 'text-red-500' : 'text-text-tertiary'}`} />
                    <span className={`text-xs font-medium ${taskOverdue ? 'text-red-600' : 'text-text-secondary'}`}>
                      {formatDateShort(task.dueAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingTask(task)} className="btn-icon h-8 w-8" title="Edit task">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="h-8 w-8 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center"
                      title="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'card' ? (
        /* ── Card View ──────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredTasks.map((task) => {
            const taskOverdue = isOverdue(task);
            const isCompleted = task.status === 'COMPLETED';
            const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
            const status = statusConfig[task.status];

            return (
              <div
                key={task.id}
                className={`rounded-xl border p-4 transition-all ${
                  taskOverdue
                    ? 'border-red-200 bg-red-50/30'
                    : isCompleted
                    ? 'border-border-subtle bg-white opacity-70'
                    : 'border-border-subtle bg-white hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={() => toggleTaskSelection(task.id)}
                    />
                    <span className={`badge ${priority.bg} ${priority.text} ring-1 ${priority.ring} text-[10px]`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
                      {priority.label}
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingTask(task)} className="btn-icon h-8 w-8" title="Edit task">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="h-8 w-8 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center"
                      title="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleComplete(task.id)}
                      className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-all ${
                        isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border-strong hover:border-brand-500 hover:bg-brand-50'
                      }`}
                      title="Mark complete"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className={`text-sm font-medium mb-2 line-clamp-2 ${isCompleted ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
                  {task.title}
                </p>
                {task.description && <p className="text-xs text-text-tertiary line-clamp-2 mb-3">{task.description}</p>}

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span>{TYPE_LABELS[task.type] || task.type.replace(/_/g, ' ')}</span>
                  </div>
                  {task.lead && (
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <Target className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{getDisplayName(task.lead.firstName, task.lead.lastName)}</span>
                    </div>
                  )}
                  {task.assignee && (
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <User2 className="h-3 w-3 flex-shrink-0" />
                      <span>{getDisplayName(task.assignee.firstName, task.assignee.lastName)}</span>
                    </div>
                  )}
                  {task.reminder && (
                    <div className="flex items-center gap-1.5 text-xs text-violet-700">
                      <Bell className="h-3 w-3 flex-shrink-0" />
                      <span>Reminder {formatDateShort(task.reminder)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
                  <select
                    className="input py-1 px-2 text-xs w-[130px]"
                    value={task.status}
                    onChange={(e) => handleUpdateTask(task.id, { status: e.target.value }, 'Task status updated')}
                  >
                    {Object.keys(statusConfig).map((statusKey) => (
                      <option key={statusKey} value={statusKey}>
                        {statusConfig[statusKey]?.label || statusKey}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    {taskOverdue && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    <Clock className={`h-3 w-3 ${taskOverdue ? 'text-red-500' : 'text-text-tertiary'}`} />
                    <span className={`text-[11px] font-medium ${taskOverdue ? 'text-red-600' : 'text-text-secondary'}`}>
                      {formatDateShort(task.dueAt)}
                    </span>
                  </div>
                </div>
                {status && <div className={`mt-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${status.bg} ${status.text}`}>{status.label}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Board View ─────────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map((columnStatus) => {
            const columnTasks = filteredTasks.filter((task) => task.status === columnStatus);
            return (
              <div key={columnStatus} className="rounded-xl border border-border-subtle bg-surface-secondary/40 min-h-[400px]">
                <div className="px-3 py-2.5 border-b border-border-subtle flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusConfig[columnStatus].bg} ${statusConfig[columnStatus].text}`}>
                    {statusConfig[columnStatus].label}
                  </span>
                  <span className="text-xs text-text-tertiary">{columnTasks.length}</span>
                </div>
                <div className="p-2.5 space-y-2 max-h-[70vh] overflow-auto">
                  {columnTasks.map((task) => {
                    const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
                    const taskOverdue = isOverdue(task);
                    return (
                      <div key={task.id} className={`rounded-lg border bg-white p-3 space-y-2 ${taskOverdue ? 'border-red-200' : 'border-border-subtle'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                              checked={selectedTaskIds.includes(task.id)}
                              onChange={() => toggleTaskSelection(task.id)}
                            />
                            <span className={`badge ${priority.bg} ${priority.text} ring-1 ${priority.ring} text-[10px]`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
                              {priority.label}
                            </span>
                          </label>
                          <button onClick={() => setEditingTask(task)} className="btn-icon h-7 w-7" title="Edit task">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-medium text-text-primary line-clamp-2">{task.title}</p>
                        <div className="flex items-center justify-between text-[11px] text-text-secondary">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateShort(task.dueAt)}
                          </span>
                          <button
                            onClick={() => handleComplete(task.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-subtle hover:bg-surface-secondary"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Complete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {columnTasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-text-tertiary">No tasks</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Compact Floating Bulk Toolbar ═════════════════════════════ */}
      {selectedTaskIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-5xl">
          <div className="rounded-2xl border border-border-subtle bg-white/95 backdrop-blur-xl shadow-xl">
            <div className="px-2.5 py-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
                {selectedTaskIds.length} selected
              </span>
              <button
                onClick={() => setSelectedTaskIds([])}
                className="h-8 px-2 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary text-xs inline-flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
              <div className="h-6 w-px bg-border-subtle hidden sm:block" />
              <button
                onClick={() => handleBulkAction({ status: 'COMPLETED' }, 'Selected tasks marked as completed')}
                disabled={bulkBusy}
                className="h-8 px-2.5 rounded-lg border border-border-subtle text-xs font-medium text-text-primary hover:bg-surface-secondary disabled:opacity-50 inline-flex items-center gap-1"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete
              </button>
              <button
                onClick={() => handleBulkAction({ status: 'IN_PROGRESS' }, 'Selected tasks moved to in progress')}
                disabled={bulkBusy}
                className="h-8 px-2.5 rounded-lg border border-border-subtle text-xs font-medium text-text-primary hover:bg-surface-secondary disabled:opacity-50"
              >
                In Progress
              </button>
              <select
                className="h-8 rounded-lg border border-border-subtle px-2 text-xs bg-white min-w-[110px]"
                disabled={bulkBusy}
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  handleBulkAction({ priority: e.target.value }, `Priority changed to ${priorityConfig[e.target.value]?.label || e.target.value}`);
                  e.currentTarget.value = '';
                }}
              >
                <option value="">Priority</option>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p} value={p}>{priorityConfig[p]?.label || p}</option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-border-subtle px-2 text-xs bg-white min-w-[150px]"
                disabled={bulkBusy}
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  handleBulkAction({ assigneeId: e.target.value }, 'Selected tasks reassigned');
                  e.currentTarget.value = '';
                }}
              >
                <option value="">Reassign</option>
                {teamMembers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {getDisplayName(u.firstName, u.lastName)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${selectedTaskIds.length} selected tasks? This cannot be undone.`)) {
                    handleBulkAction({ delete: true }, `${selectedTaskIds.length} tasks deleted`);
                  }
                }}
                disabled={bulkBusy}
                className="ml-auto h-8 px-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              {bulkBusy && (
                <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying...
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Create Task Modal ════════════════════════════════════════ */}
      {showForm && <CreateTaskModal onClose={() => setShowForm(false)} onCreated={fetchTasks} />}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          teamMembers={teamMembers}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            fetchTasks();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── Create Task Modal ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const addToast = useNotificationStore((s) => s.addToast);
  const { user: currentUser } = useAuthStore();
  const [form, setForm] = useState({
    title: '',
    type: 'FOLLOW_UP_CALL',
    priority: 'MEDIUM',
    dueAt: '',
    assigneeId: '',
    description: '',
    isRecurring: false,
    recurRule: '',
  });
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveAndCreateAnother, setSaveAndCreateAnother] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  const dueAtDate = useMemo(() => {
    if (!form.dueAt) return null;
    const parsed = new Date(form.dueAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [form.dueAt]);

  const reminderIso = useMemo(
    () => combineDateAndTimeToISO(reminderDate, reminderTime),
    [reminderDate, reminderTime]
  );

  const applyDuePreset = (minutesFromNow: number) => {
    const dt = new Date(Date.now() + minutesFromNow * 60_000);
    setForm((prev) => ({ ...prev, dueAt: toDateTimeLocalValue(dt.toISOString()) }));
  };

  const applyReminderBeforeDue = (minutesBeforeDue: number) => {
    if (!dueAtDate) {
      addToast({
        type: 'info',
        title: 'Set due date first',
        message: 'Please set due date/time before applying reminder presets.',
      });
      return;
    }
    const reminderDt = new Date(dueAtDate.getTime() - minutesBeforeDue * 60_000);
    setReminderDate(toDateTimeLocalValue(reminderDt.toISOString()).split('T')[0] || '');
    setReminderTime(toDateTimeLocalValue(reminderDt.toISOString()).split('T')[1] || '');
  };

  const selectedAssignee = users.find((u: any) => u.id === form.assigneeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!form.title.trim() || form.title.trim().length < 3) {
        addToast({ type: 'error', title: 'Invalid title', message: 'Please enter at least 3 characters.' });
        return;
      }
      if (!form.assigneeId) {
        addToast({ type: 'error', title: 'Assignee required', message: 'Please assign this task to a team member.' });
        return;
      }
      if (!dueAtDate) {
        addToast({ type: 'error', title: 'Due date required', message: 'Please set a valid due date and time.' });
        return;
      }
      if (dueAtDate < new Date()) {
        addToast({ type: 'error', title: 'Invalid due date', message: 'Due date cannot be in the past.' });
        return;
      }
      if (form.isRecurring && !form.recurRule) {
        addToast({ type: 'error', title: 'Recurrence missing', message: 'Select a recurrence pattern or turn off recurrence.' });
        return;
      }
      const reminder = reminderIso;
      if ((reminderDate || reminderTime) && !reminder) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Please provide both reminder date and time.' });
        return;
      }
      if (reminder && new Date(reminder) > dueAtDate) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Reminder cannot be after the task due date.' });
        return;
      }
      if (reminder && new Date(reminder) < new Date()) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Reminder cannot be in the past.' });
        return;
      }

      await api.createTask({
        ...form,
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueAt: dueAtDate.toISOString(),
        reminder,
        recurRule: form.isRecurring ? form.recurRule : null,
      });
      addToast({ type: 'success', title: 'Task Created', message: 'New task has been created successfully.' });
      onCreated();
      if (saveAndCreateAnother) {
        setForm((prev) => ({
          ...prev,
          title: '',
          dueAt: '',
          description: '',
          isRecurring: false,
          recurRule: '',
        }));
        setReminderDate('');
        setReminderTime('');
      } else {
        onClose();
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to create task' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Create Smart Task</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Capture details once. Schedule right. Never miss a follow-up.</p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          <div>
            <label className="label">Quick Start</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium hover:bg-surface-secondary"
                onClick={() => setForm((prev) => ({ ...prev, type: 'FOLLOW_UP_CALL', priority: 'MEDIUM', title: prev.title || 'Follow-up call' }))}
              >
                Follow-up
              </button>
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium hover:bg-surface-secondary"
                onClick={() => setForm((prev) => ({ ...prev, type: 'MEETING', priority: 'HIGH', title: prev.title || 'Client meeting' }))}
              >
                Meeting
              </button>
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium hover:bg-surface-secondary"
                onClick={() => setForm((prev) => ({ ...prev, type: 'PROPOSAL', priority: 'HIGH', title: prev.title || 'Send proposal' }))}
              >
                Proposal
              </button>
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
                onClick={() => setForm((prev) => ({ ...prev, priority: 'URGENT', title: prev.title || 'Urgent follow-up' }))}
              >
                Urgent
              </button>
            </div>
          </div>

          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Follow up with client"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-text-tertiary">Use action-focused titles (e.g., &quot;Call client for final quote&quot;).</p>
              <p className="text-[11px] text-text-tertiary">{form.title.length}/120</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] || t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p} value={p}>
                    {priorityConfig[p]?.label || p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Due Date & Time *</label>
            <input
              type="datetime-local"
              className="input"
              required
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyDuePreset(60)}>In 1 hour</button>
              <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyDuePreset(180)}>In 3 hours</button>
              <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyDuePreset(24 * 60)}>Tomorrow</button>
              <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyDuePreset(2 * 24 * 60)}>In 2 days</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reminder Date</label>
              <input
                type="date"
                className="input"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Reminder Time</label>
              <input
                type="time"
                className="input"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyReminderBeforeDue(15)}>15 min before</button>
            <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyReminderBeforeDue(60)}>1 hour before</button>
            <button type="button" className="px-2 py-1 rounded-md border border-border-subtle text-xs hover:bg-surface-secondary" onClick={() => applyReminderBeforeDue(24 * 60)}>1 day before</button>
            <button
              type="button"
              className="px-2 py-1 rounded-md border border-border-subtle text-xs text-text-secondary hover:bg-surface-secondary"
              onClick={() => {
                setReminderDate('');
                setReminderTime('');
              }}
            >
              Clear reminder
            </button>
          </div>

          <div>
            <label className="label">Assign To *</label>
            <select
              className="input"
              required
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            >
              <option value="">Select team member...</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {getDisplayName(u.firstName, u.lastName)}
                </option>
              ))}
            </select>
            {currentUser && (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, assigneeId: currentUser.id }))}
                className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Assign to me
              </button>
            )}
          </div>

          <div className="rounded-lg border border-border-subtle p-3 space-y-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                checked={form.isRecurring}
                onChange={(e) => setForm((prev) => ({ ...prev, isRecurring: e.target.checked, recurRule: e.target.checked ? prev.recurRule || 'weekly' : '' }))}
              />
              Recurring task
            </label>
            {form.isRecurring && (
              <select
                className="input"
                value={form.recurRule}
                onChange={(e) => setForm((prev) => ({ ...prev, recurRule: e.target.value }))}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes..."
            />
          </div>

          <div className="rounded-lg bg-surface-secondary/60 border border-border-subtle px-3 py-2 text-xs text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">Live summary</p>
            <p>Type: {TYPE_LABELS[form.type] || form.type.replace(/_/g, ' ')} • Priority: {priorityConfig[form.priority]?.label || form.priority}</p>
            <p>Due: {dueAtDate ? formatDateTime(dueAtDate.toISOString()) : 'Not set'}</p>
            <p>Reminder: {reminderIso ? formatDateTime(reminderIso) : 'No reminder'}</p>
            <p>Assignee: {selectedAssignee ? getDisplayName(selectedAssignee.firstName, selectedAssignee.lastName) : 'Not selected'}</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                checked={saveAndCreateAnother}
                onChange={(e) => setSaveAndCreateAnother(e.target.checked)}
              />
              Save and create another
            </label>
            <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                'Create Task'
              )}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTaskModal({
  task,
  teamMembers,
  onClose,
  onSaved,
}: {
  task: Task;
  teamMembers: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const addToast = useNotificationStore((s) => s.addToast);
  const initialReminder = toDateTimeLocalValue(task.reminder || null);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    type: task.type,
    priority: task.priority,
    status: task.status,
    dueAt: toDateTimeLocalValue(task.dueAt),
    assigneeId: task.assigneeId || task.assignee?.id || '',
    reminderDate: initialReminder.split('T')[0] || '',
    reminderTime: initialReminder.split('T')[1] || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dueAt = new Date(form.dueAt).toISOString();
      const reminder = combineDateAndTimeToISO(form.reminderDate, form.reminderTime);
      if ((form.reminderDate || form.reminderTime) && !reminder) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Please provide both reminder date and time.' });
        return;
      }
      if (reminder && new Date(reminder) > new Date(dueAt)) {
        addToast({ type: 'error', title: 'Invalid reminder', message: 'Reminder cannot be after due date.' });
        return;
      }

      await api.updateTask(task.id, {
        title: form.title,
        description: form.description || null,
        type: form.type,
        priority: form.priority,
        status: form.status,
        dueAt,
        assigneeId: form.assigneeId,
        reminder,
      });

      addToast({ type: 'success', title: 'Task updated', message: 'Task details saved successfully' });
      onSaved();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Failed to update task' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">Edit Task</h2>
          <button onClick={onClose} className="btn-icon">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
                {Object.keys(statusConfig).map((statusKey) => (
                  <option key={statusKey} value={statusKey}>
                    {statusConfig[statusKey]?.label || statusKey}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p} value={p}>
                    {priorityConfig[p]?.label || p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })}>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] || t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assignee</label>
              <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">Select team member...</option>
                {teamMembers.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {getDisplayName(u.firstName, u.lastName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Due Date & Time *</label>
            <input
              type="datetime-local"
              className="input"
              required
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reminder Date</label>
              <input
                type="date"
                className="input"
                value={form.reminderDate}
                onChange={(e) => setForm({ ...form, reminderDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Reminder Time</label>
              <input
                type="time"
                className="input"
                value={form.reminderTime}
                onChange={(e) => setForm({ ...form, reminderTime: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
