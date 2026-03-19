'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { CustomField, FieldType, Organization, BuiltInField } from '@/types';
import {
  User2, Lock, Building2, Bell, Shield, AlertTriangle, Check,
  Mail, Phone, Globe, Crown, ChevronRight, Eye, EyeOff,
  FileText, Trash2, LogOut, Columns3, Plus, GripVertical,
  Pencil, X, Type, Hash, Calendar, List, ToggleLeft, Link2,
  AtSign, Palette, ChevronDown, Image, Save, Sparkles,
  Send, CheckCircle2, XCircle, Loader2, Code2, LayoutTemplate,
  Download, RefreshCw, Inbox, Server,
  Filter, Info, ArrowUpDown, SlidersHorizontal, Search, Settings2, LayoutGrid, DollarSign, Star, Tag, Layers, Users, BarChart3, Briefcase, Clock,
} from 'lucide-react';

type Tab = 'profile' | 'security' | 'organization' | 'divisionBranding' | 'customFields' | 'email' | 'emailTemplates' | 'notifications' | 'audit' | 'danger';

const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; superAdminOnly?: boolean; divisionAdmin?: boolean }[] = [
  { key: 'profile', label: 'Profile', icon: User2 },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'organization', label: 'Organization', icon: Building2, adminOnly: true },
  { key: 'divisionBranding', label: 'Division Branding', icon: Palette, divisionAdmin: true },
  { key: 'customFields', label: 'Custom Fields', icon: Columns3, adminOnly: true },
  { key: 'email', label: 'Email Settings', icon: Mail, adminOnly: true },
  { key: 'emailTemplates', label: 'Email Templates', icon: LayoutTemplate, adminOnly: true },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'audit', label: 'Audit Log', icon: Shield, adminOnly: true },
  { key: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin;

  const filteredTabs = tabs.filter(t => {
    // Show divisionBranding tab to SUPER_ADMIN and ADMIN
    if (t.divisionAdmin) return isSuperAdmin || user?.role === 'ADMIN';
    if (t.adminOnly) return isAdmin;
    return true;
  });

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary text-sm mt-0.5">Manage your account, security, and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <nav className="w-56 flex-shrink-0">
          <div className="space-y-0.5">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-xs'
                      : tab.key === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${
                    isActive ? 'text-brand-600' : tab.key === 'danger' ? 'text-red-500' : 'text-text-tertiary'
                  }`} />
                  {tab.label}
                  <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-opacity ${
                    isActive ? 'opacity-100 text-brand-500' : 'opacity-0'
                  }`} />
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'security' && <SecuritySection />}
          {activeTab === 'organization' && isAdmin && <OrganizationSection />}
          {activeTab === 'divisionBranding' && (isSuperAdmin || user?.role === 'ADMIN') && (
            <DivisionBrandingSection isSuperAdmin={isSuperAdmin} />
          )}
          {activeTab === 'customFields' && isAdmin && <CustomFieldsSection />}
          {activeTab === 'email' && isAdmin && <EmailSettingsSection />}
          {activeTab === 'emailTemplates' && isAdmin && <EmailTemplatesSection />}
          {activeTab === 'notifications' && <NotificationsSection />}
          {activeTab === 'audit' && isAdmin && <AuditLogSection />}
          {activeTab === 'danger' && <DangerZoneSection />}
        </div>
      </div>
    </div>
  );
}

/* ─── Profile Section ────────────────────────────────────────────── */
function ProfileSection() {
  const { user, loadUser } = useAuthStore();
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', avatar: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getProfile().then((profile) => {
      setForm({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phone: profile.phone || '',
        avatar: profile.avatar || '',
      });
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await api.updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        avatar: form.avatar || null,
      });
      await loadUser();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Profile Information"
        description="Update your personal details and contact information"
      />

      <form onSubmit={handleSave} className="card p-6 space-y-5">
        {/* Avatar Preview */}
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl font-bold text-white shadow-soft">
            {form.firstName?.[0]}{form.lastName?.[0]}
          </div>
          <div>
            <p className="font-semibold text-text-primary text-lg">
              {form.firstName} {form.lastName}
            </p>
            <p className="text-sm text-text-secondary">{user?.email}</p>
            <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200 mt-1.5">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="divider" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name</label>
            <div className="relative">
              <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <input
                className="input pl-10"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Last Name</label>
            <div className="relative">
              <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <input
                className="input pl-10"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10 bg-surface-secondary cursor-not-allowed"
              value={user?.email || ''}
              disabled
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">Email cannot be changed. Contact support if needed.</p>
        </div>

        <div>
          <label className="label">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+971 50 123 4567"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Profile updated successfully
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Security Section ───────────────────────────────────────────── */
function SecuritySection() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { score: 2, label: 'Fair', color: 'bg-orange-500' };
    if (score <= 3) return { score: 3, label: 'Good', color: 'bg-yellow-500' };
    if (score <= 4) return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
    return { score: 5, label: 'Very Strong', color: 'bg-emerald-600' };
  };

  const strength = form.newPassword ? passwordStrength(form.newPassword) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Security"
        description="Manage your password and security preferences"
      />

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="label">Current Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type={showCurrent ? 'text' : 'password'}
              className="input pl-10 pr-10"
              required
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type={showNew ? 'text' : 'password'}
              className="input pl-10 pr-10"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Password strength meter */}
          {strength && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i <= strength.score ? strength.color : 'bg-surface-tertiary'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-2xs font-medium ${
                strength.score <= 2 ? 'text-red-600' : strength.score <= 3 ? 'text-yellow-600' : 'text-emerald-600'
              }`}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Confirm New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type="password"
              className="input pl-10"
              required
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
            />
          </div>
          {form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <p className="text-2xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Password changed successfully
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>

      {/* Security Info Card */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Security Recommendations</h3>
        <div className="space-y-2.5">
          {[
            { text: 'Use a strong, unique password', done: true },
            { text: 'Enable two-factor authentication', done: false },
            { text: 'Review active sessions regularly', done: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                item.done ? 'bg-emerald-100 text-emerald-600' : 'bg-surface-tertiary text-text-tertiary'
              }`}>
                {item.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </div>
              <span className={`text-sm ${item.done ? 'text-text-primary' : 'text-text-secondary'}`}>{item.text}</span>
              {!item.done && <span className="badge bg-surface-tertiary text-text-tertiary text-2xs ml-auto">Coming soon</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Organization Section ───────────────────────────────────────── */
function OrganizationSection() {
  const [org, setOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: '', domain: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getOrganization().then((data) => {
      setOrg(data);
      setForm({ name: data.name || '', domain: data.domain || '' });
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      const updated = await api.updateOrganization({
        name: form.name,
        domain: form.domain || null,
      });
      setOrg(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!org) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Organization" description="Manage your organization settings" />
        <div className="card p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}><div className="skeleton h-4 w-24 mb-2" /><div className="skeleton h-10 w-full rounded-lg" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Organization"
        description="Manage your organization settings and billing"
      />

      {/* Org Overview */}
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xl font-bold text-white shadow-soft">
            {org.name?.[0]}
          </div>
          <div>
            <p className="text-lg font-semibold text-text-primary">{org.name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                <Crown className="h-3 w-3" />
                {org.plan || 'Free'} Plan
              </span>
              <span className="text-2xs text-text-tertiary">
                Since {new Date(org.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Users', value: org._count?.users || 0 },
            { label: 'Leads', value: org._count?.leads || 0 },
            { label: 'Campaigns', value: org._count?.campaigns || 0 },
            { label: 'Automations', value: org._count?.automationRules || 0 },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-3 rounded-lg bg-surface-secondary">
              <p className="text-xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-2xs text-text-tertiary font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Org Settings Form */}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div>
          <label className="label">Organization Name</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Domain</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="company.com"
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">Used for email verification and SSO configuration</p>
        </div>

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Organization updated
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Division Branding Section (NEW - Multi-tenant) ─────────────── */
function DivisionBrandingSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    tradeName: '',
    logo: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#1E40AF',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load divisions
  useEffect(() => {
    const loadDivisions = async () => {
      try {
        if (isSuperAdmin) {
          const divs = await api.getDivisions();
          setDivisions(divs || []);
          if (divs && divs.length > 0) {
            setSelectedDivisionId(divs[0].id);
          }
        } else {
          // ADMIN: load their own division
          const org = await api.getOrganization();
          if (org) {
            setDivisions([org]);
            setSelectedDivisionId(org.id);
          }
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    };
    loadDivisions();
  }, [isSuperAdmin]);

  // Load the selected division's branding data
  useEffect(() => {
    if (!selectedDivisionId || divisions.length === 0) return;
    const div = divisions.find(d => d.id === selectedDivisionId);
    if (div) {
      setForm({
        name: div.name || '',
        tradeName: (div as any).tradeName || '',
        logo: (div as any).logo || '',
        primaryColor: (div as any).primaryColor || '#3B82F6',
        secondaryColor: (div as any).secondaryColor || '#1E40AF',
      });
    }
  }, [selectedDivisionId, divisions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await api.updateDivision(selectedDivisionId, {
        name: form.name,
        tradeName: form.tradeName || undefined,
        logo: form.logo || undefined,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
      });
      // Update local state
      setDivisions(prev =>
        prev.map(d => d.id === selectedDivisionId ? { ...d, ...updated } : d)
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save division settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Division Branding"
          description={isSuperAdmin ? 'Manage branding settings for each division' : 'Customize your division\'s branding'}
        />
        <div className="card p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i}><div className="skeleton h-4 w-24 mb-2" /><div className="skeleton h-10 w-full rounded-lg" /></div>
          ))}
        </div>
      </div>
    );
  }

  if (divisions.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <SectionHeader
          title="Division Branding"
          description="No divisions available"
        />
        <div className="card p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">No divisions found</p>
          <p className="text-xs text-text-tertiary">Division branding will be available once divisions are configured.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Division Branding"
        description={isSuperAdmin ? 'Manage branding settings for each division in the group' : 'Customize your division\'s branding and appearance'}
      />

      {/* Division Selector (SUPER_ADMIN only — they can switch between divisions) */}
      {isSuperAdmin && divisions.length > 1 && (
        <div className="card p-4">
          <label className="label mb-2">Select Division</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <select
              className="input pl-10 appearance-none cursor-pointer"
              value={selectedDivisionId}
              onChange={(e) => setSelectedDivisionId(e.target.value)}
            >
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>{div.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          </div>
        </div>
      )}

      {/* Branding Preview */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Preview</h3>
        <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-secondary">
          {form.logo ? (
            <img
              src={form.logo}
              alt={form.name}
              className="h-14 w-14 rounded-xl object-cover shadow-soft"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="h-14 w-14 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-soft"
              style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})` }}
            >
              {form.name?.[0] || 'D'}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-text-primary">{form.name || 'Division Name'}</p>
            {form.tradeName && (
              <p className="text-sm text-text-secondary">{form.tradeName}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <div
                className="h-4 w-4 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: form.primaryColor }}
                title="Primary Color"
              />
              <div
                className="h-4 w-4 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: form.secondaryColor }}
                title="Secondary Color"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Branding Form */}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div>
          <label className="label">Division Name</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Al Reem Real Estate"
            />
          </div>
        </div>

        <div>
          <label className="label">Trade Name</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.tradeName}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
              placeholder="e.g. Al Reem Properties LLC"
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">The official trade name of this division</p>
        </div>

        <div>
          <label className="label">Logo URL</label>
          <div className="relative">
            <Image className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.logo}
              onChange={(e) => setForm({ ...form, logo: e.target.value })}
              placeholder="https://example.com/logo.png"
              type="url"
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">Recommended: square image, at least 200x200px</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-10 rounded-lg border border-border cursor-pointer p-0.5"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
              <input
                className="input flex-1 font-mono text-sm"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                placeholder="#3B82F6"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
            <p className="text-2xs text-text-tertiary mt-1">Main brand color for this division</p>
          </div>
          <div>
            <label className="label">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-10 rounded-lg border border-border cursor-pointer p-0.5"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
              />
              <input
                className="input flex-1 font-mono text-sm"
                value={form.secondaryColor}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                placeholder="#1E40AF"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
            <p className="text-2xs text-text-tertiary mt-1">Accent color used for gradients and highlights</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Division branding updated successfully
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Notifications Section ──────────────────────────────────────── */
function NotificationsSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getNotificationPreferences().then(setPrefs);
  }, []);

  const toggle = (key: string) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: !prefs[key] });
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await api.updateNotificationPreferences(prefs);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const emailNotifs = [
    { key: 'emailNewLead', label: 'New lead created', description: 'Get notified when a new lead is added to the system' },
    { key: 'emailLeadAssigned', label: 'Lead assigned to you', description: 'When a lead is assigned or reassigned to you' },
    { key: 'emailTaskDue', label: 'Task due reminders', description: 'Receive reminders before tasks are due' },
    { key: 'emailWeeklyDigest', label: 'Weekly digest', description: 'Summary of your weekly lead activity and stats' },
  ];

  const inAppNotifs = [
    { key: 'inAppNewLead', label: 'New leads', description: 'Show notifications for new leads' },
    { key: 'inAppLeadAssigned', label: 'Lead assignments', description: 'Notify when leads are assigned to you' },
    { key: 'inAppTaskDue', label: 'Task reminders', description: 'Show alerts for upcoming and overdue tasks' },
    { key: 'inAppStatusChange', label: 'Status changes', description: 'When lead status or pipeline stage changes' },
  ];

  if (!prefs) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Notifications" description="Choose how you want to be notified" />
        <div className="card p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div><div className="skeleton h-4 w-40 mb-1" /><div className="skeleton h-3 w-56" /></div>
              <div className="skeleton h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Notifications"
        description="Choose how you want to be notified about activity"
      />

      {/* Email Notifications */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">Email Notifications</h3>
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {emailNotifs.map((notif) => (
            <div key={notif.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{notif.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{notif.description}</p>
              </div>
              <ToggleSwitch checked={prefs[notif.key] ?? true} onChange={() => toggle(notif.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* In-App Notifications */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">In-App Notifications</h3>
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {inAppNotifs.map((notif) => (
            <div key={notif.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{notif.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{notif.description}</p>
              </div>
              <ToggleSwitch checked={prefs[notif.key] ?? true} onChange={() => toggle(notif.key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {success && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
            <Check className="h-4 w-4" />
            Preferences saved
          </div>
        )}
        {!success && <div />}
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

/* ─── Audit Log Section ──────────────────────────────────────────── */
function AuditLogSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLog().then(setLogs).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Audit Log"
        description="Track all administrative actions and changes"
      />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex-1"><div className="skeleton h-4 w-48 mb-1" /><div className="skeleton h-3 w-32" /></div>
                <div className="skeleton h-4 w-24" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">No audit logs yet</p>
            <p className="text-xs text-text-tertiary mt-1">Activity will appear here as actions are performed</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-surface-secondary transition-colors">
                <div className="h-8 w-8 rounded-full bg-surface-tertiary flex items-center justify-center flex-shrink-0">
                  <Shield className="h-3.5 w-3.5 text-text-tertiary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{log.user?.firstName} {log.user?.lastName}</span>
                    {' '}
                    <span className="text-text-secondary">{log.action.toLowerCase().replace(/_/g, ' ')}</span>
                    {' '}
                    <span className="font-medium">{log.entity?.toLowerCase()}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xs text-text-tertiary">
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {log.ipAddress && (
                      <span className="text-2xs text-text-tertiary">&middot; {log.ipAddress}</span>
                    )}
                  </div>
                </div>
                <span className="badge bg-surface-tertiary text-text-tertiary text-2xs">{log.entity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Danger Zone Section ────────────────────────────────────────── */
function DangerZoneSection() {
  const { logout } = useAuthStore();
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      logout();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Danger Zone"
        description="Irreversible and destructive actions"
      />

      {/* Sign Out All Sessions */}
      <div className="card p-5 border-orange-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Sign Out</h3>
            <p className="text-2xs text-text-tertiary mt-0.5">Sign out of your current session</p>
          </div>
          <button
            onClick={logout}
            className="btn-secondary text-orange-700 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="card p-5 border-red-200 bg-red-50/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-red-700">Delete Account</h3>
            <p className="text-2xs text-red-600/80 mt-0.5">
              Permanently deactivate your account. This action cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDelete(!showDelete)}
            className="btn-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </button>
        </div>

        {showDelete && (
          <form onSubmit={handleDelete} className="mt-4 pt-4 border-t border-red-200 animate-fade-in">
            <div className="p-3 rounded-lg bg-red-100/60 mb-4">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">
                  <p className="font-medium">Are you absolutely sure?</p>
                  <p className="text-2xs mt-1">This will deactivate your account and remove your access. Your data will be retained per our data policy. Enter your password to confirm.</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="label text-red-700">Confirm Password</label>
              <input
                type="password"
                className="input border-red-200 focus:ring-red-500 focus:border-red-500"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-100 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDelete(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={deleting} className="btn-danger">
                {deleting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Field Type Configuration ──────────────────────────────────────── */

const FIELD_TYPE_CONFIG: Record<FieldType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string }> = {
  TEXT:         { label: 'Text',         icon: Type,       color: 'bg-gray-100 text-gray-700',    description: 'Short text input' },
  TEXTAREA:    { label: 'Long Text',    icon: FileText,   color: 'bg-gray-100 text-gray-600',    description: 'Multi-line text area' },
  NUMBER:      { label: 'Number',       icon: Hash,       color: 'bg-blue-100 text-blue-700',    description: 'Numeric value' },
  CURRENCY:    { label: 'Currency',     icon: DollarSign, color: 'bg-emerald-100 text-emerald-700', description: 'Monetary amount' },
  DATE:        { label: 'Date',         icon: Calendar,   color: 'bg-purple-100 text-purple-700', description: 'Date picker' },
  SELECT:      { label: 'Dropdown',     icon: List,       color: 'bg-amber-100 text-amber-700',  description: 'Single choice dropdown' },
  MULTI_SELECT:{ label: 'Multi-Select', icon: List,       color: 'bg-orange-100 text-orange-700', description: 'Multiple choice tags' },
  BOOLEAN:     { label: 'Yes/No',       icon: ToggleLeft, color: 'bg-green-100 text-green-700',  description: 'Toggle switch' },
  URL:         { label: 'URL',          icon: Link2,      color: 'bg-cyan-100 text-cyan-700',    description: 'Website URL' },
  EMAIL:       { label: 'Email',        icon: AtSign,     color: 'bg-indigo-100 text-indigo-700', description: 'Email address' },
  PHONE:       { label: 'Phone',        icon: Phone,      color: 'bg-pink-100 text-pink-700',    description: 'Phone number' },
};

/* ─── Built-in Field Definitions (fallback if API unavailable) ──────── */

const BUILTIN_FIELD_CATEGORIES = [
  { key: 'contact',  label: 'Contact Info', icon: Users,     emoji: '📋' },
  { key: 'lead',     label: 'Lead Info',    icon: BarChart3, emoji: '🎯' },
  { key: 'business', label: 'Business',     icon: Briefcase, emoji: '💼' },
  { key: 'system',   label: 'System',       icon: Clock,     emoji: '⚙️' },
];

const DEFAULT_BUILTIN_FIELDS: BuiltInField[] = [
  // Contact Info
  { key: 'name',           label: 'Name',             type: 'text',    category: 'contact',  locked: true,  showInList: true,  showInDetail: true, isRequired: true,  canToggleRequired: false, order: 1,  isBuiltIn: true },
  { key: 'email',          label: 'Email',            type: 'email',   category: 'contact',  locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: true,  order: 2,  isBuiltIn: true },
  { key: 'phone',          label: 'Phone',            type: 'phone',   category: 'contact',  locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: true,  order: 3,  isBuiltIn: true },
  { key: 'company',        label: 'Company',          type: 'text',    category: 'contact',  locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: true,  order: 4,  isBuiltIn: true },
  { key: 'jobTitle',       label: 'Job Title',        type: 'text',    category: 'contact',  locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 5,  isBuiltIn: true },
  { key: 'location',       label: 'Location',         type: 'text',    category: 'contact',  locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 6,  isBuiltIn: true },
  { key: 'website',        label: 'Website',          type: 'url',     category: 'contact',  locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 7,  isBuiltIn: true },
  // Lead Info
  { key: 'source',         label: 'Source',           type: 'select',  category: 'lead',     locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: true,  order: 8,  isBuiltIn: true },
  { key: 'status',         label: 'Status',           type: 'select',  category: 'lead',     locked: true,  showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: false, order: 9,  isBuiltIn: true },
  { key: 'score',          label: 'Score',            type: 'number',  category: 'lead',     locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: false, order: 10, isBuiltIn: true },
  { key: 'stageId',        label: 'Pipeline Stage',   type: 'select',  category: 'lead',     locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: false, order: 11, isBuiltIn: true },
  { key: 'assignedTo',     label: 'Assigned To',      type: 'user',    category: 'lead',     locked: true,  showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: false, order: 12, isBuiltIn: true },
  { key: 'tags',           label: 'Tags',             type: 'tags',    category: 'lead',     locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: false, order: 13, isBuiltIn: true },
  { key: 'conversionProb', label: 'Conversion %',     type: 'number',  category: 'lead',     locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: false, order: 14, isBuiltIn: true },
  // Business
  { key: 'budget',         label: 'Budget',           type: 'currency', category: 'business', locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 15, isBuiltIn: true },
  { key: 'productInterest', label: 'Product Interest', type: 'text',    category: 'business', locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 16, isBuiltIn: true },
  { key: 'campaign',       label: 'Campaign',         type: 'text',    category: 'business', locked: false, showInList: false, showInDetail: true, isRequired: false, canToggleRequired: true,  order: 17, isBuiltIn: true },
  // System
  { key: 'createdAt',      label: 'Created Date',     type: 'date',    category: 'system',   locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: false, order: 18, isBuiltIn: true },
  { key: 'updatedAt',      label: 'Updated Date',     type: 'date',    category: 'system',   locked: false, showInList: true,  showInDetail: true, isRequired: false, canToggleRequired: false, order: 19, isBuiltIn: true },
];

/* ─── Helper: Toggle Switch ─────────────────────────────────────────── */

function FieldToggle({ checked, onChange, disabled, size = 'sm' }: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = size === 'md'
    ? 'h-6 w-11'
    : 'h-5 w-9';
  const dotClasses = size === 'md'
    ? 'h-4 w-4'
    : 'h-3.5 w-3.5';
  const translateChecked = size === 'md' ? 'translate-x-6' : 'translate-x-[18px]';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`relative inline-flex ${sizeClasses} items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block ${dotClasses} transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? translateChecked : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/* ─── Helper: Stat Card ─────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

/* ─── Helper: Type Badge ────────────────────────────────────────────── */

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const config = FIELD_TYPE_CONFIG[type as FieldType];
  if (!config) {
    return (
      <span className={`inline-flex items-center gap-1 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} rounded-md font-medium bg-gray-100 text-gray-600`}>
        {type}
      </span>
    );
  }
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} rounded-md font-medium ${config.color}`}>
      <Icon className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {config.label}
    </span>
  );
}

/* ─── Helper: Division Badge ────────────────────────────────────────── */

function DivisionBadge({ divisionId, divisions }: { divisionId?: string | null; divisions: Organization[] }) {
  if (!divisionId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
        <Globe className="h-2.5 w-2.5" />
        Global
      </span>
    );
  }
  const div = divisions.find(d => d.id === divisionId);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: div?.primaryColor || '#6366f1' }} />
      {div?.name || 'Division'}
    </span>
  );
}

/* ─── Helper: Search Input ──────────────────────────────────────────── */

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Search fields...'}
        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100">
          <X className="h-3.5 w-3.5 text-gray-400" />
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN: CustomFieldsSection
   ═══════════════════════════════════════════════════════════════════════ */

function CustomFieldsSection() {
  // ─── State ─────────────────────────────────────────────────────────
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [builtInFields, setBuiltInFields] = useState<BuiltInField[]>([]);
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'builtin' | 'custom' | 'statusLabels'>('builtin');
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [editingStatusKey, setEditingStatusKey] = useState<string | null>(null);
  const [statusUnsaved, setStatusUnsaved] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [divDropdownOpen, setDivDropdownOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const divDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Fetch divisions on mount ──────────────────────────────────────
  useEffect(() => {
    api.getDivisions()
      .then(divs => setDivisions(divs))
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (divDropdownRef.current && !divDropdownRef.current.contains(e.target as Node)) {
        setDivDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Auto-dismiss toast ────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Fetch field config ────────────────────────────────────────────
  const fetchFieldConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFieldConfig(selectedDivisionId || undefined);
      setBuiltInFields(data.builtInFields || DEFAULT_BUILTIN_FIELDS);
      setCustomFields(data.customFields || []);
      setStatusLabels(data.statusLabels || {});
      setStatusUnsaved(false);
    } catch {
      // Fallback: fetch custom fields only
      try {
        const cfs = await api.getCustomFields(selectedDivisionId || undefined);
        setCustomFields(cfs || []);
        setBuiltInFields(DEFAULT_BUILTIN_FIELDS);
      } catch {
        setBuiltInFields(DEFAULT_BUILTIN_FIELDS);
        setCustomFields([]);
      }
    }
    setUnsavedChanges(false);
    setLoading(false);
  }, [selectedDivisionId]);

  useEffect(() => { fetchFieldConfig(); }, [fetchFieldConfig]);

  // ─── Computed stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const allFields = [
      ...builtInFields.map(f => ({ showInList: f.showInList, showInDetail: f.showInDetail })),
      ...customFields.map(f => ({ showInList: f.showInList, showInDetail: f.showInDetail })),
    ];
    return {
      total: allFields.length,
      inList: allFields.filter(f => f.showInList).length,
      inDetail: allFields.filter(f => f.showInDetail).length,
      required: builtInFields.filter(f => f.isRequired).length,
      custom: customFields.length,
    };
  }, [builtInFields, customFields]);

  // ─── Built-in field toggle ─────────────────────────────────────────
  const toggleBuiltIn = (key: string, prop: 'showInList' | 'showInDetail' | 'isRequired') => {
    setBuiltInFields(prev => prev.map(f => {
      if (f.key !== key) return f;
      if (prop === 'isRequired' && !f.canToggleRequired) return f;
      if (prop !== 'isRequired' && f.locked) return f;
      return { ...f, [prop]: !f[prop] };
    }));
    setUnsavedChanges(true);
  };

  // ─── Rename built-in field label ──────────────────────────────────
  const renameBuiltIn = (key: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    setBuiltInFields(prev => prev.map(f => {
      if (f.key !== key) return f;
      // If empty or same as default label, clear customLabel
      if (!trimmed || trimmed === f.label) {
        const { customLabel, ...rest } = f as any;
        return rest;
      }
      return { ...f, customLabel: trimmed };
    }));
    setUnsavedChanges(true);
  };

  // ─── Save built-in field config ────────────────────────────────────
  const saveBuiltInConfig = async () => {
    setSaving(true);
    try {
      const fields: Record<string, { showInList: boolean; showInDetail: boolean; isRequired: boolean; order: number; customLabel?: string }> = {};
      builtInFields.forEach(f => {
        const entry: any = { showInList: f.showInList, showInDetail: f.showInDetail, isRequired: f.isRequired, order: f.order };
        if (f.customLabel) entry.customLabel = f.customLabel;
        fields[f.key] = entry;
      });
      await api.saveFieldConfig(selectedDivisionId || null, fields);
      setUnsavedChanges(false);
      setToast({ type: 'success', message: 'Field configuration saved successfully' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to save configuration' });
    }
    setSaving(false);
  };

  // ─── Save status labels ───────────────────────────────────────────
  const saveStatusLabels = async () => {
    setSavingStatus(true);
    try {
      await api.saveStatusLabels(selectedDivisionId || null, statusLabels);
      setStatusUnsaved(false);
      setToast({ type: 'success', message: 'Status labels saved successfully' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to save status labels' });
    }
    setSavingStatus(false);
  };

  // ─── Custom field actions ──────────────────────────────────────────
  const handleDeleteCustomField = async (field: CustomField) => {
    if (!confirm(`Delete custom field "${field.label}"?\n\nThis will permanently remove all data stored in this field from all leads.`)) return;
    try {
      await api.deleteCustomField(field.id);
      setToast({ type: 'success', message: `Field "${field.label}" deleted` });
      fetchFieldConfig();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
  };

  // ─── Custom field drag reorder ─────────────────────────────────────
  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...customFields];
    const dragged = items.splice(dragIdx, 1)[0];
    items.splice(idx, 0, dragged);
    setCustomFields(items);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await api.reorderCustomFields(customFields.map(f => f.id));
    } catch { /* ignore */ }
  };

  // ─── Filter helpers ────────────────────────────────────────────────
  const filteredBuiltInFields = useMemo(() => {
    if (!searchQuery.trim()) return builtInFields;
    const q = searchQuery.toLowerCase();
    return builtInFields.filter(f =>
      f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
  }, [builtInFields, searchQuery]);

  const filteredCustomFields = useMemo(() => {
    if (!searchQuery.trim()) return customFields;
    const q = searchQuery.toLowerCase();
    return customFields.filter(f =>
      f.label.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)
    );
  }, [customFields, searchQuery]);

  const groupedBuiltInFields = useMemo(() => {
    const groups: Record<string, BuiltInField[]> = {};
    filteredBuiltInFields.forEach(f => {
      if (!groups[f.category]) groups[f.category] = [];
      groups[f.category].push(f);
    });
    return groups;
  }, [filteredBuiltInFields]);

  // ─── Division selector label ───────────────────────────────────────
  const selectedDivision = divisions.find(d => d.id === selectedDivisionId);
  const divisionLabel = selectedDivision ? selectedDivision.name : 'All Divisions / Group Level';

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Toast Notification ────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-fade-in ${
          toast.type === 'success'
            ? 'bg-white border-green-200 text-green-800'
            : 'bg-white border-red-200 text-red-800'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
            : <AlertTriangle className="h-4 w-4 text-red-500" />
          }
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 rounded hover:bg-gray-100">
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Field Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which fields appear in your Lead List and Lead Detail views. Create custom fields scoped to divisions.
          </p>
        </div>
        <button
          onClick={() => { setEditingField(null); setActiveSection('custom'); setShowModal(true); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Custom Field
        </button>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Layers}      label="Total Fields"     value={stats.total}    color="bg-gray-100 text-gray-600" />
        <StatCard icon={LayoutGrid}  label="In List View"     value={stats.inList}   color="bg-blue-100 text-blue-600" />
        <StatCard icon={Eye}         label="In Detail View"   value={stats.inDetail} color="bg-purple-100 text-purple-600" />
        <StatCard icon={SlidersHorizontal} label="Custom Fields" value={stats.custom} color="bg-indigo-100 text-indigo-600" />
      </div>

      {/* ── Division Selector Bar ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Building2 className="h-4 w-4" />
          <span className="font-medium">Scope:</span>
        </div>
        <div className="relative" ref={divDropdownRef}>
          <button
            onClick={() => setDivDropdownOpen(!divDropdownOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {selectedDivision && (
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedDivision.primaryColor || '#6366f1' }} />
            )}
            {!selectedDivision && <Globe className="h-3.5 w-3.5 text-gray-400" />}
            {divisionLabel}
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${divDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {divDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => { setSelectedDivisionId(''); setDivDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                  !selectedDivisionId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                }`}
              >
                <Globe className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                All Divisions / Group Level
                {!selectedDivisionId && <Check className="h-3.5 w-3.5 ml-auto text-indigo-600" />}
              </button>
              {divisions.length > 0 && <div className="border-t border-gray-100 my-1" />}
              {divisions.map(div => (
                <button
                  key={div.id}
                  onClick={() => { setSelectedDivisionId(div.id); setDivDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                    selectedDivisionId === div.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: div.primaryColor || '#6366f1' }} />
                  <span className="truncate">{div.name}</span>
                  {div._count && (
                    <span className="ml-auto text-[10px] text-gray-400">{div._count.leads} leads</span>
                  )}
                  {selectedDivisionId === div.id && <Check className="h-3.5 w-3.5 ml-auto text-indigo-600 flex-shrink-0" />}
                </button>
              ))}
              {divisions.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No divisions found</p>
              )}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <div className="w-56">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search fields..." />
        </div>
      </div>

      {/* ── Section Tabs ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveSection('builtin')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeSection === 'builtin'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Built-in Fields
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              activeSection === 'builtin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {builtInFields.length}
            </span>
          </button>
          <button
            onClick={() => setActiveSection('custom')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeSection === 'custom'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Custom Fields
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              activeSection === 'custom' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {customFields.length}
            </span>
          </button>
          <button
            onClick={() => setActiveSection('statusLabels')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeSection === 'statusLabels'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Tag className="h-4 w-4" />
            Status Labels
          </button>
        </div>

        {/* ── Loading State ──────────────────────────────────────── */}
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading field configuration…</p>
          </div>
        ) : activeSection === 'builtin' ? (
          /* ═══ BUILT-IN FIELDS TAB ═══════════════════════════════ */
          <div>
            {/* Column headers */}
            <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-4">Field</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-2 text-center">In List</div>
                <div className="col-span-2 text-center">In Detail</div>
                <div className="col-span-2 text-center">Required</div>
                <div className="col-span-1 text-center">Status</div>
              </div>
            </div>

            {/* Grouped fields */}
            {BUILTIN_FIELD_CATEGORIES.map(cat => {
              const catFields = groupedBuiltInFields[cat.key];
              if (!catFields || catFields.length === 0) return null;

              return (
                <div key={cat.key}>
                  {/* Category header */}
                  <div className="px-5 py-2 bg-gray-50/70 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{cat.emoji}</span>
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{cat.label}</span>
                      <span className="text-[10px] text-gray-400">({catFields.length})</span>
                    </div>
                  </div>

                  {/* Field rows */}
                  {catFields.map((field, idx) => (
                    <div
                      key={field.key}
                      className={`grid grid-cols-12 gap-2 items-center px-5 py-2.5 border-b border-gray-100 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                      } hover:bg-indigo-50/30`}
                    >
                      {/* Field name — click to rename */}
                      <div className="col-span-4 flex items-center gap-2.5">
                        <div className="flex-1 min-w-0">
                          {editingLabelKey === field.key ? (
                            <input
                              autoFocus
                              className="text-sm font-medium text-gray-900 bg-white border border-indigo-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              defaultValue={field.customLabel || field.label}
                              placeholder={field.label}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { renameBuiltIn(field.key, (e.target as HTMLInputElement).value); setEditingLabelKey(null); }
                                if (e.key === 'Escape') setEditingLabelKey(null);
                              }}
                              onBlur={(e) => { renameBuiltIn(field.key, e.target.value); setEditingLabelKey(null); }}
                            />
                          ) : (
                            <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditingLabelKey(field.key)}>
                              <p className="text-sm font-medium text-gray-900">
                                {field.customLabel || field.label}
                                {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                              </p>
                              <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          <p className="text-[10px] text-gray-400 font-mono">
                            {field.key}{field.customLabel && <span className="ml-1 text-gray-300">· default: {field.label}</span>}
                          </p>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="col-span-1">
                        <TypeBadge type={field.type} small />
                      </div>

                      {/* Show in List toggle */}
                      <div className="col-span-2 flex justify-center">
                        {field.locked ? (
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Lock className="h-3 w-3" />
                            Always
                          </div>
                        ) : (
                          <FieldToggle
                            checked={field.showInList}
                            onChange={() => toggleBuiltIn(field.key, 'showInList')}
                          />
                        )}
                      </div>

                      {/* Show in Detail toggle */}
                      <div className="col-span-2 flex justify-center">
                        {field.locked ? (
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Lock className="h-3 w-3" />
                            Always
                          </div>
                        ) : (
                          <FieldToggle
                            checked={field.showInDetail}
                            onChange={() => toggleBuiltIn(field.key, 'showInDetail')}
                          />
                        )}
                      </div>

                      {/* Required toggle */}
                      <div className="col-span-2 flex justify-center">
                        {!field.canToggleRequired ? (
                          field.isRequired ? (
                            <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                              <Lock className="h-3 w-3" />
                              Always
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )
                        ) : (
                          <FieldToggle
                            checked={field.isRequired}
                            onChange={() => toggleBuiltIn(field.key, 'isRequired')}
                          />
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-1 flex justify-center">
                        {field.locked ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600">
                            <Lock className="h-2.5 w-2.5" />
                            Locked
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            field.showInList || field.showInDetail
                              ? 'bg-green-50 text-green-600'
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {field.showInList || field.showInDetail ? 'Visible' : 'Hidden'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {filteredBuiltInFields.length === 0 && searchQuery && (
              <div className="p-8 text-center">
                <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No built-in fields match "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : activeSection === 'statusLabels' ? (
          /* ═══ STATUS LABELS TAB ═══════════════════════════════════ */
          <div>
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">Customize how pipeline statuses are displayed. Changes apply to stat cards, badges, filters, and dropdowns.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { key: 'NEW', default: 'New', color: 'bg-indigo-100 text-indigo-800' },
                { key: 'CONTACTED', default: 'Contacted', color: 'bg-blue-100 text-blue-800' },
                { key: 'QUALIFIED', default: 'Qualified', color: 'bg-cyan-100 text-cyan-800' },
                { key: 'PROPOSAL_SENT', default: 'Proposal Sent', color: 'bg-amber-100 text-amber-800' },
                { key: 'NEGOTIATION', default: 'Negotiation', color: 'bg-purple-100 text-purple-800' },
                { key: 'WON', default: 'Won', color: 'bg-green-100 text-green-800' },
                { key: 'LOST', default: 'Lost', color: 'bg-red-100 text-red-800' },
              ].map(status => (
                <div key={status.key} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                    {statusLabels[status.key] || status.default}
                  </span>
                  <div className="flex-1 min-w-0">
                    {editingStatusKey === status.key ? (
                      <input
                        autoFocus
                        className="text-sm font-medium text-gray-900 border border-indigo-300 rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        defaultValue={statusLabels[status.key] || status.default}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (!val || val === status.default) {
                              const next = { ...statusLabels };
                              delete next[status.key];
                              setStatusLabels(next);
                            } else {
                              setStatusLabels({ ...statusLabels, [status.key]: val });
                            }
                            setEditingStatusKey(null);
                            setStatusUnsaved(true);
                          }
                          if (e.key === 'Escape') setEditingStatusKey(null);
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (!val || val === status.default) {
                            const next = { ...statusLabels };
                            delete next[status.key];
                            setStatusLabels(next);
                          } else {
                            setStatusLabels({ ...statusLabels, [status.key]: val });
                          }
                          setEditingStatusKey(null);
                          setStatusUnsaved(true);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingStatusKey(status.key)}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors group"
                      >
                        {statusLabels[status.key] || status.default}
                        <Pencil className="h-3 w-3 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Internal: {status.key}{statusLabels[status.key] && <span className="ml-1 text-gray-300">· default: {status.default}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {statusUnsaved && (
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
                <p className="text-xs text-amber-700 font-medium">You have unsaved status label changes</p>
                <button
                  onClick={saveStatusLabels}
                  disabled={savingStatus}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {savingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Status Labels
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ═══ CUSTOM FIELDS TAB ═════════════════════════════════ */
          <div>
            {filteredCustomFields.length === 0 && !searchQuery ? (
              /* Empty state */
              <div className="p-10 text-center">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Columns3 className="h-7 w-7 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">No custom fields yet</p>
                <p className="text-xs text-gray-500 mb-5 max-w-xs mx-auto">
                  Create custom fields to track additional information specific to your business. Fields can be scoped to specific divisions.
                </p>
                <button
                  onClick={() => { setEditingField(null); setShowModal(true); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create First Field
                </button>
              </div>
            ) : filteredCustomFields.length === 0 && searchQuery ? (
              <div className="p-8 text-center">
                <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No custom fields match "{searchQuery}"</p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                  <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <div className="col-span-1" />
                    <div className="col-span-3">Field</div>
                    <div className="col-span-1">Type</div>
                    <div className="col-span-1 text-center">Required</div>
                    <div className="col-span-1 text-center">List</div>
                    <div className="col-span-1 text-center">Detail</div>
                    <div className="col-span-2 text-center">Division</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>
                </div>

                {/* Custom field rows */}
                <div className="divide-y divide-gray-100">
                  {filteredCustomFields.map((field, idx) => {
                    const typeConfig = FIELD_TYPE_CONFIG[field.type];
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`grid grid-cols-12 gap-2 items-center px-5 py-2.5 transition-colors ${
                          dragIdx === idx ? 'bg-indigo-50 ring-1 ring-indigo-200' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                        } hover:bg-indigo-50/30`}
                      >
                        {/* Drag handle */}
                        <div className="col-span-1 flex justify-center">
                          <GripVertical className="h-4 w-4 text-gray-300 cursor-grab active:cursor-grabbing" />
                        </div>

                        {/* Field info */}
                        <div className="col-span-3">
                          <p className="text-sm font-medium text-gray-900">{field.label}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{field.name}</p>
                          {field.description && (
                            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{field.description}</p>
                          )}
                        </div>

                        {/* Type */}
                        <div className="col-span-1">
                          <TypeBadge type={field.type} small />
                        </div>

                        {/* Required */}
                        <div className="col-span-1 flex justify-center">
                          {field.isRequired ? (
                            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              Required
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Optional</span>
                          )}
                        </div>

                        {/* Show in List */}
                        <div className="col-span-1 flex justify-center">
                          <FieldToggle
                            checked={field.showInList}
                            onChange={async () => {
                              try {
                                await api.updateCustomField(field.id, { showInList: !field.showInList });
                                setCustomFields(prev => prev.map(f =>
                                  f.id === field.id ? { ...f, showInList: !f.showInList } : f
                                ));
                              } catch { /* ignore */ }
                            }}
                          />
                        </div>

                        {/* Show in Detail */}
                        <div className="col-span-1 flex justify-center">
                          <FieldToggle
                            checked={field.showInDetail}
                            onChange={async () => {
                              try {
                                await api.updateCustomField(field.id, { showInDetail: !field.showInDetail });
                                setCustomFields(prev => prev.map(f =>
                                  f.id === field.id ? { ...f, showInDetail: !f.showInDetail } : f
                                ));
                              } catch { /* ignore */ }
                            }}
                          />
                        </div>

                        {/* Division */}
                        <div className="col-span-2 flex justify-center">
                          <DivisionBadge divisionId={field.divisionId} divisions={divisions} />
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {field.options && field.options.length > 0 && (
                            <span className="text-[10px] text-gray-400 mr-1">{field.options.length} opts</span>
                          )}
                          <button
                            onClick={() => { setEditingField(field); setShowModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomField(field)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add button at bottom */}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                  <button
                    onClick={() => { setEditingField(null); setShowModal(true); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Another Field
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Save Bar (sticky when built-in fields have unsaved changes) ── */}
      {unsavedChanges && activeSection === 'builtin' && (
        <div className="sticky bottom-4 z-10">
          <div className="bg-white border border-indigo-200 rounded-xl shadow-lg px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-medium text-gray-900">You have unsaved changes to built-in field visibility</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchFieldConfig()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveBuiltInConfig}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ─────────────────────────────────────── */}
      {showModal && (
        <CustomFieldModal
          field={editingField}
          divisions={divisions}
          selectedDivisionId={selectedDivisionId}
          onClose={() => { setShowModal(false); setEditingField(null); }}
          onSaved={() => {
            setShowModal(false);
            setEditingField(null);
            fetchFieldConfig();
            setToast({ type: 'success', message: editingField ? 'Field updated successfully' : 'Custom field created' });
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MODAL: CustomFieldModal (Enhanced)
   ═══════════════════════════════════════════════════════════════════════ */

function CustomFieldModal({
  field,
  divisions,
  selectedDivisionId,
  onClose,
  onSaved,
}: {
  field: CustomField | null;
  divisions: Organization[];
  selectedDivisionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(field?.label || '');
  const [type, setType] = useState<FieldType>(field?.type || 'TEXT');
  const [isRequired, setIsRequired] = useState(field?.isRequired || false);
  const [showInList, setShowInList] = useState(field?.showInList ?? true);
  const [showInDetail, setShowInDetail] = useState(field?.showInDetail ?? true);
  const [description, setDescription] = useState(field?.description || '');
  const [placeholder, setPlaceholder] = useState(field?.placeholder || '');
  const [defaultValue, setDefaultValue] = useState(field?.defaultValue || '');
  const [divisionId, setDivisionId] = useState<string>(field?.divisionId || selectedDivisionId || '');
  const [options, setOptions] = useState<string[]>((field?.options as string[]) || []);
  const [newOption, setNewOption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(
    !!(field?.description || field?.placeholder || field?.defaultValue)
  );

  const isSelect = type === 'SELECT' || type === 'MULTI_SELECT';

  const addOption = () => {
    const val = newOption.trim();
    if (val && !options.includes(val)) {
      setOptions([...options, val]);
      setNewOption('');
    }
  };

  const removeOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { setError('Label is required'); return; }
    if (isSelect && options.length === 0) { setError('Add at least one option for dropdown fields'); return; }

    setSaving(true);
    setError('');
    try {
      const payload: any = {
        label,
        type,
        options: isSelect ? options : undefined,
        isRequired,
        showInList,
        showInDetail,
        description: description || undefined,
        placeholder: placeholder || undefined,
        defaultValue: defaultValue || undefined,
        divisionId: divisionId || null,
      };

      if (field) {
        // For update, set null options if not select
        if (!isSelect) payload.options = null;
        await api.updateCustomField(field.id, payload);
      } else {
        await api.createCustomField(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{field ? 'Edit' : 'Create'} Custom Field</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {field ? 'Update field properties and visibility settings' : 'This field will appear in lead forms, table, and details'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Field Label */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Field Label <span className="text-red-500">*</span></label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Company Size, Industry, Contract Value"
                autoFocus
              />
            </div>

            {/* Division Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Division Scope</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">All Divisions (Global)</option>
                {divisions.map(div => (
                  <option key={div.id} value={div.id}>{div.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Global fields are visible across all divisions. Division-scoped fields only appear within that division.
              </p>
            </div>

            {/* Field Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Field Type <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(FIELD_TYPE_CONFIG) as [FieldType, typeof FIELD_TYPE_CONFIG[FieldType]][]).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setType(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        type === key
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options for SELECT / MULTI_SELECT */}
            {isSelect && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900">{opt}</span>
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      placeholder="Type option and press Enter"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                    />
                    <button
                      type="button"
                      onClick={addOption}
                      className="px-3 py-2 text-sm font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Visibility & Required Toggles */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Visibility & Validation</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Show in List View</p>
                  <p className="text-[11px] text-gray-500">Display as a column in the leads table</p>
                </div>
                <FieldToggle checked={showInList} onChange={() => setShowInList(!showInList)} size="md" />
              </div>

              <div className="border-t border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Show in Detail View</p>
                  <p className="text-[11px] text-gray-500">Display on the lead detail page</p>
                </div>
                <FieldToggle checked={showInDetail} onChange={() => setShowInDetail(!showInDetail)} size="md" />
              </div>

              <div className="border-t border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Required Field</p>
                  <p className="text-[11px] text-gray-500">Require this field when creating or importing leads</p>
                </div>
                <FieldToggle checked={isRequired} onChange={() => setIsRequired(!isRequired)} size="md" />
              </div>
            </div>

            {/* Advanced Options (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 pl-5 border-l-2 border-gray-200">
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Help Text / Description</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description shown to users"
                    />
                  </div>

                  {/* Placeholder */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder Text</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      value={placeholder}
                      onChange={(e) => setPlaceholder(e.target.value)}
                      placeholder="Text shown when field is empty"
                    />
                  </div>

                  {/* Default Value */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Value</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      value={defaultValue}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      placeholder="Auto-filled value for new leads"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Live Preview</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label || 'Field Label'}{isRequired ? ' *' : ''}
                </label>
                {description && (
                  <p className="text-[11px] text-gray-400 mb-1.5">{description}</p>
                )}
                {type === 'TEXT' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    placeholder={placeholder || 'Enter text...'}
                    defaultValue={defaultValue}
                    disabled
                  />
                )}
                {type === 'TEXTAREA' && (
                  <textarea
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 resize-none"
                    placeholder={placeholder || 'Enter long text...'}
                    defaultValue={defaultValue}
                    rows={3}
                    disabled
                  />
                )}
                {type === 'NUMBER' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    type="number"
                    placeholder={placeholder || '0'}
                    defaultValue={defaultValue}
                    disabled
                  />
                )}
                {type === 'CURRENCY' && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                      type="number"
                      placeholder={placeholder || '0.00'}
                      defaultValue={defaultValue}
                      disabled
                    />
                  </div>
                )}
                {type === 'DATE' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    type="date"
                    disabled
                  />
                )}
                {type === 'URL' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    placeholder={placeholder || 'https://...'}
                    defaultValue={defaultValue}
                    disabled
                  />
                )}
                {type === 'EMAIL' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    placeholder={placeholder || 'email@example.com'}
                    defaultValue={defaultValue}
                    disabled
                  />
                )}
                {type === 'PHONE' && (
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400"
                    placeholder={placeholder || '+1 (555) 000-0000'}
                    defaultValue={defaultValue}
                    disabled
                  />
                )}
                {type === 'BOOLEAN' && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input type="radio" name="preview-bool" disabled className="text-indigo-600" /> Yes
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input type="radio" name="preview-bool" disabled className="text-indigo-600" /> No
                    </label>
                  </div>
                )}
                {type === 'SELECT' && (
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900"
                    disabled
                  >
                    <option>{placeholder || 'Select...'}</option>
                    {options.map((o, i) => <option key={i}>{o}</option>)}
                  </select>
                )}
                {type === 'MULTI_SELECT' && (
                  <div className="flex gap-1.5 flex-wrap min-h-[32px] items-center">
                    {options.length > 0 ? options.map((o, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full"
                      >
                        {o}
                      </span>
                    )) : (
                      <span className="text-xs text-gray-400">No options yet</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : field ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Update Field
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Create Field
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Internal components - not exported (Next.js page files only allow default export)
function DivisionEmailSelector({ selectedDivisionId, onSelect }: { selectedDivisionId: string; onSelect: (id: string) => void }) {
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDivisions().then((divs) => {
      setDivisions(divs.map((d: any) => ({ id: d.id, name: d.name })));
      if (divs.length > 0 && !selectedDivisionId) {
        onSelect(divs[0].id);
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Loading divisions...</div>;
  }

  if (divisions.length === 0) {
    return <p className="text-sm text-text-tertiary">No divisions found. Create a division first.</p>;
  }

  return (
    <div className="card p-4 bg-surface-secondary border-2 border-brand-200">
      <div className="flex items-center gap-3">
        <Building2 className="h-5 w-5 text-brand-primary" />
        <div className="flex-1">
          <label className="label mb-1">Select Division</label>
          <select
            className="input"
            value={selectedDivisionId}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">-- Select a division --</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-2xs text-text-tertiary mt-2">Email settings are configured per division. Select the division you want to configure.</p>
    </div>
  );
}

/* ─── Email Settings Section ─────────────────────────────────────── */
function EmailSettingsSection() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [emailTab, setEmailTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');

  return (
    <div className="space-y-6">
      <SectionHeader title="Email Settings" description="Configure outgoing (SMTP) and incoming (IMAP/POP3) email servers" />

      {/* Division selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <DivisionEmailSelector
          selectedDivisionId={selectedDivisionId}
          onSelect={(id) => { setSelectedDivisionId(id); }}
        />
      )}

      {/* Show email config only when a division is selected (or user is not super admin) */}
      {(!isSuperAdmin || selectedDivisionId) && (
        <>
          {/* Outgoing / Incoming tabs */}
          <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
            <button
              onClick={() => setEmailTab('outgoing')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                emailTab === 'outgoing'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <Send className="h-4 w-4" />
              Outgoing (SMTP)
            </button>
            <button
              onClick={() => setEmailTab('incoming')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                emailTab === 'incoming'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <Inbox className="h-4 w-4" />
              Incoming (IMAP / POP3)
            </button>
          </div>

          {emailTab === 'outgoing'
            ? <OutgoingEmailSettings key={selectedDivisionId} divisionId={isSuperAdmin ? selectedDivisionId : undefined} />
            : <IncomingEmailSettings key={selectedDivisionId} divisionId={isSuperAdmin ? selectedDivisionId : undefined} />
          }
        </>
      )}
    </div>
  );
}

/* ─── Outgoing Email (SMTP) Settings ──────────────────────────────── */
function OutgoingEmailSettings({ divisionId }: { divisionId?: string }) {
  const [form, setForm] = useState({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '',
    fromName: '', fromEmail: '', replyTo: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getEmailConfig(divisionId).then((config) => {
      if (config && config.smtpHost) {
        setForm({
          smtpHost: config.smtpHost || '',
          smtpPort: String(config.smtpPort || 587),
          smtpUser: config.smtpUser || '',
          smtpPass: config.hasPassword ? '••••••••' : '',
          fromName: config.fromName || '',
          fromEmail: config.fromEmail || '',
          replyTo: config.replyTo || '',
        });
        setHasPassword(!!config.hasPassword);
      } else {
        setForm({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', fromName: '', fromEmail: '', replyTo: '' });
        setHasPassword(false);
      }
    }).finally(() => setLoading(false));
  }, [divisionId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api.saveEmailConfig({
        ...form,
        smtpPort: parseInt(form.smtpPort, 10),
      }, divisionId);
      setHasPassword(true);
      setStatus({ type: 'success', message: 'SMTP settings saved successfully' });
      setTimeout(() => setStatus(null), 4000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await api.testEmailConnection({
        smtpHost: form.smtpHost,
        smtpPort: parseInt(form.smtpPort, 10),
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
      }, divisionId);
      setStatus({ type: result.success ? 'success' : 'error', message: result.message });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail) return;
    setSendingTest(true);
    setStatus(null);
    try {
      const result = await api.sendTestEmail(testEmail, divisionId);
      setStatus({ type: result.success ? 'success' : 'error', message: result.message });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to send test email' });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>;
  }

  return (
    <div className="space-y-6">
      {status && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {status.message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* SMTP Server */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Globe className="h-4 w-4 text-text-tertiary" />
            SMTP Server
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SMTP Host *</label>
              <input className="input" required value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="mail.alzaabigroup.com" />
            </div>
            <div>
              <label className="label">SMTP Port *</label>
              <input className="input" required value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} placeholder="587" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Username *</label>
              <input className="input" required value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} placeholder="vimal@alzaabigroup.com" />
            </div>
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  required={!hasPassword}
                  value={form.smtpPass}
                  onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                  placeholder={hasPassword ? 'Leave blank to keep current' : 'App password'}
                  onFocus={() => { if (form.smtpPass === '••••••••') setForm({ ...form, smtpPass: '' }); }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-2xs text-text-tertiary mt-1">For Gmail, use an App Password (not your account password)</p>
            </div>
          </div>

          <button type="button" onClick={handleTestConnection} disabled={testing || !form.smtpHost || !form.smtpUser}
            className="btn-secondary text-xs">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* Sender Identity */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <User2 className="h-4 w-4 text-text-tertiary" />
            Sender Identity
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From Name *</label>
              <input className="input" required value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="Al-Zaabi Group" />
            </div>
            <div>
              <label className="label">From Email *</label>
              <input className="input" type="email" required value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="noreply@alzaabigroup.com" />
            </div>
          </div>
          <div>
            <label className="label">Reply-To Email (optional)</label>
            <input className="input" type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} placeholder="support@alzaabigroup.com" />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Send Test Email */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Mail className="h-4 w-4 text-text-tertiary" />
          Send Test Email
        </h3>
        <p className="text-xs text-text-tertiary">Save your settings first, then send a test email to verify everything works.</p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Recipient Email</label>
            <input className="input" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com" />
          </div>
          <button type="button" onClick={handleSendTest} disabled={sendingTest || !testEmail}
            className="btn-primary whitespace-nowrap">
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendingTest ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Incoming Email (IMAP / POP3) Settings ───────────────────────── */
function IncomingEmailSettings({ divisionId }: { divisionId?: string }) {
  const [protocol, setProtocol] = useState<'imap' | 'pop3'>('imap');
  const [imapForm, setImapForm] = useState({
    imapHost: '', imapPort: '993', imapUser: '', imapPass: '',
    imapSecurity: 'ssl', imapFolder: 'INBOX',
  });
  const [popForm, setPopForm] = useState({
    popHost: '', popPort: '995', popUser: '', popPass: '',
    popSecurity: 'ssl', popDeleteAfterFetch: false,
  });
  const [fetchInterval, setFetchInterval] = useState('5');
  const [autoFetch, setAutoFetch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [showImapPass, setShowImapPass] = useState(false);
  const [showPopPass, setShowPopPass] = useState(false);
  const [hasImapPassword, setHasImapPassword] = useState(false);
  const [hasPopPassword, setHasPopPassword] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mailboxes, setMailboxes] = useState<string[]>([]);
  const [fetchedEmails, setFetchedEmails] = useState<any[] | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getIncomingEmailConfig(divisionId).then((config) => {
      if (config) {
        if (config.protocol) setProtocol(config.protocol);
        setImapForm({
          imapHost: config.imapHost || '',
          imapPort: String(config.imapPort || 993),
          imapUser: config.imapUser || '',
          imapPass: config.hasImapPassword ? '••••••••' : '',
          imapSecurity: config.imapSecurity || 'ssl',
          imapFolder: config.imapFolder || 'INBOX',
        });
        setPopForm({
          popHost: config.popHost || '',
          popPort: String(config.popPort || 995),
          popUser: config.popUser || '',
          popPass: config.hasPopPassword ? '••••••••' : '',
          popSecurity: config.popSecurity || 'ssl',
          popDeleteAfterFetch: config.popDeleteAfterFetch || false,
        });
        setFetchInterval(String(config.fetchInterval || 5));
        setAutoFetch(config.autoFetch || false);
        setHasImapPassword(!!config.hasImapPassword);
        setHasPopPassword(!!config.hasPopPassword);
      } else {
        setProtocol('imap');
        setImapForm({ imapHost: '', imapPort: '993', imapUser: '', imapPass: '', imapSecurity: 'ssl', imapFolder: 'INBOX' });
        setPopForm({ popHost: '', popPort: '995', popUser: '', popPass: '', popSecurity: 'ssl', popDeleteAfterFetch: false });
        setFetchInterval('5');
        setAutoFetch(false);
        setHasImapPassword(false);
        setHasPopPassword(false);
      }
    }).finally(() => setLoading(false));
  }, [divisionId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api.saveIncomingEmailConfig({
        protocol,
        ...imapForm,
        imapPort: parseInt(imapForm.imapPort, 10),
        ...popForm,
        popPort: parseInt(popForm.popPort, 10),
        fetchInterval: parseInt(fetchInterval, 10),
        autoFetch,
      }, divisionId);
      setHasImapPassword(true);
      setHasPopPassword(true);
      setStatus({ type: 'success', message: 'Incoming email settings saved successfully' });
      setTimeout(() => setStatus(null), 4000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestImap = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await api.testImapConnection({
        imapHost: imapForm.imapHost,
        imapPort: parseInt(imapForm.imapPort, 10),
        imapUser: imapForm.imapUser,
        imapPass: imapForm.imapPass,
        imapSecurity: imapForm.imapSecurity,
      }, divisionId);
      setStatus({ type: result.success ? 'success' : 'error', message: result.message });
      if (result.mailboxes) setMailboxes(result.mailboxes);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'IMAP connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleTestPop3 = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await api.testPop3Connection({
        popHost: popForm.popHost,
        popPort: parseInt(popForm.popPort, 10),
        popUser: popForm.popUser,
        popPass: popForm.popPass,
        popSecurity: popForm.popSecurity,
      }, divisionId);
      setStatus({ type: result.success ? 'success' : 'error', message: result.message });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'POP3 connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchEmails = async () => {
    setFetching(true);
    setStatus(null);
    try {
      const result = await api.fetchIncomingEmails(divisionId);
      if (result.success) {
        setFetchedEmails(result.emails || []);
        setStatus({ type: 'success', message: `Fetched ${result.count || 0} email(s) from server` });
      } else {
        setStatus({ type: 'error', message: result.error || 'Failed to fetch emails' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to fetch emails' });
    } finally {
      setFetching(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>;
  }

  return (
    <div className="space-y-6">
      {status && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {status.message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Protocol Selector */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Server className="h-4 w-4 text-text-tertiary" />
            Protocol
          </h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="protocol" value="imap"
                checked={protocol === 'imap'}
                onChange={() => setProtocol('imap')}
                className="w-4 h-4 text-brand-primary"
              />
              <span className="text-sm font-medium text-text-primary">IMAP</span>
              <span className="text-2xs text-text-tertiary">(Recommended — syncs across devices)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="protocol" value="pop3"
                checked={protocol === 'pop3'}
                onChange={() => setProtocol('pop3')}
                className="w-4 h-4 text-brand-primary"
              />
              <span className="text-sm font-medium text-text-primary">POP3</span>
              <span className="text-2xs text-text-tertiary">(Downloads and optionally deletes from server)</span>
            </label>
          </div>
        </div>

        {/* IMAP Settings */}
        {protocol === 'imap' && (
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Download className="h-4 w-4 text-text-tertiary" />
              IMAP Server
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">IMAP Host *</label>
                <input className="input" required value={imapForm.imapHost} onChange={(e) => setImapForm({ ...imapForm, imapHost: e.target.value })} placeholder="mail.alzaabigroup.com" />
              </div>
              <div>
                <label className="label">IMAP Port *</label>
                <input className="input" required value={imapForm.imapPort} onChange={(e) => setImapForm({ ...imapForm, imapPort: e.target.value })} placeholder="993" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Username *</label>
                <input className="input" required value={imapForm.imapUser} onChange={(e) => setImapForm({ ...imapForm, imapUser: e.target.value })} placeholder="vimal@alzaabigroup.com" />
              </div>
              <div>
                <label className="label">Password *</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showImapPass ? 'text' : 'password'}
                    required={!hasImapPassword}
                    value={imapForm.imapPass}
                    onChange={(e) => setImapForm({ ...imapForm, imapPass: e.target.value })}
                    placeholder={hasImapPassword ? 'Leave blank to keep current' : 'App password'}
                    onFocus={() => { if (imapForm.imapPass === '••••••••') setImapForm({ ...imapForm, imapPass: '' }); }}
                  />
                  <button type="button" onClick={() => setShowImapPass(!showImapPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                    {showImapPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Security</label>
                <select className="input" value={imapForm.imapSecurity} onChange={(e) => setImapForm({ ...imapForm, imapSecurity: e.target.value })}>
                  <option value="ssl">SSL/TLS (Port 993)</option>
                  <option value="starttls">STARTTLS (Port 143)</option>
                  <option value="none">None (Not recommended)</option>
                </select>
              </div>
              <div>
                <label className="label">Mailbox Folder</label>
                {mailboxes.length > 0 ? (
                  <select className="input" value={imapForm.imapFolder} onChange={(e) => setImapForm({ ...imapForm, imapFolder: e.target.value })}>
                    {mailboxes.map((mb) => (
                      <option key={mb} value={mb}>{mb}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={imapForm.imapFolder} onChange={(e) => setImapForm({ ...imapForm, imapFolder: e.target.value })} placeholder="INBOX" />
                )}
              </div>
            </div>

            <button type="button" onClick={handleTestImap} disabled={testing || !imapForm.imapHost || !imapForm.imapUser}
              className="btn-secondary text-xs">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {testing ? 'Testing...' : 'Test IMAP Connection'}
            </button>
          </div>
        )}

        {/* POP3 Settings */}
        {protocol === 'pop3' && (
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Download className="h-4 w-4 text-text-tertiary" />
              POP3 Server
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">POP3 Host *</label>
                <input className="input" required value={popForm.popHost} onChange={(e) => setPopForm({ ...popForm, popHost: e.target.value })} placeholder="mail.alzaabigroup.com" />
              </div>
              <div>
                <label className="label">POP3 Port *</label>
                <input className="input" required value={popForm.popPort} onChange={(e) => setPopForm({ ...popForm, popPort: e.target.value })} placeholder="995" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Username *</label>
                <input className="input" required value={popForm.popUser} onChange={(e) => setPopForm({ ...popForm, popUser: e.target.value })} placeholder="vimal@alzaabigroup.com" />
              </div>
              <div>
                <label className="label">Password *</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPopPass ? 'text' : 'password'}
                    required={!hasPopPassword}
                    value={popForm.popPass}
                    onChange={(e) => setPopForm({ ...popForm, popPass: e.target.value })}
                    placeholder={hasPopPassword ? 'Leave blank to keep current' : 'App password'}
                    onFocus={() => { if (popForm.popPass === '••••••••') setPopForm({ ...popForm, popPass: '' }); }}
                  />
                  <button type="button" onClick={() => setShowPopPass(!showPopPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">
                    {showPopPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Security</label>
                <select className="input" value={popForm.popSecurity} onChange={(e) => setPopForm({ ...popForm, popSecurity: e.target.value })}>
                  <option value="ssl">SSL/TLS (Port 995)</option>
                  <option value="starttls">STARTTLS (Port 110)</option>
                  <option value="none">None (Not recommended)</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={popForm.popDeleteAfterFetch}
                    onChange={(e) => setPopForm({ ...popForm, popDeleteAfterFetch: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-primary"
                  />
                  <span className="text-sm text-text-primary">Delete emails from server after fetching</span>
                </label>
              </div>
            </div>

            <button type="button" onClick={handleTestPop3} disabled={testing || !popForm.popHost || !popForm.popUser}
              className="btn-secondary text-xs">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {testing ? 'Testing...' : 'Test POP3 Connection'}
            </button>
          </div>
        )}

        {/* Fetch Settings */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-text-tertiary" />
            Fetch Settings
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fetch Interval (minutes)</label>
              <select className="input" value={fetchInterval} onChange={(e) => setFetchInterval(e.target.value)}>
                <option value="1">Every 1 minute</option>
                <option value="2">Every 2 minutes</option>
                <option value="5">Every 5 minutes</option>
                <option value="10">Every 10 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 1 hour</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={autoFetch}
                  onChange={(e) => setAutoFetch(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-primary"
                />
                <span className="text-sm text-text-primary">Enable automatic email fetching</span>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Incoming Settings'}
          </button>
          <button type="button" onClick={handleFetchEmails} disabled={fetching} className="btn-secondary">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {fetching ? 'Fetching...' : 'Fetch Emails Now'}
          </button>
        </div>
      </form>

      {/* Fetched Emails Preview */}
      {fetchedEmails !== null && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Inbox className="h-4 w-4 text-text-tertiary" />
            Fetched Emails ({fetchedEmails.length})
          </h3>
          {fetchedEmails.length === 0 ? (
            <p className="text-xs text-text-tertiary">No new emails found.</p>
          ) : (
            <div className="divide-y divide-border-primary max-h-80 overflow-y-auto">
              {fetchedEmails.map((email: any, idx: number) => (
                <div key={idx} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{email.subject}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        From: {email.from?.map((f: any) => f.address || f.name).join(', ') || 'Unknown'}
                      </p>
                      <p className="text-2xs text-text-tertiary mt-0.5 line-clamp-2">{email.text?.substring(0, 200)}</p>
                    </div>
                    <span className="text-2xs text-text-tertiary whitespace-nowrap">
                      {email.date ? new Date(email.date).toLocaleString() : ''}
                    </span>
                  </div>
                  {email.attachments?.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <FileText className="h-3 w-3 text-text-tertiary" />
                      <span className="text-2xs text-text-tertiary">{email.attachments.length} attachment(s)</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Common Server Settings Reference */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Common Email Server Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <p className="font-medium text-brand-primary">Zimbra (Al-Zaabi Group)</p>
            <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3 space-y-1 text-text-tertiary border border-indigo-200 dark:border-indigo-800">
              <p>IMAP: mail.alzaabigroup.com : 993 (SSL)</p>
              <p>POP3: mail.alzaabigroup.com : 995 (SSL)</p>
              <p>SMTP: mail.alzaabigroup.com : 587 (STARTTLS)</p>
              <p className="text-2xs mt-1">Use your Zimbra email and password</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-text-secondary">Gmail</p>
            <div className="bg-bg-secondary rounded-lg p-3 space-y-1 text-text-tertiary">
              <p>IMAP: imap.gmail.com : 993 (SSL)</p>
              <p>POP3: pop.gmail.com : 995 (SSL)</p>
              <p>SMTP: smtp.gmail.com : 587 (STARTTLS)</p>
              <p className="text-2xs mt-1">Requires App Password with 2FA enabled</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-text-secondary">Outlook / Office 365</p>
            <div className="bg-bg-secondary rounded-lg p-3 space-y-1 text-text-tertiary">
              <p>IMAP: outlook.office365.com : 993 (SSL)</p>
              <p>POP3: outlook.office365.com : 995 (SSL)</p>
              <p>SMTP: smtp.office365.com : 587 (STARTTLS)</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-text-secondary">Yahoo Mail</p>
            <div className="bg-bg-secondary rounded-lg p-3 space-y-1 text-text-tertiary">
              <p>IMAP: imap.mail.yahoo.com : 993 (SSL)</p>
              <p>POP3: pop.mail.yahoo.com : 995 (SSL)</p>
              <p>SMTP: smtp.mail.yahoo.com : 465 (SSL)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Email Templates Section ───────────────────────────────────── */
function EmailTemplatesSection() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', label: '', subject: '', body: '', description: '' });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const divisionId = isSuperAdmin ? selectedDivisionId : undefined;

  const fetchTemplates = async () => {
    if (isSuperAdmin && !selectedDivisionId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.getEmailTemplates(divisionId);
      setTemplates(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); fetchTemplates(); }, [selectedDivisionId]);

  const handleSaveTemplate = async (name: string, data: any) => {
    setSaving(true);
    setStatus(null);
    try {
      await api.saveEmailTemplate(name, data, divisionId);
      await fetchTemplates();
      setEditingTemplate(null);
      setShowNewForm(false);
      setPreviewHtml(null);
      setStatus({ type: 'success', message: 'Template saved successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await api.deleteEmailTemplate(name, divisionId);
      await fetchTemplates();
      setStatus({ type: 'success', message: 'Template deleted' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to delete' });
    }
  };

  const handleCreateNew = async () => {
    if (!newForm.name || !newForm.label || !newForm.subject || !newForm.body) {
      setStatus({ type: 'error', message: 'Name, label, subject and body are required' });
      return;
    }
    const safeName = newForm.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    await handleSaveTemplate(safeName, {
      label: newForm.label,
      subject: newForm.subject,
      body: newForm.body,
      description: newForm.description,
    });
    setNewForm({ name: '', label: '', subject: '', body: '', description: '' });
  };

  const handlePreview = async (bodyContent: string, subject?: string) => {
    setPreviewing(true);
    try {
      const result = await api.previewEmailTemplate({ body: bodyContent, subject }, divisionId);
      setPreviewHtml(result.html);
    } catch {
      setStatus({ type: 'error', message: 'Failed to generate preview' });
    } finally {
      setPreviewing(false);
    }
  };

  // Get the body content from a template (supports both new `body` and legacy `htmlBody`)
  const getTemplateBody = (tmpl: any): string => {
    return tmpl.body || tmpl.htmlBody || '';
  };

  const VARIABLE_HINTS = [
    { var: '{{firstName}}', desc: 'Lead first name' },
    { var: '{{lastName}}', desc: 'Lead last name' },
    { var: '{{email}}', desc: 'Lead email' },
    { var: '{{phone}}', desc: 'Lead phone' },
    { var: '{{company}}', desc: 'Lead company' },
    { var: '{{jobTitle}}', desc: 'Lead job title' },
    { var: '{{status}}', desc: 'Lead status' },
    { var: '{{source}}', desc: 'Lead source' },
    { var: '{{location}}', desc: 'Lead location' },
    { var: '{{score}}', desc: 'Lead score' },
    { var: '{{assignedTo}}', desc: 'Assigned user name' },
    { var: '{{companyName}}', desc: 'Your organization name' },
    { var: '{{senderName}}', desc: 'Sender / org name' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Email Templates" description="Write your email content in plain text with variables. The system auto-wraps it in a branded HTML email." />
        {(!isSuperAdmin || selectedDivisionId) && (
          <button onClick={() => { setShowNewForm(true); setEditingTemplate(null); setPreviewHtml(null); }} className="btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> New Template
          </button>
        )}
      </div>

      {/* Division selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <DivisionEmailSelector
          selectedDivisionId={selectedDivisionId}
          onSelect={(id) => { setSelectedDivisionId(id); setEditingTemplate(null); setShowNewForm(false); setPreviewHtml(null); }}
        />
      )}

      {/* Only show templates when division is selected (or non-super-admin) */}
      {isSuperAdmin && !selectedDivisionId ? null : <>

      {status && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {status.message}
        </div>
      )}

      {/* How it works */}
      <div className="card p-4 bg-blue-50 border-blue-200">
        <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1.5">How it works</h4>
        <p className="text-xs text-blue-700 leading-relaxed">
          Just write your email content as plain text. Use the variables below (e.g. {'{{firstName}}'}) and the system will automatically
          format it into a professional branded HTML email. No coding required.
        </p>
      </div>

      {/* Variable reference */}
      <div className="card p-4">
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <Code2 className="h-3.5 w-3.5" /> Available Variables (click to copy)
        </h4>
        <div className="flex flex-wrap gap-2">
          {VARIABLE_HINTS.map((v) => (
            <button
              key={v.var}
              type="button"
              onClick={() => { navigator.clipboard.writeText(v.var); }}
              className="inline-flex items-center gap-1 px-2 py-1 bg-surface-secondary rounded text-2xs hover:bg-surface-tertiary transition-colors cursor-pointer"
              title={`Click to copy ${v.var}`}
            >
              <code className="text-brand-600 font-mono">{v.var}</code>
              <span className="text-text-tertiary">— {v.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {previewHtml && (
        <div className="card border-2 border-brand-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-brand-50 border-b border-brand-200">
            <h4 className="text-sm font-semibold text-brand-700 flex items-center gap-1.5">
              <Eye className="h-4 w-4" /> Email Preview
            </h4>
            <button onClick={() => setPreviewHtml(null)} className="btn-icon h-7 w-7"><X className="h-4 w-4" /></button>
          </div>
          <div className="bg-gray-100 p-4">
            <iframe
              srcDoc={previewHtml}
              className="w-full bg-white rounded-lg border border-gray-200"
              style={{ height: '500px' }}
              title="Email Preview"
              sandbox=""
            />
          </div>
        </div>
      )}

      {/* New template form */}
      {showNewForm && (
        <div className="card p-5 space-y-4 border-2 border-brand-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">New Template</h3>
            <button onClick={() => setShowNewForm(false)} className="btn-icon h-7 w-7"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Template Name *</label>
              <input className="input text-sm" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="e.g. onboarding" />
            </div>
            <div>
              <label className="label">Display Label *</label>
              <input className="input text-sm" value={newForm.label} onChange={(e) => setNewForm({ ...newForm, label: e.target.value })} placeholder="e.g. Onboarding" />
            </div>
          </div>
          <div>
            <label className="label">Subject Line *</label>
            <input className="input text-sm" value={newForm.subject} onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })} placeholder="e.g. Welcome to {{companyName}}" />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input text-sm" value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="When is this template used?" />
          </div>
          <div>
            <label className="label">Email Body *</label>
            <p className="text-2xs text-text-tertiary mb-1.5">Write your email content as plain text. Use variables like {'{{firstName}}'} that will be replaced with actual values. Blank lines create new paragraphs.</p>
            <textarea className="input text-sm" rows={10} value={newForm.body} onChange={(e) => setNewForm({ ...newForm, body: e.target.value })}
              placeholder={`Hi {{firstName}},\n\nThank you for your interest in {{companyName}}.\n\nWe'll be in touch shortly.\n\nBest regards,\n{{senderName}}`} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateNew} disabled={saving} className="btn-primary text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Create Template'}
            </button>
            <button
              type="button"
              onClick={() => handlePreview(newForm.body, newForm.subject)}
              disabled={previewing || !newForm.body}
              className="btn-secondary text-xs"
            >
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Preview
            </button>
            <button onClick={() => setShowNewForm(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((tmpl) => (
          <div key={tmpl.name} className="card p-4">
            {editingTemplate?.name === tmpl.name ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Display Label</label>
                    <input className="input text-sm" value={editingTemplate.label} onChange={(e) => setEditingTemplate({ ...editingTemplate, label: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input className="input text-sm" value={editingTemplate.description || ''} onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Subject Line</label>
                  <input className="input text-sm" value={editingTemplate.subject} onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email Body</label>
                  <p className="text-2xs text-text-tertiary mb-1.5">Write your content as plain text with variables. The system formats it into a professional HTML email automatically.</p>
                  <textarea
                    className="input text-sm"
                    rows={10}
                    value={editingTemplate._editBody ?? getTemplateBody(editingTemplate)}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, _editBody: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const bodyContent = editingTemplate._editBody ?? getTemplateBody(editingTemplate);
                      const saveData: any = {
                        label: editingTemplate.label,
                        subject: editingTemplate.subject,
                        description: editingTemplate.description || '',
                      };
                      // If the content looks like plain text (no HTML tags), save as body
                      if (!bodyContent.includes('<') || editingTemplate.body) {
                        saveData.body = bodyContent;
                      } else {
                        saveData.htmlBody = bodyContent;
                      }
                      handleSaveTemplate(tmpl.name, saveData);
                    }}
                    disabled={saving}
                    className="btn-primary text-xs"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const bodyContent = editingTemplate._editBody ?? getTemplateBody(editingTemplate);
                      handlePreview(bodyContent, editingTemplate.subject);
                    }}
                    disabled={previewing}
                    className="btn-secondary text-xs"
                  >
                    {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Preview
                  </button>
                  <button onClick={() => { setEditingTemplate(null); setPreviewHtml(null); }} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary">{tmpl.label}</h4>
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-secondary text-text-tertiary font-mono">{tmpl.name}</span>
                    {tmpl.isDefault && <span className="text-2xs px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 font-medium">Default</span>}
                  </div>
                  {tmpl.description && <p className="text-xs text-text-tertiary mt-0.5">{tmpl.description}</p>}
                  <p className="text-xs text-text-secondary mt-1 truncate">Subject: {tmpl.subject}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2 whitespace-pre-line">{getTemplateBody(tmpl).substring(0, 120)}{getTemplateBody(tmpl).length > 120 ? '...' : ''}</p>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => handlePreview(getTemplateBody(tmpl), tmpl.subject)}
                    className="btn-icon h-7 w-7"
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEditingTemplate({ ...tmpl })} className="btn-icon h-7 w-7" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(tmpl.name)} className="btn-icon h-7 w-7 text-red-500 hover:text-red-700" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {templates.length === 0 && (
          <div className="card p-8 text-center">
            <Mail className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm text-text-secondary font-medium">No email templates</p>
            <p className="text-xs text-text-tertiary mt-1">Create your first template to use in automations</p>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

/* ─── Shared Components ──────────────────────────────────────────── */
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-0.5">{description}</p>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
        checked ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
