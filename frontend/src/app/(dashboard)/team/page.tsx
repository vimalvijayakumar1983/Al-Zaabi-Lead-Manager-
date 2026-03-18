'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore, FEATURES } from '@/lib/permissions';
import type { User, Organization } from '@/types';
import {
  UserPlus, X, Shield, Users as UsersIcon, Crown, Eye,
  MoreHorizontal, Pencil, Key, UserX, UserCheck, Search,
  Mail, Phone, Calendar, BarChart3, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Filter, RotateCcw, Save,
  Building2, Sparkles, ArrowUpDown, ArrowUp, ArrowDown,
  Clock, TrendingUp, ListChecks, Hash, SlidersHorizontal,
  UserCog, Zap,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Config ────────────────────────────────────────────────────────
const roleConfig: Record<string, { bg: string; text: string; ring: string; icon: React.ComponentType<{ className?: string }>; label: string; description: string }> = {
  SUPER_ADMIN: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/10', icon: Sparkles, label: 'Super Admin', description: 'Full access across all divisions, group-level management' },
  ADMIN: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', icon: Crown, label: 'Admin', description: 'Full access to all features, settings, and team management' },
  MANAGER: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', icon: Shield, label: 'Manager', description: 'Manage leads, tasks, team members, and view analytics' },
  SALES_REP: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', icon: UsersIcon, label: 'Sales Rep', description: 'Work with assigned leads, create tasks, and log activities' },
  VIEWER: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', icon: Eye, label: 'Viewer', description: 'Read-only access to leads, pipeline, and analytics' },
};

const statsRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];
const allRoleKeys = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

const divisionBadgeColors = [
  { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10' },
  { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10' },
  { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/10' },
  { bg: 'bg-pink-50', text: 'text-pink-700', ring: 'ring-pink-600/10' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/10' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-600/10' },
  { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/10' },
  { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/10' },
  { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/10' },
];

function getDivisionBadgeColor(divisionId: string, divisionsList: Organization[]) {
  const idx = divisionsList.findIndex(d => d.id === divisionId);
  return divisionBadgeColors[idx >= 0 ? idx % divisionBadgeColors.length : 0];
}

// ─── Date helpers ──────────────────────────────────────────────────
type DatePreset = 'all' | '7d' | '30d' | '90d' | 'year' | 'custom';
function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === 'all') return null;
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case '7d': from = new Date(now.getTime() - 7 * 86400000); break;
    case '30d': from = new Date(now.getTime() - 30 * 86400000); break;
    case '90d': from = new Date(now.getTime() - 90 * 86400000); break;
    case 'year': from = new Date(now.getFullYear(), 0, 1); break;
    default: return null;
  }
  return { from: from.toISOString(), to };
}

// ─── Sort options ──────────────────────────────────────────────────
type SortField = 'name' | 'leads' | 'tasks' | 'newest' | 'oldest' | 'lastActive';
const sortOptions: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'leads', label: 'Most Leads' },
  { value: 'tasks', label: 'Most Tasks' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'lastActive', label: 'Last Active' },
];

// ─── Main Component ────────────────────────────────────────────────
export default function TeamPage() {
  const { user: currentUser } = useAuthStore();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Core state
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [showRoles, setShowRoles] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateJoinedPreset, setDateJoinedPreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState<string>('all');
  const [tasksFilter, setTasksFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('lastActive');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Multi-tenant state
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN' || isSuperAdmin;
  const isManager = currentUser?.role === 'MANAGER';
  const canManage = isAdmin || isManager;

  // ─── Fetch ─────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    const data = await api.getUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Auto-refresh when another user modifies team data
  useRealtimeSync(['user'], () => { fetchUsers(); });

  useEffect(() => {
    if (isSuperAdmin) {
      api.getDivisions().then((divs: Organization[]) => {
        setDivisions(divs || []);
      }).catch(() => { /* ignore */ });
    }
  }, [isSuperAdmin]);

  // ─── Ctrl+K shortcut ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeMenu) return;
    const handler = () => setActiveMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [activeMenu]);

  // ─── Computed counts ───────────────────────────────────────
  const activeCount = users.filter(u => u.isActive).length;
  const inactiveCount = users.filter(u => !u.isActive).length;
  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // New this month
  const newThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return users.filter(u => u.createdAt && new Date(u.createdAt) >= monthStart).length;
  }, [users]);

  // Active in last 24h
  const activeNow = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return users.filter(u => u.lastLoginAt && new Date(u.lastLoginAt) >= cutoff).length;
  }, [users]);

  // Top division
  const topDivision = useMemo(() => {
    if (!isSuperAdmin || divisions.length === 0) return null;
    const counts: Record<string, number> = {};
    users.forEach(u => {
      const divId = u.organizationId || (u as any).organization?.id;
      if (divId) counts[divId] = (counts[divId] || 0) + 1;
    });
    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return topId ? divisions.find(d => d.id === topId)?.name || null : null;
  }, [users, divisions, isSuperAdmin]);

  // ─── Filter + Sort ─────────────────────────────────────────
  const filteredAndSortedUsers = useMemo(() => {
    let result = users.filter((u) => {
      // Search (name, email, phone)
      const matchesSearch = searchQuery === '' ||
        `${u.firstName} ${u.lastName} ${u.email} ${u.phone || ''}`.toLowerCase().includes(searchQuery.toLowerCase());

      // Role (multi-select)
      const matchesRole = roleFilters.length === 0 || roleFilters.includes(u.role);

      // Status
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && u.isActive) ||
        (statusFilter === 'inactive' && !u.isActive);

      // Division
      const matchesDivision = divisionFilter === 'all' ||
        u.organizationId === divisionFilter ||
        (u as any).organization?.id === divisionFilter;

      // Date joined
      let matchesDate = true;
      if (dateJoinedPreset !== 'all' && dateJoinedPreset !== 'custom') {
        const range = getDateRange(dateJoinedPreset);
        if (range && u.createdAt) {
          const created = new Date(u.createdAt);
          matchesDate = created >= new Date(range.from) && created <= new Date(range.to);
        }
      } else if (dateJoinedPreset === 'custom') {
        if (customDateFrom && u.createdAt) {
          matchesDate = matchesDate && new Date(u.createdAt) >= new Date(customDateFrom);
        }
        if (customDateTo && u.createdAt) {
          matchesDate = matchesDate && new Date(u.createdAt) <= new Date(customDateTo + 'T23:59:59');
        }
      }

      // Performance (lead count)
      let matchesPerformance = true;
      const leadCount = u._count?.assignedLeads || 0;
      if (performanceFilter === 'top') matchesPerformance = leadCount >= 10;
      else if (performanceFilter === 'active') matchesPerformance = leadCount >= 1 && leadCount <= 9;
      else if (performanceFilter === 'none') matchesPerformance = leadCount === 0;

      // Tasks
      let matchesTasks = true;
      const taskCount = u._count?.tasks || 0;
      if (tasksFilter === 'with') matchesTasks = taskCount > 0;
      else if (tasksFilter === 'without') matchesTasks = taskCount === 0;

      return matchesSearch && matchesRole && matchesStatus && matchesDivision && matchesDate && matchesPerformance && matchesTasks;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'leads':
          cmp = (b._count?.assignedLeads || 0) - (a._count?.assignedLeads || 0);
          break;
        case 'tasks':
          cmp = (b._count?.tasks || 0) - (a._count?.tasks || 0);
          break;
        case 'newest':
          cmp = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          break;
        case 'oldest':
          cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
        case 'lastActive':
          cmp = new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime();
          break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [users, searchQuery, roleFilters, statusFilter, divisionFilter, dateJoinedPreset, customDateFrom, customDateTo, performanceFilter, tasksFilter, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedUsers.slice(start, start + pageSize);
  }, [filteredAndSortedUsers, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters, sortConfig]);


  // ─── Active filter count ───────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (roleFilters.length > 0) count++;
    if (statusFilter !== 'all') count++;
    if (divisionFilter !== 'all') count++;
    if (dateJoinedPreset !== 'all') count++;
    if (performanceFilter !== 'all') count++;
    if (tasksFilter !== 'all') count++;
    return count;
  }, [searchQuery, roleFilters, statusFilter, divisionFilter, dateJoinedPreset, performanceFilter, tasksFilter]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setRoleFilters([]);
    setStatusFilter('all');
    setDivisionFilter('all');
    setDateJoinedPreset('all');
    setCustomDateFrom('');
    setCustomDateTo('');
    setPerformanceFilter('all');
    setTasksFilter('all');
    setSortField('name');
    setSortDirection('asc');
  };

  // ─── Bulk actions ──────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedUsers.length && paginatedUsers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedUsers.map(u => u.id)));
    }
  };

  const toggleSelectUser = (userId: string) => {
    const next = new Set(selectedIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedIds(next);
  };

  // ─── Role multi-select toggle ─────────────────────────────
  const toggleRoleFilter = (role: string) => {
    setRoleFilters(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // ─── Handlers ──────────────────────────────────────────────
  const handleDeactivate = async (user: User) => {
    if (!confirm(`Deactivate ${user.firstName} ${user.lastName}? They will lose access immediately.`)) return;
    try {
      await api.deactivateUser(user.id);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReactivate = async (user: User) => {
    try {
      await api.reactivateUser(user.id);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkDeactivate = async () => {
    if (!confirm(`Deactivate ${selectedIds.size} selected users?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.deactivateUser(id)));
      setSelectedIds(new Set());
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkChangeRole = async () => {
    const role = prompt('Enter new role (ADMIN, MANAGER, SALES_REP, VIEWER):');
    if (!role || !['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'].includes(role)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.updateUser(id, { role })));
      setSelectedIds(new Set());
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkTransferDivision = async () => {
    if (!isSuperAdmin || divisions.length === 0) return;
    const divName = prompt(`Enter division name to transfer to:\n${divisions.map(d => d.name).join(', ')}`);
    const div = divisions.find(d => d.name.toLowerCase() === divName?.toLowerCase());
    if (!div) { alert('Division not found'); return; }
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.updateUser(id, { divisionId: div.id } as any)));
      setSelectedIds(new Set());
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getUserDivisionName = (user: User): string => {
    const org = (user as any).organization as Organization | undefined;
    if (org) return org.name;
    if (user.organizationName) return user.organizationName;
    const match = divisions.find(d => d.id === user.organizationId);
    return match?.name || '—';
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Team</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {users.length} members &middot; {activeCount} active
            {inactiveCount > 0 && <span className="text-text-tertiary"> &middot; {inactiveCount} inactive</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchUsers} />
          <button onClick={() => setShowRoles(true)} className="btn-secondary">
            <Shield className="h-4 w-4" />
            Roles &amp; Access
          </button>
          {canManage && (
            <button onClick={() => setShowInvite(true)} className="btn-primary">
              <UserPlus className="h-4 w-4" />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Enhanced Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Users */}
        <button
          onClick={clearAllFilters}
          className={`card p-4 text-left transition-all duration-150 ${
            activeFilterCount === 0 ? 'ring-2 ring-brand-500 shadow-card-hover' : 'hover:shadow-card-hover'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <UsersIcon className="h-4 w-4 text-brand-600" />
            </div>
            <span className="text-xl font-bold text-text-primary">{users.length}</span>
          </div>
          <p className="text-sm font-medium text-text-primary">Total Users</p>
          <p className="text-2xs text-text-tertiary mt-0.5">All team members</p>
        </button>

        {/* Active Now (last 24h) */}
        <button
          onClick={() => { clearAllFilters(); setSortField('lastActive'); setSortDirection('asc'); }}
          className="card p-4 text-left transition-all duration-150 hover:shadow-card-hover"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
              <Zap className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-xl font-bold text-text-primary">{activeNow}</span>
          </div>
          <p className="text-sm font-medium text-text-primary">Active Now</p>
          <p className="text-2xs text-text-tertiary mt-0.5">Last 24 hours</p>
        </button>

        {/* Role stat cards */}
        {statsRoleKeys.map((key) => {
          const config = roleConfig[key];
          const Icon = config.icon;
          const count = roleCounts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setRoleFilters(roleFilters.length === 1 && roleFilters[0] === key ? [] : [key])}
              className={`card p-4 text-left transition-all duration-150 ${
                roleFilters.length === 1 && roleFilters[0] === key ? 'ring-2 ring-brand-500 shadow-card-hover' : 'hover:shadow-card-hover'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`h-8 w-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${config.text}`} />
                </div>
                <span className="text-xl font-bold text-text-primary">{count}</span>
              </div>
              <p className="text-sm font-medium text-text-primary">{config.label}s</p>
              <p className="text-2xs text-text-tertiary mt-0.5 line-clamp-1">{config.description.split(',')[0]}</p>
            </button>
          );
        })}
      </div>

      {/* Extra stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary text-sm">
          <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-text-secondary">New this month:</span>
          <span className="font-semibold text-text-primary">{newThisMonth}</span>
        </div>
        {topDivision && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary text-sm">
            <Building2 className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="text-text-secondary">Top Division:</span>
            <span className="font-semibold text-text-primary">{topDivision}</span>
          </div>
        )}
      </div>

      {/* Search & Primary Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search with Ctrl+K */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            ref={searchInputRef}
            className="input pl-10 pr-20"
            placeholder="Search name, email, phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-tertiary text-text-tertiary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-text-tertiary bg-surface-tertiary rounded px-1.5 py-0.5 font-mono hidden sm:inline">
              Ctrl+K
            </span>
          )}
        </div>

        {/* Division filter for SUPER_ADMIN */}
        {isSuperAdmin && divisions.length > 0 && (
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <select
              className="input py-2 pl-9 pr-8 text-sm w-auto bg-white appearance-none cursor-pointer min-w-[180px]"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
            >
              <option value="all">All Divisions</option>
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>{div.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          </div>
        )}

        {/* Status toggle */}
        <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
                statusFilter === f.key
                  ? 'bg-white shadow-soft text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`btn-secondary text-sm ${showAdvancedFilters ? 'ring-2 ring-brand-500 bg-brand-50' : ''}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-brand-500 text-white text-2xs font-semibold">
              {activeFilterCount}
            </span>
          )}
          {showAdvancedFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <select
              className="input py-2 pl-3 pr-8 text-sm w-auto bg-white appearance-none cursor-pointer"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
            >
              {sortOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          </div>
          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className="btn-icon h-9 w-9"
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel (collapsible) */}
      {showAdvancedFilters && (
        <div className="card p-4 space-y-4 border-brand-200 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Role multi-select */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Roles
              </label>
              <div className="space-y-1.5 mt-1.5">
                {allRoleKeys.map(role => {
                  const config = roleConfig[role];
                  const isChecked = roleFilters.includes(role);
                  return (
                    <label key={role} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRoleFilter(role)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className={`badge ${config.bg} ${config.text} ring-1 ${config.ring} text-2xs`}>
                        {config.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Date Joined */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Date Joined
              </label>
              <div className="space-y-1.5 mt-1.5">
                {([
                  { value: 'all', label: 'All Time' },
                  { value: '7d', label: 'Last 7 Days' },
                  { value: '30d', label: 'Last 30 Days' },
                  { value: '90d', label: 'Last 90 Days' },
                  { value: 'year', label: 'This Year' },
                  { value: 'custom', label: 'Custom Range' },
                ] as { value: DatePreset; label: string }[]).map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dateJoined"
                      checked={dateJoinedPreset === opt.value}
                      onChange={() => setDateJoinedPreset(opt.value)}
                      className="h-4 w-4 text-brand-600 border-gray-300 focus:ring-brand-500"
                    />
                    <span className="text-sm text-text-secondary">{opt.label}</span>
                  </label>
                ))}
                {dateJoinedPreset === 'custom' && (
                  <div className="flex gap-2 ml-6 mt-1">
                    <input
                      type="date"
                      className="input text-xs py-1"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                    />
                    <input
                      type="date"
                      className="input text-xs py-1"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Performance */}
            <div>
              <label className="label flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Performance
              </label>
              <div className="space-y-1.5 mt-1.5">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'top', label: 'Top Performers (10+ leads)' },
                  { value: 'active', label: 'Active (1-9 leads)' },
                  { value: 'none', label: 'No Leads (0)' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="performance"
                      checked={performanceFilter === opt.value}
                      onChange={() => setPerformanceFilter(opt.value)}
                      className="h-4 w-4 text-brand-600 border-gray-300 focus:ring-brand-500"
                    />
                    <span className="text-sm text-text-secondary">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Has Tasks */}
            <div>
              <label className="label flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Tasks
              </label>
              <div className="space-y-1.5 mt-1.5">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'with', label: 'With Active Tasks' },
                  { value: 'without', label: 'No Active Tasks' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hasTasks"
                      checked={tasksFilter === opt.value}
                      onChange={() => setTasksFilter(opt.value)}
                      className="h-4 w-4 text-brand-600 border-gray-300 focus:ring-brand-500"
                    />
                    <span className="text-sm text-text-secondary">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-secondary">
            {filteredAndSortedUsers.length} result{filteredAndSortedUsers.length !== 1 ? 's' : ''}
          </span>
          <span className="text-text-tertiary">|</span>

          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 ring-1 ring-blue-200">
              Search: &quot;{searchQuery}&quot;
              <button onClick={() => setSearchQuery('')} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          {roleFilters.map(r => (
            <span key={r} className={`inline-flex items-center gap-1 rounded-full ${roleConfig[r]?.bg || 'bg-gray-50'} ${roleConfig[r]?.text || 'text-gray-700'} text-xs font-medium px-2.5 py-1 ring-1 ${roleConfig[r]?.ring || 'ring-gray-200'}`}>
              {roleConfig[r]?.label || r}
              <button onClick={() => toggleRoleFilter(r)} className="hover:opacity-75"><X className="h-3 w-3" /></button>
            </span>
          ))}

          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 text-gray-700 text-xs font-medium px-2.5 py-1 ring-1 ring-gray-200">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter('all')} className="hover:text-gray-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          {divisionFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium px-2.5 py-1 ring-1 ring-purple-200">
              <Building2 className="h-3 w-3" />
              {divisions.find(d => d.id === divisionFilter)?.name}
              <button onClick={() => setDivisionFilter('all')} className="hover:text-purple-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          {dateJoinedPreset !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 ring-1 ring-amber-200">
              <Calendar className="h-3 w-3" />
              {dateJoinedPreset === 'custom' ? 'Custom Date' : dateJoinedPreset === '7d' ? 'Last 7 Days' : dateJoinedPreset === '30d' ? 'Last 30 Days' : dateJoinedPreset === '90d' ? 'Last 90 Days' : 'This Year'}
              <button onClick={() => { setDateJoinedPreset('all'); setCustomDateFrom(''); setCustomDateTo(''); }} className="hover:text-amber-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          {performanceFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 ring-1 ring-emerald-200">
              <TrendingUp className="h-3 w-3" />
              {performanceFilter === 'top' ? 'Top Performers' : performanceFilter === 'active' ? 'Active' : 'No Leads'}
              <button onClick={() => setPerformanceFilter('all')} className="hover:text-emerald-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          {tasksFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 ring-1 ring-indigo-200">
              <ListChecks className="h-3 w-3" />
              {tasksFilter === 'with' ? 'Has Tasks' : 'No Tasks'}
              <button onClick={() => setTasksFilter('all')} className="hover:text-indigo-900"><X className="h-3 w-3" /></button>
            </span>
          )}

          <button
            onClick={clearAllFilters}
            className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && canManage && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-50 ring-1 ring-brand-200 animate-fade-in">
          <span className="text-sm font-semibold text-brand-700">
            {selectedIds.size} selected
          </span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-brand-600 hover:underline">
            Deselect All
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleBulkChangeRole} className="btn-secondary text-sm">
              <UserCog className="h-3.5 w-3.5" />
              Change Role
            </button>
            {isSuperAdmin && divisions.length > 0 && (
              <button onClick={handleBulkTransferDivision} className="btn-secondary text-sm">
                <Building2 className="h-3.5 w-3.5" />
                Transfer Division
              </button>
            )}
            <button onClick={handleBulkDeactivate} className="btn-secondary text-sm text-red-600 hover:bg-red-50">
              <UserX className="h-3.5 w-3.5" />
              Deactivate
            </button>
          </div>
        </div>
      )}

      {/* Team Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              {canManage && (
                <th className="table-cell w-10">
                  <input
                    type="checkbox"
                    checked={filteredAndSortedUsers.length > 0 && selectedIds.size === paginatedUsers.length && paginatedUsers.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
              )}
              <th className="table-cell text-left">Member</th>
              <th className="table-cell text-left">Role</th>
              {isSuperAdmin && <th className="table-cell text-left hidden md:table-cell">Division</th>}
              <th className="table-cell text-left hidden md:table-cell">Contact</th>
              <th className="table-cell text-center hidden lg:table-cell">Leads</th>
              <th className="table-cell text-center hidden lg:table-cell">Tasks</th>
              <th className="table-cell text-left hidden md:table-cell">Status</th>
              <th className="table-cell text-left hidden lg:table-cell">Last Active</th>
              {canManage && <th className="table-cell text-right w-12"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="table-row">
                  {canManage && <td className="table-cell"><div className="skeleton h-4 w-4 rounded" /></td>}
                  <td className="table-cell"><div className="flex items-center gap-3"><div className="skeleton h-10 w-10 rounded-full" /><div><div className="skeleton h-4 w-32 mb-1" /><div className="skeleton h-3 w-24" /></div></div></td>
                  <td className="table-cell"><div className="skeleton h-5 w-20 rounded-md" /></td>
                  {isSuperAdmin && <td className="table-cell hidden md:table-cell"><div className="skeleton h-5 w-24 rounded-md" /></td>}
                  <td className="table-cell hidden md:table-cell"><div className="skeleton h-3 w-36" /></td>
                  <td className="table-cell hidden lg:table-cell"><div className="skeleton h-4 w-8 mx-auto" /></td>
                  <td className="table-cell hidden lg:table-cell"><div className="skeleton h-4 w-8 mx-auto" /></td>
                  <td className="table-cell hidden md:table-cell"><div className="skeleton h-5 w-16 rounded-md" /></td>
                  <td className="table-cell hidden lg:table-cell"><div className="skeleton h-3 w-20" /></td>
                  {canManage && <td className="table-cell" />}
                </tr>
              ))
            ) : filteredAndSortedUsers.length === 0 ? (
              <tr>
                <td colSpan={canManage ? (isSuperAdmin ? 10 : 9) : (isSuperAdmin ? 8 : 7)}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><UsersIcon className="h-6 w-6" /></div>
                    <p className="text-sm font-medium text-text-primary">No team members found</p>
                    <p className="text-xs text-text-tertiary mt-1">Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedUsers.map((user, _idx) => {
                const role = roleConfig[user.role] || roleConfig.VIEWER;
                const RoleIcon = role.icon;
                const isCurrentUser = currentUser?.id === user.id;
                const isSelf = isCurrentUser;
                const divName = getUserDivisionName(user);
                const divColor = getDivisionBadgeColor(user.organizationId, divisions);

                return (
                  <tr key={user.id} className={`table-row group ${!user.isActive ? 'opacity-50' : ''}`}>
                    {/* Checkbox */}
                    {canManage && (
                      <td className="table-cell">
                        {!isSelf && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                    )}

                    {/* Member */}
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-sm font-semibold text-white shadow-soft">
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                            user.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {user.firstName} {user.lastName}
                            {isCurrentUser && <span className="text-2xs text-text-tertiary ml-1 font-normal">(you)</span>}
                          </p>
                          <p className="text-2xs text-text-tertiary truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="table-cell">
                      <span className={`badge ${role.bg} ${role.text} ring-1 ${role.ring}`}>
                        <RoleIcon className="h-3 w-3" />
                        {role.label}
                      </span>
                    </td>

                    {/* Division (SUPER_ADMIN only) */}
                    {isSuperAdmin && (
                      <td className="table-cell hidden md:table-cell">
                        <span className={`badge ${divColor.bg} ${divColor.text} ring-1 ${divColor.ring}`}>
                          <Building2 className="h-3 w-3" />
                          {divName}
                        </span>
                      </td>
                    )}

                    {/* Contact */}
                    <td className="table-cell hidden md:table-cell">
                      <div className="space-y-0.5">
                        <p className="text-2xs text-text-secondary flex items-center gap-1">
                          <Mail className="h-3 w-3 text-text-tertiary" />
                          {user.email}
                        </p>
                        {user.phone && (
                          <p className="text-2xs text-text-secondary flex items-center gap-1">
                            <Phone className="h-3 w-3 text-text-tertiary" />
                            {user.phone}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Leads Count */}
                    <td className="table-cell text-center hidden lg:table-cell">
                      <span className="text-sm font-medium text-text-primary">{user._count?.assignedLeads || 0}</span>
                    </td>

                    {/* Tasks Count */}
                    <td className="table-cell text-center hidden lg:table-cell">
                      <span className="text-sm font-medium text-text-primary">{user._count?.tasks || 0}</span>
                    </td>

                    {/* Status */}
                    <td className="table-cell hidden md:table-cell">
                      {user.isActive ? (
                        <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="badge bg-red-50 text-red-700 ring-1 ring-red-600/10">
                          <XCircle className="h-3 w-3" /> Inactive
                        </span>
                      )}
                    </td>

                    {/* Last Active — date AND time */}
                    <td className="table-cell hidden lg:table-cell">
                      {user.lastLoginAt ? (
                        <span className="text-2xs text-text-tertiary">
                          {new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' '}
                          {new Date(user.lastLoginAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-2xs text-text-tertiary">Never</span>
                      )}
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="table-cell text-right">
                        {!isSelf && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === user.id ? null : user.id);
                              }}
                              className="btn-icon h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {activeMenu === user.id && (
                              <div
                                ref={(el) => {
                                  if (el) {
                                    const rect = el.getBoundingClientRect();
                                    if (rect.bottom > window.innerHeight - 8) {
                                      el.style.top = 'auto';
                                      el.style.bottom = '100%';
                                      el.style.marginBottom = '4px';
                                      el.style.marginTop = '0';
                                    }
                                  }
                                }}
                                className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-float border border-border p-1.5 animate-scale-in z-50"
                              >
                                <button
                                  onClick={() => { setEditingUser(user); setActiveMenu(null); }}
                                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-text-tertiary" />
                                  Edit Member
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => { setResetPasswordUser(user); setActiveMenu(null); }}
                                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
                                  >
                                    <Key className="h-3.5 w-3.5 text-text-tertiary" />
                                    Reset Password
                                  </button>
                                )}
                                <div className="my-1 h-px bg-border-subtle" />
                                {user.isActive ? (
                                  <button
                                    onClick={() => { handleDeactivate(user); setActiveMenu(null); }}
                                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <UserX className="h-3.5 w-3.5" />
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { handleReactivate(user); setActiveMenu(null); }}
                                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  >
                                    <UserCheck className="h-3.5 w-3.5" />
                                    Reactivate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>


      {/* Pagination */}
      {filteredAndSortedUsers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-surface-secondary/30 rounded-b-xl">
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <span>
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedUsers.length)}–{Math.min(currentPage * pageSize, filteredAndSortedUsers.length)} of {filteredAndSortedUsers.length} member{filteredAndSortedUsers.length !== 1 ? 's' : ''}
            </span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1 text-xs rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1.5 text-xs font-medium rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="First page"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {(() => {
              const pages: number[] = [];
              const maxVisible = 5;
              let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
              let end = Math.min(totalPages, start + maxVisible - 1);
              if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
              if (start > 1) { pages.push(1); if (start > 2) pages.push(-1); }
              for (let i = start; i <= end; i++) pages.push(i);
              if (end < totalPages) { if (end < totalPages - 1) pages.push(-2); pages.push(totalPages); }
              return pages.map((p, i) =>
                p < 0 ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-text-tertiary">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`min-w-[32px] px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      currentPage === p
                        ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                        : 'bg-white text-text-secondary border-border hover:bg-surface-secondary'
                    }`}
                  >
                    {p}
                  </button>
                )
              );
            })()}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1.5 text-xs font-medium rounded-lg border border-border bg-white text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Last page"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={fetchUsers}
          isSuperAdmin={isSuperAdmin}
          divisions={divisions}
        />
      )}
      {editingUser && <EditMemberModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={fetchUsers} />}
      {resetPasswordUser && <ResetPasswordModal user={resetPasswordUser} onClose={() => setResetPasswordUser(null)} />}
      {showRoles && <RolesAccessModal onClose={() => setShowRoles(false)} />}
    </div>
  );
}

/* ─── Invite Modal ───────────────────────────────────────────────── */
function InviteModal({
  onClose,
  onCreated,
  isSuperAdmin,
  divisions,
}: {
  onClose: () => void;
  onCreated: () => void;
  isSuperAdmin: boolean;
  divisions: Organization[];
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', role: 'SALES_REP', password: '', divisionId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inviteRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSuperAdmin && !form.divisionId) {
      setError('Please select a division for this team member');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: any = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        password: form.password,
      };
      if (isSuperAdmin && form.divisionId) {
        payload.divisionId = form.divisionId;
      }
      await api.inviteUser(payload);
      onClose();
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Invite Team Member</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">Add a new member to your organization</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name</label>
              <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" />
            </div>
          </div>
          <div>
            <label className="label">Email Address</label>
            <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" />
          </div>

          {isSuperAdmin && divisions.length > 0 && (
            <div>
              <label className="label">
                Division <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
                <select
                  className="input pl-10 appearance-none cursor-pointer"
                  required
                  value={form.divisionId}
                  onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
                >
                  <option value="">Select a division...</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>{div.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
              </div>
              <p className="text-2xs text-text-tertiary mt-1">This member will be added to the selected division</p>
            </div>
          )}

          <div>
            <label className="label">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {inviteRoleKeys.map((key) => {
                const config = roleConfig[key];
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, role: key })}
                    className={`p-3 rounded-lg border text-left transition-all duration-150 ${
                      form.role === key
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-border hover:border-border-strong hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-3.5 w-3.5 ${form.role === key ? 'text-brand-600' : config.text}`} />
                      <span className={`text-sm font-medium ${form.role === key ? 'text-brand-700' : 'text-text-primary'}`}>{config.label}</span>
                    </div>
                    <p className="text-2xs text-text-tertiary line-clamp-1">{config.description.split(',')[0]}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label">Temporary Password</label>
            <input type="password" className="input" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
            <p className="text-2xs text-text-tertiary mt-1">The member should change this after first login</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit Member Modal ──────────────────────────────────────────── */
function EditMemberModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const { user: currentUser } = useAuthStore();
  const { rolePermissions, userOverrides, loadPermissions } = usePermissionsStore();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN' || isSuperAdmin;

  const [tab, setTab] = useState<'details' | 'permissions'>('details');
  const [form, setForm] = useState<{ firstName: string; lastName: string; role: string; phone: string }>({
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingOverrides = userOverrides[user.id] || {};
  const [permOverrides, setPermOverrides] = useState<Record<string, boolean | undefined>>({ ...existingOverrides });
  const [savingPerms, setSavingPerms] = useState(false);

  const editRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateUser(user.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        phone: form.phone || null,
      });
      onClose();
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePerms = async () => {
    setSavingPerms(true);
    setError('');
    try {
      const cleanOverrides: Record<string, boolean> = {};
      let hasOverrides = false;
      for (const [key, val] of Object.entries(permOverrides)) {
        if (typeof val === 'boolean') {
          cleanOverrides[key] = val;
          hasOverrides = true;
        }
      }
      await api.updateUserPermissions(user.id, hasOverrides ? cleanOverrides : null);
      await loadPermissions();
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  const cycleOverride = (feature: string) => {
    if (!isAdmin) return;
    const current = permOverrides[feature];
    if (current === undefined) {
      setPermOverrides({ ...permOverrides, [feature]: true });
    } else if (current === true) {
      setPermOverrides({ ...permOverrides, [feature]: false });
    } else {
      const copy = { ...permOverrides };
      delete copy[feature];
      setPermOverrides(copy);
    }
  };

  const rolePermsForUser = rolePermissions[form.role] || {};

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Edit Team Member</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        {isAdmin && (
          <div className="flex border-b border-border-subtle px-6">
            <button
              onClick={() => setTab('details')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === 'details' ? 'border-brand-500 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setTab('permissions')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === 'permissions' ? 'border-brand-500 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Permission Overrides
            </button>
          </div>
        )}

        {tab === 'details' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-secondary">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-lg font-semibold text-white shadow-soft">
                {form.firstName[0]}{form.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-text-primary">{form.firstName} {form.lastName}</p>
                <p className="text-sm text-text-secondary">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 123 4567" />
            </div>

            <div>
              <label className="label">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {editRoleKeys.map((key) => {
                  const config = roleConfig[key];
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm({ ...form, role: key })}
                      className={`p-3 rounded-lg border text-left transition-all duration-150 ${
                        form.role === key
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                          : 'border-border hover:border-border-strong hover:bg-surface-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`h-3.5 w-3.5 ${form.role === key ? 'text-brand-600' : config.text}`} />
                        <span className={`text-sm font-medium ${form.role === key ? 'text-brand-700' : 'text-text-primary'}`}>{config.label}</span>
                      </div>
                      <p className="text-2xs text-text-tertiary line-clamp-1">{config.description.split(',')[0]}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && tab === 'details' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 ring-1 ring-amber-200">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Click a feature to cycle through: <strong>Inherit from role</strong> &rarr; <strong>Grant</strong> &rarr; <strong>Deny</strong>.
                  Overrides apply only to this user, regardless of their role.
                </p>
              </div>
            </div>

            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell text-left">Feature</th>
                    <th className="table-cell text-center">Role Default</th>
                    <th className="table-cell text-center">Override</th>
                    <th className="table-cell text-center">Effective</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {FEATURES.map((feature) => {
                    const roleDefault = rolePermsForUser[feature.key] ?? false;
                    const override = permOverrides[feature.key];
                    const effective = override !== undefined ? override : roleDefault;

                    return (
                      <tr key={feature.key} className="table-row">
                        <td className="table-cell text-sm font-medium text-text-primary">{feature.label}</td>
                        <td className="table-cell text-center">
                          {roleDefault ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="table-cell text-center">
                          <button
                            type="button"
                            onClick={() => cycleOverride(feature.key)}
                            className="inline-flex items-center justify-center"
                          >
                            {override === undefined ? (
                              <span className="text-2xs text-text-tertiary px-2 py-0.5 rounded bg-gray-100">Inherit</span>
                            ) : override ? (
                              <span className="text-2xs text-emerald-700 px-2 py-0.5 rounded bg-emerald-50 ring-1 ring-emerald-200">Grant</span>
                            ) : (
                              <span className="text-2xs text-red-700 px-2 py-0.5 rounded bg-red-50 ring-1 ring-red-200">Deny</span>
                            )}
                          </button>
                        </td>
                        <td className="table-cell text-center">
                          {effective ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && tab === 'permissions' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleSavePerms} disabled={savingPerms} className="btn-primary">
                <Save className="h-3.5 w-3.5" />
                {savingPerms ? 'Saving...' : 'Save Overrides'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Reset Password Modal ───────────────────────────────────────── */
function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.resetUserPassword(user.id, password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-md relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Reset Password</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">{user.firstName} {user.lastName} ({user.email})</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-semibold text-text-primary">Password Reset Successfully</p>
            <p className="text-sm text-text-secondary mt-1">The new password has been set for {user.firstName}.</p>
            <button onClick={onClose} className="btn-primary mt-4">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 ring-1 ring-amber-200">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">This will immediately change the password for <strong>{user.firstName} {user.lastName}</strong>. They will need to use the new password on their next login.</p>
              </div>
            </div>

            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-2xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Roles & Access Modal ───────────────────────────────────────── */
function RolesAccessModal({ onClose }: { onClose: () => void }) {
  const { user: currentUser } = useAuthStore();
  const { rolePermissions, loadPermissions } = usePermissionsStore();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN' || isSuperAdmin;

  const matrixRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

  const [editPerms, setEditPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const clone: Record<string, Record<string, boolean>> = {};
    for (const role of matrixRoleKeys) {
      clone[role] = { ...(rolePermissions[role] || {}) };
    }
    setEditPerms(clone);
  }, [rolePermissions]);

  const togglePerm = (role: string, feature: string) => {
    if (!isAdmin) return;
    setEditPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [feature]: !prev[role]?.[feature] },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateRolePermissions(editPerms);
      await loadPermissions();
      setDirty(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const clone: Record<string, Record<string, boolean>> = {};
    for (const role of matrixRoleKeys) {
      clone[role] = { ...(rolePermissions[role] || {}) };
    }
    setEditPerms(clone);
    setDirty(false);
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-3xl relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Roles &amp; Access Rights</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {isAdmin ? 'Toggle permissions for each role. Changes apply to all users with that role.' : 'Overview of permissions for each role'}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {matrixRoleKeys.map((key) => {
              const config = roleConfig[key];
              const Icon = config.icon;
              return (
                <div key={key} className={`p-3 rounded-lg ${config.bg} ring-1 ${config.ring}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className={`h-4 w-4 ${config.text}`} />
                    <span className={`text-sm font-semibold ${config.text}`}>{config.label}</span>
                  </div>
                  <p className="text-2xs text-text-secondary">{config.description}</p>
                </div>
              );
            })}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="table-cell text-left">Feature</th>
                  {matrixRoleKeys.map((key) => {
                    const config = roleConfig[key];
                    return (
                      <th key={key} className="table-cell text-center">
                        <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {FEATURES.map((feature) => (
                  <tr key={feature.key} className="table-row">
                    <td className="table-cell">
                      <div>
                        <span className="text-sm font-medium text-text-primary">{feature.label}</span>
                        <span className="text-2xs text-text-tertiary ml-2">{feature.section}</span>
                      </div>
                    </td>
                    {matrixRoleKeys.map((role) => (
                      <td key={role} className="table-cell text-center">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => togglePerm(role, feature.key)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                              editPerms[role]?.[feature.key] ? 'bg-brand-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              editPerms[role]?.[feature.key] ? 'translate-x-[18px]' : 'translate-x-[3px]'
                            }`} />
                          </button>
                        ) : editPerms[role]?.[feature.key] ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex justify-end gap-2">
          {isAdmin && dirty && (
            <button onClick={handleReset} className="btn-secondary">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          {isAdmin && dirty ? (
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          ) : (
            <button onClick={onClose} className="btn-secondary">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
