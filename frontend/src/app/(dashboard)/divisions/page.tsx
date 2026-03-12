'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Organization, DivisionUser, DivisionStats } from '@/types';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Palette,
  X,
  Loader2,
  AlertTriangle,
  Users,
  Target,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  BarChart3,
  UserPlus,
  ArrowRightLeft,
  KeyRound,
  Shield,
  Eye,
  UserCog,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Trophy,
  Mail,
  Phone,
  RefreshCw,
  Ban,
  RotateCcw,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────
const ROLES = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'] as const;

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-100', text: 'text-purple-700' },
  ADMIN: { bg: 'bg-blue-100', text: 'text-blue-700' },
  MANAGER: { bg: 'bg-amber-100', text: 'text-amber-700' },
  SALES_REP: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  VIEWER: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
  VIEWER: 'Viewer',
};

function formatAED(value: number): string {
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  return `AED ${value.toLocaleString()}`;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
}

// ─── Modal Wrapper ──────────────────────────────────────────────────
function Modal({
  open,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${maxWidth} mx-4 overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col`}>
        {children}
      </div>
    </div>
  );
}

// ─── Stats Mini Bar ─────────────────────────────────────────────────
function StageBar({ stages }: { stages: Array<{ stage: string; count: number; value: number; color: string }> }) {
  const total = stages.reduce((s, st) => s + st.count, 0);
  if (total === 0) return <div className="text-xs text-text-tertiary">No leads</div>;
  return (
    <div className="space-y-1.5">
      {stages.map((st) => {
        const pct = total > 0 ? (st.count / total) * 100 : 0;
        return (
          <div key={st.stage} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate text-text-secondary">{st.stage}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: st.color || '#6366f1' }}
              />
            </div>
            <span className="w-6 text-right text-text-tertiary">{st.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── User Row Actions Dropdown ──────────────────────────────────────
function UserActionMenu({
  user,
  divisionId,
  divisions,
  onEditRole,
  onResetPassword,
  onToggleActive,
  onTransfer,
}: {
  user: DivisionUser;
  divisionId: string;
  divisions: Organization[];
  onEditRole: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
  onTransfer: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-icon h-8 w-8"
        title="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white rounded-xl shadow-lg border border-border-subtle py-1">
            <button
              onClick={() => { setOpen(false); onEditRole(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary transition-colors"
            >
              <Shield className="h-4 w-4 text-blue-500" />
              Edit Role
            </button>
            <button
              onClick={() => { setOpen(false); onResetPassword(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary transition-colors"
            >
              <KeyRound className="h-4 w-4 text-amber-500" />
              Reset Password
            </button>
            <button
              onClick={() => { setOpen(false); onToggleActive(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary transition-colors"
            >
              {user.isActive ? (
                <>
                  <Ban className="h-4 w-4 text-red-500" />
                  Deactivate
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 text-emerald-500" />
                  Reactivate
                </>
              )}
            </button>
            {divisions.length > 1 && (
              <button
                onClick={() => { setOpen(false); onTransfer(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary transition-colors"
              >
                <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
                Transfer to Division
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── Main Page Component ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
export default function DivisionsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Auth
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Data
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Global search/filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Expanded panels per division
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [expandedStats, setExpandedStats] = useState<Record<string, boolean>>({});

  // Per-division user data cache
  const [divisionUsers, setDivisionUsers] = useState<Record<string, DivisionUser[]>>({});
  const [divisionUsersLoading, setDivisionUsersLoading] = useState<Record<string, boolean>>({});
  const [divisionUsersSearch, setDivisionUsersSearch] = useState<Record<string, string>>({});
  const [divisionUsersSortKey, setDivisionUsersSortKey] = useState<Record<string, string>>({});
  const [divisionUsersSortDir, setDivisionUsersSortDir] = useState<Record<string, 'asc' | 'desc'>>({});

  // Per-division stats cache
  const [divisionStats, setDivisionStats] = useState<Record<string, DivisionStats>>({});
  const [divisionStatsLoading, setDivisionStatsLoading] = useState<Record<string, boolean>>({});

  // Create/Edit Division Modal
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [formName, setFormName] = useState('');
  const [formTradeName, setFormTradeName] = useState('');
  const [formLogo, setFormLogo] = useState('');
  const [formPrimaryColor, setFormPrimaryColor] = useState('#6366f1');
  const [formSecondaryColor, setFormSecondaryColor] = useState('#1e293b');

  // Delete Confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Invite User Modal
  const [inviteDiv, setInviteDiv] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'SALES_REP' });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Edit Role Modal
  const [editRoleUser, setEditRoleUser] = useState<{ user: DivisionUser; divisionId: string } | null>(null);
  const [editRoleValue, setEditRoleValue] = useState('');
  const [editRoleSaving, setEditRoleSaving] = useState(false);
  const [editRoleError, setEditRoleError] = useState('');

  // Reset Password Modal
  const [resetPwUser, setResetPwUser] = useState<{ user: DivisionUser; divisionId: string } | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwConfirm, setResetPwConfirm] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetPwError, setResetPwError] = useState('');

  // Transfer User Modal
  const [transferUser, setTransferUser] = useState<{ user: DivisionUser; divisionId: string } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Success toast
  const [toast, setToast] = useState('');

  // ── Auth Check ────────────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      setAuthorized(user.role === 'SUPER_ADMIN');
    }
  }, [user]);

  // ── Show Toast Helper ─────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Fetch Divisions ───────────────────────────────────────────────
  const fetchDivisions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDivisions();
      setDivisions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load divisions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) fetchDivisions();
  }, [authorized, fetchDivisions]);

  // ── Fetch Users for a Division ────────────────────────────────────
  const fetchDivisionUsers = useCallback(async (divisionId: string) => {
    setDivisionUsersLoading((p) => ({ ...p, [divisionId]: true }));
    try {
      const users = await api.getDivisionUsers(divisionId);
      setDivisionUsers((p) => ({ ...p, [divisionId]: users }));
    } catch (err: any) {
      console.error('Failed to load division users:', err);
      setDivisionUsers((p) => ({ ...p, [divisionId]: [] }));
    } finally {
      setDivisionUsersLoading((p) => ({ ...p, [divisionId]: false }));
    }
  }, []);

  // ── Fetch Stats for a Division ────────────────────────────────────
  const fetchDivisionStats = useCallback(async (divisionId: string) => {
    setDivisionStatsLoading((p) => ({ ...p, [divisionId]: true }));
    try {
      const stats = await api.getDivisionStats(divisionId);
      setDivisionStats((p) => ({ ...p, [divisionId]: stats }));
    } catch (err: any) {
      console.error('Failed to load division stats:', err);
    } finally {
      setDivisionStatsLoading((p) => ({ ...p, [divisionId]: false }));
    }
  }, []);

  // ── Toggle User Panel ─────────────────────────────────────────────
  const toggleUsersPanel = (divisionId: string) => {
    const isExpanded = expandedUsers[divisionId];
    setExpandedUsers((p) => ({ ...p, [divisionId]: !isExpanded }));
    if (!isExpanded && !divisionUsers[divisionId]) {
      fetchDivisionUsers(divisionId);
    }
  };

  // ── Toggle Stats Panel ────────────────────────────────────────────
  const toggleStatsPanel = (divisionId: string) => {
    const isExpanded = expandedStats[divisionId];
    setExpandedStats((p) => ({ ...p, [divisionId]: !isExpanded }));
    if (!isExpanded && !divisionStats[divisionId]) {
      fetchDivisionStats(divisionId);
    }
  };

  // ── Filter Divisions ──────────────────────────────────────────────
  const filteredDivisions = useMemo(() => {
    let result = divisions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.tradeName && d.tradeName.toLowerCase().includes(q))
      );
    }
    return result;
  }, [divisions, searchQuery]);

  // ── Division Create/Edit ──────────────────────────────────────────
  const openCreateModal = () => {
    setEditingDivision(null);
    setFormName('');
    setFormTradeName('');
    setFormLogo('');
    setFormPrimaryColor('#6366f1');
    setFormSecondaryColor('#1e293b');
    setModalError('');
    setShowDivisionModal(true);
  };

  const openEditModal = (division: Organization) => {
    setEditingDivision(division);
    setFormName(division.name);
    setFormTradeName(division.tradeName || '');
    setFormLogo(division.logo || '');
    setFormPrimaryColor(division.primaryColor || '#6366f1');
    setFormSecondaryColor(division.secondaryColor || '#1e293b');
    setModalError('');
    setShowDivisionModal(true);
  };

  const handleSaveDivision = async () => {
    if (!formName.trim()) {
      setModalError('Division name is required');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const payload: Partial<Organization> = {
        name: formName.trim(),
        tradeName: formTradeName.trim() || undefined,
        logo: formLogo.trim() || undefined,
        primaryColor: formPrimaryColor,
        secondaryColor: formSecondaryColor,
      };
      if (editingDivision) {
        await api.updateDivision(editingDivision.id, payload);
        showToast('Division updated successfully');
      } else {
        await api.createDivision(payload);
        showToast('Division created successfully');
      }
      setShowDivisionModal(false);
      fetchDivisions();
      try {
        const freshDivisions = await api.getDivisions();
        localStorage.setItem('divisions', JSON.stringify(freshDivisions));
      } catch { /* non-critical */ }
    } catch (err: any) {
      setModalError(err.message || 'Failed to save division');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Division ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await api.deleteDivision(deletingId);
      setDeletingId(null);
      setDeleteConfirm('');
      showToast('Division deleted successfully');
      fetchDivisions();
      try {
        const freshDivisions = await api.getDivisions();
        localStorage.setItem('divisions', JSON.stringify(freshDivisions));
      } catch { /* non-critical */ }
    } catch (err: any) {
      setError(err.message || 'Failed to delete division');
    } finally {
      setDeleting(false);
    }
  };

  // ── Invite User ───────────────────────────────────────────────────
  const handleInviteUser = async () => {
    if (!inviteDiv) return;
    if (!inviteForm.email.trim() || !inviteForm.firstName.trim() || !inviteForm.password.trim()) {
      setInviteError('First name, email and password are required');
      return;
    }
    setInviting(true);
    setInviteError('');
    try {
      await api.inviteDivisionUser(inviteDiv, {
        email: inviteForm.email.trim(),
        firstName: inviteForm.firstName.trim(),
        lastName: inviteForm.lastName.trim(),
        role: inviteForm.role,
        password: inviteForm.password,
      });
      showToast('User invited successfully');
      setInviteDiv(null);
      setInviteForm({ firstName: '', lastName: '', email: '', password: '', role: 'SALES_REP' });
      fetchDivisionUsers(inviteDiv);
      fetchDivisions();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  // ── Edit Role ─────────────────────────────────────────────────────
  const handleEditRole = async () => {
    if (!editRoleUser) return;
    setEditRoleSaving(true);
    setEditRoleError('');
    try {
      await api.updateDivisionUser(editRoleUser.divisionId, editRoleUser.user.id, { role: editRoleValue });
      showToast(`Role updated to ${ROLE_LABELS[editRoleValue] || editRoleValue}`);
      setEditRoleUser(null);
      fetchDivisionUsers(editRoleUser.divisionId);
    } catch (err: any) {
      setEditRoleError(err.message || 'Failed to update role');
    } finally {
      setEditRoleSaving(false);
    }
  };

  // ── Reset Password ────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!resetPwUser) return;
    if (resetPwValue.length < 8) {
      setResetPwError('Password must be at least 8 characters');
      return;
    }
    if (resetPwValue !== resetPwConfirm) {
      setResetPwError('Passwords do not match');
      return;
    }
    setResettingPw(true);
    setResetPwError('');
    try {
      await api.resetDivisionUserPassword(resetPwUser.divisionId, resetPwUser.user.id, resetPwValue);
      showToast('Password reset successfully');
      setResetPwUser(null);
      setResetPwValue('');
      setResetPwConfirm('');
    } catch (err: any) {
      setResetPwError(err.message || 'Failed to reset password');
    } finally {
      setResettingPw(false);
    }
  };

  // ── Toggle Active ─────────────────────────────────────────────────
  const handleToggleActive = async (divUser: DivisionUser, divisionId: string) => {
    try {
      await api.updateDivisionUser(divisionId, divUser.id, { isActive: !divUser.isActive });
      showToast(divUser.isActive ? 'User deactivated' : 'User reactivated');
      fetchDivisionUsers(divisionId);
      fetchDivisions();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
    }
  };

  // ── Transfer User ─────────────────────────────────────────────────
  const handleTransferUser = async () => {
    if (!transferUser || !transferTargetId) return;
    setTransferring(true);
    setTransferError('');
    try {
      await api.transferDivisionUser(transferUser.divisionId, {
        userId: transferUser.user.id,
        targetDivisionId: transferTargetId,
      });
      showToast('User transferred successfully');
      setTransferUser(null);
      setTransferTargetId('');
      fetchDivisionUsers(transferUser.divisionId);
      fetchDivisions();
    } catch (err: any) {
      setTransferError(err.message || 'Failed to transfer user');
    } finally {
      setTransferring(false);
    }
  };

  // ── Sort Users Helper ─────────────────────────────────────────────
  const getSortedUsers = (divisionId: string, users: DivisionUser[]): DivisionUser[] => {
    const localSearch = (divisionUsersSearch[divisionId] || '').toLowerCase();
    let filtered = users;
    if (localSearch) {
      filtered = filtered.filter(
        (u) =>
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(localSearch) ||
          u.email.toLowerCase().includes(localSearch)
      );
    }
    if (roleFilter !== 'ALL') {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    const sortKey = divisionUsersSortKey[divisionId] || 'name';
    const sortDir = divisionUsersSortDir[divisionId] || 'asc';
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'role':
          cmp = a.role.localeCompare(b.role);
          break;
        case 'leads':
          cmp = (a._count?.assignedLeads ?? 0) - (b._count?.assignedLeads ?? 0);
          break;
        case 'tasks':
          cmp = (a._count?.tasks ?? 0) - (b._count?.tasks ?? 0);
          break;
        case 'status':
          cmp = Number(b.isActive) - Number(a.isActive);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  };

  const toggleSort = (divisionId: string, key: string) => {
    const current = divisionUsersSortKey[divisionId] || 'name';
    const currentDir = divisionUsersSortDir[divisionId] || 'asc';
    if (current === key) {
      setDivisionUsersSortDir((p) => ({ ...p, [divisionId]: currentDir === 'asc' ? 'desc' : 'asc' }));
    } else {
      setDivisionUsersSortKey((p) => ({ ...p, [divisionId]: key }));
      setDivisionUsersSortDir((p) => ({ ...p, [divisionId]: 'asc' }));
    }
  };

  // ── Computed ──────────────────────────────────────────────────────
  const divisionToDelete = divisions.find((d) => d.id === deletingId);

  // ═══════════════════════════════════════════════════════════════════
  // ── Render: Access Denied ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Access Denied</h2>
        <p className="text-sm text-text-secondary mb-4">
          Only Super Admins can manage divisions.
        </p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary">
          Go to Dashboard
        </button>
      </div>
    );
  }

  // ── Render: Loading Auth ──────────────────────────────────────────
  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── Main Render ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ── Toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-fade-in-up">
          <CheckCircle2 className="h-4 w-4" />
          {toast}
        </div>
      )}

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Building2 className="h-7 w-7 text-brand-500" />
            Division Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create and manage your organization&apos;s divisions
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Division
        </button>
      </div>

      {/* ── Search & Filter Bar ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            className="input pl-9 w-full"
            placeholder="Search divisions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-text-tertiary" />
          <select
            className="input py-2 pr-8"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────────── */}
      {!loading && divisions.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border-subtle">
          <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-brand-500" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">No divisions yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Create your first division to start organizing your team.
          </p>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Division
          </button>
        </div>
      )}

      {/* ── No Search Results ────────────────────────────────────────── */}
      {!loading && divisions.length > 0 && filteredDivisions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-border-subtle">
          <Search className="h-10 w-10 text-text-tertiary mb-3" />
          <h3 className="text-lg font-semibold text-text-primary mb-1">No divisions found</h3>
          <p className="text-sm text-text-secondary">
            Try adjusting your search or filters.
          </p>
        </div>
      )}

      {/* ═══ Division Cards ════════════════════════════════════════════ */}
      {!loading && filteredDivisions.length > 0 && (
        <div className="space-y-4">
          {filteredDivisions.map((division) => {
            const usersExpanded = expandedUsers[division.id];
            const statsExpanded = expandedStats[division.id];
            const users = divisionUsers[division.id] || [];
            const usersLoading = divisionUsersLoading[division.id];
            const stats = divisionStats[division.id];
            const statsLoading = divisionStatsLoading[division.id];
            const sortedUsers = getSortedUsers(division.id, users);
            const userCount = division._count?.users ?? 0;
            const leadCount = division._count?.leads ?? 0;
            const pipelineVal = stats?.totalPipelineValue ?? 0;
            const convRate = stats?.conversionRate ?? 0;
            const avgLead = stats?.avgLeadValue ?? 0;

            return (
              <div
                key={division.id}
                className="bg-white rounded-2xl border border-border-subtle overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* ── Division Color Bar ──────────────────────────────── */}
                <div className="h-1.5" style={{ backgroundColor: division.primaryColor || '#6366f1' }} />

                {/* ── Division Header ────────────────────────────────── */}
                <div className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Logo + Info */}
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      {division.logo ? (
                        <img
                          src={division.logo}
                          alt={division.name}
                          className="h-14 w-14 rounded-xl object-cover border border-border-subtle flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                          style={{ backgroundColor: division.primaryColor || '#6366f1' }}
                        >
                          {division.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-primary truncate">
                          {division.name}
                        </h3>
                        {division.tradeName && (
                          <p className="text-sm text-text-secondary truncate">{division.tradeName}</p>
                        )}
                        {/* ── Quick Stats Row ──────────────────────────── */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                            <div
                              className="h-3 w-3 rounded-full border border-white shadow-sm"
                              style={{ backgroundColor: division.primaryColor || '#6366f1' }}
                            />
                            <span className="font-mono">{division.primaryColor || '#6366f1'}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <Users className="h-3.5 w-3.5 text-blue-500" />
                            <span className="font-semibold text-text-primary">{userCount}</span>
                            <span className="text-text-tertiary">Users</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <Target className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="font-semibold text-text-primary">{leadCount}</span>
                            <span className="text-text-tertiary">Leads</span>
                          </div>
                          {stats && (
                            <>
                              <div className="flex items-center gap-1 text-xs">
                                <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
                                <span className="font-semibold text-text-primary">{formatAED(pipelineVal)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-text-tertiary">Conv.</span>
                                <span className="font-semibold text-text-primary">{convRate.toFixed(0)}%</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-text-tertiary">Avg Lead:</span>
                                <span className="font-semibold text-text-primary">{formatAED(avgLead)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleUsersPanel(division.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          usersExpanded
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-surface-secondary text-text-secondary hover:bg-blue-50 hover:text-blue-600'
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Manage Users
                        {usersExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => toggleStatsPanel(division.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          statsExpanded
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-surface-secondary text-text-secondary hover:bg-emerald-50 hover:text-emerald-600'
                        }`}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Stats
                        {statsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => openEditModal(division)}
                        className="btn-icon h-8 w-8"
                        title="Edit division"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { setDeletingId(division.id); setDeleteConfirm(''); }}
                        className="btn-icon h-8 w-8 text-red-500 hover:bg-red-50"
                        title="Delete division"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ═══ Stats Expanded Panel ═══════════════════════════════ */}
                {statsExpanded && (
                  <div className="px-6 pb-5 border-t border-border-subtle pt-4">
                    {statsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                      </div>
                    )}
                    {!statsLoading && !stats && (
                      <p className="text-sm text-text-tertiary text-center py-4">No statistics available.</p>
                    )}
                    {!statsLoading && stats && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Leads by Stage */}
                        <div>
                          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Leads by Stage
                          </h4>
                          <StageBar stages={stats.leadsByStage || []} />
                        </div>

                        {/* Top Performers */}
                        <div>
                          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Trophy className="h-3.5 w-3.5 text-amber-500" />
                            Top Performers
                          </h4>
                          {(stats.topPerformers || []).length === 0 && (
                            <p className="text-xs text-text-tertiary">No data yet</p>
                          )}
                          <div className="space-y-2">
                            {(stats.topPerformers || []).slice(0, 3).map((perf, idx) => (
                              <div key={perf.id} className="flex items-center gap-2">
                                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                  idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : 'bg-amber-700'
                                }`}>
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-text-primary flex-1 truncate">{perf.name}</span>
                                <span className="text-xs text-text-secondary">{perf.wonLeads} won</span>
                                <span className="text-xs font-medium text-emerald-600">{formatAED(perf.totalValue)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recent Leads */}
                        <div>
                          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-blue-500" />
                            Recent Leads
                          </h4>
                          {(stats.recentLeads || []).length === 0 && (
                            <p className="text-xs text-text-tertiary">No leads yet</p>
                          )}
                          <div className="space-y-1.5">
                            {(stats.recentLeads || []).slice(0, 5).map((lead) => (
                              <div key={lead.id} className="flex items-center justify-between text-xs">
                                <div className="min-w-0">
                                  <span className="text-text-primary font-medium truncate block">{lead.name}</span>
                                  <span className="text-text-tertiary truncate block">{lead.company || 'N/A'}</span>
                                </div>
                                <span className="text-text-secondary font-medium flex-shrink-0 ml-2">{formatAED(lead.value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ Users Expanded Panel ═══════════════════════════════ */}
                {usersExpanded && (
                  <div className="border-t border-border-subtle">
                    {/* User toolbar */}
                    <div className="px-6 py-3 bg-surface-secondary/30 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-between">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                        <input
                          type="text"
                          className="input pl-8 py-1.5 text-sm w-full"
                          placeholder="Search users..."
                          value={divisionUsersSearch[division.id] || ''}
                          onChange={(e) =>
                            setDivisionUsersSearch((p) => ({ ...p, [division.id]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchDivisionUsers(division.id)}
                          className="btn-icon h-8 w-8"
                          title="Refresh users"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => {
                            setInviteDiv(division.id);
                            setInviteForm({ firstName: '', lastName: '', email: '', password: '', role: 'SALES_REP' });
                            setInviteError('');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Invite User
                        </button>
                      </div>
                    </div>

                    {/* Users loading */}
                    {usersLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                      </div>
                    )}

                    {/* Users empty */}
                    {!usersLoading && users.length === 0 && (
                      <div className="text-center py-8">
                        <Users className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                        <p className="text-sm text-text-secondary">No users in this division</p>
                        <button
                          onClick={() => {
                            setInviteDiv(division.id);
                            setInviteForm({ firstName: '', lastName: '', email: '', password: '', role: 'SALES_REP' });
                            setInviteError('');
                          }}
                          className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
                        >
                          + Invite the first user
                        </button>
                      </div>
                    )}

                    {/* Users table */}
                    {!usersLoading && users.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border-subtle bg-surface-secondary/20">
                              {[
                                { key: 'name', label: 'Name' },
                                { key: 'email', label: 'Email' },
                                { key: 'role', label: 'Role' },
                                { key: 'status', label: 'Status' },
                                { key: 'leads', label: 'Leads' },
                                { key: 'tasks', label: 'Tasks' },
                              ].map(({ key, label }) => (
                                <th
                                  key={key}
                                  className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5 cursor-pointer hover:text-text-primary select-none"
                                  onClick={() => toggleSort(division.id, key)}
                                >
                                  <span className="flex items-center gap-1">
                                    {label}
                                    {divisionUsersSortKey[division.id] === key && (
                                      divisionUsersSortDir[division.id] === 'asc'
                                        ? <ChevronUp className="h-3 w-3" />
                                        : <ChevronDown className="h-3 w-3" />
                                    )}
                                  </span>
                                </th>
                              ))}
                              <th className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                                Last Login
                              </th>
                              <th className="text-right text-[11px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle">
                            {sortedUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-surface-secondary/20 transition-colors">
                                {/* Name + Avatar */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {u.avatar ? (
                                      <img src={u.avatar} alt="" className="h-8 w-8 rounded-full object-cover border border-border-subtle" />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                                        {getInitials(u.firstName, u.lastName)}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-text-primary truncate">
                                        {u.firstName} {u.lastName}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                {/* Email */}
                                <td className="px-4 py-3">
                                  <span className="text-sm text-text-secondary truncate block max-w-[200px]">{u.email}</span>
                                </td>
                                {/* Role */}
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLORS[u.role]?.bg || 'bg-gray-100'} ${ROLE_COLORS[u.role]?.text || 'text-gray-600'}`}>
                                    {ROLE_LABELS[u.role] || u.role}
                                  </span>
                                </td>
                                {/* Status */}
                                <td className="px-4 py-3">
                                  {u.isActive ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                                      <XCircle className="h-3.5 w-3.5" />
                                      Inactive
                                    </span>
                                  )}
                                </td>
                                {/* Leads */}
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                    {u._count?.assignedLeads ?? 0}
                                  </span>
                                </td>
                                {/* Tasks */}
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                    {u._count?.tasks ?? 0}
                                  </span>
                                </td>
                                {/* Last Login */}
                                <td className="px-4 py-3">
                                  <span className="text-xs text-text-tertiary">
                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                                  </span>
                                </td>
                                {/* Actions */}
                                <td className="px-4 py-3 text-right">
                                  <UserActionMenu
                                    user={u}
                                    divisionId={division.id}
                                    divisions={divisions}
                                    onEditRole={() => {
                                      setEditRoleUser({ user: u, divisionId: division.id });
                                      setEditRoleValue(u.role);
                                      setEditRoleError('');
                                    }}
                                    onResetPassword={() => {
                                      setResetPwUser({ user: u, divisionId: division.id });
                                      setResetPwValue('');
                                      setResetPwConfirm('');
                                      setResetPwError('');
                                    }}
                                    onToggleActive={() => handleToggleActive(u, division.id)}
                                    onTransfer={() => {
                                      setTransferUser({ user: u, divisionId: division.id });
                                      setTransferTargetId('');
                                      setTransferError('');
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {sortedUsers.length === 0 && users.length > 0 && (
                          <div className="text-center py-6">
                            <p className="text-sm text-text-tertiary">No users match the current filters.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ── MODALS ──────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* ── Create/Edit Division Modal ──────────────────────────────── */}
      <Modal open={showDivisionModal} onClose={() => setShowDivisionModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-500" />
            {editingDivision ? 'Edit Division' : 'Add Division'}
          </h3>
          <button onClick={() => setShowDivisionModal(false)} className="btn-icon h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {modalError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{modalError}</span>
            </div>
          )}
          <div>
            <label className="label">Division Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Healthcare Division"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Trade Name</label>
            <input
              type="text"
              className="input"
              value={formTradeName}
              onChange={(e) => setFormTradeName(e.target.value)}
              placeholder="e.g. Al-Zaabi Healthcare"
            />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input
              type="url"
              className="input"
              value={formLogo}
              onChange={(e) => setFormLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {formLogo && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={formLogo}
                  alt="Logo preview"
                  className="h-10 w-10 rounded-lg object-cover border border-border-subtle"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="text-xs text-text-tertiary">Preview</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Primary Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded-lg border border-border-subtle cursor-pointer"
                  value={formPrimaryColor}
                  onChange={(e) => setFormPrimaryColor(e.target.value)}
                />
                <input
                  type="text"
                  className="input flex-1 font-mono text-sm"
                  value={formPrimaryColor}
                  onChange={(e) => setFormPrimaryColor(e.target.value)}
                  placeholder="#6366f1"
                />
              </div>
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Secondary Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded-lg border border-border-subtle cursor-pointer"
                  value={formSecondaryColor}
                  onChange={(e) => setFormSecondaryColor(e.target.value)}
                />
                <input
                  type="text"
                  className="input flex-1 font-mono text-sm"
                  value={formSecondaryColor}
                  onChange={(e) => setFormSecondaryColor(e.target.value)}
                  placeholder="#1e293b"
                />
              </div>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-border-subtle">
            <div className="h-3" style={{ backgroundColor: formPrimaryColor }} />
            <div className="p-3 flex items-center gap-3" style={{ backgroundColor: formSecondaryColor }}>
              {formLogo ? (
                <img src={formLogo} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: formPrimaryColor }}
                >
                  {formName.charAt(0).toUpperCase() || 'D'}
                </div>
              )}
              <span className="text-sm font-medium text-white">
                {formTradeName || formName || 'Division Preview'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button onClick={() => setShowDivisionModal(false)} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSaveDivision} className="btn-primary flex items-center gap-2" disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              editingDivision ? 'Update Division' : 'Create Division'
            )}
          </button>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────── */}
      <Modal open={!!deletingId} onClose={() => { setDeletingId(null); setDeleteConfirm(''); }} maxWidth="max-w-md">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Delete Division</h3>
              <p className="text-sm text-text-secondary">This action cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Are you sure you want to delete{' '}
            <strong className="text-text-primary">
              {divisionToDelete?.tradeName || divisionToDelete?.name}
            </strong>
            ? All users, leads, and data within this division will be permanently removed.
          </p>
          <div>
            <label className="label">
              Type &quot;{divisionToDelete?.name}&quot; to confirm
            </label>
            <input
              type="text"
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={divisionToDelete?.name}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button
            onClick={() => { setDeletingId(null); setDeleteConfirm(''); }}
            className="btn-secondary"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            disabled={deleting || deleteConfirm !== divisionToDelete?.name}
          >
            {deleting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</>
            ) : (
              <><Trash2 className="h-4 w-4" /> Delete Division</>
            )}
          </button>
        </div>
      </Modal>

      {/* ── Invite User Modal ───────────────────────────────────────── */}
      <Modal open={!!inviteDiv} onClose={() => setInviteDiv(null)} maxWidth="max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand-500" />
            Invite User
          </h3>
          <button onClick={() => setInviteDiv(null)} className="btn-icon h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {inviteError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{inviteError}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                value={inviteForm.firstName}
                onChange={(e) => setInviteForm((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="Ahmed"
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input
                type="text"
                className="input"
                value={inviteForm.lastName}
                onChange={(e) => setInviteForm((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Khan"
              />
            </div>
          </div>
          <div>
            <label className="label">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              className="input"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="user@company.ae"
            />
          </div>
          <div>
            <label className="label">Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              className="input"
              value={inviteForm.password}
              onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={inviteForm.role}
              onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          {inviteDiv && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              This user will be added to:{' '}
              <strong>{divisions.find((d) => d.id === inviteDiv)?.tradeName || divisions.find((d) => d.id === inviteDiv)?.name}</strong>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button onClick={() => setInviteDiv(null)} className="btn-secondary" disabled={inviting}>
            Cancel
          </button>
          <button onClick={handleInviteUser} className="btn-primary flex items-center gap-2" disabled={inviting}>
            {inviting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Inviting...</>
            ) : (
              <><UserPlus className="h-4 w-4" /> Invite User</>
            )}
          </button>
        </div>
      </Modal>

      {/* ── Edit Role Modal ─────────────────────────────────────────── */}
      <Modal open={!!editRoleUser} onClose={() => setEditRoleUser(null)} maxWidth="max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Edit Role
          </h3>
          <button onClick={() => setEditRoleUser(null)} className="btn-icon h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {editRoleError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{editRoleError}</span>
            </div>
          )}
          {editRoleUser && (
            <p className="text-sm text-text-secondary">
              Change role for{' '}
              <strong className="text-text-primary">
                {editRoleUser.user.firstName} {editRoleUser.user.lastName}
              </strong>
            </p>
          )}
          <div>
            <label className="label">New Role</label>
            <select
              className="input"
              value={editRoleValue}
              onChange={(e) => setEditRoleValue(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button onClick={() => setEditRoleUser(null)} className="btn-secondary" disabled={editRoleSaving}>
            Cancel
          </button>
          <button onClick={handleEditRole} className="btn-primary flex items-center gap-2" disabled={editRoleSaving}>
            {editRoleSaving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              'Update Role'
            )}
          </button>
        </div>
      </Modal>

      {/* ── Reset Password Modal ────────────────────────────────────── */}
      <Modal open={!!resetPwUser} onClose={() => setResetPwUser(null)} maxWidth="max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Reset Password
          </h3>
          <button onClick={() => setResetPwUser(null)} className="btn-icon h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {resetPwError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{resetPwError}</span>
            </div>
          )}
          {resetPwUser && (
            <p className="text-sm text-text-secondary">
              Reset password for{' '}
              <strong className="text-text-primary">
                {resetPwUser.user.firstName} {resetPwUser.user.lastName}
              </strong>
              <br />
              <span className="text-xs text-text-tertiary">{resetPwUser.user.email}</span>
            </p>
          )}
          <div>
            <label className="label">New Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              className="input"
              value={resetPwValue}
              onChange={(e) => setResetPwValue(e.target.value)}
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              className="input"
              value={resetPwConfirm}
              onChange={(e) => setResetPwConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button onClick={() => setResetPwUser(null)} className="btn-secondary" disabled={resettingPw}>
            Cancel
          </button>
          <button onClick={handleResetPassword} className="btn-primary flex items-center gap-2" disabled={resettingPw}>
            {resettingPw ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Resetting...</>
            ) : (
              <><KeyRound className="h-4 w-4" /> Reset Password</>
            )}
          </button>
        </div>
      </Modal>

      {/* ── Transfer User Modal ─────────────────────────────────────── */}
      <Modal open={!!transferUser} onClose={() => setTransferUser(null)} maxWidth="max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-500" />
            Transfer User
          </h3>
          <button onClick={() => setTransferUser(null)} className="btn-icon h-8 w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {transferError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{transferError}</span>
            </div>
          )}
          {transferUser && (
            <div>
              <p className="text-sm text-text-secondary mb-1">
                Transfer{' '}
                <strong className="text-text-primary">
                  {transferUser.user.firstName} {transferUser.user.lastName}
                </strong>{' '}
                to another division:
              </p>
              <p className="text-xs text-text-tertiary">
                Currently in:{' '}
                <strong>
                  {divisions.find((d) => d.id === transferUser.divisionId)?.tradeName ||
                    divisions.find((d) => d.id === transferUser.divisionId)?.name}
                </strong>
              </p>
            </div>
          )}
          <div>
            <label className="label">Target Division <span className="text-red-500">*</span></label>
            <select
              className="input"
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
            >
              <option value="">Select a division...</option>
              {divisions
                .filter((d) => d.id !== transferUser?.divisionId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.tradeName || d.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
          <button onClick={() => setTransferUser(null)} className="btn-secondary" disabled={transferring}>
            Cancel
          </button>
          <button
            onClick={handleTransferUser}
            className="btn-primary flex items-center gap-2"
            disabled={transferring || !transferTargetId}
          >
            {transferring ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Transferring...</>
            ) : (
              <><ArrowRightLeft className="h-4 w-4" /> Transfer</>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
