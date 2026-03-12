'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore, FEATURES } from '@/lib/permissions';
import type { User, Organization } from '@/types';
import {
  UserPlus, X, Shield, Users as UsersIcon, Crown, Eye,
  MoreHorizontal, Pencil, Key, UserX, UserCheck, Search,
  Mail, Phone, Calendar, BarChart3, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, Filter, RotateCcw, Save,
  Building2, Sparkles,
} from 'lucide-react';

const roleConfig: Record<string, { bg: string; text: string; ring: string; icon: React.ComponentType<{ className?: string }>; label: string; description: string }> = {
  SUPER_ADMIN: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/10', icon: Sparkles, label: 'Super Admin', description: 'Full access across all divisions, group-level management' },
  ADMIN: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', icon: Crown, label: 'Admin', description: 'Full access to all features, settings, and team management' },
  MANAGER: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', icon: Shield, label: 'Manager', description: 'Manage leads, tasks, team members, and view analytics' },
  SALES_REP: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', icon: UsersIcon, label: 'Sales Rep', description: 'Work with assigned leads, create tasks, and log activities' },
  VIEWER: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', icon: Eye, label: 'Viewer', description: 'Read-only access to leads, pipeline, and analytics' },
};

/** Roles shown in the stats cards (exclude SUPER_ADMIN from the stats row for brevity) */
const statsRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

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

export default function TeamPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showRoles, setShowRoles] = useState(false);

  // Multi-tenant state
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN' || isSuperAdmin;
  const isManager = currentUser?.role === 'MANAGER';
  const canManage = isAdmin || isManager;

  const fetchUsers = useCallback(async () => {
    const data = await api.getUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Fetch divisions for SUPER_ADMIN
  useEffect(() => {
    if (isSuperAdmin) {
      api.getDivisions().then((divs: Organization[]) => {
        setDivisions(divs || []);
      }).catch(() => { /* ignore */ });
    }
  }, [isSuperAdmin]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeMenu) return;
    const handler = () => setActiveMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [activeMenu]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch = searchQuery === '' ||
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && u.isActive) ||
      (statusFilter === 'inactive' && !u.isActive);
    // Division filter for SUPER_ADMIN
    const matchesDivision = divisionFilter === 'all' ||
      u.organizationId === divisionFilter ||
      (u as any).organization?.id === divisionFilter;
    return matchesSearch && matchesRole && matchesStatus && matchesDivision;
  });

  const activeCount = users.filter(u => u.isActive).length;
  const inactiveCount = users.filter(u => !u.isActive).length;
  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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

  /** Get the division name for a user */
  const getUserDivisionName = (user: User): string => {
    const org = (user as any).organization as Organization | undefined;
    if (org) return org.name;
    if (user.organizationName) return user.organizationName;
    const match = divisions.find(d => d.id === user.organizationId);
    return match?.name || '—';
  };

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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsRoleKeys.map((key) => {
          const config = roleConfig[key];
          const Icon = config.icon;
          const count = roleCounts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setRoleFilter(roleFilter === key ? 'all' : key)}
              className={`card p-4 text-left transition-all duration-150 ${
                roleFilter === key ? 'ring-2 ring-brand-500 shadow-card-hover' : 'hover:shadow-card-hover'
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

      {/* Filters & Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            className="input pl-10"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
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
        {roleFilter !== 'all' && (
          <button onClick={() => setRoleFilter('all')} className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200 cursor-pointer hover:bg-brand-100">
            {roleConfig[roleFilter]?.label} <X className="h-3 w-3 ml-1" />
          </button>
        )}
        {isSuperAdmin && divisionFilter !== 'all' && (
          <button onClick={() => setDivisionFilter('all')} className="badge bg-purple-50 text-purple-700 ring-1 ring-purple-200 cursor-pointer hover:bg-purple-100">
            <Building2 className="h-3 w-3" />
            {divisions.find(d => d.id === divisionFilter)?.name}
            <X className="h-3 w-3 ml-1" />
          </button>
        )}
      </div>

      {/* Team Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="table-header">
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
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={canManage ? (isSuperAdmin ? 9 : 8) : (isSuperAdmin ? 8 : 7)}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><UsersIcon className="h-6 w-6" /></div>
                    <p className="text-sm font-medium text-text-primary">No team members found</p>
                    <p className="text-xs text-text-tertiary mt-1">Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const role = roleConfig[user.role] || roleConfig.VIEWER;
                const RoleIcon = role.icon;
                const isCurrentUser = currentUser?.id === user.id;
                const isSelf = isCurrentUser;
                const divName = getUserDivisionName(user);
                const divColor = getDivisionBadgeColor(user.organizationId, divisions);

                return (
                  <tr key={user.id} className={`table-row group ${!user.isActive ? 'opacity-50' : ''}`}>
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

                    {/* Last Active */}
                    <td className="table-cell hidden lg:table-cell">
                      {user.lastLoginAt ? (
                        <span className="text-2xs text-text-tertiary">
                          {new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                              onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === user.id ? null : user.id); }}
                              className="btn-icon h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {activeMenu === user.id && (
                              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-float border border-border p-1.5 animate-scale-in z-50">
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

  // Roles available for invite selection (exclude SUPER_ADMIN — only one per group)
  const inviteRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // SUPER_ADMIN must select a division
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

          {/* Division selector for SUPER_ADMIN */}
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

  // User-level permission overrides
  const existingOverrides = userOverrides[user.id] || {};
  const [permOverrides, setPermOverrides] = useState<Record<string, boolean | undefined>>({ ...existingOverrides });
  const [savingPerms, setSavingPerms] = useState(false);

  // Roles available for editing (exclude SUPER_ADMIN)
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
      // Filter out undefined values (features with no override)
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
    // Cycle: undefined (inherit) -> true (grant) -> false (deny) -> undefined
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

        {/* Tabs */}
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

  // Roles shown in the permission matrix (include all standard roles)
  const matrixRoleKeys = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

  const [editPerms, setEditPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Deep clone current role permissions for editing
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
          {/* Role descriptions */}
          <div className="grid grid-cols-4 gap-3 mb-6">
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

          {/* Permission matrix table */}
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
