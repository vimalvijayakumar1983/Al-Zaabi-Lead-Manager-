'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';
import { UserPlus, X, Shield, Users as UsersIcon, Crown, Eye } from 'lucide-react';

const roleConfig: Record<string, { bg: string; text: string; ring: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  ADMIN: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/10', icon: Crown, label: 'Admin' },
  MANAGER: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', icon: Shield, label: 'Manager' },
  SALES_REP: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', icon: UsersIcon, label: 'Sales Rep' },
  VIEWER: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', icon: Eye, label: 'Viewer' },
};

export default function TeamPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  const handleInvite = async (data: any) => {
    await api.inviteUser(data);
    setShowInvite(false);
    const updated = await api.getUsers();
    setUsers(updated);
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Team</h1>
          <p className="text-text-secondary text-sm mt-0.5">{users.length} team members</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            Invite Member
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="skeleton h-12 w-12 rounded-full" />
                <div><div className="skeleton h-4 w-32 mb-2" /><div className="skeleton h-3 w-40" /></div>
              </div>
              <div className="flex justify-between"><div className="skeleton h-5 w-20 rounded-md" /><div className="skeleton h-4 w-16" /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => {
            const role = roleConfig[user.role] || roleConfig.VIEWER;
            const RoleIcon = role.icon;
            const isCurrentUser = currentUser?.id === user.id;

            return (
              <div key={user.id} className={`card p-5 transition-all duration-200 hover:shadow-card-hover ${!user.isActive ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-lg font-semibold text-white shadow-soft">
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                    {user.isActive && (
                      <div className="absolute bottom-0 right-0 status-online" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">
                      {user.firstName} {user.lastName}
                      {isCurrentUser && <span className="text-xs text-text-tertiary ml-1">(you)</span>}
                    </p>
                    <p className="text-sm text-text-secondary truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`badge ${role.bg} ${role.text} ring-1 ${role.ring}`}>
                    <RoleIcon className="h-3 w-3" />
                    {role.label}
                  </span>
                  <div className="text-right">
                    {user._count && (
                      <p className="text-xs text-text-secondary font-medium">{user._count.assignedLeads} leads</p>
                    )}
                    {user.lastLoginAt && (
                      <p className="text-2xs text-text-tertiary mt-0.5">
                        Last login {new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>

                {!user.isActive && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <span className="badge bg-red-50 text-red-700 ring-1 ring-red-600/10">Inactive</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSubmit={handleInvite} />}
    </div>
  );
}

function InviteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', role: 'SALES_REP', password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-md relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">Invite Team Member</h2>
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
            <label className="label">Email</label>
            <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(roleConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Send Invite</button>
          </div>
        </form>
      </div>
    </div>
  );
}
