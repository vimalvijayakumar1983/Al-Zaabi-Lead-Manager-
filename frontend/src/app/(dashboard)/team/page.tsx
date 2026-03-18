'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore, FEATURES } from '@/lib/permissions';
import type { User, Organization, DivisionMembership } from '@/types';
import {
  UserPlus, X, Shield, Users as UsersIcon, Crown, Eye,
  MoreHorizontal, Pencil, Key, UserX, UserCheck, Search,
  Mail, Phone, Calendar, BarChart3, Check, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Filter, RotateCcw, Save,
  Building2, Sparkles, ArrowUpDown, ArrowUp, ArrowDown,
  Clock, TrendingUp, ListChecks, Hash, SlidersHorizontal,
  UserCog, Zap, Star, Trash2, Plus, RefreshCw,
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


  // Division Memberships

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
  const [showBulkRoleDropdown, setShowBulkRoleDropdown] = useState(false);
  const [showBulkDivisionDropdown, setShowBulkDivisionDropdown] = useState(false);
  const bulkRoleRef = useRef<HTMLDivElement>(null);
  const bulkDivisionRef = useRef<HTMLDivElement>(null);

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

  // Close bulk dropdowns on outside click
  useEffect(() => {
    if (!showBulkRoleDropdown && !showBulkDivisionDropdown) return;
    const handler = (e: MouseEvent) => {
      if (bulkRoleRef.current && !bulkRoleRef.current.contains(e.target as Node)) {
        setShowBulkRoleDropdown(false);
      }
      if (bulkDivisionRef.current && !bulkDivisionRef.current.contains(e.target as Node)) {
        setShowBulkDivisionDropdown(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showBulkRoleDropdown, showBulkDivisionDropdown]);

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


  // Division Memberships
  const [userMemberships, setUserMemberships] = useState<Record<string, DivisionMembership[]>>({});
  const [showMembershipModal, setShowMembershipModal] = useState<User | null>(null);
  const [membershipLoading, setMembershipLoading] = useState<string | null>(null);
  const [addDivisionRole, setAddDivisionRole] = useState<string>('SALES_REP');
  const [addDivisionId, setAddDivisionId] = useState<string>('');

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedUsers.slice(start, start + pageSize);
  }, [filteredAndSortedUsers, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilters, statusFilter, divisionFilter, sortField, sortDirection]);


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


  // Load division memberships for all users
  const loadAllMemberships = useCallback(async (userList: User[]) => {
    try {
      const results: Record<string, DivisionMembership[]> = {};
      await Promise.all(
        userList.map(async (u) => {
          try {
            const memberships = await api.getUserDivisions(u.id);
            results[u.id] = memberships;
          } catch { results[u.id] = []; }
        })
      );
      setUserMemberships(results);
    } catch {}
  }, []);

  useEffect(() => {
    if (users.length > 0) loadAllMemberships(users);
  }, [users, loadAllMemberships]);

  const handleAddToDivision = async (userId: string) => {
    if (!addDivisionId) return;
    setMembershipLoading(userId);
    try {
      await api.addUserToDivision(userId, { divisionId: addDivisionId, role: addDivisionRole });
      const memberships = await api.getUserDivisions(userId);
      setUserMemberships(prev => ({ ...prev, [userId]: memberships }));
      setAddDivisionId('');
      setAddDivisionRole('SALES_REP');
    } catch (err: any) {
      alert(err?.message || 'Failed to add division');
    }
    setMembershipLoading(null);
  };

  const handleRemoveFromDivision = async (userId: string, divisionId: string) => {
    setMembershipLoading(userId);
    try {
      await api.removeUserFromDivision(userId, divisionId);
      const memberships = await api.getUserDivisions(userId);
      setUserMemberships(prev => ({ ...prev, [userId]: memberships }));
    } catch (err: any) {
      alert(err?.message || 'Failed to remove from division');
    }
    setMembershipLoading(null);
  };

  const handleUpdateMembershipRole = async (userId: string, divisionId: string, role: string) => {
    setMembershipLoading(userId);
    try {
      await api.updateUserDivisionRole(userId, divisionId, { role });
      const memberships = await api.getUserDivisions(userId);
      setUserMemberships(prev => ({ ...prev, [userId]: memberships }));
    } catch (err: any) {
      alert(err?.message || 'Failed to update role');
    }
    setMembershipLoading(null);
  };

  const handleSetPrimaryDivision = async (userId: string, divisionId: string) => {
    setMembershipLoading(userId);
    try {
      await api.updateUserDivisionRole(userId, divisionId, { isPrimary: true });
      const memberships = await api.getUserDivisions(userId);
      setUserMemberships(prev => ({ ...prev, [userId]: memberships }));
    } catch (err: any) {
      alert(err?.message || 'Failed to set primary division');
    }
    setMembershipLoading(null);
  };

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

  // ─── Delete User State & Handler ──────────────────────────────
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [deleteReassignTo, setDeleteReassignTo] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setDeleteLoading(true);
    try {
      await api.deleteUserPermanently(deleteConfirmUser.id, deleteReassignTo || undefined);
      alert(`${deleteConfirmUser.firstName} ${deleteConfirmUser.lastName} permanently deleted`);
      setDeleteConfirmUser(null);
      setDeleteReassignTo('');
      fetchUsers();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete user');
    } finally {
      setDeleteLoading(false);
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

  const handleBulkChangeRole = async (role: string) => {
    if (!role || !['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'].includes(role)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.updateUser(id, { role })));
      setSelectedIds(new Set());
      setShowBulkRoleDropdown(false);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkTransferDivision = async (divisionId: string) => {
    if (!isSuperAdmin || !divisionId) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.updateUser(id, { divisionId } as any)));
      setSelectedIds(new Set());
      setShowBulkDivisionDropdown(false);
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
          <button onClick={() => window.location.href = '/roles'} className="btn-secondary">
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


      {/* ─── Division Scope Bar ─── */}
      {isSuperAdmin && divisions.length > 0 && (
        <div className="bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-200/60 rounded-xl p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-white shadow-sm flex items-center justify-center">
                <Building2 className="h-4.5 w-4.5 text-brand-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-brand-700/70 uppercase tracking-wider">View by Division</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {divisionFilter === 'all' 
                    ? `Showing all ${divisions.length} divisions`
                    : `Filtered to ${divisions.find(d => d.id === divisionFilter)?.name || 'selected division'}`
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {divisions.map((div) => (
                <button
                  key={div.id}
                  onClick={() => setDivisionFilter(divisionFilter === div.id ? 'all' : div.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 ${
                    divisionFilter === div.id
                      ? 'bg-white text-brand-700 border-brand-300 shadow-sm ring-1 ring-brand-200'
                      : 'bg-white/60 text-text-secondary border-transparent hover:bg-white hover:border-border hover:shadow-sm'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full mr-1.5"
                    style={{ backgroundColor: (div as any).primaryColor || '#6366f1' }}
                  />
                  {div.name}
                </button>
              ))}
              {divisionFilter !== 'all' && (
                <button
                  onClick={() => setDivisionFilter('all')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-brand-600 hover:bg-white/80 transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
            <span className="text-xl font-bold text-text-primary">{filteredAndSortedUsers.length}</span>
          </div>
          <p className="text-sm font-medium text-text-primary">Total Users</p>
          <p className="text-2xs text-text-tertiary mt-0.5">{divisionFilter !== 'all' ? 'In selected division' : 'All team members'}</p>
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
            {/* Change Role Dropdown */}
            <div className="relative" ref={bulkRoleRef}>
              <button
                onClick={() => { setShowBulkRoleDropdown(!showBulkRoleDropdown); setShowBulkDivisionDropdown(false); }}
                className="btn-secondary text-sm"
              >
                <UserCog className="h-3.5 w-3.5" />
                Change Role
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBulkRoleDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showBulkRoleDropdown && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl ring-1 ring-gray-200 py-1 z-[60] animate-fade-in">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Select Role</div>
                  {[
                    { value: 'ADMIN', label: 'Admin', icon: '👑', desc: 'Full division access' },
                    { value: 'MANAGER', label: 'Manager', icon: '📋', desc: 'Manage team & leads' },
                    { value: 'SALES_REP', label: 'Sales Rep', icon: '💼', desc: 'Work assigned leads' },
                    { value: 'VIEWER', label: 'Viewer', icon: '👁️', desc: 'Read-only access' },
                  ].map(role => (
                    <button
                      key={role.value}
                      onClick={() => handleBulkChangeRole(role.value)}
                      className="w-full text-left px-3 py-2.5 hover:bg-brand-50 flex items-center gap-3 transition-colors"
                    >
                      <span className="text-lg">{role.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{role.label}</div>
                        <div className="text-xs text-gray-500">{role.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Transfer Division Dropdown */}
            {isSuperAdmin && divisions.length > 0 && (
              <div className="relative" ref={bulkDivisionRef}>
                <button
                  onClick={() => { setShowBulkDivisionDropdown(!showBulkDivisionDropdown); setShowBulkRoleDropdown(false); }}
                  className="btn-secondary text-sm"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Transfer Division
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBulkDivisionDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showBulkDivisionDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl ring-1 ring-gray-200 py-1 z-[60] animate-fade-in max-h-72 overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Select Division</div>
                    {divisions.map(div => (
                      <button
                        key={div.id}
                        onClick={() => handleBulkTransferDivision(div.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-brand-50 flex items-center gap-3 transition-colors"
                      >
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: (div as any).settings?.brandColors?.primary || '#6366f1' }}
                        >
                          {div.name?.charAt(0) || 'D'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{div.name}</div>
                          {(div as any).tradeName && (
                            <div className="text-xs text-gray-500 truncate">{(div as any).tradeName}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleBulkDeactivate} className="btn-secondary text-sm text-red-600 hover:bg-red-50">
              <UserX className="h-3.5 w-3.5" />
              Deactivate
            </button>
          </div>
        </div>
      )}

      {/* Team Table */}
      <div className="card">
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
              {isSuperAdmin && <th className="table-cell text-left hidden md:table-cell">Divisions</th>}
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
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowMembershipModal(user); }}
                          className="flex flex-wrap gap-1 max-w-[260px] group/div cursor-pointer"
                          title="Click to manage divisions"
                        >
                          {(userMemberships[user.id] || []).length > 0 ? (
                            <>
                              {(userMemberships[user.id] || []).slice(0, 3).map((m: any) => (
                                <span key={m.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-medium border" style={{
                                  backgroundColor: (m.division?.primaryColor || '#6366f1') + '15',
                                  borderColor: (m.division?.primaryColor || '#6366f1') + '30',
                                  color: m.division?.primaryColor || '#6366f1'
                                }}>
                                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.division?.primaryColor || '#6366f1' }} />
                                  {(m.division?.name || '?').replace('Al-Zaabi ', '')}
                                  {m.isPrimary && <span className="ml-0.5">★</span>}
                                </span>
                              ))}
                              {(userMemberships[user.id] || []).length > 3 && (
                                <span className="text-2xs text-text-tertiary">+{(userMemberships[user.id] || []).length - 3}</span>
                              )}
                            </>
                          ) : (
                            <span className={`badge ${divColor.bg} ${divColor.text} ring-1 ${divColor.ring}`}>
                              <Building2 className="h-3 w-3" />
                              {divName}
                            </span>
                          )}
                          <span className="text-2xs text-brand-500 opacity-0 group-hover/div:opacity-100 ml-0.5">✎</span>
                        </button>
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
                                  if (el && el.parentElement) {
                                    const btnRect = el.parentElement.querySelector('button')?.getBoundingClientRect();
                                    if (!btnRect) return;
                                    const menuHeight = el.offsetHeight;
                                    const spaceBelow = window.innerHeight - btnRect.bottom;
                                    if (spaceBelow < menuHeight + 8) {
                                      el.style.top = `${btnRect.top - menuHeight - 4}px`;
                                    } else {
                                      el.style.top = `${btnRect.bottom + 4}px`;
                                    }
                                    el.style.left = `${Math.max(8, btnRect.right - el.offsetWidth)}px`;
                                  }
                                }}
                                className="fixed w-52 bg-white rounded-xl shadow-float border border-border p-1.5 animate-scale-in z-[9999]"
                              >
                                <button
                                  onClick={() => { setEditingUser(user); setActiveMenu(null); }}
                                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-text-tertiary" />
                                  Edit Member
                                </button>
                                <button
                                  onClick={() => { setShowMembershipModal(user); setActiveMenu(null); }}
                                  className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
                                >
                                  <Building2 className="h-3.5 w-3.5 text-text-tertiary" />
                                  Manage Divisions
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
                                {isAdmin && (
                                  <>
                                    <div className="my-1 h-px bg-border-subtle" />
                                    <button
                                      onClick={() => { setDeleteConfirmUser(user); setActiveMenu(null); }}
                                      className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete Permanently
                                    </button>
                                  </>
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
      {showMembershipModal && (
        <ManageDivisionsModal
          user={showMembershipModal}
          divisions={divisions}
          onClose={() => setShowMembershipModal(null)}
          onSaved={fetchUsers}
        />
      )}

      {/* ─── Delete User Confirmation Modal ──────────────────────── */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setDeleteConfirmUser(null); setDeleteReassignTo(''); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-red-50 border-b border-red-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-900">Delete User Permanently</h2>
                  <p className="text-sm text-red-700">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">
                  {deleteConfirmUser.firstName} {deleteConfirmUser.lastName}
                </p>
                <p className="text-xs text-gray-500">{deleteConfirmUser.email}</p>
                <p className="text-xs text-gray-500 mt-1">Role: {deleteConfirmUser.role}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Warning:</strong> This will permanently remove this user, their notifications, activity history, and division memberships.
                </p>
              </div>

              {/* Reassign leads dropdown — scoped to same division(s) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reassign leads & tasks to:
                </label>
                <select
                  value={deleteReassignTo}
                  onChange={(e) => setDeleteReassignTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">No reassignment (delete if no leads)</option>
                  {(() => {
                    // Get the divisions the deleted user belongs to
                    const deletedUserDivs = (userMemberships[deleteConfirmUser.id] || []).map((m: any) => m.divisionId || m.organizationId);
                    // If user has no division memberships, fall back to showing all active users
                    if (deletedUserDivs.length === 0) {
                      return users
                        .filter((u) => u.id !== deleteConfirmUser.id && u.isActive)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName} ({roleConfig[u.role]?.label || u.role})
                          </option>
                        ));
                    }
                    // Group eligible users by division
                    const divisionGroups: { division: Organization; users: User[] }[] = [];
                    for (const divId of deletedUserDivs) {
                      const div = divisions.find((d) => d.id === divId);
                      if (!div) continue;
                      const divUsers = users.filter((u) => {
                        if (u.id === deleteConfirmUser.id || !u.isActive) return false;
                        const uDivs = (userMemberships[u.id] || []).map((m: any) => m.divisionId || m.organizationId);
                        return uDivs.includes(divId);
                      });
                      if (divUsers.length > 0) {
                        divisionGroups.push({ division: div, users: divUsers });
                      }
                    }
                    // Render optgroups by division
                    if (divisionGroups.length === 1) {
                      // Single division — no need for optgroup header
                      return divisionGroups[0].users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({roleConfig[u.role]?.label || u.role})
                        </option>
                      ));
                    }
                    return divisionGroups.map((g) => (
                      <optgroup key={g.division.id} label={g.division.name}>
                        {g.users.map((u) => (
                          <option key={`${g.division.id}-${u.id}`} value={u.id}>
                            {u.firstName} {u.lastName} ({roleConfig[u.role]?.label || u.role})
                          </option>
                        ))}
                      </optgroup>
                    ));
                  })()}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {(() => {
                    const deletedUserDivs = (userMemberships[deleteConfirmUser.id] || []).map((m: any) => m.divisionId || m.organizationId);
                    const divNames = deletedUserDivs.map((id: string) => divisions.find((d) => d.id === id)?.name).filter(Boolean);
                    if (divNames.length > 0) {
                      return `Showing users from: ${divNames.join(', ')}`;
                    }
                    return 'If the user has assigned leads, you must select someone to reassign them to.';
                  })()}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 bg-gray-50">
              <button
                onClick={() => { setDeleteConfirmUser(null); setDeleteReassignTo(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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

/* ─── Manage Divisions Modal ──────────────────────────────────── */
function ManageDivisionsModal({ user, divisions, onClose, onSaved }: { 
  user: User; 
  divisions: any[]; 
  onClose: () => void; 
  onSaved: () => void;
}) {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [originalMemberships, setOriginalMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingDivision, setAddingDivision] = useState(false);
  const [selectedNewDivision, setSelectedNewDivision] = useState('');
  const [selectedNewRole, setSelectedNewRole] = useState('SALES_REP');
  const [pendingAdds, setPendingAdds] = useState<any[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<string[]>([]);
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Record<string, string>>({});
  const [pendingPrimary, setPendingPrimary] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMemberships();
  }, []);

  const loadMemberships = async () => {
    try {
      setLoading(true);
      const data = await api.getUserDivisions(user.id);
      const list = Array.isArray(data) ? data : [];
      setMemberships(list);
      setOriginalMemberships(JSON.parse(JSON.stringify(list)));
    } catch (err) {
      console.error('Failed to load memberships:', err);
      if (user.organizationId) {
        const fallback = [{
          id: 'current',
          divisionId: user.organizationId,
          role: user.role,
          isPrimary: true,
          division: divisions.find(d => d.id === user.organizationId) || { name: 'Current Division' }
        }];
        setMemberships(fallback);
        setOriginalMemberships(JSON.parse(JSON.stringify(fallback)));
      }
    } finally {
      setLoading(false);
    }
  };

  // Local state changes (no API calls until Save)
  const handleRoleChange = (divisionId: string, newRole: string) => {
    setPendingRoleChanges(prev => ({ ...prev, [divisionId]: newRole }));
    setMemberships(prev => prev.map(m => 
      m.divisionId === divisionId ? { ...m, role: newRole } : m
    ));
  };

  const handleSetPrimary = (divisionId: string) => {
    setPendingPrimary(divisionId);
    setMemberships(prev => prev.map(m => ({
      ...m,
      isPrimary: m.divisionId === divisionId
    })));
  };

  const handleRemove = (membership: any) => {
    const activeMemberships = memberships.filter(m => !pendingRemoves.includes(m.divisionId));
    if (activeMemberships.length <= 1) {
      alert('User must belong to at least one division');
      return;
    }
    setPendingRemoves(prev => [...prev, membership.divisionId]);
  };

  const undoRemove = (divisionId: string) => {
    setPendingRemoves(prev => prev.filter(id => id !== divisionId));
  };

  const handleAddToPending = () => {
    if (!selectedNewDivision) return;
    const div = divisions.find(d => d.id === selectedNewDivision);
    setPendingAdds(prev => [...prev, {
      divisionId: selectedNewDivision,
      role: selectedNewRole,
      division: div || { name: 'Division' }
    }]);
    setSelectedNewDivision('');
    setSelectedNewRole('SALES_REP');
    setAddingDivision(false);
  };

  const removePendingAdd = (divisionId: string) => {
    setPendingAdds(prev => prev.filter(a => a.divisionId !== divisionId));
  };

  const hasChanges = pendingAdds.length > 0 || pendingRemoves.length > 0 || 
    Object.keys(pendingRoleChanges).length > 0 || pendingPrimary !== null;

  const handleSaveAll = async () => {
    setSaving(true);
    setError('');
    try {
      // Process removes
      for (const divId of pendingRemoves) {
        await api.removeUserFromDivision(user.id, divId);
      }
      // Process role changes
      for (const [divId, role] of Object.entries(pendingRoleChanges)) {
        if (!pendingRemoves.includes(divId)) {
          await api.updateUserDivisionRole(user.id, divId, { role });
        }
      }
      // Process primary change
      if (pendingPrimary && !pendingRemoves.includes(pendingPrimary)) {
        await api.updateUserDivisionRole(user.id, pendingPrimary, { isPrimary: true });
      }
      // Process adds
      for (const add of pendingAdds) {
        await api.addUserToDivision(user.id, { divisionId: add.divisionId, role: add.role });
      }
      
      // Success!
      setSaveSuccess(true);
      setPendingAdds([]);
      setPendingRemoves([]);
      setPendingRoleChanges({});
      setPendingPrimary(null);
      onSaved();
      
      // Reload fresh data
      await loadMemberships();
      
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      console.error('Failed to save:', err);
      setError(err?.message || 'Failed to save changes. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const availableDivisions = divisions.filter(
    d => !memberships.some(m => m.divisionId === d.id) && 
         !pendingAdds.some(a => a.divisionId === d.id) &&
         !pendingRemoves.includes(d.id) === false // show removed ones as available
  ).filter(d => !pendingAdds.some(a => a.divisionId === d.id));

  const roleOptions = [
    { value: 'SUPER_ADMIN', label: 'Super Admin', color: 'text-purple-600' },
    { value: 'ADMIN', label: 'Division Admin', color: 'text-blue-600' },
    { value: 'MANAGER', label: 'Manager / Team Lead', color: 'text-emerald-600' },
    { value: 'SALES_REP', label: 'Sales Rep', color: 'text-orange-600' },
    { value: 'VIEWER', label: 'Viewer', color: 'text-gray-600' },
  ];

  const changeCount = pendingAdds.length + pendingRemoves.length + 
    Object.keys(pendingRoleChanges).length + (pendingPrimary ? 1 : 0);

  return (
    <div className="modal">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl relative z-50 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-primary flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Manage Division Access</h2>
              <p className="text-sm text-text-secondary">{user.firstName} {user.lastName} · {user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-tertiary rounded-lg transition-colors">
            <X className="h-5 w-5 text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
              <span className="ml-2 text-text-secondary">Loading divisions...</span>
            </div>
          ) : (
            <>
              {/* Current Memberships */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                    Current Divisions ({memberships.filter(m => !pendingRemoves.includes(m.divisionId)).length})
                  </h3>
                </div>
                
                {memberships.length === 0 && pendingAdds.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No division memberships found</p>
                  </div>
                ) : (
                  memberships.map((membership) => {
                    const isRemoved = pendingRemoves.includes(membership.divisionId);
                    const isRoleChanged = pendingRoleChanges[membership.divisionId];
                    const isPrimaryChanged = pendingPrimary === membership.divisionId;
                    return (
                      <div key={membership.divisionId || membership.id} 
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                          isRemoved 
                            ? 'border-red-200 bg-red-50/50 opacity-60' 
                            : (isRoleChanged || isPrimaryChanged)
                              ? 'border-amber-300 bg-amber-50/50'
                              : 'border-border-primary bg-surface-secondary hover:bg-surface-tertiary'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: membership.division?.primaryColor || '#6366f1' }}>
                            {(membership.division?.name?.[0] || 'D').toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isRemoved ? 'line-through text-red-400' : 'text-text-primary'}`}>
                                {membership.division?.name || 'Unknown Division'}
                              </span>
                              {(pendingPrimary ? pendingPrimary === membership.divisionId : membership.isPrimary) && !isRemoved && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded">Primary</span>
                              )}
                              {isRemoved && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-600 rounded">Will be removed</span>
                              )}
                              {isRoleChanged && !isRemoved && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded">Modified</span>
                              )}
                            </div>
                            <span className="text-xs text-text-tertiary">{membership.division?.tradeName || ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isRemoved ? (
                            <button
                              onClick={() => undoRemove(membership.divisionId)}
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              Undo
                            </button>
                          ) : (
                            <>
                              <select
                                value={membership.role}
                                onChange={(e) => handleRoleChange(membership.divisionId, e.target.value)}
                                className="text-sm border border-border-primary rounded-lg px-2 py-1.5 bg-surface-primary text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                              >
                                {roleOptions.map(r => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                              {!(pendingPrimary ? pendingPrimary === membership.divisionId : membership.isPrimary) && (
                                <button
                                  onClick={() => handleSetPrimary(membership.divisionId)}
                                  className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                                  title="Set as primary division"
                                >
                                  <Star className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemove(membership)}
                                disabled={memberships.filter(m => !pendingRemoves.includes(m.divisionId)).length <= 1}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                                title="Remove from division"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pending Adds */}
              {pendingAdds.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    New Divisions to Add ({pendingAdds.length})
                  </h3>
                  {pendingAdds.map((add) => (
                    <div key={add.divisionId}
                      className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: add.division?.primaryColor || '#10b981' }}>
                          {(add.division?.name?.[0] || 'D').toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-text-primary">{add.division?.name}</span>
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded">New</span>
                          <div className="text-xs text-text-tertiary">
                            Role: {roleOptions.find(r => r.value === add.role)?.label || add.role}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removePendingAdd(add.divisionId)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Division Form */}
              {(divisions.filter(d => 
                !memberships.some(m => m.divisionId === d.id && !pendingRemoves.includes(m.divisionId)) && 
                !pendingAdds.some(a => a.divisionId === d.id)
              ).length > 0) && (
                <div className="pt-2">
                  {!addingDivision ? (
                    <button
                      onClick={() => setAddingDivision(true)}
                      className="flex items-center gap-2 w-full justify-center py-3 border-2 border-dashed border-border-primary rounded-xl text-sm font-medium text-text-secondary hover:text-brand-primary hover:border-brand-primary transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add to Another Division
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl border-2 border-brand-primary bg-brand-primary/5 space-y-3">
                      <h4 className="text-sm font-semibold text-text-primary">Select Division & Role</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Division</label>
                          <select
                            value={selectedNewDivision}
                            onChange={(e) => setSelectedNewDivision(e.target.value)}
                            className="w-full border border-border-primary rounded-lg px-3 py-2 text-sm bg-surface-primary text-text-primary"
                          >
                            <option value="">Select division...</option>
                            {divisions.filter(d => 
                              !memberships.some(m => m.divisionId === d.id && !pendingRemoves.includes(m.divisionId)) && 
                              !pendingAdds.some(a => a.divisionId === d.id)
                            ).map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Role</label>
                          <select
                            value={selectedNewRole}
                            onChange={(e) => setSelectedNewRole(e.target.value)}
                            className="w-full border border-border-primary rounded-lg px-3 py-2 text-sm bg-surface-primary text-text-primary"
                          >
                            {roleOptions.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setAddingDivision(false); setSelectedNewDivision(''); }}
                          className="px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddToPending}
                          disabled={!selectedNewDivision}
                          className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          + Add Division
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Success */}
        {saveSuccess && (
          <div className="mx-6 mb-2 flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <Check className="h-4 w-4 flex-shrink-0" />
            All changes saved successfully!
          </div>
        )}

        {/* Footer with prominent Save button */}
        <div className="flex items-center justify-between p-6 border-t border-border-primary bg-surface-secondary/50 rounded-b-2xl flex-shrink-0">
          <div className="text-sm text-text-tertiary">
            {hasChanges ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">{changeCount} unsaved change{changeCount !== 1 ? 's' : ''}</span>
            ) : (
              <span className="text-gray-500">No unsaved changes</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-colors"
            >
              {hasChanges ? 'Discard & Close' : 'Close'}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 ${
                hasChanges 
                  ? 'text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25' 
                  : 'text-gray-400 bg-gray-100 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
